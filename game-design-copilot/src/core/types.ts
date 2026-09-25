/**
 * THE DATA MODEL
 * ==============
 * Everything the copilot "remembers" about a game lives in these shapes.
 * The chat transcript is NOT the memory — it's just conversation. The
 * memory is a ProjectState: a list of design items (with statuses), the
 * links between them, open questions, decisions, and a log of every change.
 *
 * This file has no imports and no logic, so it's the best place to start
 * reading the codebase.
 */

/* ------------------------------------------------------------------ */
/* Status: how sure are we that something is part of the game?         */
/* ------------------------------------------------------------------ */

/**
 * - confirmed: the user explicitly chose it. This is canon.
 * - likely:    strongly implied by what the user said, not yet confirmed.
 * - proposed:  a suggestion (from the AI or the user) being considered.
 * - rejected:  the user said no. The copilot must not suggest it again.
 *
 * "Unknown" isn't a status — it's the absence of an item (for example an
 * empty concept slot). "Needs decision" lives in OpenQuestion instead.
 */
export type Status = "confirmed" | "likely" | "proposed" | "rejected";

export const STATUSES: Status[] = ["confirmed", "likely", "proposed", "rejected"];

/* ------------------------------------------------------------------ */
/* Design items: every fact about the game is one of these             */
/* ------------------------------------------------------------------ */

export type ItemKind =
  | "concept" // one of the fixed concept slots below (genre, core fantasy…)
  | "pillar" // a core design pillar (3–5 per game)
  | "loop" // one step of the core gameplay loop, ordered by `order`
  | "system" // a top-level system: Combat, Movement, Progression…
  | "mechanic" // a rule or action inside a system: Perfect Dodge…
  | "weapon"
  | "ability"
  | "enemy"
  | "boss"
  | "level" // a region, level or area
  | "character"
  | "narrative" // story beats, lore, quests
  | "art" // visual style and art direction notes
  | "ui" // HUD, menus, controls
  | "constraint" // team size, budget, engine, platform, deadlines
  | "reference" // a game the user draws inspiration from, and why
  | "other";

export const ITEM_KINDS: ItemKind[] = [
  "concept", "pillar", "loop", "system", "mechanic", "weapon", "ability", "enemy",
  "boss", "level", "character", "narrative", "art", "ui", "constraint", "reference", "other",
];

/** The fixed slots of the Concept Lab. Each holds at most one concept item. */
export type ConceptSlot =
  | "title"
  | "genre"
  | "perspective"
  | "coreFantasy"
  | "playerRole"
  | "audience"
  | "tone"
  | "artDirection"
  | "hook"
  | "length"
  | "scope"
  | "platform";

export const CONCEPT_SLOTS: { slot: ConceptSlot; label: string }[] = [
  { slot: "title", label: "Working title" },
  { slot: "genre", label: "Genre" },
  { slot: "perspective", label: "Perspective / camera" },
  { slot: "coreFantasy", label: "Core fantasy" },
  { slot: "playerRole", label: "Player role" },
  { slot: "audience", label: "Target audience" },
  { slot: "tone", label: "Tone" },
  { slot: "artDirection", label: "Art direction" },
  { slot: "hook", label: "Unique hook" },
  { slot: "length", label: "Expected length" },
  { slot: "scope", label: "Development scope" },
  { slot: "platform", label: "Platform" },
];

/** Where an item came from. Used for trust decisions and shown in the UI. */
export type Origin = "user" | "ai" | "user_accepted_ai";

export interface DesignItem {
  id: string; // "it_…"
  kind: ItemKind;
  title: string; // short name: "Perfect Dodge", or the value of a concept slot
  summary: string; // 1–3 sentences: what it is / how it works
  details?: string; // longer notes, optional
  status: Status;
  parentId?: string | null; // tree structure: a mechanic's parent is a system
  slot?: ConceptSlot; // only for kind === "concept"
  order?: number; // for loop steps and pillars
  rationale?: string; // why it exists — or, for rejected items, why it was rejected
  origin: Origin;
  createdAt: string; // ISO timestamps
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Links: the "design graph" edges between items                       */
/* ------------------------------------------------------------------ */

export type LinkType =
  | "depends_on" // A needs B to work (Air Dash depends on Double Jump)
  | "feeds" // A produces a resource B uses (Melee hits feed Rifle energy)
  | "counters" // A is the answer to B (Parry counters Shield Enemy)
  | "supports" // A reinforces a pillar or loop step
  | "conflicts_with" // A undermines B
  | "unlocks" // A gives access to B (Glide unlocks the Canopy area)
  | "teaches" // A teaches the player B (First boss teaches Perfect Dodge)
  | "related";

export const LINK_TYPES: LinkType[] = [
  "depends_on", "feeds", "counters", "supports", "conflicts_with", "unlocks", "teaches", "related",
];

export interface Link {
  id: string; // "ln_…"
  from: string; // item id
  to: string; // item id
  type: LinkType;
  note?: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Open questions ("NEEDS DECISION") and decisions (history)           */
/* ------------------------------------------------------------------ */

export interface OpenQuestion {
  id: string; // "q_…"
  question: string;
  why?: string; // why it matters
  relatedItemIds: string[];
  status: "open" | "resolved" | "dropped";
  resolution?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface Decision {
  id: string; // "dc_…"
  number: number; // shown as DECISION 014
  title: string; // "Gun energy system"
  before?: string; // what it was (absent for brand-new decisions)
  after: string; // what it is now
  reason?: string; // why — the thing users ask about months later
  alternatives?: string[]; // options that were considered
  itemIds: string[];
  createdAt: string;
  messageId?: string;
}

/* ------------------------------------------------------------------ */
/* Change operations: the ONLY way the AI can propose memory changes   */
/* ------------------------------------------------------------------ */

/**
 * Where the clerk (the extraction step) believes a change came from.
 * - user_stated:   the user said it themselves ("the game is called X")
 * - user_accepted: the user accepted something the AI offered ("let's do B")
 * - ai_suggested:  the AI's idea; the user hasn't committed
 * Code does not trust this label alone — see validate.ts.
 */
export type OpOrigin = "user_stated" | "user_accepted" | "ai_suggested";

interface OpBase {
  origin: OpOrigin;
  /** An exact quote from the user's latest message that backs this change. */
  evidence?: string;
}

/** Create a new item. `ref` ("new:1") lets later ops in the same set point at it. */
export interface CreateItemOp extends OpBase {
  type: "create_item";
  ref: string;
  kind: ItemKind;
  title: string;
  summary: string;
  status: Status;
  parent?: string; // existing item id OR a ref from this change set
  slot?: ConceptSlot;
  rationale?: string;
}

/** Change the content of an existing item. */
export interface UpdateItemOp extends OpBase {
  type: "update_item";
  itemId: string;
  /** true when the user changes how a confirmed item WORKS (not just adds detail). Triggers Design Consequences. */
  change?: boolean;
  title?: string;
  summary?: string;
  details?: string;
  rationale?: string;
}

/** Change an item's status (confirm, reject, demote…). */
export interface SetStatusOp extends OpBase {
  type: "set_status";
  itemId: string;
  status: Status;
  rationale?: string;
}

export interface AddLinkOp extends OpBase {
  type: "add_link";
  from: string; // id or ref
  to: string; // id or ref
  linkType: LinkType;
  note?: string;
}

export interface AddQuestionOp extends OpBase {
  type: "add_question";
  question: string;
  why?: string;
  related?: string[]; // ids or refs
}

export interface ResolveQuestionOp extends OpBase {
  type: "resolve_question";
  questionId: string;
  resolution: string;
}

export interface RecordDecisionOp extends OpBase {
  type: "record_decision";
  title: string;
  before?: string;
  after: string;
  reason?: string;
  alternatives?: string[];
  items?: string[]; // ids or refs
}

export type ChangeOp =
  | CreateItemOp
  | UpdateItemOp
  | SetStatusOp
  | AddLinkOp
  | AddQuestionOp
  | ResolveQuestionOp
  | RecordDecisionOp;

/**
 * What happened to one op after validation and review.
 * - applied:   written into memory (automatically or by the user)
 * - pending:   waiting for the user to apply or dismiss it
 * - dismissed: the user said no
 * - reverted:  applied, then undone
 * - invalid:   blocked by a safety rule (kept for transparency/debugging)
 */
export type OpState = "applied" | "pending" | "dismissed" | "reverted" | "invalid";

export interface ProposedOp {
  opId: string; // "op_…"
  op: ChangeOp;
  state: OpState;
  /** Why validation routed it this way — shown to the user. */
  note?: string;
  /** True when the user's own words back it (evidence matched). */
  verified: boolean;
  /** Human-readable description, written when the op was proposed (so it never goes stale). */
  label?: string;
}

export interface ChangeSet {
  id: string; // "cs_…"
  messageId: string; // the assistant message this set is attached to
  createdAt: string;
  ops: ProposedOp[];
  /** ref ("new:1") → real item id, filled in as create ops are applied */
  refMap: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Events: an append-only log of every applied change (enables undo)   */
/* ------------------------------------------------------------------ */

export type EntityType = "item" | "link" | "question" | "decision" | "settings";

export interface MemoryEvent {
  id: string; // "ev_…"
  at: string;
  actor: "user" | "ai"; // ai = auto-applied from the user's own words via the clerk
  changeSetId?: string;
  opId?: string;
  action: string; // "create_item", "manual_edit", "undo"…
  entity: EntityType;
  entityId: string;
  before: unknown | null; // snapshot before (null = didn't exist)
  after: unknown | null; // snapshot after (null = deleted)
  label: string; // human-readable: "Confirmed “Perfect Dodge”"
  /** Set when confirmed design changed how it works — the trigger for Design Consequences. */
  significant?: boolean;
}

/* ------------------------------------------------------------------ */
/* Design consequences                                                  */
/* ------------------------------------------------------------------ */

export interface Consequences {
  whatChanged: string;
  systemsAffected: { name: string; itemId?: string; impact: string }[];
  problems: string[];
  opportunities: string[];
  tests: string[];
}

/* ------------------------------------------------------------------ */
/* Project and chat                                                     */
/* ------------------------------------------------------------------ */

export interface ProjectSettings {
  /** When true, even changes backed by the user's own words wait for review. */
  reviewAll: boolean;
  /** When true, the project is renamed to the game's title once one is decided. */
  autoName?: boolean;
}

export interface ProjectInfo {
  id: string; // "pr_…"
  name: string;
  ownerId?: string; // reserved for multi-user accounts later
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
}

/** The whole memory of one game project. Stored as one document in V1. */
export interface ProjectState {
  schemaVersion: 1;
  project: ProjectInfo;
  items: DesignItem[];
  links: Link[];
  questions: OpenQuestion[];
  decisions: Decision[];
  changeSets: ChangeSet[];
  events: MemoryEvent[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: string;
  confirmedCount: number;
  openQuestionCount: number;
}

export type ModeId = "chat" | "concept" | "coach" | "critic" | "scope" | "compare" | "ideas";

export interface ChatMessageRecord {
  id: string; // "msg_…"
  projectId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  mode?: ModeId;
  topic?: string; // Design Coach playbook id
  meta?: {
    changeSetId?: string;
    consequences?: Consequences;
    consequencesFor?: string[]; // item ids the analysis was about
    warnings?: string[]; // e.g. "Mentions a rejected idea: Wall running"
    kind?: "reply" | "consequences" | "error";
    error?: string;
  };
}

/** Everything the UI needs to draw one project. */
export interface Workspace {
  state: ProjectState;
  messages: ChatMessageRecord[];
}
