/**
 * Builds the system prompt for one designer turn:
 * persona + mode instructions (+ playbook) + the memory brief.
 */
import type { ModeId, ProjectState } from "../types";
import { buildBrief } from "../brief";
import { LEAD_DESIGNER } from "./persona";
import { findMode } from "./modes";
import { findPlaybook, renderPlaybook } from "./playbooks";

export function composeSystemPrompt(
  state: ProjectState,
  input: { text: string; mode: ModeId; topic?: string },
  briefBudget?: number,
): string {
  const mode = findMode(input.mode);
  const parts = [LEAD_DESIGNER, "", "----", mode.instructions];
  if (mode.id === "coach") {
    const pb = findPlaybook(input.topic);
    parts.push("", pb ? `TOPIC: ${pb.label}\n${renderPlaybook(pb)}` : "TOPIC: whatever the user asks to design. Pick a sensible step-by-step order.");
  }
  parts.push("", "----", buildBrief(state, { query: input.text, budget: briefBudget }));
  return parts.join("\n");
}
