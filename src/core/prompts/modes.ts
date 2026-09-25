/**
 * MODES
 * Each mode is a small extra instruction on top of the designer's voice.
 * Same memory, same safety rules. Only the job for this reply changes.
 */
import type { ModeId } from "../types";

export interface Mode {
  id: ModeId;
  label: string; // shown in the mode menu
  short: string; // one line explaining it
  instructions: string;
  starters: string[]; // example prompts shown on an empty chat
}

export const MODES: Mode[] = [
  {
    id: "chat",
    label: "Chat",
    short: "Talk about anything in your game",
    instructions: `MODE: Chat. Answer what the user asked in plain words, using their game notes, then suggest one next step.`,
    starters: [
      "What should I design next?",
      "What's the weakest part of my game right now?",
      "Why did we choose the current rifle energy system?",
    ],
  },
  {
    id: "concept",
    label: "Shape my idea",
    short: "Turn a rough idea into a clear game idea",
    instructions: `MODE: Shape my idea. Help turn a rough idea into a clear game idea, one small step at a time.
- Start by saying back the heart of their idea in one sentence.
- Then help decide ONE open point (look at "Not decided yet"): what the player does most, how it should feel, the camera, what makes it special, the tone, how long it is, how big the project is.
- Offer 2-3 short options for that point. Don't write a big document.
- Once the basics are clear, offer to suggest 3 main goals (pillars) for the game.`,
    starters: [
      "I want to make a fast third-person game about a squirrel samurai with a sword and a gun.",
      "A cozy farming game, but the crops are haunted.",
      "A game about a lighthouse keeper stuck in a time loop.",
    ],
  },
  {
    id: "coach",
    label: "Step by step",
    short: "Design one part of your game, one decision at a time",
    instructions: `MODE: Step by step. Walk the user through designing the topic below, one step at a time, using the playbook.
- Work out which step you're on from the notes and the chat. Start at step 1 unless it's already decided.
- Each reply covers ONE step: say in one sentence why it matters for THIS game, give 2-3 short options that fit their game, and ask the one question for this step.
- Don't jump ahead. When they decide, say "Got it" briefly and move to the next step.
- At the last step, sum up the design in a few bullets so they can confirm it.`,
    starters: ["Let's design my first boss.", "Help me design the combat.", "Walk me through designing an enemy."],
  },
  {
    id: "critic",
    label: "Honest feedback",
    short: "Find the weak spots in an idea",
    instructions: `MODE: Honest feedback. The user wants the truth, said kindly.
- Look at what they point to, or the idea you were just discussing.
- Give the 2-4 biggest problems. For each, in 2-3 short lines: what the problem is, why players would run into it, and one way to fix it. Say whether it's a big, medium or small problem.
- No scores or ratings.
- End with one thing that's working well and worth keeping.`,
    starters: ["Give me honest feedback on my combat.", "What will players find boring?", "What's the riskiest part of my plan?"],
  },
  {
    id: "scope",
    label: "Is it too big?",
    short: "Make your plan finishable",
    instructions: `MODE: Is it too big? Help make the game finishable.
- If you don't know the team size, experience or time available, ask in one question, and give a quick first impression.
- Then use these short sections, one line per item: **Keep** (the heart of the game), **Later** (after the first version), **Cut**, **Fake it cheaper** (same feeling, less work), **Smallest fun version**.
- Say briefly why expensive things are expensive (lots of art, tricky tech, online play, testing).
- Protect the fun part. The goal is a game they can finish.`,
    starters: ["I'm a solo beginner. Is my game realistic?", "What's the smallest version that's still fun?", "I have 6 months of evenings. What should I cut?"],
  },
  {
    id: "compare",
    label: "Compare options",
    short: "Weigh choices before you decide",
    instructions: `MODE: Compare options. Help the user choose.
- Find the options in their message. If they only describe a problem, suggest 2-3 options labelled A, B, C.
- For each option give 2-3 short bullets: how it changes the way the game plays, and how hard it is to make.
- Don't choose for them unless they ask. If they ask, pick one and say why in two sentences.
- End by asking which one they're leaning towards.`,
    starters: [
      "Should gun ammo be unlimited, recharge from melee hits, or be found in the world?",
      "Open map or separate levels?",
      "Should healing come from potions or from enemies?",
    ],
  },
  {
    id: "ideas",
    label: "Brainstorm",
    short: "Get ideas that fit your game",
    instructions: `MODE: Brainstorm. Give ideas that fit THIS game.
- Give 5-6 ideas unless they ask for a different number.
- Each idea: a short name, one sentence, and what in their game it builds on (for example "uses your air dash").
- Respect what's ruled out, the tone and the project size. Mark ideas that would be a lot of work.
- End by asking which ones they like.`,
    starters: ["Give me boss ideas that use my movement.", "Give me enemy ideas for the forest area.", "Ideas for abilities that reward being brave."],
  },
];

export const findMode = (id: ModeId) => MODES.find((m) => m.id === id) ?? MODES[0];
