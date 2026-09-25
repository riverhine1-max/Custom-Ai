/**
 * End-to-end design sessions with a scripted model. These check the whole
 * pipeline — reply, clerk, validation, memory, consequences — without an
 * API key. Each scenario comes from the product spec.
 */
import { describe, expect, it } from "vitest";
import { CopilotService, type GenerateRequest } from "../src/core";
import { MemoryStore } from "../src/stores/memory";
import { ScriptedProvider } from "../src/providers/mock";
import { deterministic } from "./helpers";

deterministic();

type Script = { reply?: string; clerk?: unknown; analysis?: unknown };

/** A provider that answers each purpose from a queue of scripted turns. */
function scripted(turns: Script[]) {
  let turn = -1;
  return new ScriptedProvider((req: GenerateRequest) => {
    if (req.purpose === "reply") turn++;
    const t = turns[turn] ?? {};
    if (req.purpose === "reply") return t.reply ?? "OK.";
    if (req.purpose === "clerk") return typeof t.clerk === "string" ? t.clerk : JSON.stringify(t.clerk ?? { ops: [] });
    return JSON.stringify(t.analysis ?? {});
  });
}

async function setup(turns: Script[]) {
  const store = new MemoryStore();
  const provider = scripted(turns);
  const svc = new CopilotService(store, provider);
  const p = await svc.createProject("Squirrel game");
  return { svc, provider, id: p.id };
}

describe("scenario: a vague pitch becomes structured memory", () => {
  it("stores what the user said as canon and the AI's ideas only as pending proposals", async () => {
    const { svc, id, provider } = await setup([
      {
        reply: "A squirrel samurai is a great silhouette... A) melee-first B) ranged-first. Which matters more?",
        clerk: {
          ops: [
            { type: "create_item", ref: "new:1", kind: "concept", slot: "perspective", title: "Third-person", summary: "", status: "confirmed", origin: "user_stated", evidence: "fast third-person game" },
            { type: "create_item", ref: "new:2", kind: "system", title: "Combat", summary: "Sword and gun.", status: "likely", origin: "user_stated", evidence: "with a sword and a gun" },
            { type: "create_item", ref: "new:3", kind: "weapon", title: "Sword", summary: "", status: "confirmed", parent: "new:2", origin: "user_stated", evidence: "with a sword and a gun" },
            { type: "create_item", ref: "new:4", kind: "mechanic", title: "Acorn grenades", summary: "Throwable acorns", status: "confirmed", origin: "ai_suggested" },
          ],
        },
      },
    ]);
    const ws = await svc.sendMessage(id, { text: "I want to make a fast third-person game about a squirrel samurai with a sword and a gun.", mode: "concept" });

    const byTitle = (t: string) => ws.state.items.find((i) => i.title === t);
    expect(byTitle("Third-person")?.status).toBe("confirmed");
    expect(byTitle("Combat")?.status).toBe("likely");
    expect(byTitle("Sword")?.parentId).toBe(byTitle("Combat")?.id);
    expect(byTitle("Acorn grenades")).toBeUndefined(); // AI idea: not in memory yet

    const cs = ws.state.changeSets[0];
    const grenade = cs.ops.find((p) => p.op.type === "create_item" && p.op.title === "Acorn grenades")!;
    expect(grenade.state).toBe("pending");

    // the user keeps the idea — it's stored, but only as a proposal
    const ws2 = await svc.applyChanges(id, cs.id, [grenade.opId]);
    expect(ws2.state.items.find((i) => i.title === "Acorn grenades")?.status).toBe("proposed");

    // the designer saw the brief with the Concept Lab mode
    expect(provider.calls[0].system).toMatch(/MODE: Shape my idea/);
    expect(provider.calls[0].system).toMatch(/GAME NOTES/);
  });
});

describe("scenario: rejected ideas stay rejected", () => {
  it("blocks the AI from bringing wall running back, and warns if the reply mentions it", async () => {
    const { svc, id } = await setup([
      {
        clerk: { ops: [{ type: "create_item", ref: "new:1", kind: "mechanic", title: "Wall running", summary: "", status: "rejected", rationale: "Too close to wall jump", origin: "user_stated", evidence: "I don't want wall running" }] },
      },
      {
        reply: "Here are movement ideas: 1) Wall running along the city towers. 2) Grapple tail.",
        clerk: { ops: [{ type: "create_item", ref: "new:1", kind: "mechanic", title: "Wall-running", summary: "", status: "proposed", origin: "ai_suggested" }] },
      },
    ]);
    await svc.sendMessage(id, { text: "I don't want wall running, it's too close to wall jump.", mode: "chat" });
    const ws = await svc.sendMessage(id, { text: "Give me movement ideas", mode: "ideas" });

    expect(ws.state.items.filter((i) => /wall.?running/i.test(i.title))).toHaveLength(1);
    const last = ws.messages[ws.messages.length - 1];
    expect(last.meta?.warnings?.[0]).toMatch(/rejected/);
    const cs = ws.state.changeSets.find((c) => c.id === last.meta?.changeSetId)!;
    expect(cs.ops[0].state).toBe("invalid");
  });

  it("puts rejected ideas in the brief the designer sees", async () => {
    const { svc, id, provider } = await setup([
      { clerk: { ops: [{ type: "create_item", ref: "new:1", kind: "mechanic", title: "Wall running", summary: "", status: "rejected", rationale: "Too close to wall jump", origin: "user_stated", evidence: "no wall running" }] } },
      {},
    ]);
    await svc.sendMessage(id, { text: "no wall running", mode: "chat" });
    await svc.sendMessage(id, { text: "movement ideas?", mode: "ideas" });
    const system = provider.calls.filter((c) => c.purpose === "reply")[1].system;
    expect(system).toMatch(/Ruled out — never suggest these[\s\S]*Wall running — reason: Too close to wall jump/);
  });
});

describe("scenario: changing an established mechanic", () => {
  it("records the decision and runs Design Consequences without undoing the change", async () => {
    const { svc, id, provider } = await setup([
      {
        clerk: {
          ops: [
            { type: "create_item", ref: "new:1", kind: "weapon", title: "Energy rifle", summary: "Melee hits recharge rifle energy.", status: "confirmed", origin: "user_stated", evidence: "melee hits recharge the rifle's energy" },
          ],
        },
      },
      {
        reply: "Got it. That makes melee optional for keeping the rifle topped up...",
        clerk: {
          ops: [
            { type: "update_item", itemId: "it_1", summary: "Rifle energy regenerates automatically over time.", change: true, origin: "user_stated", evidence: "gun energy now regenerates automatically" },
            { type: "record_decision", title: "Rifle energy", before: "Melee hits recharge energy", after: "Energy regenerates automatically", origin: "user_stated", evidence: "gun energy now regenerates automatically" },
          ],
        },
        analysis: {
          whatChanged: "Rifle energy: melee recharge → automatic regeneration.",
          systemsAffected: [{ name: "Katana", impact: "No longer needed to sustain ranged combat." }],
          problems: ["Players may stay at range and ignore melee."],
          opportunities: ["Melee can be redesigned around finishers instead of resource gain."],
          tests: ["Watch whether testers still close distance during the first boss."],
        },
      },
    ]);
    await svc.sendMessage(id, { text: "The rifle is confirmed: melee hits recharge the rifle's energy.", mode: "chat" });
    const ws = await svc.sendMessage(id, { text: "Change of plan: gun energy now regenerates automatically.", mode: "chat" });

    const rifle = ws.state.items.find((i) => i.title === "Energy rifle")!;
    expect(rifle.summary).toMatch(/automatically/);
    expect(rifle.status).toBe("confirmed");
    expect(ws.state.decisions[0]).toMatchObject({ number: 1, before: "Melee hits recharge energy" });

    const last = ws.messages[ws.messages.length - 1];
    expect(last.meta?.kind).toBe("consequences");
    expect(last.meta?.consequences?.problems[0]).toMatch(/stay at range/);
    expect(provider.calls.some((c) => c.purpose === "analysis")).toBe(true);
  });
});

describe("scenario: undo", () => {
  it("restores memory exactly and keeps the history", async () => {
    const { svc, id } = await setup([
      {
        clerk: {
          ops: [
            { type: "create_item", ref: "new:1", kind: "system", title: "Movement", summary: "", status: "confirmed", origin: "user_stated", evidence: "movement is double jump and air dash" },
            { type: "create_item", ref: "new:2", kind: "mechanic", title: "Air dash", summary: "", status: "confirmed", parent: "new:1", origin: "user_stated", evidence: "air dash" },
            { type: "add_link", from: "new:2", to: "new:1", linkType: "related", origin: "user_stated", evidence: "air dash" },
          ],
        },
      },
    ]);
    const ws = await svc.sendMessage(id, { text: "movement is double jump and air dash", mode: "chat" });
    expect(ws.state.items).toHaveLength(2);
    const undone = await svc.undoChanges(id, ws.state.changeSets[0].id);
    expect(undone.state.items).toHaveLength(0);
    expect(undone.state.links).toHaveLength(0);
    expect(undone.state.changeSets[0].ops.every((p) => p.state === "reverted")).toBe(true);
    expect(undone.state.events.filter((e) => e.action === "undo")).toHaveLength(3);
  });
});

describe("scenario: accepting an option by letter", () => {
  it("treats a bare 'B' as the user's own words", async () => {
    const { svc, id } = await setup([
      { reply: "A) unlimited ammo B) melee recharges ammo C) pickups" },
      {
        clerk: { ops: [{ type: "create_item", ref: "new:1", kind: "mechanic", title: "Melee recharge", summary: "Melee hits restore gun ammo.", status: "confirmed", origin: "user_accepted", evidence: "B" }] },
      },
    ]);
    await svc.sendMessage(id, { text: "How should ammo work?", mode: "compare" });
    const ws = await svc.sendMessage(id, { text: "B", mode: "compare" });
    expect(ws.state.items[0]).toMatchObject({ title: "Melee recharge", status: "confirmed", origin: "user_accepted_ai" });
  });
});

describe("scenario: things go wrong", () => {
  it("a broken clerk reply leaves memory untouched and says so", async () => {
    const { svc, id } = await setup([{ reply: "Sure.", clerk: "I'm sorry, I can't do JSON today." }]);
    const ws = await svc.sendMessage(id, { text: "The game is called Acorn Ronin", mode: "chat" });
    expect(ws.state.items).toHaveLength(0);
    expect(ws.messages[1].meta?.warnings?.[0]).toMatch(/Memory wasn't updated/);
  });

  it("a failed reply is saved as an error message, not as memory", async () => {
    const store = new MemoryStore();
    const svc = new CopilotService(store, new ScriptedProvider(() => { throw new Error("rate limited"); }));
    const p = await svc.createProject("x");
    const ws = await svc.sendMessage(p.id, { text: "hello", mode: "chat" });
    expect(ws.messages[1].meta).toMatchObject({ kind: "error", error: "rate limited" });
    expect(ws.state.changeSets).toHaveLength(0);
  });
});

describe("scenario: adding detail is not a design change", () => {
  it("doesn't run Design Consequences when the user only refines a confirmed item", async () => {
    const { svc, id, provider } = await setup([
      { clerk: { ops: [{ type: "create_item", ref: "new:1", kind: "weapon", title: "Gun", summary: "The ranged weapon.", status: "confirmed", origin: "user_stated", evidence: "a gun" }] } },
      { clerk: { ops: [{ type: "update_item", itemId: "it_1", title: "Energy rifle", summary: "A rifle that fires energy bolts.", origin: "user_stated", evidence: "the gun is an energy rifle" }] } },
    ]);
    await svc.sendMessage(id, { text: "a samurai with a gun", mode: "chat" });
    const ws = await svc.sendMessage(id, { text: "the gun is an energy rifle", mode: "chat" });
    expect(ws.state.items[0].title).toBe("Energy rifle");
    expect(provider.calls.some((c) => c.purpose === "analysis")).toBe(false);
    expect(ws.messages.every((m) => m.meta?.kind !== "consequences")).toBe(true);
  });
});

describe("the example project", () => {
  it("seeds through the real pipeline into the expected memory", async () => {
    const store = new MemoryStore();
    const svc = new CopilotService(store, scripted([]));
    const summary = await svc.loadExample();
    const ws = await svc.getWorkspace(summary.id);
    const s = ws.state;
    const item = (t: string) => s.items.find((i) => i.title === t);

    expect(item("Acorn Ronin")?.slot).toBe("title");
    expect(item("Energy rifle")?.summary).toMatch(/sword hits/);
    expect(item("Wall running")?.status).toBe("rejected");
    expect(item("Small hero, big world")).toBeUndefined(); // AI pillar still waiting for the user
    expect(s.items.filter((i) => i.kind === "pillar").map((i) => i.status)).toEqual(["confirmed", "confirmed"]);
    expect(s.decisions).toHaveLength(1);
    expect(s.questions.filter((q) => q.status === "open")).toHaveLength(2);
    expect(s.questions.filter((q) => q.status === "resolved")).toHaveLength(1);
    expect(s.links).toHaveLength(1);
    const pending = s.changeSets.flatMap((c) => c.ops).filter((p) => p.state === "pending");
    expect(pending).toHaveLength(1);
    expect(ws.messages.filter((m) => m.meta?.kind === "consequences")).toHaveLength(1);
    expect(ws.messages.filter((m) => m.meta?.warnings?.length)).toHaveLength(0);
    expect(s.changeSets.flatMap((c) => c.ops).filter((p) => p.state === "invalid")).toEqual([]);
  });
});

describe("scenario: edit or regenerate the last message", () => {
  it("takes back the last exchange and undoes what it saved", async () => {
    const { svc, id } = await setup([
      { clerk: { ops: [{ type: "create_item", ref: "new:1", kind: "concept", slot: "title", title: "Acorn Ronin", summary: "", status: "confirmed", origin: "user_stated", evidence: "called Acorn Ronin" }] } },
      { clerk: { ops: [{ type: "create_item", ref: "new:1", kind: "mechanic", title: "Glide", summary: "", status: "rejected", origin: "user_stated", evidence: "no glide" }] } },
    ]);
    await svc.sendMessage(id, { text: "It's called Acorn Ronin", mode: "chat" });
    await svc.sendMessage(id, { text: "no glide", mode: "ideas" });
    const r = await svc.rewindLastTurn(id);
    expect(r.text).toBe("no glide");
    expect(r.mode).toBe("ideas");
    expect(r.workspace.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(r.workspace.state.items.map((i) => i.title)).toEqual(["Acorn Ronin"]);
    expect(r.workspace.state.changeSets).toHaveLength(1);
  });
});
