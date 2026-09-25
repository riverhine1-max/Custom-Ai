/**
 * Clerk prompt evaluation cases. `npx tsx scripts/clerk-eval-cases.ts out.json`
 * writes the exact prompts the clerk would receive, so any model can be run on
 * them and its answers checked with scripts/clerk-eval-check.ts.
 */
import fs from "node:fs";
import { CLERK_SYSTEM, buildClerkInput } from "../src/core/prompts/clerk";
import { buildClerkIndex } from "../src/core/brief";
import { emptyState } from "../src/core/memory";
import type { DesignItem, ProjectState } from "../src/core/types";

function state(items: Partial<DesignItem>[]): ProjectState {
  const s = emptyState("Eval", "pr_eval");
  s.items = items.map((p, n) => ({ id: p.id!, kind: p.kind ?? "mechanic", title: p.title!, summary: p.summary ?? "", status: p.status ?? "confirmed", parentId: p.parentId ?? null, slot: p.slot, origin: "user", createdAt: "", updatedAt: "" }));
  return s;
}

export const CASES = [
  {
    id: "pitch-with-maybe",
    state: state([]),
    previousAssistant: undefined,
    user: "I'm making a cozy farming game where the crops are haunted. Top-down, pixel art. Maybe a day/night cycle.",
    reply: "Haunted crops are a lovely twist... A) crops as pets B) crops as threats. Which is closer?",
    expect: "perspective + art direction saved from the user's words; day/night only as proposed; no invented pillars",
  },
  {
    id: "accept-option-B",
    state: state([{ id: "it_1", kind: "system", title: "Combat" }]),
    previousAssistant: "For healing: A) limited flask charges refilled at shrines B) enemies drop healing seeds on melee kills C) slow regeneration out of combat.",
    user: "Let's go with B.",
    reply: "Seeds on melee kills it is. That rewards aggression...",
    expect: "a healing mechanic from option B, origin user_accepted, evidence quoting the user; ideally a decision",
  },
  {
    id: "request-only",
    state: state([{ id: "it_2", kind: "mechanic", title: "Grapple" }]),
    previousAssistant: undefined,
    user: "Give me five boss ideas that use the grapple.",
    reply: "1) The Canopy Serpent ... 2) The Bell Tower ... 3) ... 4) ... 5) ...",
    expect: "no items created from the reply's boss ideas",
  },
  {
    id: "reject-existing",
    state: state([{ id: "it_5", kind: "mechanic", title: "Grapple", summary: "Swing from anchor points." }]),
    previousAssistant: undefined,
    user: "Actually drop the grapple, it makes the levels too easy to skip.",
    reply: "Understood, the grapple is out...",
    expect: "set_status it_5 rejected with the reason, backed by the user's words",
  },
  {
    id: "change-mechanic",
    state: state([{ id: "it_9", kind: "mechanic", title: "Dodge stamina cost", summary: "Each dodge costs 25% stamina." }, { id: "it_10", kind: "system", title: "Combat" }]),
    previousAssistant: undefined,
    user: "Dodging shouldn't cost stamina anymore, I want players to dodge freely.",
    reply: "Free dodging changes the pace...",
    expect: "update_item on it_9 with change:true (or reject it) plus a decision; no duplicate item",
  },
  {
    id: "rejected-not-revived",
    state: state([{ id: "it_3", kind: "mechanic", title: "Wall running", status: "rejected" }, { id: "it_4", kind: "mechanic", title: "Wall jump" }]),
    previousAssistant: undefined,
    user: "Tell me more about movement options.",
    reply: "You could add a glide, a slide, or wall running along the towers...",
    expect: "nothing created for wall running (or anything else from the reply)",
  },
];

// Only export when run directly (not when imported by the checker).
if (process.argv[1]?.endsWith("clerk-eval-cases.ts") && process.argv[2]) {
  const out = CASES.map((c) => ({
    id: c.id,
    expect: c.expect,
    system: CLERK_SYSTEM,
    user: buildClerkInput({ index: buildClerkIndex(c.state), previousAssistant: c.previousAssistant, userText: c.user, reply: c.reply }),
  }));
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
  console.log(`wrote ${out.length} cases to ${process.argv[2]}`);
}
