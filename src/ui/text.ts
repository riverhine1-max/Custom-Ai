/** Plain-text versions of things, for the Copy buttons. */
import type { Consequences } from "../core";

export function consequencesAsText(c: Consequences): string {
  const list = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n") || "- Nothing noted";
  return [
    `What this change affects: ${c.whatChanged}`,
    "",
    "Parts of your game affected:",
    list(c.systemsAffected.map((s) => `${s.name}: ${s.impact}`)),
    "",
    "Watch out for:",
    list(c.problems),
    "",
    "New possibilities:",
    list(c.opportunities),
    "",
    "Try this in a playtest:",
    list(c.tests),
  ].join("\n");
}

/** Turn a short idea into a working project name ("A cozy farming game…" → "Cozy farming game"). */
export function nameFromIdea(idea: string): string {
  const named = idea.match(/\b(?:called|named|titled)\s+["“']?([A-Z0-9][\w'’ -]{1,40}?)["”']?(?=[,.!?;]|\s+(?:and|but|where|with|about)\b|$)/);
  if (named) return named[1].trim();
  const cleaned = idea
    .replace(/^(i\s+(want|would like|'d like|wanna)\s+to\s+(make|build|create)\s+)/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/[.!?].*$/, "")
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 5).join(" ");
  const name = words.length > 3 ? words : "New game";
  return name.charAt(0).toUpperCase() + name.slice(1) + (cleaned.split(/\s+/).length > 5 ? "…" : "");
}
