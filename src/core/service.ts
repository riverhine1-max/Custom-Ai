/**
 * COPILOT SERVICE
 * ===============
 * One conversation turn, end to end:
 *
 *   1. save the user's message
 *   2. designer reply   (persona + mode + memory brief → model, streamed)
 *   3. memory clerk     (a second, focused call → proposed change ops as JSON)
 *   4. validation       (validate.ts: auto / review / invalid — in code)
 *   5. apply the auto ops, save memory
 *   6. if confirmed design changed → Design Consequences (third call)
 *
 * The service only depends on two interfaces: ProjectStore (where data
 * lives) and ModelProvider (which AI answers). That's what makes it
 * portable between the web app and the hosted demo.
 */
import type { CopilotClient, ProjectExport, SendInput, TurnCallbacks } from "./client";
import type { ContextBudget, ModelMessage, ModelProvider } from "./provider";
import { FULL_BUDGET } from "./provider";
import type { ProjectStore } from "./store";
import { summarize } from "./store";
import type {
  ChangeSet,
  ChatMessageRecord,
  Consequences,
  DesignItem,
  ModeId,
  ProjectState,
  ProjectSummary,
  Workspace,
} from "./types";
import { newId, now } from "./ids";
import {
  applyManualEdit,
  applyPending,
  applyProposed,
  clone,
  compact,
  confirmedChanges,
  dismissPending,
  emptyState,
  undoOps,
  type ChangedItem,
  type MemoryEdit,
} from "./memory";
import { parseClerkOutput, routeOps } from "./validate";
import { buildBrief, buildClerkIndex } from "./brief";
import { composeSystemPrompt } from "./prompts/compose";
import { CLERK_SYSTEM, CLERK_SYSTEM_COMPACT, buildClerkInput } from "./prompts/clerk";
import { CONSEQUENCES_SYSTEM, consequencesToText, describeChange, parseConsequences } from "./prompts/consequences";
import { extractJson, normalize } from "./text";
import { renderDesignDoc } from "./designDoc";
import { EXAMPLE_NAME, EXAMPLE_TURNS, ExampleProvider } from "./example";
import { MemoryStore } from "./memoryStore";

export interface ServiceOptions {
  /** How many earlier messages the designer sees (memory covers the rest). */
  historyMessages?: number;
  /** Size of the memory brief in characters. */
  briefBudget?: number;
  /** Keep stored documents bounded (the hosted demo sets lower limits). */
  compactLimits?: { changeSets: number; events: number };
  /** Called for problems worth logging (clerk failures etc.). */
  log?: (msg: string, err?: unknown) => void;
}

export class CopilotService implements CopilotClient {
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private store: ProjectStore,
    private provider: ModelProvider,
    private opts: ServiceOptions = {},
  ) {}

  /* ---------------- projects ---------------- */

  listProjects(): Promise<ProjectSummary[]> {
    return this.store.listProjects();
  }

  async createProject(name: string, options: { autoName?: boolean } = {}): Promise<ProjectSummary> {
    const state = emptyState(name.trim() || "Untitled game");
    if (options.autoName) state.project.settings.autoName = true;
    await this.store.saveState(state);
    return summarize(state);
  }

  deleteProject(projectId: string): Promise<void> {
    return this.store.deleteProject(projectId);
  }

  async exportProject(projectId: string): Promise<ProjectExport> {
    const { state, messages } = await this.getWorkspace(projectId);
    return { format: "game-design-copilot", version: 1, exportedAt: now(), state, messages };
  }

  /** Add a game from a backup file. If a game with the same id exists, the copy gets a new id. */
  async importProject(data: unknown): Promise<ProjectSummary> {
    const d = data as Partial<ProjectExport> | null;
    if (!d || d.format !== "game-design-copilot" || d.state?.schemaVersion !== 1 || !Array.isArray(d.messages)) {
      throw new Error("That file isn't a Game Design Copilot backup.");
    }
    const state = clone(d.state);
    if (!state.project?.id || !Array.isArray(state.items)) throw new Error("That backup file looks damaged.");
    const taken = await this.store.loadState(state.project.id);
    if (taken) {
      state.project.id = newId("pr");
      state.project.name = `${state.project.name} (copy)`;
    }
    const messages = d.messages.map((m) => ({ ...m, projectId: state.project.id }));
    await this.store.saveMessages(state.project.id, messages);
    await this.store.saveState(state);
    return summarize(state);
  }

  /** Create the "Acorn Ronin" example by running scripted turns through the real pipeline. */
  async loadExample(): Promise<ProjectSummary> {
    // Build it in memory (fast), then save the finished project in a few writes,
    // so a slow or interrupted connection can't leave a half-built example.
    const scratch = new MemoryStore();
    const seeder = new CopilotService(scratch, new ExampleProvider(), this.opts);
    const p = await seeder.createProject(EXAMPLE_NAME);
    for (const t of EXAMPLE_TURNS) await seeder.sendMessage(p.id, { text: t.user, mode: t.mode });
    const state = (await scratch.loadState(p.id))!;
    await this.store.saveMessages(p.id, await scratch.loadMessages(p.id));
    await this.store.saveState(state); // last: the project appears in the list only when complete
    return summarize(state);
  }

  async getWorkspace(projectId: string): Promise<Workspace> {
    const state = await this.mustLoad(projectId);
    const messages = await this.store.loadMessages(projectId);
    return { state, messages };
  }

  exportDesignDoc(projectId: string, includeProposed = false): Promise<string> {
    return this.mustLoad(projectId).then((s) => renderDesignDoc(s, { includeProposed }));
  }

  /* ---------------- the conversation turn ---------------- */

  async sendMessage(projectId: string, input: SendInput, cb: TurnCallbacks = {}, signal?: AbortSignal): Promise<Workspace> {
    const text = input.text.trim();
    if (!text) throw new Error("Message is empty.");
    const state = await this.mustLoad(projectId);
    const history = await this.store.loadMessages(projectId);

    // 1. save the user's message
    const userMsg: ChatMessageRecord = {
      id: newId("msg"), projectId, role: "user", content: text, createdAt: now(), mode: input.mode, topic: input.topic,
    };
    await this.store.saveMessage(userMsg);

    // 2. designer reply
    cb.onStage?.("thinking");
    const budget = this.budget();
    const system = composeSystemPrompt(state, { ...input, text }, budget.briefChars);
    const messages: ModelMessage[] = [...this.historyForModel(history, budget.historyMessages, budget.historyChars), { role: "user", content: text }];
    let reply = "";
    try {
      let started = false;
      reply = await this.provider.generate({
        purpose: "reply",
        system,
        messages,
        maxTokens: budget.replyTokens,
        signal,
        onText: (t) => {
          if (!started) {
            started = true;
            cb.onStage?.("writing");
          }
          reply = t;
          cb.onText?.(t);
        },
      });
    } catch (err) {
      const aborted = signal?.aborted;
      await this.store.saveMessage({
        id: newId("msg"), projectId, role: "assistant", content: reply, createdAt: now(), mode: input.mode,
        meta: { kind: "error", error: aborted ? "Stopped." : errorText(err) },
      });
      this.opts.log?.("reply failed", err);
      return this.getWorkspace(projectId);
    }

    const assistantMsg: ChatMessageRecord = {
      id: newId("msg"), projectId, role: "assistant", content: reply, createdAt: now(), mode: input.mode, topic: input.topic,
      meta: { kind: "reply", warnings: [] },
    };

    // 3. memory clerk
    cb.onStage?.("remembering");
    const previousAssistant = [...history].reverse().find((m) => m.role === "assistant" && m.meta?.kind !== "error")?.content;
    let ops: ReturnType<typeof parseClerkOutput>["ops"] = [];
    try {
      const small = budget.compactClerk;
      const raw = await this.provider.generate({
        purpose: "clerk",
        system: small ? CLERK_SYSTEM_COMPACT : CLERK_SYSTEM,
        messages: [{
          role: "user",
          content: buildClerkInput({
            index: buildClerkIndex(state),
            previousAssistant,
            userText: text,
            reply,
            caps: small ? { previous: 1500, reply: 1200, index: 3000 } : undefined,
          }),
        }],
        maxTokens: budget.clerkTokens,
        json: true,
        signal,
      });
      const parsed = parseClerkOutput(extractJson(raw));
      ops = parsed.ops;
      if (parsed.rejected.length) this.opts.log?.(`clerk: ${parsed.rejected.length} malformed op(s) dropped: ${parsed.rejected.join(" | ")}`);
    } catch (err) {
      this.opts.log?.("clerk failed", err);
      assistantMsg.meta!.warnings!.push("Memory wasn't updated this turn: the memory step failed. You can add anything important from the Memory tab.");
    }

    // 4 + 5. validate against FRESH state (the user may have applied changes meanwhile), apply, save
    const { changedItems } = await this.withLock(projectId, async () => {
      const fresh = await this.mustLoad(projectId);
      const draft = clone(fresh);
      const eventsBefore = draft.events.length;
      const routed = routeOps(draft, ops, text);
      if (routed.length) {
        const cs: ChangeSet = { id: newId("cs"), messageId: assistantMsg.id, createdAt: now(), ops: routed.map((r) => r.proposed), refMap: {} };
        draft.changeSets.push(cs);
        for (const r of routed) {
          if (r.disposition !== "auto") continue;
          if (!applyProposed(draft, cs, r.proposed, "ai")) {
            r.proposed.state = "invalid";
            r.proposed.note = "Couldn't apply.";
          }
        }
        assistantMsg.meta!.changeSetId = cs.id;
      }
      assistantMsg.meta!.warnings!.push(...rejectedMentions(reply, draft));
      // A game started from a one-line idea takes its real title once one is decided.
      const title = draft.items.find((i) => i.kind === "concept" && i.slot === "title" && i.status === "confirmed");
      if (title && draft.project.settings.autoName) {
        draft.project.name = title.title;
        draft.project.settings.autoName = false;
      }
      compact(draft, this.opts.compactLimits);
      await this.store.saveState(draft);
      await this.store.saveMessage(assistantMsg);
      return { changedItems: confirmedChanges(draft.events.slice(eventsBefore)) };
    });

    // 6. consequences
    if (changedItems.length) {
      cb.onStage?.("analyzing");
      await this.runConsequences(projectId, changedItems, signal);
    }
    return this.getWorkspace(projectId);
  }

  /**
   * Take back the last exchange: your last message and everything after it,
   * undoing any notes it saved. Used by "Edit" and "Regenerate", which then
   * send the (edited) message again.
   */
  async rewindLastTurn(projectId: string): Promise<{ workspace: Workspace; text: string; mode?: ModeId; topic?: string }> {
    const removed = await this.withLock(projectId, async () => {
      const messages = await this.store.loadMessages(projectId);
      let idx = -1;
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") { idx = i; break; }
      if (idx < 0) throw new Error("There's no message to redo yet.");
      const gone = messages.slice(idx);
      const draft = clone(await this.mustLoad(projectId));
      for (const m of gone) {
        const csId = m.meta?.changeSetId;
        if (!csId || !draft.changeSets.some((c) => c.id === csId)) continue;
        undoOps(draft, csId);
        draft.changeSets = draft.changeSets.filter((c) => c.id !== csId);
      }
      await this.store.saveMessages(projectId, messages.slice(0, idx));
      await this.store.saveState(draft);
      return gone[0];
    });
    return { workspace: await this.getWorkspace(projectId), text: removed.content, mode: removed.mode, topic: removed.topic };
  }

  /* ---------------- reviewing proposed changes ---------------- */

  async applyChanges(projectId: string, changeSetId: string, opIds: string[]): Promise<Workspace> {
    const changed = await this.mutate(projectId, (draft) => {
      const before = draft.events.length;
      applyPending(draft, changeSetId, opIds);
      return confirmedChanges(draft.events.slice(before));
    });
    if (changed.length) await this.runConsequences(projectId, changed);
    return this.getWorkspace(projectId);
  }

  async dismissChanges(projectId: string, changeSetId: string, opIds: string[]): Promise<Workspace> {
    await this.mutate(projectId, (draft) => dismissPending(draft, changeSetId, opIds));
    return this.getWorkspace(projectId);
  }

  async undoChanges(projectId: string, changeSetId: string, opIds?: string[]): Promise<Workspace> {
    await this.mutate(projectId, (draft) => undoOps(draft, changeSetId, opIds));
    return this.getWorkspace(projectId);
  }

  async editMemory(projectId: string, edit: MemoryEdit): Promise<Workspace> {
    await this.mutate(projectId, (draft) => applyManualEdit(draft, edit));
    return this.getWorkspace(projectId);
  }

  /** "Analyze consequences" button: treat the items' current state as the change. */
  async analyzeConsequences(projectId: string, itemIds: string[]): Promise<Workspace> {
    const state = await this.mustLoad(projectId);
    const changes: ChangedItem[] = [];
    for (const id of itemIds) {
      const item = state.items.find((i) => i.id === id);
      if (!item) continue;
      // find the item's last recorded "before" to describe what changed
      const ev = [...state.events].reverse().find((e) => e.entity === "item" && e.entityId === id && e.before);
      changes.push({ itemId: id, before: (ev?.before as DesignItem) ?? item, after: item });
    }
    if (changes.length) await this.runConsequences(projectId, changes);
    return this.getWorkspace(projectId);
  }

  /* ---------------- internals ---------------- */

  /** What the current model can handle (the provider may change at run time). */
  private budget(): ContextBudget {
    const base: ContextBudget = {
      ...FULL_BUDGET,
      briefChars: this.opts.briefBudget ?? FULL_BUDGET.briefChars,
      historyMessages: this.opts.historyMessages ?? FULL_BUDGET.historyMessages,
    };
    return { ...base, ...(this.provider.budget ?? {}) };
  }

  private async runConsequences(projectId: string, changes: ChangedItem[], signal?: AbortSignal): Promise<void> {
    const state = await this.mustLoad(projectId);
    const focusIds = new Set(changes.map((c) => c.itemId));
    for (const l of state.links) {
      if (focusIds.has(l.from)) focusIds.add(l.to);
      if (focusIds.has(l.to)) focusIds.add(l.from);
    }
    const prompt = [
      "THE CHANGE",
      describeChange(changes),
      "",
      buildBrief(state, { query: changes.map((c) => `${c.before.title} ${c.before.summary} ${c.after?.summary ?? ""}`).join(" "), focusIds: [...focusIds], budget: Math.min(10000, this.budget().briefChars) }),
    ].join("\n");
    let consequences: Consequences | undefined;
    let error: string | undefined;
    try {
      const raw = await this.provider.generate({ purpose: "analysis", system: CONSEQUENCES_SYSTEM, messages: [{ role: "user", content: prompt }], maxTokens: Math.min(1500, this.budget().replyTokens * 2), json: true, signal });
      consequences = parseConsequences(extractJson(raw));
    } catch (err) {
      this.opts.log?.("consequences failed", err);
      error = "The consequence check failed. You can run it again from the Memory tab.";
    }
    await this.store.saveMessage({
      id: newId("msg"), projectId, role: "assistant", createdAt: now(),
      content: consequences ? consequencesToText(consequences) : "",
      meta: consequences
        ? { kind: "consequences", consequences, consequencesFor: changes.map((c) => c.itemId) }
        : { kind: "error", error },
    });
  }

  /** The last N messages as model turns. Errors are skipped; memory covers older context. */
  private historyForModel(history: ChatMessageRecord[], n: number, maxChars = Infinity): ModelMessage[] {
    return history
      .filter((m) => m.meta?.kind !== "error" && m.content.trim())
      .slice(-n)
      .map((m) => ({ role: m.role, content: m.content.length > maxChars ? m.content.slice(0, maxChars) + " …" : m.content }));
  }

  private async mustLoad(projectId: string): Promise<ProjectState> {
    const s = await this.store.loadState(projectId);
    if (!s) throw new Error("Project not found.");
    return s;
  }

  /** Load → clone → change → save, one at a time per project. */
  private mutate<T>(projectId: string, fn: (draft: ProjectState) => T): Promise<T> {
    return this.withLock(projectId, async () => {
      const draft = clone(await this.mustLoad(projectId));
      const result = fn(draft);
      compact(draft, this.opts.compactLimits);
      await this.store.saveState(draft);
      return result;
    });
  }

  private withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(projectId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(projectId, next.catch(() => undefined));
    return next;
  }
}

/**
 * Soft guard: flag replies that mention a rejected idea without saying it
 * was rejected. Shown as a small warning under the message.
 */
export function rejectedMentions(reply: string, state: ProjectState): string[] {
  const text = normalize(reply);
  const out: string[] = [];
  for (const r of state.items.filter((i) => i.status === "rejected")) {
    const t = normalize(r.title);
    if (t.length < 4) continue;
    let at = text.indexOf(t);
    let flagged = false;
    while (at >= 0 && !flagged) {
      const window = text.slice(Math.max(0, at - 80), at + t.length + 40);
      if (!/\b(reject\w*|rul\w* out|decided against|drop\w*|remov\w*|avoid\w*|not using|dont want|no longer|instead of|without|skip\w*|cut\w*)\b/.test(window)) flagged = true;
      at = text.indexOf(t, at + t.length);
    }
    if (flagged) out.push(`Mentions “${r.title}”, which you rejected.`);
  }
  return out;
}

function errorText(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}
