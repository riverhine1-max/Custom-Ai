/**
 * THE STORE INTERFACE
 * Where projects are saved. The web app uses SQLite (src/stores/sqlite.ts),
 * the hosted demo uses the claude.ai artifact database, tests use memory.
 */
import type { ChatMessageRecord, ProjectState, ProjectSummary } from "./types";

export interface ProjectStore {
  listProjects(): Promise<ProjectSummary[]>;
  loadState(projectId: string): Promise<ProjectState | null>;
  saveState(state: ProjectState): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
  loadMessages(projectId: string): Promise<ChatMessageRecord[]>;
  /** Insert or replace by id. */
  saveMessage(message: ChatMessageRecord): Promise<void>;
  /** Replace a project's whole message list in one write (used when importing a project). */
  saveMessages(projectId: string, messages: ChatMessageRecord[]): Promise<void>;
}

export function summarize(state: ProjectState): ProjectSummary {
  return {
    id: state.project.id,
    name: state.project.name,
    updatedAt: state.project.updatedAt,
    confirmedCount: state.items.filter((i) => i.status === "confirmed").length,
    openQuestionCount: state.questions.filter((q) => q.status === "open").length,
  };
}
