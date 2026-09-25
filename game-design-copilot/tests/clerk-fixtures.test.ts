/**
 * Real model answers to the clerk eval cases (scripts/clerk-eval-cases.ts),
 * run through the real validation code. If you change the clerk prompt,
 * re-run the eval with your model and refresh tests/fixtures/clerk-answers.json.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { CASES } from "../scripts/clerk-eval-cases";
import { parseClerkOutput, routeOps } from "../src/core/validate";
import { extractJson } from "../src/core/text";

const answers: Record<string, string> = JSON.parse(fs.readFileSync(new URL("./fixtures/clerk-answers.json", import.meta.url), "utf8"));
const run = (id: string) => {
  const c = CASES.find((x) => x.id === id)!;
  const { ops, rejected } = parseClerkOutput(extractJson(answers[id]));
  expect(rejected).toEqual([]);
  return routeOps(c.state, ops, c.user);
};

describe("clerk answers from a real model", () => {
  it("saves a pitch from the user's words, keeping 'maybe' as a proposal", () => {
    const r = run("pitch-with-maybe");
    expect(r.every((x) => x.disposition === "auto")).toBe(true);
    const created = r.map((x) => x.proposed.op).filter((o) => o.type === "create_item") as { title: string; status: string }[];
    expect(created.find((o) => /day.?night/i.test(o.title))?.status).toBe("proposed");
    expect(created.some((o) => /pixel/i.test(o.title))).toBe(true);
  });
  it("turns 'Let's go with B' into the accepted option and a decision", () => {
    const r = run("accept-option-B");
    expect(r.map((x) => x.proposed.op.type).sort()).toEqual(["create_item", "record_decision"]);
    expect(r.every((x) => x.disposition === "auto" && x.proposed.op.origin === "user_accepted")).toBe(true);
  });
  it("records nothing for a request for ideas", () => {
    expect(run("request-only")).toEqual([]);
  });
  it("rejects an existing item when the user drops it", () => {
    const r = run("reject-existing");
    expect(r[0]).toMatchObject({ disposition: "auto", proposed: { op: { type: "set_status", itemId: "it_5", status: "rejected" } } });
  });
  it("flags a changed mechanic so Design Consequences runs", () => {
    const r = run("change-mechanic");
    const upd = r.find((x) => x.proposed.op.type === "update_item")!;
    expect(upd.disposition).toBe("auto");
    expect((upd.proposed.op as { change?: boolean }).change).toBe(true);
    expect(r.some((x) => x.proposed.op.type === "record_decision")).toBe(true);
  });
  it("doesn't bring back a rejected idea the reply mentioned", () => {
    expect(run("rejected-not-revived").filter((x) => x.disposition !== "invalid")).toEqual([]);
  });
});
