/**
 * THE EXAMPLE PROJECT: "Acorn Ronin"
 * A short, pre-written design session (the squirrel samurai from the spec)
 * that runs through the REAL pipeline — clerk ops, validation, memory,
 * consequences — with scripted model answers. New users open the app to a
 * working project instead of an empty screen, and it doubles as a test.
 */
import type { GenerateRequest, ModelProvider } from "./provider";
import type { ModeId } from "./types";

interface Turn {
  mode: ModeId;
  user: string;
  reply: string;
  clerk: (index: string) => unknown[];
  analysis?: unknown;
}

/** Find an item id in the clerk's memory index by title. */
function idOf(index: string, title: string): string {
  const line = index.split("\n").find((l) => l.split(" | ")[3]?.trim().toLowerCase() === title.toLowerCase());
  return line ? line.split(" | ")[0].trim() : title;
}
function questionId(index: string, startsWith: string): string {
  const line = index.split("\n").find((l) => /^q_/.test(l) && l.includes(startsWith));
  return line ? line.split(" | ")[0].trim() : "q_unknown";
}

export const EXAMPLE_TURNS: Turn[] = [
  {
    mode: "concept",
    user: "I want to make a fast third-person game about a squirrel samurai with a sword and a gun.",
    reply: `A squirrel samurai is a great start: small, quick, and easy to picture. The big question is what the player should feel best about, because that shapes everything else.

- **A) Speed.** You're a blur, always moving, fighting on the run.
- **B) Skill.** You're a duelist: read the enemy, dodge at the last second, switch sword and gun at the right moment.
- **C) Size.** You're tiny in a giant world, climbing furniture and using it as a weapon.

Which one sounds most like your game?`,
    clerk: () => [
      { type: "create_item", ref: "new:1", kind: "concept", slot: "perspective", title: "Third-person", summary: "", status: "confirmed", origin: "user_stated", evidence: "fast third-person game" },
      { type: "create_item", ref: "new:2", kind: "concept", slot: "playerRole", title: "Squirrel samurai", summary: "The player is a squirrel samurai.", status: "confirmed", origin: "user_stated", evidence: "about a squirrel samurai" },
      { type: "create_item", ref: "new:3", kind: "system", title: "Combat", summary: "Fights use a sword and a gun.", status: "likely", origin: "user_stated", evidence: "with a sword and a gun" },
      { type: "create_item", ref: "new:4", kind: "weapon", title: "Sword", summary: "The samurai's melee weapon.", status: "confirmed", parent: "new:3", origin: "user_stated", evidence: "with a sword and a gun" },
      { type: "create_item", ref: "new:5", kind: "weapon", title: "Gun", summary: "The samurai's ranged weapon.", status: "confirmed", parent: "new:3", origin: "user_stated", evidence: "with a sword and a gun" },
      { type: "add_question", question: "What does 'fast' mean for this game: fast movement, fast combat, or both?", origin: "ai_suggested" },
    ],
  },
  {
    mode: "concept",
    user: "B, the agile duelist. The working title is Acorn Ronin. I'm a solo developer and I have about a year of evenings and weekends.",
    reply: `Agile duelist it is. So movement is there to set up fights, and the sword and gun reward good timing.

One gentle heads-up: solo with about a year of evenings is roughly 500-700 hours. That's enough for a short, polished game of 2-4 hours, not a huge world. The duelist idea fits that well, because it lives in how fighting feels more than in lots of content.

Here are three main goals (pillars) to check new ideas against:

1. **Readable, fast duels.** Every enemy attack gives a clear warning, and you win by reacting.
2. **Blade and barrel.** Sword and gun work together, not as two separate styles.
3. **Small hero, big world.** Levels are human-sized places seen from a squirrel's height.

Do these feel right, or is one of them not your game?`,
    clerk: (index) => [
      { type: "create_item", ref: "new:1", kind: "concept", slot: "coreFantasy", title: "Agile duelist", summary: "Precision is the fantasy: read enemies, dodge at the last moment, switch between blade and gun at the right time.", status: "confirmed", origin: "user_accepted", evidence: "B, the agile duelist" },
      { type: "create_item", ref: "new:2", kind: "concept", slot: "title", title: "Acorn Ronin", summary: "", status: "confirmed", origin: "user_stated", evidence: "The working title is Acorn Ronin" },
      { type: "create_item", ref: "new:3", kind: "concept", slot: "scope", title: "Small: solo, about a year part-time", summary: "Roughly 500-700 hours of work; aim for a polished 2-4 hour game.", status: "confirmed", origin: "user_stated", evidence: "I'm a solo developer and I have about a year of evenings and weekends" },
      { type: "create_item", ref: "new:4", kind: "constraint", title: "Solo developer, evenings and weekends", summary: "One person, about a year of part-time work.", status: "confirmed", origin: "user_stated", evidence: "I'm a solo developer and I have about a year of evenings and weekends" },
      { type: "resolve_question", questionId: questionId(index, "What does 'fast' mean"), resolution: "Fast means precise, reactive duels: the agile duelist.", origin: "user_accepted", evidence: "B, the agile duelist" },
    ],
  },
  {
    mode: "chat",
    user: "Pillars 1 and 2 are right. Not sure about 3 yet. Movement is double jump, air dash and wall jump. I don't want wall running, it's too close to wall jump. The gun is an energy rifle and its energy regenerates automatically.",
    reply: `Great, readable duels and blade-and-barrel are now your main goals. I'll keep "small hero, big world" as an idea for now.

Your moves are nicely small: double jump for height, air dash for distance, wall jump for climbing. Dropping wall running keeps each move useful.

One thing to watch: if the rifle refills by itself, players may just stay back and shoot, since that's safer. Want to look at combat next?`,
    clerk: (index) => [
      { type: "create_item", ref: "new:1", kind: "pillar", title: "Readable, fast duels", summary: "Every enemy attack is telegraphed; the player wins by reading and reacting.", status: "confirmed", origin: "user_accepted", evidence: "Pillars 1 and 2 are right" },
      { type: "create_item", ref: "new:2", kind: "pillar", title: "Blade and barrel", summary: "Melee and ranged are two halves of one loop, not two separate play styles.", status: "confirmed", origin: "user_accepted", evidence: "Pillars 1 and 2 are right" },
      { type: "create_item", ref: "new:3", kind: "pillar", title: "Small hero, big world", summary: "Levels are human-scale spaces seen from a squirrel's height.", status: "proposed", origin: "ai_suggested" },
      { type: "create_item", ref: "new:4", kind: "system", title: "Movement", summary: "Double jump, air dash and wall jump.", status: "confirmed", origin: "user_stated", evidence: "Movement is double jump, air dash and wall jump" },
      { type: "create_item", ref: "new:5", kind: "mechanic", title: "Double jump", summary: "A second jump in mid-air for height.", status: "confirmed", parent: "new:4", origin: "user_stated", evidence: "Movement is double jump" },
      { type: "create_item", ref: "new:6", kind: "mechanic", title: "Air dash", summary: "A quick burst in the air for distance and aerial dodging.", status: "confirmed", parent: "new:4", origin: "user_stated", evidence: "air dash" },
      { type: "create_item", ref: "new:7", kind: "mechanic", title: "Wall jump", summary: "Kick off walls to climb.", status: "confirmed", parent: "new:4", origin: "user_stated", evidence: "wall jump" },
      { type: "create_item", ref: "new:8", kind: "mechanic", title: "Wall running", summary: "", status: "rejected", rationale: "Too close to wall jump.", origin: "user_stated", evidence: "I don't want wall running, it's too close to wall jump" },
      { type: "update_item", itemId: idOf(index, "Gun"), title: "Energy rifle", summary: "A ranged weapon whose energy regenerates automatically.", origin: "user_stated", evidence: "The gun is an energy rifle and its energy regenerates automatically" },
    ],
  },
  {
    mode: "critic",
    user: "Critique the combat as it stands.",
    reply: `Here's my honest take on combat right now.

**1. Shooting is always the safe choice (big problem).** The rifle refills on its own and costs nothing, while the sword means getting close and getting hit. Most players will pick the safe option. Fixes: **A)** sword hits refill the rifle, **B)** slow refill plus energy from sword kills, or **C)** shots can't break an enemy's guard, so you need the sword.

**2. No way to dodge yet (medium).** Your first goal is about reacting, but there's no move for it. A ground dodge that rewards good timing would fix that.

**3. The sword needs a personality (small).** Fast combos or slow, heavy hits? That choice shapes your enemies.

What's working: your movement is simple and every move has a job. Keep that.

Which rifle fix do you like: A, B or C?`,
    clerk: () => [
      { type: "add_question", question: "How does the player defend: dodge, parry or block?", why: "Pillar 1 needs a way to react to telegraphed attacks.", origin: "ai_suggested" },
      { type: "add_question", question: "Is the sword about fast combos or heavy, deliberate strikes?", why: "Decides enemy design and hit feedback.", origin: "ai_suggested" },
    ],
  },
  {
    mode: "chat",
    user: "A. I want players switching between melee and ranged all the time.",
    reply: `Done: the sword now powers the rifle. To keep shooting, players have to get in close, which is exactly what "blade and barrel" is about.

Two things to keep in mind: enemies now need openings to rush into, and running out of energy should feel like a signal to attack, not a punishment. I've listed what else this touches below.

A good next step is the dodge, since players will be up close more often.`,
    clerk: (index) => [
      { type: "update_item", itemId: idOf(index, "Energy rifle"), summary: "Rifle energy only recharges when sword hits land, so players must close in to keep shooting.", change: true, origin: "user_accepted", evidence: "A. I want players switching between melee and ranged all the time" },
      { type: "create_item", ref: "new:1", kind: "mechanic", title: "Melee recharge", summary: "Each sword hit restores rifle energy.", status: "confirmed", parent: idOf(index, "Combat"), origin: "user_accepted", evidence: "A. I want players switching between melee and ranged all the time" },
      { type: "add_link", from: idOf(index, "Sword"), to: idOf(index, "Energy rifle"), linkType: "feeds", note: "Sword hits restore rifle energy.", origin: "user_accepted", evidence: "A. I want players switching between melee and ranged" },
      { type: "record_decision", title: "Rifle energy system", before: "Energy regenerates automatically", after: "Sword hits restore rifle energy", reason: "Keep players switching between melee and ranged all the time.", alternatives: ["Slow regeneration plus energy drops from melee kills", "Shots weak against guarding enemies"], items: [idOf(index, "Energy rifle")], origin: "user_accepted", evidence: "A. I want players switching between melee and ranged all the time" },
    ],
    analysis: {
      whatChanged: "Rifle energy: regenerates automatically → restored only by sword hits.",
      systemsAffected: [
        { name: "Sword", impact: "Now the engine of the ranged game: its hit rate decides how often the player can shoot." },
        { name: "Energy rifle", impact: "Becomes a reward for aggression instead of a safe default." },
        { name: "Air dash", impact: "Gains a new job, closing distance to refuel, so its cooldown matters more." },
        { name: "Blade and barrel", impact: "The pillar is now enforced by a rule instead of hoped for." },
      ],
      problems: [
        "Players can get stuck at range with an empty rifle against enemies that are hard to approach.",
        "Enemies that punish closing in will make the loop feel unfair, so enemy design now has to leave openings.",
        "Without a defensive move, the extra time spent in melee will turn into more damage taken.",
      ],
      opportunities: [
        "The empty-rifle moment can become a clear cue (a sound and a HUD flash) that says 'go in'.",
        "Upgrades can tune energy per hit: a cheap source of build variety.",
      ],
      tests: [
        "Watch whether testers deliberately go in to refuel, or stop using the rifle.",
        "Measure how often the rifle sits empty for more than five seconds.",
        "In a fight against three enemies, see whether players alternate weapons or stick to one.",
      ],
    },
  },
];

export class ExampleProvider implements ModelProvider {
  readonly name = "example";
  private turn = -1;
  async generate(req: GenerateRequest): Promise<string> {
    if (req.purpose === "reply") {
      this.turn++;
      const t = EXAMPLE_TURNS[this.turn].reply;
      req.onText?.(t);
      return t;
    }
    const t = EXAMPLE_TURNS[this.turn];
    if (req.purpose === "clerk") {
      const index = req.messages[0].content.split("PREVIOUS ASSISTANT MESSAGE")[0];
      return JSON.stringify({ ops: t.clerk(index) });
    }
    return JSON.stringify(t.analysis ?? {});
  }
}

export const EXAMPLE_NAME = "Acorn Ronin (example)";
