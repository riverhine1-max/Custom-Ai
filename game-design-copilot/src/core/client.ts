/**
 * THE CLIENT INTERFACE
 * Everything the UI can ask for. The React UI only knows this interface:
 * - in the web app it's implemented by HttpClient (calls the API routes,
 *   which call CopilotService on the server);
 * - in the hosted demo it's CopilotService itself, running in the page.
 */
import type { MemoryEdit } from "./memory";
import type { ModeId, ProjectSummary, Workspace } from "./types";

/** A game saved to a file (backup, or moving to another browser). */
export interface ProjectExport {
  format: "game-design-copilot";
  version: 1;
  exportedAt: string;
  state: import("./types").ProjectState;
  messages: import("./types").ChatMessageRecord[];
}

/** What rewindLastTurn gives back: the updated workspace and the message that was taken back. */
export interface Rewound {
  workspace: Workspace;
  text: string;
  mode?: ModeId;
  topic?: string;
}

export type Stage = "thinking" | "writing" | "remembering" | "analyzing";

export interface TurnCallbacks {
  onText?: (textSoFar: string) => void;
  onStage?: (stage: Stage) => void;
}

export interface SendInput {
  text: string;
  mode: ModeId;
  topic?: string;
}

export interface CopilotClient {
  listProjects(): Promise<ProjectSummary[]>;
  /** autoName: rename the project to the game's title once one is decided. */
  createProject(name: string, options?: { autoName?: boolean }): Promise<ProjectSummary>;
  deleteProject(projectId: string): Promise<void>;
  /** Create the pre-written "Acorn Ronin" example project. */
  loadExample(): Promise<ProjectSummary>;
  /** Everything about one game, for a backup file. */
  exportProject(projectId: string): Promise<ProjectExport>;
  /** Add a game from a backup file. */
  importProject(data: unknown): Promise<ProjectSummary>;
  getWorkspace(projectId: string): Promise<Workspace>;
  sendMessage(projectId: string, input: SendInput, cb?: TurnCallbacks, signal?: AbortSignal): Promise<Workspace>;
  /** Remove your last message and the reply to it (undoing what it saved), for Edit and Regenerate. */
  rewindLastTurn(projectId: string): Promise<Rewound>;
  applyChanges(projectId: string, changeSetId: string, opIds: string[]): Promise<Workspace>;
  dismissChanges(projectId: string, changeSetId: string, opIds: string[]): Promise<Workspace>;
  undoChanges(projectId: string, changeSetId: string, opIds?: string[]): Promise<Workspace>;
  editMemory(projectId: string, edit: MemoryEdit): Promise<Workspace>;
  analyzeConsequences(projectId: string, itemIds: string[]): Promise<Workspace>;
}

/** Method names the HTTP API may call (everything except streaming sendMessage). */
export const RPC_METHODS = [
  "listProjects",
  "createProject",
  "deleteProject",
  "loadExample",
  "exportProject",
  "importProject",
  "getWorkspace",
  "rewindLastTurn",
  "applyChanges",
  "dismissChanges",
  "undoChanges",
  "editMemory",
  "analyzeConsequences",
] as const;
export type RpcMethod = (typeof RPC_METHODS)[number];
