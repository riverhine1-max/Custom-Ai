/**
 * Chrome's own built-in AI (Gemini Nano through the Prompt API). Nothing to
 * download from us: when Chrome already has the model ready, we use it.
 * Only used when LanguageModel.availability() says "available".
 */
import { alternate, type GenerateRequest } from "../../core";

interface LMSession {
  promptStreaming(input: string, options?: Record<string, unknown>): AsyncIterable<string> & ReadableStream<string>;
  destroy(): void;
}
interface LanguageModelApi {
  availability(options?: Record<string, unknown>): Promise<string>;
  create(options?: Record<string, unknown>): Promise<LMSession>;
}

const LANG = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

function api(): LanguageModelApi | null {
  const lm = (globalThis as unknown as { LanguageModel?: LanguageModelApi }).LanguageModel;
  return lm && typeof lm.availability === "function" ? lm : null;
}

export async function chromeAiReady(): Promise<boolean> {
  const lm = api();
  if (!lm) return false;
  try {
    return (await lm.availability(LANG)) === "available";
  } catch {
    return false;
  }
}

export class ChromeAiEngine {
  readonly kind = "chrome" as const;

  async generate(req: GenerateRequest): Promise<string> {
    const lm = api();
    if (!lm) throw new Error("Chrome's built-in AI isn't available.");
    const turns = alternate(req.messages);
    const last = turns.pop();
    const session = await lm.create({
      ...LANG,
      signal: req.signal,
      initialPrompts: [
        { role: "system", content: req.json ? `${req.system}\n\nRespond with JSON only.` : req.system },
        ...turns.map((t) => ({ role: t.role, content: t.content })),
      ],
    });
    let text = "";
    try {
      const stream = session.promptStreaming(last?.content ?? "", {
        signal: req.signal,
        ...(req.json ? { responseConstraint: { type: "object" } } : {}),
      });
      for await (const chunk of stream as AsyncIterable<string>) {
        // Older Chrome versions sent the whole answer so far; newer ones send only the new part.
        text = text && chunk.startsWith(text) ? chunk : text + chunk;
        req.onText?.(text);
      }
    } catch (e) {
      if (req.signal?.aborted) throw new Error("Stopped.");
      const name = (e as { name?: string })?.name;
      if (name === "QuotaExceededError") throw new Error("That was too much for Chrome's built-in AI to read at once. Try a shorter message.");
      throw new Error(`Chrome's built-in AI couldn't answer: ${(e as Error)?.message ?? e}`);
    } finally {
      session.destroy();
    }
    return text;
  }
}
