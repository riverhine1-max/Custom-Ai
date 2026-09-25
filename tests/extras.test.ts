/** Design Dice and the Scope meter. */
import { describe, expect, it } from "vitest";
import { DESIGN_DICE, dicePrompt, rollDesignDice, scopeReport } from "../src/core/extras";
import { emptyState } from "../src/core";
import type { DesignItem } from "../src/core";

const item = (kind: DesignItem["kind"], status: DesignItem["status"] = "confirmed", extra: Partial<DesignItem> = {}): DesignItem =>
  ({ id: `${kind}-${Math.random()}`, kind, title: kind, summary: "", status, origin: "user_stated", createdAt: "", updatedAt: "", ...extra }) as DesignItem;

describe("design dice", () => {
  it("never rolls the same face twice in a row", () => {
    let prev: string | undefined;
    for (let i = 0; i < 200; i++) {
      const r = rollDesignDice(prev);
      expect(r.text).not.toBe(prev);
      prev = r.text;
    }
  });
  it("has plenty of distinct faces and writes a prompt that checks the pillars", () => {
    expect(new Set(DESIGN_DICE.map((d) => d.text)).size).toBe(DESIGN_DICE.length);
    expect(DESIGN_DICE.length).toBeGreaterThanOrEqual(30);
    const p = dicePrompt({ kind: "limit", text: "the player can never jump" });
    expect(p).toContain("what if the player can never jump?");
    expect(p).toMatch(/main goals/);
  });
});

describe("scope meter", () => {
  it("starts tiny and grows with systems and content", () => {
    const s = emptyState("Test");
    expect(scopeReport(s).level.id).toBe("tiny");
    for (let i = 0; i < 6; i++) s.items.push(item("system"));
    for (let i = 0; i < 12; i++) s.items.push(item("mechanic"));
    for (let i = 0; i < 6; i++) s.items.push(item("boss"));
    const r = scopeReport(s);
    expect(r.counts).toEqual({ systems: 6, mechanics: 12, content: 6 });
    expect(r.level.id).toBe("large");
  });
  it("ignores ruled-out ideas, counts ideas at half, and tracks decided basics", () => {
    const s = emptyState("Test");
    s.items.push(item("system", "rejected"), item("system", "proposed"), item("concept", "confirmed", { slot: "title" }), item("concept", "likely", { slot: "genre" }));
    const r = scopeReport(s);
    expect(r.score).toBe(1.5);
    expect(r.basicsDone).toBe(1);
    expect(r.basicsTotal).toBe(12);
  });
});
