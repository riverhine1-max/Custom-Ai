/**
 * THE MEMORY ENGINE
 * =================
 * Applies change ops to a ProjectState, records an event for every change,
 * and can undo them. All functions here MUTATE the `draft` they are given:
 * the service clones the state first (see service.ts), so a failed turn
 * never leaves half-written memory behind.
 */
import type {
  ChangeOp,
  ChangeSet,
  ConceptSlot,
  DesignItem,
  EntityType,
  ItemKind,
  LinkType,
  MemoryEvent,
  ProjectSettings,
  ProjectState,
  ProposedOp,
  Status,
} from "./types";
import { newId, now } from "./ids";
import { describeOp, refsUsedBy } from "./validate";
import { similarTitle } from "./text";

export function emptyState(name: string, id = newId("pr")): ProjectState {
  const t = now();
  return {
    schemaVersion: 1,
    project: { id, name, createdAt: t, updatedAt: t, settings: { reviewAll: false } },
    items: [],
    links: [],
    questions: [],
    decisions: [],
    changeSets: [],
    events: [],
  };
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/* ------------------------------------------------------------------ */
/* Events                                                               */
/* ------------------------------------------------------------------ */

function record(
  draft: ProjectState,
  e: Omit<MemoryEvent, "id" | "at">,
): MemoryEvent {
  const ev: MemoryEvent = { id: newId("ev"), at: now(), ...e };
  draft.events.push(ev);
  draft.project.updatedAt = ev.at;
  return ev;
}

type Collection = "items" | "links" | "questions" | "decisions";
const COLLECTION: Record<Exclude<EntityType, "settings">, Collection> = {
  item: "items",
  link: "links",
  question: "questions",
  decision: "decisions",
};

/** Put an entity back to a snapshot (or remove it when the snapshot is null). */
function restore(draft: ProjectState, entity: EntityType, id: string, snapshot: unknown | null) {
  if (entity === "settings") {
    if (snapshot) draft.project.settings = clone(snapshot as ProjectSettings);
    return;
  }
  const list = draft[COLLECTION[entity]] as { id: string }[];
  const idx = list.findIndex((x) => x.id === id);
  if (snapshot === null) {
    if (idx >= 0) list.splice(idx, 1);
  } else if (idx >= 0) {
    list[idx] = clone(snapshot) as { id: string };
  } else {
    list.push(clone(snapshot) as { id: string });
  }
}

/* ------------------------------------------------------------------ */
/* Applying one op                                                      */
/* ------------------------------------------------------------------ */

function originOf(op: ChangeOp): DesignItem["origin"] {
  return op.origin === "ai_suggested" ? "ai" : op.origin === "user_accepted" ? "user_accepted_ai" : "user";
}

/**
 * Apply a single proposed op from a change set.
 * `actor` is "ai" when auto-applied by the pipeline, "user" when the user
 * clicked Apply. Returns false (and leaves memory alone) if the op can't
 * apply any more — e.g. the item it edits was deleted in the meantime.
 */
export function applyProposed(
  draft: ProjectState,
  cs: ChangeSet,
  p: ProposedOp,
  actor: "user" | "ai",
): boolean {
  const resolve = (x: string | undefined) => {
    if (!x) return undefined;
    const mapped = cs.refMap[x] ?? x;
    return draft.items.some((i) => i.id === mapped) ? mapped : undefined;
  };
  const base = { actor, changeSetId: cs.id, opId: p.opId };
  const op = p.op;
  const t = now();
  // Describe the change BEFORE applying it, so labels read "A → B", not "B → B".
  const label = p.label ?? describeOp(op, draft);

  switch (op.type) {
    case "create_item": {
      // AI suggestions are stored as proposals, whoever clicks Apply.
      const status: Status = op.origin === "ai_suggested" ? "proposed" : op.status;
      // Defensive: a concept slot may have been filled since validation.
      if (op.kind === "concept" && op.slot) {
        const taken = draft.items.find((i) => i.kind === "concept" && i.slot === op.slot);
        if (taken) {
          cs.refMap[op.ref] = taken.id;
          const before = clone(taken);
          Object.assign(taken, { title: op.title, summary: op.summary || taken.summary, status, updatedAt: t });
          record(draft, { ...base, action: "update_item", entity: "item", entityId: taken.id, before, after: clone(taken), label });
          break;
        }
      }
      const item: DesignItem = {
        id: newId("it"),
        kind: op.kind,
        title: op.title,
        summary: op.summary,
        status,
        parentId: resolve(op.parent) ?? null,
        slot: op.kind === "concept" ? op.slot : undefined,
        order: op.kind === "loop" || op.kind === "pillar" ? nextOrder(draft, op.kind) : undefined,
        rationale: op.rationale,
        origin: originOf(op),
        createdAt: t,
        updatedAt: t,
      };
      draft.items.push(item);
      cs.refMap[op.ref] = item.id;
      record(draft, { ...base, action: "create_item", entity: "item", entityId: item.id, before: null, after: clone(item), label });
      break;
    }
    case "update_item": {
      const id = resolve(op.itemId);
      const item = draft.items.find((i) => i.id === id);
      if (!item) return false;
      const before = clone(item);
      if (op.title) item.title = op.title;
      if (op.summary) item.summary = op.summary;
      if (op.details) item.details = op.details;
      if (op.rationale) item.rationale = op.rationale;
      item.updatedAt = t;
      // A change (not a refinement) to confirmed design: flagged by the clerk,
      // or implied by a decision in the same change set that names this item.
      const decided = cs.ops.some(
        (x) => x.op.type === "record_decision" && (x.op.items ?? []).some((r) => (cs.refMap[r] ?? r) === item.id),
      );
      const significant = before.status === "confirmed" && (op.change === true || decided);
      record(draft, { ...base, action: "update_item", entity: "item", entityId: item.id, before, after: clone(item), label, significant });
      break;
    }
    case "set_status": {
      const id = resolve(op.itemId);
      const item = draft.items.find((i) => i.id === id);
      if (!item) return false;
      const before = clone(item);
      item.status = op.status;
      if (op.rationale) item.rationale = op.rationale;
      item.updatedAt = t;
      record(draft, { ...base, action: "set_status", entity: "item", entityId: item.id, before, after: clone(item), label });
      break;
    }
    case "add_link": {
      const from = resolve(op.from);
      const to = resolve(op.to);
      if (!from || !to) return false;
      const link = { id: newId("ln"), from, to, type: op.linkType as LinkType, note: op.note, createdAt: t };
      draft.links.push(link);
      record(draft, { ...base, action: "add_link", entity: "link", entityId: link.id, before: null, after: clone(link), label });
      break;
    }
    case "add_question": {
      const q = {
        id: newId("q"),
        question: op.question,
        why: op.why,
        relatedItemIds: (op.related ?? []).map(resolve).filter((x): x is string => !!x),
        status: "open" as const,
        createdAt: t,
      };
      draft.questions.push(q);
      record(draft, { ...base, action: "add_question", entity: "question", entityId: q.id, before: null, after: clone(q), label });
      break;
    }
    case "resolve_question": {
      const q = draft.questions.find((x) => x.id === op.questionId);
      if (!q || q.status !== "open") return false;
      const before = clone(q);
      q.status = "resolved";
      q.resolution = op.resolution;
      q.resolvedAt = t;
      record(draft, { ...base, action: "resolve_question", entity: "question", entityId: q.id, before, after: clone(q), label });
      break;
    }
    case "record_decision": {
      const d = {
        id: newId("dc"),
        number: draft.decisions.reduce((n, x) => Math.max(n, x.number), 0) + 1,
        title: op.title,
        before: op.before,
        after: op.after,
        reason: op.reason,
        alternatives: op.alternatives,
        itemIds: (op.items ?? []).map(resolve).filter((x): x is string => !!x),
        createdAt: t,
        messageId: cs.messageId,
      };
      draft.decisions.push(d);
      record(draft, { ...base, action: "record_decision", entity: "decision", entityId: d.id, before: null, after: clone(d), label: `Decision ${pad(d.number)}: ${d.title}` });
      break;
    }
  }
  p.state = "applied";
  return true;
}

function nextOrder(draft: ProjectState, kind: ItemKind): number {
  return draft.items.filter((i) => i.kind === kind).reduce((n, i) => Math.max(n, i.order ?? 0), 0) + 1;
}

export const pad = (n: number) => String(n).padStart(3, "0");

/* ------------------------------------------------------------------ */
/* Review actions on a change set                                       */
/* ------------------------------------------------------------------ */

function findSet(draft: ProjectState, csId: string): ChangeSet {
  const cs = draft.changeSets.find((c) => c.id === csId);
  if (!cs) throw new Error("Change set not found.");
  return cs;
}

/** refs created by create ops in this set, mapped to their ProposedOp */
function createsByRef(cs: ChangeSet): Map<string, ProposedOp> {
  const m = new Map<string, ProposedOp>();
  for (const p of cs.ops) if (p.op.type === "create_item") m.set(p.op.ref, p);
  return m;
}

/**
 * The user clicked Apply on some pending ops. Applies them in their
 * original order; an op whose parent create isn't applied (and isn't
 * being applied now) is skipped with a note.
 */
export function applyPending(draft: ProjectState, csId: string, opIds: string[]): ProposedOp[] {
  const cs = findSet(draft, csId);
  const creates = createsByRef(cs);
  const wanted = new Set(opIds);
  const applied: ProposedOp[] = [];
  for (const p of cs.ops) {
    if (!wanted.has(p.opId) || p.state !== "pending") continue;
    const blocker = refsUsedBy(p.op)
      .map((r) => creates.get(r))
      .find((c) => c && c.state !== "applied" && !cs.refMap[(c.op as { ref: string }).ref]);
    if (blocker) {
      p.note = "Apply the item it depends on first.";
      continue;
    }
    // Memory may have moved on since this was proposed (e.g. the user said it in a later message).
    if (p.op.type === "create_item") {
      const o = p.op;
      const same = draft.items.find((i) => (i.kind === o.kind || i.status === "rejected") && similarTitle(i.title, o.title));
      if (same) {
        p.state = "invalid";
        p.note = same.status === "rejected" ? `“${same.title}” was rejected.` : `Already in memory as “${same.title}”.`;
        cs.refMap[o.ref] = same.id;
        continue;
      }
    }
    if (applyProposed(draft, cs, p, "user")) applied.push(p);
    else p.note = "Couldn't apply — the item it changes no longer exists.";
  }
  return applied;
}

/** The user dismissed some pending ops. Dismissing a create also dismisses what depends on it. */
export function dismissPending(draft: ProjectState, csId: string, opIds: string[]): void {
  const cs = findSet(draft, csId);
  const dismissedRefs = new Set<string>();
  for (const p of cs.ops) {
    if (opIds.includes(p.opId) && p.state === "pending") {
      p.state = "dismissed";
      if (p.op.type === "create_item") dismissedRefs.add(p.op.ref);
    }
  }
  for (const p of cs.ops) {
    if (p.state === "pending" && refsUsedBy(p.op).some((r) => dismissedRefs.has(r))) p.state = "dismissed";
  }
}

/**
 * Undo applied ops (all of a change set when opIds is omitted). Undoing a
 * create also undoes ops in the set that depend on it. Every undo is itself
 * recorded as an event, so history is never rewritten.
 */
export function undoOps(draft: ProjectState, csId: string, opIds?: string[]): number {
  const cs = findSet(draft, csId);
  const targets = new Set(opIds ?? cs.ops.filter((p) => p.state === "applied").map((p) => p.opId));
  // pull in dependants of undone creates
  const createdRefs = new Set(
    cs.ops.filter((p) => targets.has(p.opId) && p.op.type === "create_item").map((p) => (p.op as { ref: string }).ref),
  );
  for (const p of cs.ops) {
    if (p.state === "applied" && refsUsedBy(p.op).some((r) => createdRefs.has(r))) targets.add(p.opId);
  }
  const events = draft.events.filter((e) => e.changeSetId === csId && e.opId && targets.has(e.opId) && e.action !== "undo");
  let n = 0;
  for (const e of [...events].reverse()) {
    const op = cs.ops.find((p) => p.opId === e.opId);
    if (!op || op.state !== "applied") continue;
    const current = currentSnapshot(draft, e.entity, e.entityId);
    restore(draft, e.entity, e.entityId, e.before);
    if (e.entity === "item" && e.before === null) removeDanglingLinks(draft);
    record(draft, { actor: "user", changeSetId: csId, action: "undo", entity: e.entity, entityId: e.entityId, before: current, after: e.before, label: `Undone: ${e.label}` });
    n++;
  }
  for (const p of cs.ops) if (targets.has(p.opId) && p.state === "applied") p.state = "reverted";
  return n;
}

function currentSnapshot(draft: ProjectState, entity: EntityType, id: string): unknown | null {
  if (entity === "settings") return clone(draft.project.settings);
  const found = (draft[COLLECTION[entity]] as { id: string }[]).find((x) => x.id === id);
  return found ? clone(found) : null;
}

function removeDanglingLinks(draft: ProjectState) {
  const ids = new Set(draft.items.map((i) => i.id));
  draft.links = draft.links.filter((l) => ids.has(l.from) && ids.has(l.to));
}

/* ------------------------------------------------------------------ */
/* Manual edits from the Memory screen                                  */
/* ------------------------------------------------------------------ */

export type MemoryEdit =
  | { type: "create_item"; kind: ItemKind; title: string; summary?: string; status: Status; parentId?: string | null; slot?: ConceptSlot; rationale?: string }
  | { type: "update_item"; itemId: string; patch: Partial<Pick<DesignItem, "title" | "summary" | "details" | "rationale" | "parentId" | "kind">> }
  | { type: "set_status"; itemId: string; status: Status; rationale?: string }
  | { type: "delete_item"; itemId: string }
  | { type: "add_link"; from: string; to: string; linkType: LinkType; note?: string }
  | { type: "delete_link"; linkId: string }
  | { type: "add_question"; question: string; why?: string; relatedItemIds?: string[] }
  | { type: "resolve_question"; questionId: string; resolution: string }
  | { type: "drop_question"; questionId: string }
  | { type: "reopen_question"; questionId: string }
  | { type: "add_decision"; title: string; before?: string; after: string; reason?: string; itemIds?: string[] }
  | { type: "rename_project"; name: string }
  | { type: "set_settings"; settings: Partial<ProjectSettings> };

/** Apply a direct edit by the user. The user is the creative director: no review needed. */
export function applyManualEdit(draft: ProjectState, edit: MemoryEdit): void {
  const t = now();
  const ev = (entity: EntityType, entityId: string, before: unknown, after: unknown, label: string) =>
    record(draft, { actor: "user", action: "manual_edit", entity, entityId, before: before ?? null, after: after ?? null, label });
  const item = (id: string) => {
    const it = draft.items.find((i) => i.id === id);
    if (!it) throw new Error("Item not found.");
    return it;
  };
  const question = (id: string) => {
    const q = draft.questions.find((x) => x.id === id);
    if (!q) throw new Error("Question not found.");
    return q;
  };

  switch (edit.type) {
    case "create_item": {
      if (edit.kind === "concept" && edit.slot && draft.items.some((i) => i.kind === "concept" && i.slot === edit.slot)) {
        throw new Error("That concept slot is already filled — edit it instead.");
      }
      const it: DesignItem = {
        id: newId("it"), kind: edit.kind, title: edit.title.trim(), summary: (edit.summary ?? "").trim(),
        status: edit.status, parentId: edit.parentId ?? null, slot: edit.kind === "concept" ? edit.slot : undefined,
        order: edit.kind === "loop" || edit.kind === "pillar" ? nextOrder(draft, edit.kind) : undefined,
        rationale: edit.rationale, origin: "user", createdAt: t, updatedAt: t,
      };
      if (!it.title) throw new Error("A title is required.");
      draft.items.push(it);
      ev("item", it.id, null, clone(it), `Added “${it.title}”`);
      break;
    }
    case "update_item": {
      const it = item(edit.itemId);
      const before = clone(it);
      Object.assign(it, edit.patch, { updatedAt: t });
      ev("item", it.id, before, clone(it), `Edited “${it.title}”`);
      break;
    }
    case "set_status": {
      const it = item(edit.itemId);
      const before = clone(it);
      it.status = edit.status;
      if (edit.rationale !== undefined) it.rationale = edit.rationale;
      it.updatedAt = t;
      ev("item", it.id, before, clone(it), `Marked “${it.title}” as ${edit.status}`);
      break;
    }
    case "delete_item": {
      const it = item(edit.itemId);
      for (const child of draft.items.filter((i) => i.parentId === it.id)) {
        const b = clone(child);
        child.parentId = it.parentId ?? null;
        ev("item", child.id, b, clone(child), `Moved “${child.title}” up a level`);
      }
      for (const l of draft.links.filter((x) => x.from === it.id || x.to === it.id)) {
        ev("link", l.id, clone(l), null, "Removed a link");
      }
      draft.links = draft.links.filter((x) => x.from !== it.id && x.to !== it.id);
      draft.items = draft.items.filter((i) => i.id !== it.id);
      ev("item", it.id, clone(it), null, `Deleted “${it.title}”`);
      break;
    }
    case "add_link": {
      if (edit.from === edit.to) throw new Error("An item can't link to itself.");
      item(edit.from);
      item(edit.to);
      const l = { id: newId("ln"), from: edit.from, to: edit.to, type: edit.linkType, note: edit.note, createdAt: t };
      draft.links.push(l);
      ev("link", l.id, null, clone(l), "Added a link");
      break;
    }
    case "delete_link": {
      const l = draft.links.find((x) => x.id === edit.linkId);
      if (!l) return;
      draft.links = draft.links.filter((x) => x.id !== edit.linkId);
      ev("link", l.id, clone(l), null, "Removed a link");
      break;
    }
    case "add_question": {
      const q = { id: newId("q"), question: edit.question.trim(), why: edit.why, relatedItemIds: edit.relatedItemIds ?? [], status: "open" as const, createdAt: t };
      if (q.question.length < 3) throw new Error("Write the question out.");
      draft.questions.push(q);
      ev("question", q.id, null, clone(q), `Open question: ${q.question}`);
      break;
    }
    case "resolve_question":
    case "drop_question":
    case "reopen_question": {
      const q = question(edit.questionId);
      const before = clone(q);
      if (edit.type === "resolve_question") Object.assign(q, { status: "resolved", resolution: edit.resolution, resolvedAt: t });
      if (edit.type === "drop_question") Object.assign(q, { status: "dropped", resolvedAt: t });
      if (edit.type === "reopen_question") Object.assign(q, { status: "open", resolution: undefined, resolvedAt: undefined });
      ev("question", q.id, before, clone(q), `${edit.type === "resolve_question" ? "Resolved" : edit.type === "drop_question" ? "Dropped" : "Reopened"}: ${q.question}`);
      break;
    }
    case "add_decision": {
      const d = {
        id: newId("dc"), number: draft.decisions.reduce((n, x) => Math.max(n, x.number), 0) + 1,
        title: edit.title.trim(), before: edit.before, after: edit.after.trim(), reason: edit.reason,
        itemIds: edit.itemIds ?? [], createdAt: t,
      };
      draft.decisions.push(d);
      ev("decision", d.id, null, clone(d), `Decision ${pad(d.number)}: ${d.title}`);
      break;
    }
    case "rename_project": {
      const name = edit.name.trim();
      if (!name) throw new Error("A name is required.");
      draft.project.name = name;
      draft.project.updatedAt = t;
      break;
    }
    case "set_settings": {
      const before = clone(draft.project.settings);
      Object.assign(draft.project.settings, edit.settings);
      ev("settings", draft.project.id, before, clone(draft.project.settings), "Changed settings");
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* When should Design Consequences run?                                 */
/* ------------------------------------------------------------------ */

const SYSTEMIC_KINDS = new Set<ItemKind>(["pillar", "loop", "system", "mechanic", "weapon", "ability", "enemy", "boss", "level", "constraint"]);
const SYSTEMIC_SLOTS = new Set<ConceptSlot>(["genre", "perspective", "coreFantasy", "playerRole", "scope"]);

export interface ChangedItem {
  itemId: string;
  before: DesignItem;
  after: DesignItem | null;
}

/**
 * Given events just recorded, return the confirmed design that changed in a
 * way worth analysing: how it works changed, it was demoted or rejected, or
 * it was deleted. New items, added detail and edits to proposals don't
 * trigger analysis.
 */
export function confirmedChanges(events: MemoryEvent[]): ChangedItem[] {
  const out = new Map<string, ChangedItem>();
  for (const e of events) {
    if (e.entity !== "item" || !e.before) continue;
    const before = e.before as DesignItem;
    const after = e.after as DesignItem | null;
    if (before.status !== "confirmed") continue;
    const systemic = SYSTEMIC_KINDS.has(before.kind) || (before.kind === "concept" && before.slot && SYSTEMIC_SLOTS.has(before.slot));
    if (!systemic) continue;
    // Deleted, demoted/rejected, or its behaviour changed. Adding detail or renaming doesn't count.
    const changed = !after || after.status !== "confirmed" || e.significant === true;
    if (!changed) continue;
    const prev = out.get(before.id);
    out.set(before.id, { itemId: before.id, before: prev?.before ?? before, after });
  }
  return [...out.values()];
}

/* ------------------------------------------------------------------ */
/* Housekeeping                                                         */
/* ------------------------------------------------------------------ */

/**
 * Keep the stored document bounded: old change sets lose their resolved
 * ops, and the event log keeps the most recent entries. Decisions, items
 * and questions are never pruned.
 */
export function compact(draft: ProjectState, limits = { changeSets: 150, events: 1500 }): void {
  if (draft.changeSets.length > limits.changeSets) {
    draft.changeSets = draft.changeSets.slice(-limits.changeSets);
  }
  if (draft.events.length > limits.events) {
    draft.events = draft.events.slice(-limits.events);
  }
}
