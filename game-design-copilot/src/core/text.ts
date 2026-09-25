/**
 * Small text helpers used by the memory rules.
 * Kept deliberately simple (no NLP libraries) so the behaviour is easy
 * to predict and to test.
 */

/** Lowercase, straighten quotes, drop punctuation, collapse spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "a an the and or but of to in on at for with by from as is are was were be been it its this that these " +
    "those i we you they he she my our your their me us them do does did not no so if then than into about " +
    "just can could should would will shall may might have has had get got make made like want need think " +
    "what which who how why when where there here some any all more most very really also still maybe"
  ).split(" "),
);

/** Meaningful words, crudely singularised ("bosses" → "boss", "dashing" stays). */
export function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(singular);
}

function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("sses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/**
 * Are two titles "the same idea"? True when they normalise to the same
 * string, or when one's words are all contained in the other's (and it has
 * at least two words — so "Dash" doesn't swallow "Air Dash").
 *   "Wall running" ~ "Wall-running ability"  → true
 *   "Dash" ~ "Air dash"                      → false
 */
export function similarTitle(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  if (small.size < 2) return [...small].join(" ") === [...big].join(" ");
  for (const t of small) if (!big.has(t)) return false;
  return true;
}

/** Share of words two sentences have in common (0–1). Used for duplicate questions. */
export function overlap(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.min(ta.size, tb.size);
}

/**
 * THE EVIDENCE CHECK.
 * The clerk must quote the user's own words to claim the user decided
 * something. We check the quote really appears in the user's message.
 * A quote may skip words with "..." — each piece must appear, in order.
 */
export function evidenceMatches(evidence: string | undefined, userText: string): boolean {
  if (!evidence) return false;
  const haystack = normalize(userText);
  const pieces = evidence
    .split(/\.\.\.|…/)
    .map(normalize)
    .filter((p) => p.length > 0);
  if (pieces.length === 0) return false;
  // A very short quote ("B", "ok") only counts if it IS the whole message.
  if (pieces.length === 1 && pieces[0] === haystack) return true;
  const total = pieces.reduce((n, p) => n + p.length, 0);
  if (total < 3) return false;
  let from = 0;
  for (const p of pieces) {
    const at = haystack.indexOf(p, from);
    if (at < 0) return false;
    from = at + p.length;
  }
  return true;
}

/** Trim to a length on a word boundary, adding an ellipsis. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

/** Find the first JSON object in a model reply (tolerates ```json fences and chatter). */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [text.trim()];
  if (fence) candidates.push(fence[1].trim());
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error("The model's reply did not contain valid JSON.");
}
