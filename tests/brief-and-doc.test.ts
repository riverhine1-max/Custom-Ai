import { describe, expect, it } from "vitest";
import { buildBrief } from "../src/core/brief";
import { renderDesignDoc } from "../src/core/designDoc";
import { applyManualEdit } from "../src/core/memory";
import { deterministic, stateWith } from "./helpers";

deterministic();

describe("memory brief", () => {
  it("tags every item with its status and lists unknown concept slots", () => {
    const s = stateWith([
      { id: "it_g", kind: "concept", slot: "genre", title: "Action platformer" },
      { id: "it_c", kind: "system", title: "Combat", summary: "Katana and rifle." },
      { id: "it_p", kind: "mechanic", title: "Parry", status: "proposed", parentId: "it_c" },
    ]);
    const b = buildBrief(s);
    expect(b).toMatch(/Genre \[Decided\]: Action platformer/);
    expect(b).toMatch(/Not decided yet: Working title, Perspective/);
    expect(b).toMatch(/- System \[Decided\] Combat \(it_c\): Katana and rifle\./);
    expect(b).toMatch(/ {2}- Mechanic \[Idea\] Parry/);
  });

  it("shrinks unrelated items to titles when over budget, but keeps rejected ideas", () => {
    const items = Array.from({ length: 60 }, (_, n) => ({ id: `it_${n}`, kind: "enemy" as const, title: `Enemy ${n}`, summary: "A long description of this enemy's behaviour. ".repeat(6) }));
    const s = stateWith([...items, { id: "it_r", title: "Wall running", status: "rejected", rationale: "too similar" }, { id: "it_boss", kind: "boss", title: "Acorn King", summary: "Tests perfect dodge." }]);
    const b = buildBrief(s, { query: "Let's work on the Acorn King boss", budget: 6000 });
    expect(b.length).toBeLessThan(9000);
    expect(b).toMatch(/Acorn King \(it_boss\): Tests perfect dodge/);
    expect(b).toMatch(/Wall running — reason: too similar/);
    expect(b).toMatch(/Enemy 5 \(it_5\)\n/);
  });
});

describe("design document", () => {
  it("contains confirmed design only, unless proposals are requested", () => {
    const s = stateWith([
      { id: "it_t", kind: "concept", slot: "title", title: "Acorn Ronin" },
      { id: "it_c", kind: "system", title: "Combat", summary: "Katana plus rifle." },
      { id: "it_k", kind: "weapon", title: "Katana", parentId: "it_c", summary: "Fast melee." },
      { id: "it_g", kind: "mechanic", title: "Glide", status: "proposed" },
      { id: "it_w", kind: "mechanic", title: "Wall running", status: "rejected", rationale: "Too close to wall jump" },
    ]);
    applyManualEdit(s, { type: "add_decision", title: "Rifle energy", before: "Auto", after: "Melee recharge", reason: "Encourage switching" });
    const doc = renderDesignDoc(s);
    expect(doc).toMatch(/^# Acorn Ronin/);
    expect(doc).toMatch(/### Combat[\s\S]*- \*\*Katana\*\* — Fast melee\./);
    expect(doc).not.toMatch(/Glide/);
    expect(doc).toMatch(/1 idea isn't shown/);
    expect(doc).toMatch(/DECISION 001 · Rifle energy/);
    expect(doc).toMatch(/~~Wall running~~ — Too close to wall jump/);
    expect(renderDesignDoc(s, { includeProposed: true })).toMatch(/Ideas \(not decided yet\)[\s\S]*Glide/);
  });
});

describe("manual edits", () => {
  it("deleting an item moves its children up and removes its links", () => {
    const s = stateWith([
      { id: "it_c", kind: "system", title: "Combat" },
      { id: "it_k", kind: "weapon", title: "Katana", parentId: "it_c" },
      { id: "it_r", kind: "weapon", title: "Rifle", parentId: "it_c" },
    ]);
    applyManualEdit(s, { type: "add_link", from: "it_k", to: "it_r", linkType: "feeds" });
    applyManualEdit(s, { type: "delete_item", itemId: "it_k" });
    expect(s.items.map((i) => i.id)).toEqual(["it_c", "it_r"]);
    expect(s.links).toHaveLength(0);
    applyManualEdit(s, { type: "delete_item", itemId: "it_c" });
    expect(s.items[0].parentId).toBeNull();
  });
});
