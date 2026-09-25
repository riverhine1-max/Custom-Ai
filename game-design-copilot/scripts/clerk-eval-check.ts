/** Runs model answers for the clerk cases through the real validation code. */
import fs from "node:fs";
import { CASES } from "./clerk-eval-cases";
import { parseClerkOutput, routeOps } from "../src/core/validate";
import { extractJson } from "../src/core/text";

const answers: Record<string, string> = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const c of CASES) {
  const raw = answers[c.id];
  console.log(`\n=== ${c.id} — expect: ${c.expect}`);
  if (!raw) { console.log("  (no answer)"); continue; }
  try {
    const { ops, rejected } = parseClerkOutput(extractJson(raw));
    if (rejected.length) console.log("  malformed ops:", rejected);
    const routed = routeOps(c.state, ops, c.user);
    if (!routed.length) console.log("  (no ops)");
    for (const r of routed) console.log(`  ${r.disposition.padEnd(7)} ${r.proposed.label}${r.proposed.note ? `  [${r.proposed.note}]` : ""}`);
  } catch (e) {
    console.log("  PARSE FAILED:", (e as Error).message);
  }
}
