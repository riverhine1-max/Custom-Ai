import { describe, expect, it } from "vitest";
import { parseClerkOutput, routeOps } from "../src/core/validate";
import { evidenceMatches, similarTitle } from "../src/core/text";
import { deterministic, op, stateWith } from "./helpers";

deterministic();

describe("evidence check", () => {
  const user = "I want a fast third-person game about a squirrel samurai — with a sword and a gun!";
  it("accepts exact quotes, ignoring case and punctuation", () => {
    expect(evidenceMatches("about a squirrel samurai", user)).toBe(true);
    expect(evidenceMatches("With a SWORD and a gun", user)).toBe(true);
  });
  it("accepts fragments joined with ...", () => {
    expect(evidenceMatches("fast third-person game ... sword and a gun", user)).toBe(true);
  });
  it("rejects paraphrases and invented quotes", () => {
    expect(evidenceMatches("a samurai squirrel", user)).toBe(false);
    expect(evidenceMatches("the player has a glider", user)).toBe(false);
    expect(evidenceMatches(undefined, user)).toBe(false);
  });
  it("rejects fragments out of order", () => {
    expect(evidenceMatches("sword and a gun ... third-person", user)).toBe(false);
  });
  it("accepts a one-letter answer only when it is the whole message", () => {
    expect(evidenceMatches("B", "B")).toBe(true);
    expect(evidenceMatches("B", "B sounds risky")).toBe(false);
  });
});

describe("similar titles", () => {
  it("matches the same idea in different words", () => {
    expect(similarTitle("Wall running", "wall-running")).toBe(true);
    expect(similarTitle("Wall running", "Wall running ability")).toBe(true);
    expect(similarTitle("Bosses", "boss")).toBe(true);
  });
  it("doesn't let a short title swallow a longer one", () => {
    expect(similarTitle("Dash", "Air dash")).toBe(false);
    expect(similarTitle("Wall jump", "Wall running")).toBe(false);
  });
});

describe("parseClerkOutput", () => {
  it("keeps valid ops and drops malformed ones individually", () => {
    const { ops, rejected } = parseClerkOutput({
      ops: [
        { type: "create_item", ref: "new:1", kind: "mechanic", title: "Glide", summary: "", status: "proposed", origin: "ai_suggested" },
        { type: "create_item", ref: "new:2", kind: "spaceship", title: "X", status: "confirmed", origin: "user_stated" },
        { type: "teleport" },
      ],
    });
    expect(ops).toHaveLength(1);
    expect(rejected).toHaveLength(2);
  });
  it("treats an unknown origin as an AI suggestion", () => {
    const { ops } = parseClerkOutput({ ops: [{ type: "add_question", question: "How is healing restored?", origin: "trust me" }] });
    expect(ops[0].origin).toBe("ai_suggested");
  });
  it("returns nothing for junk", () => {
    expect(parseClerkOutput("nope").ops).toEqual([]);
  });
});

describe("routing", () => {
  const userText = "The game is called Acorn Ronin. I don't want wall running, it's too close to wall jump.";

  it("auto-applies changes backed by the user's words", () => {
    const s = stateWith([]);
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "concept", slot: "title", title: "Acorn Ronin", summary: "", status: "confirmed", origin: "user_stated", evidence: "The game is called Acorn Ronin" })], userText);
    expect(r[0].disposition).toBe("auto");
    expect(r[0].proposed.verified).toBe(true);
  });

  it("sends changes with a fake quote to review", () => {
    const s = stateWith([]);
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "mechanic", title: "Glide", summary: "", status: "confirmed", origin: "user_stated", evidence: "I love gliding" })], userText);
    expect(r[0].disposition).toBe("review");
    expect(r[0].proposed.note).toMatch(/exact words/);
  });

  it("never lets an AI suggestion be stored as more than proposed", () => {
    const s = stateWith([]);
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "mechanic", title: "Glide", summary: "", status: "confirmed", origin: "ai_suggested" })], userText);
    expect(r[0].disposition).toBe("review");
    expect((r[0].proposed.op as { status: string }).status).toBe("proposed");
  });

  it("won't let the AI confirm or reject existing items on its own", () => {
    const s = stateWith([{ id: "it_g", title: "Glide", status: "proposed" }]);
    const r = routeOps(s, [op({ type: "set_status", itemId: "it_g", status: "confirmed", origin: "ai_suggested" })], userText);
    expect(r[0].disposition).toBe("review");
  });

  it("blocks re-suggesting a rejected idea", () => {
    const s = stateWith([{ id: "it_w", title: "Wall running", status: "rejected", rationale: "Too close to wall jump" }]);
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "mechanic", title: "Wall-running", summary: "Run along walls", status: "proposed", origin: "ai_suggested" })], "Give me movement ideas");
    expect(r[0].disposition).toBe("invalid");
    expect(r[0].proposed.note).toMatch(/rejected/);
  });

  it("lets the user revive a rejected idea in their own words", () => {
    const s = stateWith([{ id: "it_w", title: "Wall running", status: "rejected" }]);
    const text = "Actually, let's bring back wall running for the city levels.";
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "mechanic", title: "Wall running", summary: "", status: "confirmed", origin: "user_stated", evidence: "let's bring back wall running" })], text);
    expect(r[0].disposition).toBe("auto");
    expect(r[0].proposed.op.type).toBe("set_status");
    expect(r[0].proposed.note).toMatch(/Revives/);
  });

  it("turns a duplicate concept slot into an update", () => {
    const s = stateWith([{ id: "it_t", kind: "concept", slot: "title", title: "Squirrel Game", status: "proposed" }]);
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "concept", slot: "title", title: "Acorn Ronin", summary: "", status: "confirmed", origin: "user_stated", evidence: "The game is called Acorn Ronin" })], userText);
    expect(r.map((x) => x.proposed.op.type)).toEqual(["update_item", "set_status"]);
    expect(r.every((x) => x.disposition === "auto")).toBe(true);
  });

  it("blocks duplicates of existing items", () => {
    const s = stateWith([{ id: "it_d", title: "Perfect dodge", status: "confirmed" }]);
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "mechanic", title: "Perfect Dodge", summary: "", status: "proposed", origin: "ai_suggested" })], "hi");
    expect(r[0].disposition).toBe("invalid");
  });

  it("holds dependants back when the item they depend on is only pending", () => {
    const s = stateWith([{ id: "it_c", kind: "system", title: "Combat" }]);
    const text = "maybe a parry?";
    const r = routeOps(
      s,
      [
        op({ type: "create_item", ref: "new:1", kind: "mechanic", title: "Parry", summary: "", status: "proposed", parent: "it_c", origin: "ai_suggested" }),
        op({ type: "add_link", from: "new:1", to: "it_c", linkType: "supports", origin: "user_stated", evidence: "maybe a parry" }),
      ],
      text,
    );
    expect(r[0].disposition).toBe("review");
    expect(r[1].disposition).toBe("review");
  });

  it("adds at most three open questions automatically and blocks duplicates", () => {
    const s = stateWith([]);
    s.questions.push({ id: "q_1", question: "How is healing restored?", relatedItemIds: [], status: "open", createdAt: "" });
    const q = (question: string) => op({ type: "add_question" as const, question, origin: "ai_suggested" as const });
    const r = routeOps(s, [q("How is healing restored in combat?"), q("Does gliding use stamina?"), q("How many weapons can the player carry?"), q("How are checkpoints handled?"), q("What happens when the combo meter hits zero?")], "hi");
    expect(r.map((x) => x.disposition)).toEqual(["invalid", "auto", "auto", "auto", "review"]);
  });

  it("only records decisions the user made", () => {
    const s = stateWith([]);
    const r = routeOps(s, [op({ type: "record_decision", title: "Energy", after: "Melee recharge", origin: "ai_suggested" })], "hi");
    expect(r[0].disposition).toBe("invalid");
  });

  it("respects review-all mode", () => {
    const s = stateWith([]);
    s.project.settings.reviewAll = true;
    const r = routeOps(s, [op({ type: "create_item", ref: "new:1", kind: "concept", slot: "title", title: "Acorn Ronin", summary: "", status: "confirmed", origin: "user_stated", evidence: "The game is called Acorn Ronin" })], userText);
    expect(r[0].disposition).toBe("review");
  });
});

describe("labels", () => {
  it("describe the change as it was proposed, before memory moves on", () => {
    const s = stateWith([{ id: "it_t", kind: "concept", slot: "title", title: "Squirrel Game" }, { id: "it_g", kind: "weapon", title: "Gun" }]);
    const text = "It's called Acorn Ronin and the gun is an energy rifle";
    const r = routeOps(s, [
      op({ type: "create_item", ref: "new:1", kind: "concept", slot: "title", title: "Acorn Ronin", summary: "", status: "confirmed", origin: "user_stated", evidence: "called Acorn Ronin" }),
      op({ type: "update_item", itemId: "it_g", title: "Energy rifle", origin: "user_stated", evidence: "the gun is an energy rifle" }),
    ], text);
    expect(r[0].proposed.label).toBe("Working title: “Squirrel Game” → “Acorn Ronin”");
    expect(r[1].proposed.label).toBe("Renamed “Gun” to “Energy rifle”");
  });
});
