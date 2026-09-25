/**
 * In-memory store: used by tests, and by the hosted demo as a fallback
 * when the claude.ai database isn't available in a view.
 */
import type { ChatMessageRecord, ProjectState, ProjectSummary } from "./types";
import type { ProjectStore } from "./store";
import { summarize } from "./store";
import { clone } from "./memory";

export class MemoryStore implements ProjectStore {
  private states = new Map<string, ProjectState>();
  private messages = new Map<string, ChatMessageRecord[]>();

  async listProjects(): Promise<ProjectSummary[]> {
    return [...this.states.values()].map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async loadState(id: string) {
    const s = this.states.get(id);
    return s ? clone(s) : null;
  }
  async saveState(state: ProjectState) {
    this.states.set(state.project.id, clone(state));
  }
  async deleteProject(id: string) {
    this.states.delete(id);
    this.messages.delete(id);
  }
  async loadMessages(id: string) {
    return clone(this.messages.get(id) ?? []);
  }
  async saveMessages(projectId: string, list: ChatMessageRecord[]) {
    this.messages.set(projectId, clone(list));
  }
  async saveMessage(m: ChatMessageRecord) {
    const list = this.messages.get(m.projectId) ?? [];
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = clone(m);
    else list.push(clone(m));
    this.messages.set(m.projectId, list);
  }
}
