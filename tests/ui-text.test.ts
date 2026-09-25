import { describe, expect, it } from "vitest";
import { nameFromIdea } from "../src/ui/text";

describe("naming a game from its first idea", () => {
  it("uses the title when the idea names one", () => {
    expect(nameFromIdea("It's called Shadow Fox, a stealth action game.")).toBe("Shadow Fox");
    expect(nameFromIdea("A farming game called Grave Harvest where crops are haunted")).toBe("Grave Harvest");
  });
  it("otherwise uses the first few words", () => {
    expect(nameFromIdea("I want to make a fast third-person game about a squirrel samurai")).toBe("Fast third-person game about a…");
    expect(nameFromIdea("A cozy farming game")).toBe("Cozy farming game");
  });
});
