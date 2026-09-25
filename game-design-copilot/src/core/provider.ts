/**
 * THE MODEL PROVIDER INTERFACE
 * The core never imports an AI SDK. It talks to this small interface, and
 * each provider (Anthropic, OpenAI-compatible, hosted Claude, mock) is an
 * adapter in src/providers. Swapping models = swapping the adapter.
 */
export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export type Purpose = "reply" | "clerk" | "analysis";

export interface GenerateRequest {
  /** Lets an adapter pick a model per job (e.g. a cheaper model for the clerk). */
  purpose: Purpose;
  system: string;
  messages: ModelMessage[]; // oldest first, ends with a user message
  maxTokens?: number;
  /** Ask for JSON output. Adapters use native JSON modes where available. */
  json?: boolean;
  /** Streaming: called with the WHOLE text so far each time more arrives. */
  onText?: (textSoFar: string) => void;
  signal?: AbortSignal;
}

/**
 * How much a model can read and write per call. Small models that run on
 * your own device get a smaller brief, less history and a shorter memory
 * prompt so everything fits in their context window.
 */
export interface ContextBudget {
  briefChars: number; // size of the game notes summary
  historyMessages: number; // earlier chat messages included
  historyChars?: number; // longest an earlier message can be (small models)
  compactClerk: boolean; // use the short memory-step prompt
  replyTokens: number;
  clerkTokens: number;
}

export const FULL_BUDGET: ContextBudget = { briefChars: 14000, historyMessages: 12, compactClerk: false, replyTokens: 2000, clerkTokens: 2500 };
// Sized for a 4,096-token window: about 3,000 tokens in, 500 out.
export const SMALL_MODEL_BUDGET: ContextBudget = { briefChars: 3500, historyMessages: 4, historyChars: 1200, compactClerk: true, replyTokens: 500, clerkTokens: 600 };

export interface ModelProvider {
  readonly name: string;
  /** Omit for large cloud models; small local models set SMALL_MODEL_BUDGET. */
  readonly budget?: ContextBudget;
  generate(req: GenerateRequest): Promise<string>;
}

/** Merge consecutive same-role messages (some APIs require strict alternation). */
export function alternate(messages: ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + m.content;
    else out.push({ ...m });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
