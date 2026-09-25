/**
 * DESIGN CONSEQUENCES PROMPT
 * Runs when confirmed design changes. Explains knock-on effects; never
 * reverses the user's decision.
 */
import { z } from "zod";
import type { Consequences, DesignItem } from "../types";

export const CONSEQUENCES_SYSTEM = `You are a senior systems designer reviewing a change the creative director just made to their game. Game mechanics affect one another; your job is to trace how this change ripples through the rest of the design.

- The user decided. Don't argue against the change or suggest undoing it. Explain effects and how to make the new direction work.
- Be specific to this game. Name the affected items as they appear in memory. No generic advice.
- Think about player behaviour: what will players now do more, less, or differently?
- Keep each point to one short, plain sentence. No jargon.

Return only JSON:
{"whatChanged": "one sentence, before -> after",
 "systemsAffected": [{"name": "item or system name", "itemId": "its id if it has one", "impact": "one sentence"}],
 "problems": ["concrete risks: what players might do, what stops working"],
 "opportunities": ["what the change makes possible"],
 "tests": ["specific playtest checks, e.g. 'Watch whether players still use melee in the first boss'"]}
Limits: systemsAffected 1-5 (most affected first), problems 0-4, opportunities 0-3, tests 1-4.`;

export function describeChange(changes: { before: DesignItem; after: DesignItem | null }[]): string {
  return changes
    .map(({ before, after }) => {
      const b = `${before.title} [${before.status}]: ${before.summary || "(no summary)"}`;
      const a = after ? `${after.title} [${after.status}]: ${after.summary || "(no summary)"}` : "(deleted)";
      return `- ${before.kind} (${before.id})\n  BEFORE: ${b}\n  AFTER:  ${a}`;
    })
    .join("\n");
}

const str = z.string().trim();
export const ConsequencesSchema = z.object({
  whatChanged: str.default(""),
  systemsAffected: z
    .array(z.object({ name: str, itemId: str.optional().nullable().transform((v) => v || undefined), impact: str }))
    .default([])
    .transform((a) => a.slice(0, 5)),
  problems: z.array(str).default([]).transform((a) => a.slice(0, 4)),
  opportunities: z.array(str).default([]).transform((a) => a.slice(0, 3)),
  tests: z.array(str).default([]).transform((a) => a.slice(0, 4)),
});

export function parseConsequences(raw: unknown): Consequences {
  return ConsequencesSchema.parse(raw);
}

/** Plain-text version stored as the message content (used as chat history). */
export function consequencesToText(c: Consequences): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : "- (none noted)");
  return [
    "**What this change affects**",
    "",
    `**What changed:** ${c.whatChanged}`,
    "",
    "**Parts of the game affected**",
    list(c.systemsAffected.map((s) => `${s.name}: ${s.impact}`)),
    "",
    "**Watch out for**",
    list(c.problems),
    "",
    "**New possibilities**",
    list(c.opportunities),
    "",
    "**Try this in a playtest**",
    list(c.tests),
  ].join("\n");
}
