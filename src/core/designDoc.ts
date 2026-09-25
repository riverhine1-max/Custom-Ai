/**
 * THE DESIGN DOCUMENT
 * Rendered from memory on demand, never written by the model. The main
 * sections contain CONFIRMED design only; likely and proposed items appear
 * in a separate section when `includeProposed` is on.
 */
import type { DesignItem, ItemKind, ProjectState } from "./types";
import { CONCEPT_SLOTS } from "./types";
import { kindLabel } from "./validate";
import { pad } from "./memory";

export interface DocOptions {
  includeProposed?: boolean;
}

const CONTENT_SECTIONS: { title: string; kinds: ItemKind[] }[] = [
  { title: "Characters", kinds: ["character"] },
  { title: "Enemies", kinds: ["enemy"] },
  { title: "Bosses", kinds: ["boss"] },
  { title: "World and levels", kinds: ["level"] },
  { title: "Narrative", kinds: ["narrative"] },
  { title: "Art direction", kinds: ["art"] },
  { title: "UI and controls", kinds: ["ui"] },
  { title: "Other mechanics, weapons and abilities", kinds: ["mechanic", "weapon", "ability"] },
  { title: "Scope and constraints", kinds: ["constraint"] },
  { title: "References and inspirations", kinds: ["reference"] },
  { title: "Other notes", kinds: ["other"] },
];

export function renderDesignDoc(state: ProjectState, opts: DocOptions = {}): string {
  const confirmed = state.items.filter((i) => i.status === "confirmed");
  const placed = new Set<string>();
  const out: string[] = [];
  const concept = (slot: string) => confirmed.find((i) => i.kind === "concept" && i.slot === slot);
  const title = concept("title")?.title ?? state.project.name;

  out.push(`# ${title}`, "");
  const pitch = [concept("genre")?.title, concept("perspective")?.title, concept("coreFantasy")?.title].filter(Boolean).join(" · ");
  if (pitch) out.push(`*${pitch}*`, "");
  out.push(`Everything here is decided. Built from your notes on ${new Date().toISOString().slice(0, 10)}.`, "");

  // Overview
  const rows = CONCEPT_SLOTS.map((s) => ({ s, it: concept(s.slot) })).filter((r) => r.it && r.s.slot !== "title");
  confirmed.filter((i) => i.kind === "concept").forEach((i) => placed.add(i.id));
  if (rows.length) {
    out.push("## The basics", "", "| | Decided |", "| --- | --- |");
    for (const { s, it } of rows) out.push(`| **${s.label}** | ${cell(it!.title)}${it!.summary ? ` — ${cell(it!.summary)}` : ""} |`);
    out.push("");
  }

  const pillars = confirmed.filter((i) => i.kind === "pillar").sort(byOrder);
  if (pillars.length) {
    out.push("## Main goals (pillars)", "");
    pillars.forEach((p, n) => {
      placed.add(p.id);
      out.push(`${n + 1}. **${p.title}**${p.summary ? ` — ${p.summary}` : ""}`);
    });
    out.push("");
  }

  const loop = confirmed.filter((i) => i.kind === "loop").sort(byOrder);
  if (loop.length) {
    loop.forEach((l) => placed.add(l.id));
    out.push("## Core loop", "", loop.map((l) => l.title).join(" → "), "");
    for (const l of loop) if (l.summary) out.push(`- **${l.title}:** ${l.summary}`);
    out.push("");
  }

  // Systems and their subtrees
  const systems = confirmed.filter((i) => i.kind === "system");
  if (systems.length) {
    out.push("## Systems", "");
    for (const s of systems) {
      placed.add(s.id);
      out.push(`### ${s.title}`, "");
      if (s.summary) out.push(s.summary, "");
      if (s.rationale) out.push(`*Why:* ${s.rationale}`, "");
      renderChildren(confirmed, s.id, 0, out, placed);
      out.push("");
    }
  }

  // Everything else, grouped by kind
  for (const sec of CONTENT_SECTIONS) {
    const pool = confirmed.filter((i) => sec.kinds.includes(i.kind) && !placed.has(i.id));
    const poolIds = new Set(pool.map((i) => i.id));
    // top level of this section = items whose parent isn't also in the section
    const items = pool.filter((i) => !(i.parentId && poolIds.has(i.parentId)));
    if (!items.length) continue;
    out.push(`## ${sec.title}`, "");
    for (const it of items) {
      placed.add(it.id);
      out.push(`- **${it.title}**${it.summary ? ` — ${it.summary}` : ""}${it.rationale ? ` *Why: ${it.rationale}*` : ""}`);
      renderChildren(confirmed, it.id, 1, out, placed);
    }
    out.push("");
  }

  // Not yet confirmed
  const tentative = state.items.filter((i) => i.status === "likely" || i.status === "proposed");
  if (opts.includeProposed && tentative.length) {
    out.push("## Ideas (not decided yet)", "", "These are being considered. They are not part of the game until you decide.", "");
    for (const it of tentative) {
      out.push(`- *${it.status === "likely" ? "Probably" : "Idea"}* · ${kindLabel(it.kind)} · **${it.title}**${it.summary ? ` — ${it.summary}` : ""}`);
    }
    out.push("");
  } else if (tentative.length) {
    out.push(`*${tentative.length} idea${tentative.length === 1 ? " isn't" : "s aren't"} shown because ${tentative.length === 1 ? "it isn't" : "they aren't"} decided yet. Turn on "Show ideas" to include them.*`, "");
  }

  const open = state.questions.filter((q) => q.status === "open");
  if (open.length) {
    out.push("## Still to decide", "");
    for (const q of open) out.push(`- [ ] ${q.question}${q.why ? ` *(${q.why})*` : ""}`);
    out.push("");
  }

  if (state.decisions.length) {
    out.push("## Decisions", "");
    for (const d of [...state.decisions].sort((a, b) => a.number - b.number)) {
      out.push(`**DECISION ${pad(d.number)} · ${d.title}** (${d.createdAt.slice(0, 10)})`, "");
      if (d.before) out.push(`- Original: ${d.before}`);
      out.push(`- ${d.before ? "Changed to" : "Chosen"}: ${d.after}`);
      if (d.reason) out.push(`- Reason: ${d.reason}`);
      if (d.alternatives?.length) out.push(`- Also considered: ${d.alternatives.join("; ")}`);
      out.push("");
    }
  }

  const rejected = state.items.filter((i) => i.status === "rejected");
  if (rejected.length) {
    out.push("## Ruled out", "");
    for (const r of rejected) out.push(`- ~~${r.title}~~${r.rationale ? ` — ${r.rationale}` : ""}`);
    out.push("");
  }

  if (out.length < 8) out.push("*Nothing is decided yet. As you make decisions in the chat, your game plan fills in here.*");
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function renderChildren(pool: DesignItem[], parentId: string, depth: number, out: string[], placed: Set<string>) {
  for (const c of pool.filter((i) => i.parentId === parentId && !placed.has(i.id))) {
    placed.add(c.id);
    out.push(`${"  ".repeat(depth)}- **${c.title}**${c.summary ? ` — ${c.summary}` : ""}${c.rationale ? ` *Why: ${c.rationale}*` : ""}`);
    renderChildren(pool, c.id, depth + 1, out, placed);
  }
}

function byOrder(a: DesignItem, b: DesignItem) {
  return (a.order ?? 0) - (b.order ?? 0);
}

function cell(s: string) {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
