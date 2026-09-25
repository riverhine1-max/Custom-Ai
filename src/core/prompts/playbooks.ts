/**
 * DESIGN COACH PLAYBOOKS
 * Each playbook is the order in which an experienced designer would make
 * decisions about one kind of thing. The coach walks the user through one
 * step at a time instead of generating the whole design at once.
 *
 * Adding a playbook = adding an entry here. No other code changes needed.
 */
export interface Playbook {
  id: string;
  label: string;
  blurb: string;
  steps: { title: string; focus: string }[];
  watchFor: string[];
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: "core_loop",
    label: "Core loop",
    blurb: "What the player does every 30 seconds, every session, and across the game.",
    steps: [
      { title: "Moment to moment", focus: "The 30-second loop: the actions the player repeats most, and what makes each repetition different." },
      { title: "Session loop", focus: "What a 20-60 minute session looks like from start to finish; where it starts and where it naturally pauses." },
      { title: "Long-term loop", focus: "What changes over the whole game: new abilities, areas, story. Why the player comes back." },
      { title: "Motivation", focus: "What pulls the player through each loop: curiosity, mastery, power, story, collection." },
      { title: "Stress test", focus: "Where the loop could break: grind, dead time, a dominant strategy, a step players will skip." },
      { title: "Summary", focus: "Write the loop as a short arrow chain and check it against the pillars." },
    ],
    watchFor: ["A loop that's a list of features rather than a cycle", "Steps players can skip without losing anything", "No reason to change strategy over time"],
  },
  {
    id: "combat",
    label: "Combat",
    blurb: "Feel, verbs, resources, enemy pressure, depth and feedback.",
    steps: [
      { title: "Combat fantasy", focus: "What fighting should feel like (fast, heavy, tactical, chaotic) and what the player should feel proud of." },
      { title: "Core verbs", focus: "The 3-5 core actions and their roles. Each should answer a different situation." },
      { title: "Resources and limits", focus: "What stops the player spamming the best action: stamina, ammo, cooldowns, energy, positioning. How each refills. The risk and reward of each action." },
      { title: "Enemy pressure", focus: "How enemies threaten the player, telegraph attacks, and react to hits (stagger, knockback, armour)." },
      { title: "Depth and mastery", focus: "What separates a novice from an expert: combos, cancels, perfect timing, target priority." },
      { title: "Feedback", focus: "How hits read: hit-stop, sound, effects, camera, animation. What the player must be able to see at all times." },
      { title: "Pacing", focus: "Encounter rhythm: build-up, peaks, rest. How difficulty escalates across the game." },
      { title: "Summary", focus: "Summarise the combat loop, check it against the pillars and scope, and list open questions." },
    ],
    watchFor: ["One option that's always safest (e.g. ranged with no cost)", "Too many verbs for the scope", "Enemies that don't force different verbs", "Unreadable feedback"],
  },
  {
    id: "movement",
    label: "Movement",
    blurb: "How moving feels, air control, advanced moves and chaining.",
    steps: [
      { title: "Movement fantasy", focus: "How moving should feel and how central traversal is compared with combat." },
      { title: "Base movement", focus: "Run speed, acceleration, turning and camera. The feel of the most-used input." },
      { title: "Air control", focus: "Jump height and arc, double jump, how much control in the air, forgiveness (coyote time, jump buffering)." },
      { title: "Advanced moves", focus: "Dash, wall moves, glide, grapple: what problem each solves. Cut any two moves that solve the same problem." },
      { title: "Chaining and momentum", focus: "How moves combine, whether speed carries between them, and where skill expression lives." },
      { title: "Movement in play", focus: "How movement interacts with combat and level geometry: dodging with it, gating areas with it." },
      { title: "Unlock order", focus: "Which moves are available from the start and which are earned, and what each unlock opens up." },
      { title: "Summary", focus: "Summarise the move set, its unlock order and the level-design rules it implies." },
    ],
    watchFor: ["Overlapping moves that solve the same problem", "Moves the levels never demand", "Movement that fights the camera"],
  },
  {
    id: "enemy",
    label: "Enemy",
    blurb: "Purpose first: what gameplay job does this enemy do?",
    steps: [
      { title: "Purpose", focus: "The gameplay job: teach a mechanic, pressure a habit, punish a bad strategy, or combine with other enemies." },
      { title: "Silhouette and read", focus: "How the player recognises it and its threat at a glance, even in a crowd." },
      { title: "Behaviour", focus: "How it moves, keeps its distance, notices the player, and changes state." },
      { title: "Attacks and tells", focus: "2-3 attacks, each with a readable warning (wind-up, sound, flash)." },
      { title: "Counterplay", focus: "What the player should do against it, and what is rewarded for doing it well." },
      { title: "Combinations", focus: "Which other enemies or hazards it pairs with, and what new problem the pair creates." },
      { title: "Variants and difficulty", focus: "How it scales: elite versions, later-game twists." },
      { title: "Summary", focus: "Summarise the enemy and the player skill it exercises." },
    ],
    watchFor: ["Enemies that exist only for visual variety", "Attacks without tells", "Counterplay that's the same as every other enemy"],
  },
  {
    id: "boss",
    label: "Boss",
    blurb: "Start from the skill it tests, then build the fight around it.",
    steps: [
      { title: "What it tests", focus: "Which part of the player's skill this boss tests or teaches. Usually one or two things, not everything." },
      { title: "Fantasy and story", focus: "Who the boss is and why this fight matters to the player and the world." },
      { title: "Arena", focus: "The space, hazards and geometry, and how they support the skill being tested." },
      { title: "Attacks and tells", focus: "The core moves, each with readable anticipation, and how they pressure the tested skill." },
      { title: "Openings and counterplay", focus: "When and how the player deals damage; what a well-played response looks like." },
      { title: "Phases", focus: "How the fight changes as it goes: new attacks, arena changes, remixes of earlier moves." },
      { title: "Fairness", focus: "Expected attempts, checkpointing, recovery options; how a player learns from each death." },
      { title: "Rewards", focus: "What beating it gives: ability, story, access, and how it feels afterwards." },
      { title: "Summary", focus: "Summarise the fight as a phase-by-phase outline." },
    ],
    watchFor: ["Testing every mechanic at once", "Damage sponges that just take long", "Unreadable or off-screen attacks", "A first boss harder than the player's toolkit allows"],
  },
  {
    id: "weapon",
    label: "Weapon",
    blurb: "Its role in the arsenal, how it feels, and what it costs to use.",
    steps: [
      { title: "Role", focus: "What gap it fills and the situation where a player should reach for it." },
      { title: "Feel", focus: "Speed, weight, range, sound, and how it looks in the hand." },
      { title: "Moveset or fire behaviour", focus: "Its attacks or firing pattern and inputs." },
      { title: "Cost and risk", focus: "Ammo, energy, stamina or exposure: what using it costs the player." },
      { title: "Synergies and counters", focus: "How it combines with other weapons, moves and enemies." },
      { title: "Upgrades", focus: "How it grows over the game, if at all." },
      { title: "Summary", focus: "Summarise the weapon and its place in the arsenal." },
    ],
    watchFor: ["A weapon that's strictly better than another", "No cost, so no decision", "A role already covered"],
  },
  {
    id: "ability",
    label: "Ability",
    blurb: "The decision it creates, its cost, and how it interacts with everything else.",
    steps: [
      { title: "Purpose", focus: "The problem it solves or the new decision it creates." },
      { title: "Activation and cost", focus: "Input, cooldown or resource, and when it can be used." },
      { title: "Effect and feedback", focus: "What it does and how the player sees and hears it working." },
      { title: "Interactions", focus: "How it combines with movement, combat and enemies." },
      { title: "Limits", focus: "What stops it from becoming the answer to everything." },
      { title: "Unlock and growth", focus: "When it's unlocked and whether it upgrades." },
      { title: "Summary", focus: "Summarise the ability." },
    ],
    watchFor: ["An ability that replaces a core verb", "No clear moment to use it", "Unclear cooldown state"],
  },
  {
    id: "progression",
    label: "Progression",
    blurb: "What grows, how fast, and what choices it gives the player.",
    steps: [
      { title: "What grows", focus: "Player skill, character power, options, or access: which matter most in this game." },
      { title: "Pacing", focus: "How often meaningful rewards arrive across the expected length." },
      { title: "Currencies and sources", focus: "What the player earns and where it comes from." },
      { title: "Structure", focus: "Skill tree, shop, equipment, story unlocks: how upgrades are chosen." },
      { title: "Build variety", focus: "Whether choices change how the player plays, or are just bigger numbers." },
      { title: "Gating", focus: "How progression opens content: traversal locks, difficulty, story." },
      { title: "Summary", focus: "Summarise the progression and its pacing." },
    ],
    watchFor: ["Upgrades that are only +10% numbers", "A long gap with no reward", "Required grinding"],
  },
  {
    id: "level",
    label: "Level",
    blurb: "Purpose, landmarks, flow, encounters and secrets.",
    steps: [
      { title: "Purpose", focus: "What this level teaches or tests, and its place in the game's order." },
      { title: "Theme and landmarks", focus: "Its identity and the landmarks players navigate by." },
      { title: "Flow and layout", focus: "The critical path, loops and shortcuts, verticality." },
      { title: "Encounters", focus: "Where fights happen, their pacing, and where the player rests." },
      { title: "Exploration and secrets", focus: "What rewards curiosity and how secrets are hinted." },
      { title: "Environmental storytelling", focus: "What the space tells the player without words." },
      { title: "Summary", focus: "Summarise the level as a beat-by-beat walkthrough." },
    ],
    watchFor: ["No landmarks, so players get lost", "Encounters back-to-back with no rest", "Secrets with no hint"],
  },
  {
    id: "economy",
    label: "Economy",
    blurb: "Currencies, sources, sinks and reward frequency.",
    steps: [
      { title: "What it's for", focus: "The decisions the economy should create for the player." },
      { title: "Currencies", focus: "How many currencies and what each is for. Fewer is usually better." },
      { title: "Sources", focus: "Where each currency comes from and roughly how much." },
      { title: "Sinks", focus: "What it's spent on, and what stops hoarding or runaway wealth." },
      { title: "Prices and pacing", focus: "Costs relative to income across the game." },
      { title: "Reward feel", focus: "How often rewards drop and how they feel to collect." },
      { title: "Summary", focus: "Summarise the economy's flow from sources to sinks." },
    ],
    watchFor: ["Currencies with nothing worth buying", "Too many currencies", "Rewards that trivialise difficulty"],
  },
  {
    id: "tutorial",
    label: "Tutorial",
    blurb: "What players must learn, in what order, and how you'll know they got it.",
    steps: [
      { title: "What must be learned", focus: "The mechanics a player needs, in the order they need them." },
      { title: "Teaching method", focus: "Show, don't tell: safe spaces, level design, prompts, and when text is unavoidable." },
      { title: "First ten minutes", focus: "The opening sequence, beat by beat." },
      { title: "Checks", focus: "How the game confirms the player understood before raising the stakes." },
      { title: "Later mechanics", focus: "How mechanics unlocked later are taught." },
      { title: "Summary", focus: "Summarise the teaching plan." },
    ],
    watchFor: ["Walls of text", "Teaching everything up front", "No check before the first real test"],
  },
  {
    id: "narrative",
    label: "Narrative",
    blurb: "Story that supports play instead of ignoring it.",
    steps: [
      { title: "Story's role", focus: "How much the story matters compared with gameplay, and how it's delivered." },
      { title: "Protagonist", focus: "Who the player is and what they want." },
      { title: "World and conflict", focus: "The setting and the central conflict." },
      { title: "Structure", focus: "The main beats and how they map to regions and progression." },
      { title: "Gameplay connection", focus: "How mechanics express the story: why the player can do what they do." },
      { title: "Characters and quests", focus: "Supporting characters and what they ask of the player." },
      { title: "Delivery", focus: "Cutscenes, dialogue, environmental storytelling, item text: what fits the scope." },
      { title: "Summary", focus: "Summarise the story outline and its links to gameplay." },
    ],
    watchFor: ["Story that contradicts the mechanics", "Lore the player never encounters", "Cutscene scope a small team can't produce"],
  },
];

export const findPlaybook = (id?: string) => PLAYBOOKS.find((p) => p.id === id);

export function renderPlaybook(p: Playbook): string {
  return [
    `PLAYBOOK: ${p.label}`,
    ...p.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.focus}`),
    `Common pitfalls to watch for: ${p.watchFor.join("; ")}.`,
  ].join("\n");
}
