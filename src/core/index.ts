/** Public surface of the portable core. Hosts import from here. */
export * from "./types";
export * from "./client";
export * from "./provider";
export * from "./store";
export { MemoryStore } from "./memoryStore";
export { CopilotService, rejectedMentions, type ServiceOptions } from "./service";
export { emptyState, clone, pad, type MemoryEdit } from "./memory";
export { describeOp, kindLabel, statusVerb, STATUS_WORD } from "./validate";
export { buildBrief, oneLiner } from "./brief";
export { renderDesignDoc } from "./designDoc";
export { MODES, findMode } from "./prompts/modes";
export { PLAYBOOKS, findPlaybook } from "./prompts/playbooks";
export { extractJson } from "./text";
