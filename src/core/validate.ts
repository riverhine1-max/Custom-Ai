/**
 * THE SAFETY RULES
 * ================
 * The AI never writes to memory directly. After each reply, a separate
 * "clerk" call proposes a list of change ops (see prompts/clerk.ts). This
 * file decides, in code, what happens to each proposed op:
 *
 *   auto    → applied right away (shown with Undo)
 *   review  → waits for the user to click Apply or Dismiss
 *   invalid → blocked, with a note explaining why
 *
 * The central rule: a change applies automatically ONLY when it is backed
 * by an exact quote from the user's latest message ("evidence"). Anything
 * the AI came up with itself waits for the user — and even then, applying
 * an AI suggestion stores it as "proposed", never as confirmed canon.
 */
import { z } from "zod";
import type {
  ChangeOp,
  DesignItem,
  ProjectState,
  ProposedOp,
  Status,
} from "./types";
import { CONCEPT_SLOTS, ITEM_KINDS, LINK_TYPES, STATUSES } from "./types";
import { evidenceMatches, normalize, overlap, similarTitle } from "./text";
import { newId } from "./ids";

/* ------------------------------------------------------------------ */
/* 1. Schema: is the clerk's output even well-formed?                  */
/* ------------------------------------------------------------------ */

const str = z.string().trim();
const optStr = z.string().trim().optional().nullable().transform((v) => v || undefined);
const origin = z.enum(["user_stated", "user_accepted", "ai_suggested"]).catch("ai_suggested");
const status = z.enum(STATUSES as [Status, ...Status[]]);
const kind = z.enum(ITEM_KINDS as [string, ...string[]]);
const slot = z
  .enum(CONCEPT_SLOTS.map((s) => s.slot) as [string, ...string[]])
  .optional()
  .nullable()
  .transform((v) => v || undefined);
const idList = z.array(str).optional().nullable().transform((v) => v || undefined);

const base = { origin, evidence: optStr };

const OpSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("create_item"),
    ref: str.min(1),
    kind,
    title: str.min(1).max(120),
    summary: z.string().trim().max(1200).default(""),
    status,
    parent: optStr,
    slot,
    rationale: optStr,
  }),
  z.object({
    ...base,
    type: z.literal("update_item"),
    itemId: str.min(1),
    change: z.boolean().optional().nullable().transform((v) => v || undefined),
    title: optStr,
    summary: optStr,
    details: optStr,
    rationale: optStr,
  }),
  z.object({ ...base, type: z.literal("set_status"), itemId: str.min(1), status, rationale: optStr }),
  z.object({
    ...base,
    type: z.literal("add_link"),
    from: str.min(1),
    to: str.min(1),
    linkType: z.enum(LINK_TYPES as [string, ...string[]]).catch("related"),
    note: optStr,
  }),
  z.object({ ...base, type: z.literal("add_question"), question: str.min(8).max(400), why: optStr, related: idList }),
  z.object({ ...base, type: z.literal("resolve_question"), questionId: str.min(1), resolution: str.min(1) }),
  z.object({
    ...base,
    type: z.literal("record_decision"),
    title: str.min(1).max(160),
    before: optStr,
    after: str.min(1),
    reason: optStr,
    alternatives: idList,
    items: idList,
  }),
]);

/** Parse the clerk's JSON. Each op is checked separately so one bad op doesn't sink the rest. */
export function parseClerkOutput(raw: unknown): { ops: ChangeOp[]; rejected: string[] } {
  const list = Array.isArray((raw as { ops?: unknown })?.ops) ? (raw as { ops: unknown[] }).ops : [];
  const ops: ChangeOp[] = [];
  const rejected: string[] = [];
  for (const candidate of list.slice(0, MAX_OPS_PER_TURN)) {
    const parsed = OpSchema.safeParse(candidate);
    if (parsed.success) ops.push(parsed.data as ChangeOp);
    else rejected.push(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return { ops, rejected };
}

export const MAX_OPS_PER_TURN = 15;
export const MAX_AUTO_QUESTIONS_PER_TURN = 3;

/* ------------------------------------------------------------------ */
/* 2. Routing: auto, review, or invalid?                               */
/* ------------------------------------------------------------------ */

export type Disposition = "auto" | "review" | "invalid";

export interface Routed {
  proposed: ProposedOp;
  disposition: Disposition;
}

interface Ctx {
  state: ProjectState;
  userText: string;
  reviewAll: boolean;
  /** refs created in this set: ref → index into `out` of the create op */
  refs: Map<string, number>;
  /** refs that turned out to be existing items: ref → existing id */
  alias: Map<string, string>;
  out: Routed[];
  autoQuestions: number;
}

const findItem = (s: ProjectState, id: string) => s.items.find((i) => i.id === id);

function push(ctx: Ctx, op: ChangeOp, disposition: Disposition, verified: boolean, note?: string) {
  ctx.out.push({
    disposition,
    proposed: {
      opId: newId("op"),
      op,
      verified,
      note,
      state: disposition === "invalid" ? "invalid" : "pending",
    },
  });
}

/** The trust decision for an op that passed its structural checks. */
function trust(ctx: Ctx, op: ChangeOp, verified: boolean, extraNote?: string): void {
  if (op.origin === "ai_suggested") {
    push(ctx, op, "review", false, extraNote ?? "AI suggestion — apply to keep it as a proposal.");
  } else if (!verified) {
    push(ctx, op, "review", false, extraNote ?? "Couldn't match this to your exact words — please check it.");
  } else if (ctx.reviewAll) {
    push(ctx, op, "review", true, extraNote ?? "From your words. Review mode is on.");
  } else {
    push(ctx, op, "auto", true, extraNote);
  }
}

/** Resolve an id-or-ref to something that exists (or will exist) in this set. */
function resolvable(ctx: Ctx, idOrRef: string | undefined): boolean {
  if (!idOrRef) return false;
  if (ctx.alias.has(idOrRef)) return true;
  if (ctx.refs.has(idOrRef)) return true;
  return !!findItem(ctx.state, idOrRef);
}

function rewrite(ctx: Ctx, idOrRef: string): string {
  return ctx.alias.get(idOrRef) ?? idOrRef;
}

/**
 * Route every proposed op. `userText` is the user's latest message — the
 * only text that counts as evidence of a user decision.
 */
export function routeOps(
  state: ProjectState,
  ops: ChangeOp[],
  userText: string,
): Routed[] {
  const ctx: Ctx = {
    state,
    userText,
    reviewAll: state.project.settings.reviewAll,
    refs: new Map(),
    alias: new Map(),
    out: [],
    autoQuestions: 0,
  };

  for (const op of ops.slice(0, MAX_OPS_PER_TURN)) {
    const verified = op.origin !== "ai_suggested" && evidenceMatches(op.evidence, userText);
    switch (op.type) {
      case "create_item":
        routeCreate(ctx, op, verified);
        break;
      case "update_item":
        routeUpdate(ctx, { ...op, itemId: rewrite(ctx, op.itemId) }, verified);
        break;
      case "set_status":
        routeSetStatus(ctx, { ...op, itemId: rewrite(ctx, op.itemId) }, verified);
        break;
      case "add_link":
        routeLink(ctx, { ...op, from: rewrite(ctx, op.from), to: rewrite(ctx, op.to) }, verified);
        break;
      case "add_question":
        routeQuestion(ctx, { ...op, related: op.related?.map((r) => rewrite(ctx, r)) });
        break;
      case "resolve_question":
        routeResolve(ctx, op, verified);
        break;
      case "record_decision":
        routeDecision(ctx, { ...op, items: op.items?.map((r) => rewrite(ctx, r)) }, verified);
        break;
    }
  }

  applyDependencyRule(ctx);
  // Label every op against memory as it is NOW, before anything is applied.
  const refTitles: Record<string, string> = {};
  for (const r of ctx.out) if (r.proposed.op.type === "create_item") refTitles[r.proposed.op.ref] = r.proposed.op.title;
  for (const r of ctx.out) r.proposed.label = describeOp(r.proposed.op, state, refTitles);
  return ctx.out;
}

function routeCreate(ctx: Ctx, op: Extract<ChangeOp, { type: "create_item" }>, verified: boolean) {
  const s = ctx.state;
  if (ctx.refs.has(op.ref) || ctx.alias.has(op.ref) || findItem(s, op.ref)) {
    return push(ctx, op, "invalid", verified, `Duplicate reference "${op.ref}".`);
  }
  // AI suggestions are never stored as anything stronger than "proposed".
  if (op.origin === "ai_suggested" && op.status !== "proposed") op = { ...op, status: "proposed" };

  // Concept slots hold one value each: an existing slot becomes an update.
  if (op.kind === "concept") {
    if (!op.slot) return push(ctx, op, "invalid", verified, "A concept item needs a slot (genre, tone…).");
    const existing = s.items.find((i) => i.kind === "concept" && i.slot === op.slot);
    if (existing) {
      ctx.alias.set(op.ref, existing.id);
      if (normalize(existing.title) !== normalize(op.title) || (op.summary && op.summary !== existing.summary)) {
        routeUpdate(ctx, { type: "update_item", itemId: existing.id, title: op.title, summary: op.summary || undefined, origin: op.origin, evidence: op.evidence }, verified);
      }
      if (existing.status !== op.status) {
        routeSetStatus(ctx, { type: "set_status", itemId: existing.id, status: op.status, origin: op.origin, evidence: op.evidence }, verified);
      }
      return;
    }
  }

  // Never re-suggest a rejected idea. The user may revive one in their own words.
  const rejectedMatch = s.items.find((i) => i.status === "rejected" && similarTitle(i.title, op.title));
  if (rejectedMatch) {
    if (op.origin === "user_stated" && verified && op.status !== "rejected") {
      ctx.alias.set(op.ref, rejectedMatch.id);
      return trust(
        ctx,
        { type: "set_status", itemId: rejectedMatch.id, status: op.status, origin: op.origin, evidence: op.evidence, rationale: op.rationale },
        verified,
        `Revives “${rejectedMatch.title}”, which you rejected earlier.`,
      );
    }
    if (op.status === "rejected") {
      ctx.alias.set(op.ref, rejectedMatch.id);
      return push(ctx, op, "invalid", verified, `“${rejectedMatch.title}” is already rejected.`);
    }
    return push(ctx, op, "invalid", verified, `Matches rejected idea “${rejectedMatch.title}” — not re-suggested.`);
  }

  // Already in memory? Point the ref at it and only route a status change.
  const dup = s.items.find((i) => i.kind === op.kind && similarTitle(i.title, op.title));
  if (dup) {
    ctx.alias.set(op.ref, dup.id);
    if (dup.status !== op.status && rank(op.status) > rank(dup.status)) {
      return routeSetStatus(ctx, { type: "set_status", itemId: dup.id, status: op.status, origin: op.origin, evidence: op.evidence }, verified);
    }
    return push(ctx, op, "invalid", verified, `Already in memory as “${dup.title}”.`);
  }

  if (op.parent && !resolvable(ctx, op.parent)) op = { ...op, parent: undefined };
  else if (op.parent) op = { ...op, parent: rewrite(ctx, op.parent) };

  ctx.refs.set(op.ref, ctx.out.length);
  trust(ctx, op, verified);
}

/** Strength of commitment, for "is this an upgrade?" checks. */
function rank(s: Status): number {
  return { rejected: 0, proposed: 1, likely: 2, confirmed: 3 }[s];
}

function routeUpdate(ctx: Ctx, op: Extract<ChangeOp, { type: "update_item" }>, verified: boolean) {
  const item = findItem(ctx.state, op.itemId);
  if (!item && !ctx.refs.has(op.itemId)) return push(ctx, op, "invalid", verified, "Unknown item.");
  if (item) {
    const changes =
      (op.title && op.title !== item.title) ||
      (op.summary && op.summary !== item.summary) ||
      (op.details && op.details !== item.details) ||
      (op.rationale && op.rationale !== item.rationale);
    if (!changes) return push(ctx, op, "invalid", verified, "No change.");
    if (item.status === "rejected" && op.origin === "ai_suggested") {
      return push(ctx, op, "invalid", verified, `“${item.title}” is rejected — not reworked.`);
    }
  }
  trust(ctx, op, verified, item?.status === "confirmed" && op.origin === "ai_suggested"
    ? "Would change confirmed design — only you can approve that."
    : undefined);
}

function routeSetStatus(ctx: Ctx, op: Extract<ChangeOp, { type: "set_status" }>, verified: boolean) {
  const item = findItem(ctx.state, op.itemId);
  if (!item && !ctx.refs.has(op.itemId)) return push(ctx, op, "invalid", verified, "Unknown item.");
  if (item && item.status === op.status) return push(ctx, op, "invalid", verified, "No change.");
  if (op.origin === "ai_suggested" && (op.status === "confirmed" || op.status === "rejected")) {
    return push(ctx, op, "review", false, "Only you can confirm or reject — apply if you agree.");
  }
  trust(ctx, op, verified);
}

function routeLink(ctx: Ctx, op: Extract<ChangeOp, { type: "add_link" }>, verified: boolean) {
  if (!resolvable(ctx, op.from) || !resolvable(ctx, op.to)) return push(ctx, op, "invalid", verified, "Link points at an unknown item.");
  if (op.from === op.to) return push(ctx, op, "invalid", verified, "An item can't link to itself.");
  const exists = ctx.state.links.some(
    (l) => l.type === op.linkType && ((l.from === op.from && l.to === op.to) || (l.from === op.to && l.to === op.from)),
  );
  if (exists) return push(ctx, op, "invalid", verified, "Link already exists.");
  trust(ctx, op, verified);
}

/**
 * Open questions are a to-do list, not design canon, so the AI may add a
 * few per turn without review. Duplicates are blocked.
 */
function routeQuestion(ctx: Ctx, op: Extract<ChangeOp, { type: "add_question" }>) {
  const dup = ctx.state.questions.find((q) => q.status === "open" && overlap(q.question, op.question) >= 0.75);
  if (dup) return push(ctx, op, "invalid", false, `Already an open question: “${dup.question}”`);
  const dupInSet = ctx.out.some(
    (r) => r.proposed.op.type === "add_question" && overlap((r.proposed.op as { question: string }).question, op.question) >= 0.75,
  );
  if (dupInSet) return push(ctx, op, "invalid", false, "Duplicate question in this turn.");
  if (ctx.autoQuestions >= MAX_AUTO_QUESTIONS_PER_TURN || ctx.reviewAll) {
    return push(ctx, op, "review", false, "Suggested open question.");
  }
  ctx.autoQuestions++;
  push(ctx, { ...op, related: op.related?.filter((r) => resolvable(ctx, r)) }, "auto", false, "Added to open questions.");
}

function routeResolve(ctx: Ctx, op: Extract<ChangeOp, { type: "resolve_question" }>, verified: boolean) {
  const q = ctx.state.questions.find((x) => x.id === op.questionId);
  if (!q || q.status !== "open") return push(ctx, op, "invalid", verified, "Unknown or already-closed question.");
  trust(ctx, op, verified);
}

function routeDecision(ctx: Ctx, op: Extract<ChangeOp, { type: "record_decision" }>, verified: boolean) {
  if (op.origin === "ai_suggested") {
    return push(ctx, op, "invalid", false, "Decisions are only recorded from your choices.");
  }
  trust(ctx, { ...op, items: op.items?.filter((r) => resolvable(ctx, r)) }, verified);
}

/**
 * If an op depends on an item created in this same set, it can't be more
 * trusted than that create op: blocked create → blocked dependant;
 * pending create → pending dependant.
 */
function applyDependencyRule(ctx: Ctx) {
  for (const r of ctx.out) {
    for (const ref of refsUsedBy(r.proposed.op)) {
      const idx = ctx.refs.get(ref);
      if (idx === undefined) continue;
      const parent = ctx.out[idx];
      if (parent === r) continue;
      if (parent.disposition === "invalid" && r.disposition !== "invalid") {
        r.disposition = "invalid";
        r.proposed.state = "invalid";
        r.proposed.note = "Depends on a blocked item.";
      } else if (parent.disposition === "review" && r.disposition === "auto") {
        r.disposition = "review";
        r.proposed.note = "Waits for the item it depends on.";
      }
    }
  }
}

/** Which ids/refs an op points at (other than one it creates). */
export function refsUsedBy(op: ChangeOp): string[] {
  switch (op.type) {
    case "create_item":
      return op.parent ? [op.parent] : [];
    case "update_item":
    case "set_status":
      return [op.itemId];
    case "add_link":
      return [op.from, op.to];
    case "add_question":
      return op.related ?? [];
    case "record_decision":
      return op.items ?? [];
    default:
      return [];
  }
}

/** A short, plain-language label for an op, shown on the "saved to notes" cards. */
export function describeOp(op: ChangeOp, state: ProjectState, refTitles: Record<string, string> = {}): string {
  const title = (id: string) => findItem(state, id)?.title ?? refTitles[id] ?? id;
  switch (op.type) {
    case "create_item": {
      if (op.kind === "concept") {
        const slot = CONCEPT_SLOTS.find((s) => s.slot === op.slot)?.label ?? "Basics";
        if (op.status === "rejected") return `Ruled out for ${slot.toLowerCase()}: “${op.title}”`;
        return `${slot}: “${op.title}”${op.status === "proposed" ? " (idea)" : op.status === "likely" ? " (probably)" : ""}`;
      }
      const k = kindLabel(op.kind).toLowerCase();
      const parent = op.parent ? title(op.parent) : undefined;
      switch (op.status) {
        case "confirmed":
          return `Added ${k} “${op.title}”${parent ? ` to ${parent}` : ""}`;
        case "likely":
          return `Noted ${k} “${op.title}” (probably)`;
        case "proposed":
          return `Idea: ${k} “${op.title}”`;
        case "rejected":
          return `Ruled out “${op.title}”`;
      }
      return op.title;
    }
    case "update_item": {
      const item = findItem(state, op.itemId);
      const renamed = op.title && op.title !== title(op.itemId);
      if (item?.kind === "concept" && renamed) {
        const slot = CONCEPT_SLOTS.find((s) => s.slot === item.slot)?.label ?? "Basics";
        return `${slot}: “${item.title}” → “${op.title}”`;
      }
      if (renamed) return `Renamed “${title(op.itemId)}” to “${op.title}”${op.summary ? `: ${op.summary}` : ""}`;
      return `Changed “${title(op.itemId)}”${op.summary ? `: ${op.summary}` : ""}`;
    }
    case "set_status":
      return {
        confirmed: `Marked “${title(op.itemId)}” as decided`,
        likely: `Marked “${title(op.itemId)}” as probably`,
        proposed: `Moved “${title(op.itemId)}” back to ideas`,
        rejected: `Ruled out “${title(op.itemId)}”`,
      }[op.status];
    case "add_link":
      return `“${title(op.from)}” ${LINK_VERB[op.linkType] ?? "relates to"} “${title(op.to)}”`;
    case "add_question":
      return `To decide: ${op.question}`;
    case "resolve_question": {
      const q = state.questions.find((x) => x.id === op.questionId);
      return `Answered: ${q?.question ?? "a question"} → ${op.resolution}`;
    }
    case "record_decision":
      return `Decision: ${op.title}. ${op.before ? `${op.before} → ` : ""}${op.after}`;
  }
}

const LINK_VERB: Record<string, string> = {
  depends_on: "needs", feeds: "powers", counters: "counters", supports: "supports",
  conflicts_with: "works against", unlocks: "unlocks", teaches: "teaches", related: "relates to",
};

/** Friendly names for statuses, used everywhere in the UI. */
export const STATUS_WORD: Record<Status, string> = { confirmed: "Decided", likely: "Probably", proposed: "Idea", rejected: "Ruled out" };

export function statusVerb(s: Status): string {
  return STATUS_WORD[s];
}

export function kindLabel(k: string): string {
  const labels: Record<string, string> = {
    concept: "Concept", pillar: "Pillar", loop: "Core loop step", system: "System", mechanic: "Mechanic",
    weapon: "Weapon", ability: "Ability", enemy: "Enemy", boss: "Boss", level: "Level", character: "Character",
    narrative: "Narrative", art: "Art", ui: "UI", constraint: "Constraint", reference: "Reference", other: "Note",
  };
  return labels[k] ?? k;
}

export type { DesignItem };
