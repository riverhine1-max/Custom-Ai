/**
 * Store for the hosted claude.ai demo, using the page's `db` capability.
 * Each viewer's projects live under their private data/users/<id>/ path,
 * so nobody else (the artifact's owner included) can read them.
 *
 * Platform limits shape this file: a document holds at most 256 KiB, and
 * the whole demo database at most 5,000 documents. So each project uses
 * three documents (index entry, memory, recent messages), and history is
 * trimmed to stay under the size cap.
 */
import type { ChatMessageRecord, ProjectState, ProjectStore, ProjectSummary } from "../core";
import { clone, summarize } from "../core";

/* Minimal shape of the db capability we use (see the platform's db.d.ts). */
interface DocSnap { exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
export interface ArtifactDb { doc(path: string): DocRef }

const MAX_DOC_BYTES = 230_000;
const MAX_MESSAGES = 80;

const bytes = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;

export class ArtifactDbStore implements ProjectStore {
  constructor(private db: ArtifactDb, private userId: string) {}

  private path(name: string) {
    return `data/users/${this.userId}/${name}`;
  }

  private async readIndex(): Promise<ProjectSummary[]> {
    const snap = await this.db.doc(this.path("index")).get();
    return snap.exists ? ((snap.data()?.projects as ProjectSummary[]) ?? []) : [];
  }

  private async writeIndex(list: ProjectSummary[]) {
    await this.db.doc(this.path("index")).set({ projects: list });
  }

  async listProjects() {
    return (await this.readIndex()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadState(id: string): Promise<ProjectState | null> {
    const snap = await this.db.doc(this.path(`state_${id}`)).get();
    return snap.exists ? (clone(snap.data()) as unknown as ProjectState) : null;
  }

  async saveState(state: ProjectState): Promise<void> {
    let s = state;
    // Trim history until it fits the platform's per-document cap. Items,
    // questions and decisions are never trimmed.
    for (const keep of [120, 60, 20, 0]) {
      if (bytes(s) <= MAX_DOC_BYTES) break;
      s = { ...s, events: s.events.slice(-keep * 4), changeSets: s.changeSets.slice(-keep) };
    }
    if (bytes(s) > MAX_DOC_BYTES) {
      throw new Error("This project is too large for the demo's storage. The full web app has no such limit.");
    }
    await this.db.doc(this.path(`state_${s.project.id}`)).set(s as unknown as Record<string, unknown>);
    const list = (await this.readIndex()).filter((p) => p.id !== s.project.id);
    list.push(summarize(s));
    await this.writeIndex(list);
  }

  async deleteProject(id: string): Promise<void> {
    await this.db.doc(this.path(`state_${id}`)).delete();
    await this.db.doc(this.path(`msgs_${id}`)).delete();
    await this.writeIndex((await this.readIndex()).filter((p) => p.id !== id));
  }

  async loadMessages(id: string): Promise<ChatMessageRecord[]> {
    const snap = await this.db.doc(this.path(`msgs_${id}`)).get();
    return snap.exists ? clone((snap.data()?.messages as ChatMessageRecord[]) ?? []) : [];
  }

  async saveMessage(m: ChatMessageRecord): Promise<void> {
    const list = await this.loadMessages(m.projectId);
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = m;
    else list.push(m);
    await this.saveMessages(m.projectId, list);
  }

  async saveMessages(projectId: string, all: ChatMessageRecord[]): Promise<void> {
    let list = all.slice(-MAX_MESSAGES);
    while (list.length > 1 && bytes({ messages: list }) > MAX_DOC_BYTES) list = list.slice(1);
    await this.db.doc(this.path(`msgs_${projectId}`)).set({ messages: list });
  }
}
