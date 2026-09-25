/**
 * THE MEMORY BRIEF
 * ================
 * Each turn, the model gets a compact written summary of the project's
 * memory — not the whole chat history. This is how the copilot "remembers"
 * months of design work without re-reading every conversation.
 *
 * The brief has a size budget. Pillars, concept, loop, rejected ideas, open
 * questions and recent decisions always go in. Everything else is ranked by
 * relevance to the user's message; less relevant items shrink to a title.
 * (Later, embeddings can replace `relevance()` without changing callers.)
 */
import type { DesignItem, ProjectState } from "./types";
import { CONCEPT_SLOTS } from "./types";
import { clip, tokens } from "./text";
import { kindLabel } from "./validate";
import { pad } from "./memory";

const TAG: Record<DesignItem["status"], string> = { confirmed: "Decided", likely: "Probably", proposed: "Idea", rejected: "Ruled out" };

export interface BriefOptions {
  /** The user's message, used to rank what's relevant. */
  query?: string;
  /** Soft cap in characters (~4 chars per token). */
  budget?: number;
  /** Item ids that must be shown in full (e.g. the subject of a critique). */
  focusIds?: string[];
}

/** Score items by word overlap with the query, plus their graph neighbours. */
export function relevance(state: ProjectState, query: string): Map<string, number> {
  const q = new Set(tokens(query));
  const scores = new Map<string, number>();
  if (q.size === 0) return scores;
  for (const it of state.items) {
    let s = 0;
    for (const t of tokens(it.title)) if (q.has(t)) s += 3;
    for (const t of tokens(it.summary)) if (q.has(t)) s += 1;
    if (s > 0) scores.set(it.id, s);
  }
  // neighbours of relevant items get a little relevance too
  const direct = [...scores.keys()];
  for (const id of direct) {
    const it = state.items.find((i) => i.id === id);
    const neighbours = new Set<string>();
    if (it?.parentId) neighbours.add(it.parentId);
    for (const c of state.items) if (c.parentId === id) neighbours.add(c.id);
    for (const l of state.links) {
      if (l.from === id) neighbours.add(l.to);
      if (l.to === id) neighbours.add(l.from);
    }
    for (const n of neighbours) scores.set(n, (scores.get(n) ?? 0) + 1);
  }
  return scores;
}

function line(it: DesignItem, full: boolean): string {
  const head = `[${TAG[it.status]}] ${it.title} (${it.id})`;
  if (!full || !it.summary) return head;
  return `${head}: ${clip(it.summary, 280)}`;
}

/** Items shown in the "Design" tree: everything except concept, pillars, loop, rejected. */
function treeItems(state: ProjectState) {
  return state.items.filter((i) => !["concept", "pillar", "loop"].includes(i.kind) && i.status !== "rejected");
}

export function buildBrief(state: ProjectState, opts: BriefOptions = {}): string {
  const budget = opts.budget ?? 14000;
  const scores = relevance(state, opts.query ?? "");
  const focus = new Set(opts.focusIds ?? []);
  const out: string[] = [];
  const name = state.items.find((i) => i.kind === "concept" && i.slot === "title")?.title ?? state.project.name;

  out.push(`GAME NOTES — "${name}"`);
  out.push(`Tags: [Decided] = the user chose it · [Probably] = implied, not confirmed · [Idea] = being considered, NOT decided`);

  // Concept
  const concept = CONCEPT_SLOTS.map((s) => ({ s, it: state.items.find((i) => i.kind === "concept" && i.slot === s.slot) }));
  out.push("", "## Basics");
  for (const { s, it } of concept) {
    if (it) out.push(`- ${s.label} [${TAG[it.status]}]: ${it.title}${it.summary ? ` — ${clip(it.summary, 200)}` : ""} (${it.id})`);
  }
  const unknown = concept.filter((c) => !c.it).map((c) => c.s.label);
  if (unknown.length) out.push(`- Not decided yet: ${unknown.join(", ")}`);

  const pillars = state.items.filter((i) => i.kind === "pillar" && i.status !== "rejected").sort(byOrder);
  out.push("", "## Pillars (the main goals of the game)");
  out.push(...(pillars.length ? pillars.map((p) => `- ${line(p, true)}`) : ["- (none yet)"]));

  const loop = state.items.filter((i) => i.kind === "loop" && i.status !== "rejected").sort(byOrder);
  out.push("", "## Core loop");
  out.push(...(loop.length ? loop.map((p, n) => `${n + 1}. ${line(p, true)}`) : ["- (not defined yet)"]));

  // Rejected — always in full, so the model never re-suggests them
  const rejected = state.items.filter((i) => i.status === "rejected");
  out.push("", "## Ruled out — never suggest these unless the user brings them back");
  out.push(...(rejected.length ? rejected.map((r) => `- ${r.title}${r.rationale ? ` — reason: ${clip(r.rationale, 160)}` : ""}`) : ["- (none)"]));

  // Open questions
  const open = state.questions.filter((q) => q.status === "open");
  out.push("", "## Still to decide");
  out.push(...(open.length ? open.slice(-15).map((q) => `- (${q.id}) ${q.question}`) : ["- (none)"]));

  // Recent decisions
  const decisions = [...state.decisions].sort((a, b) => b.number - a.number);
  out.push("", "## Past decisions (newest first)");
  out.push(
    ...(decisions.length
      ? decisions.slice(0, 12).map((d) => `- DECISION ${pad(d.number)} ${d.title}: ${d.before ? `${clip(d.before, 120)} → ` : ""}${clip(d.after, 160)}${d.reason ? `. Why: ${clip(d.reason, 180)}` : ""}`)
      : ["- (none yet)"]),
  );
  if (decisions.length > 12) out.push(`- (${decisions.length - 12} older decisions not shown)`);

  const fixed = out.join("\n");

  // The design tree, sized to what's left of the budget.
  const items = treeItems(state);
  const remaining = budget - fixed.length - 200;
  const tree = renderTree(state, items, scores, focus, remaining);
  return `${fixed}\n\n## Game details (systems, mechanics, content)\n${tree}`;
}

function byOrder(a: DesignItem, b: DesignItem) {
  return (a.order ?? 0) - (b.order ?? 0);
}

/**
 * Render items as an indented tree. First try everything in full; if that's
 * over budget, show relevant/confirmed items in full and the rest as titles;
 * if still over, drop unrelated proposals entirely.
 */
function renderTree(
  state: ProjectState,
  items: DesignItem[],
  scores: Map<string, number>,
  focus: Set<string>,
  budget: number,
): string {
  if (items.length === 0) return "- (nothing designed yet)";
  const ids = new Set(items.map((i) => i.id));
  const children = (pid: string | null) =>
    items.filter((i) => (i.parentId && ids.has(i.parentId) ? i.parentId : null) === pid);

  const attempt = (fullFor: (it: DesignItem) => boolean, include: (it: DesignItem) => boolean) => {
    const lines: string[] = [];
    let hidden = 0;
    const walk = (pid: string | null, depth: number) => {
      for (const it of children(pid)) {
        if (!include(it)) {
          hidden++;
          continue;
        }
        lines.push(`${"  ".repeat(depth)}- ${kindLabel(it.kind)} ${line(it, fullFor(it))}`);
        walk(it.id, depth + 1);
      }
    };
    walk(null, 0);
    if (hidden) lines.push(`- (${hidden} less relevant proposals not shown)`);
    const linkLines = state.links
      .filter((l) => ids.has(l.from) && ids.has(l.to))
      .slice(-40)
      .map((l) => `- ${title(state, l.from)} —${l.type.replace(/_/g, " ")}→ ${title(state, l.to)}${l.note ? ` (${clip(l.note, 80)})` : ""}`);
    if (linkLines.length) lines.push("", "Connections:", ...linkLines);
    return lines.join("\n");
  };

  const important = (it: DesignItem) => focus.has(it.id) || (scores.get(it.id) ?? 0) > 0;
  const tries = [
    attempt(() => true, () => true),
    attempt((it) => important(it) || it.status === "confirmed", () => true),
    attempt(important, () => true),
    attempt(important, (it) => important(it) || it.status !== "proposed"),
  ];
  return tries.find((t) => t.length <= budget) ?? tries[tries.length - 1];
}

function title(state: ProjectState, id: string) {
  return state.items.find((i) => i.id === id)?.title ?? id;
}

/**
 * The index the clerk sees: every item and open question with its id, so
 * it can refer to existing things instead of creating duplicates.
 */
export function buildClerkIndex(state: ProjectState): string {
  const lines = ["ITEMS (id | kind | status | title | parent | slot):"];
  for (const it of state.items) {
    lines.push(`${it.id} | ${it.kind} | ${it.status} | ${it.title} | ${it.parentId ?? "-"} | ${it.slot ?? "-"}`);
  }
  if (state.items.length === 0) lines.push("(none)");
  lines.push("", "OPEN QUESTIONS (id | question):");
  const open = state.questions.filter((q) => q.status === "open");
  for (const q of open) lines.push(`${q.id} | ${q.question}`);
  if (open.length === 0) lines.push("(none)");
  return lines.join("\n");
}

/** Short one-paragraph summary for the context panel and project list. */
export function oneLiner(state: ProjectState): string {
  const get = (slot: string) => state.items.find((i) => i.kind === "concept" && i.slot === slot && i.status !== "rejected")?.title;
  const parts = [get("genre"), get("perspective") && `${get("perspective")}`, get("coreFantasy")].filter(Boolean);
  return parts.join(" · ");
}
