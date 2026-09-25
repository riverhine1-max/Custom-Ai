/**
 * Browser storage for the web app: your games live in this browser's
 * IndexedDB, on your device. Nothing is sent anywhere. (Clearing the
 * browser's site data deletes them, so the app offers backup files.)
 */
import type { ChatMessageRecord, ProjectState, ProjectStore, ProjectSummary } from "../core";
import { clone, summarize } from "../core";

const DB_NAME = "game-design-copilot";
const VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage write was cancelled."));
  });
}

export class IndexedDbStore implements ProjectStore {
  private db: Promise<IDBDatabase>;

  constructor(factory: IDBFactory = indexedDB, name = DB_NAME) {
    this.db = new Promise((resolve, reject) => {
      const open = factory.open(name, VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("states")) db.createObjectStore("states");
        if (!db.objectStoreNames.contains("summaries")) db.createObjectStore("summaries");
        if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages");
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error("Close other tabs of this app and reload."));
    });
  }

  /** Can this browser store data here? (Some private windows can't.) */
  static async available(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<boolean> {
    if (!factory) return false;
    try {
      const s = new IndexedDbStore(factory, "gdc-probe");
      await s.db;
      return true;
    } catch {
      return false;
    }
  }

  private async tx(stores: string[], mode: IDBTransactionMode) {
    return (await this.db).transaction(stores, mode);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const t = await this.tx(["summaries"], "readonly");
    const all = (await req(t.objectStore("summaries").getAll())) as ProjectSummary[];
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async loadState(id: string): Promise<ProjectState | null> {
    const t = await this.tx(["states"], "readonly");
    const s = (await req(t.objectStore("states").get(id))) as ProjectState | undefined;
    return s ? clone(s) : null;
  }

  async saveState(state: ProjectState): Promise<void> {
    const t = await this.tx(["states", "summaries"], "readwrite");
    t.objectStore("states").put(clone(state), state.project.id);
    t.objectStore("summaries").put(summarize(state), state.project.id);
    await done(t);
  }

  async deleteProject(id: string): Promise<void> {
    const t = await this.tx(["states", "summaries", "messages"], "readwrite");
    t.objectStore("states").delete(id);
    t.objectStore("summaries").delete(id);
    t.objectStore("messages").delete(id);
    await done(t);
  }

  async loadMessages(id: string): Promise<ChatMessageRecord[]> {
    const t = await this.tx(["messages"], "readonly");
    const list = (await req(t.objectStore("messages").get(id))) as ChatMessageRecord[] | undefined;
    return list ? clone(list) : [];
  }

  async saveMessages(projectId: string, list: ChatMessageRecord[]): Promise<void> {
    const t = await this.tx(["messages"], "readwrite");
    t.objectStore("messages").put(clone(list), projectId);
    await done(t);
  }

  async saveMessage(m: ChatMessageRecord): Promise<void> {
    // read and write in one transaction so two quick saves can't lose each other
    const t = await this.tx(["messages"], "readwrite");
    const store = t.objectStore("messages");
    const list = ((await req(store.get(m.projectId))) as ChatMessageRecord[] | undefined) ?? [];
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = clone(m);
    else list.push(clone(m));
    store.put(list, m.projectId);
    await done(t);
  }
}
