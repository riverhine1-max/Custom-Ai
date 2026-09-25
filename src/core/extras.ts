/**
 * EXTRAS: small mechanics that don't need the AI.
 *
 *  - Design Dice: a random creative twist to shake up a stuck design. It only
 *    writes a prompt into the message box; you decide whether to send it.
 *  - Scope meter: a rough "how big is this game getting?" score, counted from
 *    your notes, so a solo dev sees scope creep early.
 */
import { CONCEPT_SLOTS, type ItemKind, type ProjectState } from "./types";

export type DiceKind = "twist" | "limit" | "player" | "world";

export const DICE_KINDS: Record<DiceKind, string> = {
  twist: "Twist",
  limit: "Limit",
  player: "Player",
  world: "World",
};

/** Each face is a short "what if…" that works for almost any game. */
export const DESIGN_DICE: { kind: DiceKind; text: string }[] = [
  { kind: "twist", text: "the main enemy is secretly on the player's side" },
  { kind: "twist", text: "every fight could be solved without fighting" },
  { kind: "twist", text: "the world changes a little every time the player dies" },
  { kind: "twist", text: "the most powerful ability has a real cost" },
  { kind: "twist", text: "the tutorial is also the final level, played backwards" },
  { kind: "twist", text: "the player's weapon has a personality and opinions" },
  { kind: "twist", text: "time only moves when the player moves" },
  { kind: "twist", text: "the map is drawn by the player as they explore" },
  { kind: "twist", text: "enemies remember how the player beat them last time" },
  { kind: "twist", text: "the story is told only through items and places, with no dialogue" },
  { kind: "twist", text: "the player can swap roles with any enemy for ten seconds" },
  { kind: "twist", text: "losing a fight opens a new path instead of a game over" },
  { kind: "limit", text: "the player can only use two buttons" },
  { kind: "limit", text: "each level must be finished in under three minutes" },
  { kind: "limit", text: "there is no UI on screen at all during play" },
  { kind: "limit", text: "the whole game takes place in one building" },
  { kind: "limit", text: "you can only add one new mechanic per level" },
  { kind: "limit", text: "the player can never jump" },
  { kind: "limit", text: "there are only three enemy types in the whole game" },
  { kind: "limit", text: "the game has to be playable with one hand" },
  { kind: "limit", text: "you have to cut your least favourite system entirely" },
  { kind: "limit", text: "the player can only carry one item at a time" },
  { kind: "player", text: "the player is much weaker than every enemy" },
  { kind: "player", text: "the player has to protect something that can't fight" },
  { kind: "player", text: "a second player can join and play a completely different role" },
  { kind: "player", text: "the player chooses a flaw at the start that lasts the whole game" },
  { kind: "player", text: "the player's best move only works when they take a risk" },
  { kind: "player", text: "the player gets a new way to move, but loses an old one" },
  { kind: "player", text: "the player is being hunted the whole time" },
  { kind: "player", text: "the player can undo their last five seconds, once per fight" },
  { kind: "world", text: "the world is tiny, but every corner hides a secret" },
  { kind: "world", text: "the weather changes how every system works" },
  { kind: "world", text: "day and night are completely different games" },
  { kind: "world", text: "the world is falling apart and shrinks over time" },
  { kind: "world", text: "one place in the world is visited again and again, changing each time" },
  { kind: "world", text: "the setting is the opposite of what the genre usually uses" },
  { kind: "world", text: "a friendly town becomes more dangerous the more the player helps it" },
  { kind: "world", text: "sound is the most important way to find your way around" },
];

export interface DiceRoll {
  kind: DiceKind;
  text: string;
}

/** Roll a face, never the same one twice in a row. */
export function rollDesignDice(previous?: string, rand: () => number = Math.random): DiceRoll {
  const pool = DESIGN_DICE.filter((d) => d.text !== previous);
  return pool[Math.floor(rand() * pool.length) % pool.length];
}

/** The message the dice put in the box. Mentions pillars so the designer checks the fit. */
export function dicePrompt(roll: DiceRoll): string {
  return `Design dice (${DICE_KINDS[roll.kind].toLowerCase()}): what if ${roll.text}? Give me two ways this could work in my game, and tell me honestly if it fights my main goals.`;
}

/* ------------------------------------------------------------------ scope */

const WEIGHTS: Partial<Record<ItemKind, number>> = {
  system: 3,
  mechanic: 1.5,
  boss: 3,
  level: 2,
  enemy: 1,
  weapon: 1,
  ability: 1,
  character: 1,
  narrative: 1,
  ui: 0.5,
  art: 0.5,
  loop: 0.5,
};

export const SCOPE_LEVELS = [
  { id: "tiny", label: "Tiny", max: 8, note: "A jam-sized game. Plenty of room to grow." },
  { id: "small", label: "Small", max: 20, note: "A good size for a first finished game." },
  { id: "medium", label: "Medium", max: 36, note: "Doable solo with steady work. Watch for creep." },
  { id: "large", label: "Large", max: 56, note: "Big for one person. Decide what the smallest fun version is." },
  { id: "huge", label: "Huge", max: Infinity, note: "Studio-sized. Try “Is it too big?” to find a smaller first version." },
] as const;

export interface ScopeReport {
  score: number;
  level: (typeof SCOPE_LEVELS)[number];
  /** 0–4, which of the five segments is lit. */
  step: number;
  counts: { systems: number; mechanics: number; content: number };
  basicsDone: number;
  basicsTotal: number;
}

/** Counts decided and likely notes (ideas count half; ruled-out ideas don't count). */
export function scopeReport(state: ProjectState): ScopeReport {
  let score = 0;
  const counts = { systems: 0, mechanics: 0, content: 0 };
  for (const it of state.items) {
    if (it.status === "rejected") continue;
    const w = WEIGHTS[it.kind] ?? 0;
    score += it.status === "proposed" ? w / 2 : w;
    if (it.kind === "system") counts.systems++;
    else if (it.kind === "mechanic") counts.mechanics++;
    else if (["weapon", "ability", "enemy", "boss", "level", "character"].includes(it.kind)) counts.content++;
  }
  score = Math.round(score * 10) / 10;
  const step = SCOPE_LEVELS.findIndex((l) => score <= l.max);
  const basicsDone = CONCEPT_SLOTS.filter((s) => state.items.some((i) => i.kind === "concept" && i.slot === s.slot && i.status === "confirmed")).length;
  return { score, level: SCOPE_LEVELS[step], step, counts, basicsDone, basicsTotal: CONCEPT_SLOTS.length };
}
