/** Every store must behave the same. This runs one contract against all three. */
import { describe, expect, it } from "vitest";
import type { ProjectStore } from "../src/core";
import { emptyState } from "../src/core";
import { MemoryStore } from "../src/stores/memory";
import { IndexedDbStore } from "../src/stores/indexedDb";
import { IDBFactory } from "fake-indexeddb";
import { ArtifactDbStore, type ArtifactDb } from "../src/stores/artifactDb";

/** A fake of the claude.ai db capability: a map of path → JSON. */
function fakeDb(): ArtifactDb & { docs: Map<string, string> } {
  const docs = new Map<string, string>();
  return {
    docs,
    doc: (p: string) => ({
      get: async () => ({ exists: docs.has(p), data: () => (docs.has(p) ? JSON.parse(docs.get(p)!) : undefined) }),
      set: async (d) => {
        const s = JSON.stringify(d);
        if (s.length > 256 * 1024) throw { code: "invalid_argument", message: "too big" };
        docs.set(p, s);
      },
      delete: async () => void docs.delete(p),
    }),
  };
}

const stores: [string, () => ProjectStore][] = [
  ["memory", () => new MemoryStore()],
  ["browser (IndexedDB)", () => new IndexedDbStore(new IDBFactory())],
  ["artifact db", () => new ArtifactDbStore(fakeDb(), "user123")],
];

describe.each(stores)("%s store", (_name, make) => {
  it("saves, lists, loads and deletes projects with their messages", async () => {
    const store = make();
    const a = emptyState("Alpha", "pr_a");
    const b = emptyState("Beta", "pr_b");
    b.project.updatedAt = "2099-01-01T00:00:00Z";
    await store.saveState(a);
    await store.saveState(b);
    expect((await store.listProjects()).map((p) => p.name)).toEqual(["Beta", "Alpha"]);

    await store.saveMessage({ id: "m1", projectId: "pr_a", role: "user", content: "hi", createdAt: "t1" });
    await store.saveMessage({ id: "m2", projectId: "pr_a", role: "assistant", content: "hello", createdAt: "t2" });
    await store.saveMessage({ id: "m1", projectId: "pr_a", role: "user", content: "hi (edited)", createdAt: "t1" });
    expect((await store.loadMessages("pr_a")).map((m) => m.content)).toEqual(["hi (edited)", "hello"]);

    await store.saveMessages("pr_b", [
      { id: "b1", projectId: "pr_b", role: "user", content: "one", createdAt: "t1" },
      { id: "b2", projectId: "pr_b", role: "assistant", content: "two", createdAt: "t2" },
    ]);
    await store.saveMessages("pr_b", [{ id: "b3", projectId: "pr_b", role: "user", content: "three", createdAt: "t3" }]);
    expect((await store.loadMessages("pr_b")).map((m) => m.id)).toEqual(["b3"]);

    const loaded = await store.loadState("pr_a");
    expect(loaded?.project.name).toBe("Alpha");

    await store.deleteProject("pr_a");
    expect(await store.loadState("pr_a")).toBeNull();
    expect(await store.loadMessages("pr_a")).toEqual([]);
    expect((await store.listProjects()).map((p) => p.id)).toEqual(["pr_b"]);
  });
});

describe("artifact db store limits", () => {
  it("trims history to fit the 256 KiB document cap but keeps all design items", async () => {
    const db = fakeDb();
    const store = new ArtifactDbStore(db, "u1");
    const s = emptyState("Big", "pr_big");
    s.items = Array.from({ length: 50 }, (_, n) => ({ id: `it_${n}`, kind: "mechanic" as const, title: `M${n}`, summary: "x".repeat(200), status: "confirmed" as const, origin: "user" as const, createdAt: "", updatedAt: "" }));
    s.events = Array.from({ length: 3000 }, (_, n) => ({ id: `ev_${n}`, at: "", actor: "user" as const, action: "manual_edit", entity: "item" as const, entityId: "it_1", before: { pad: "y".repeat(100) }, after: null, label: "edit" }));
    await store.saveState(s);
    const back = await store.loadState("pr_big");
    expect(back?.items).toHaveLength(50);
    expect(back!.events.length).toBeLessThan(3000);
  });
});

describe("loading the example into slow storage", () => {
  it("writes the finished project in three documents, never half of it", async () => {
    const db = fakeDb();
    let writes = 0;
    const counting: ArtifactDb = { doc: (p) => { const d = db.doc(p); return { ...d, set: async (x) => { writes++; return d.set(x); } }; } };
    const { CopilotService } = await import("../src/core");
    const { OfflineProvider } = await import("../src/providers/mock");
    const svc = new CopilotService(new ArtifactDbStore(counting, "u1"), new OfflineProvider());
    const p = await svc.loadExample();
    expect(writes).toBe(3);
    const ws = await svc.getWorkspace(p.id);
    expect(ws.messages.length).toBe(11);
    expect(ws.state.decisions).toHaveLength(1);
  });
});
