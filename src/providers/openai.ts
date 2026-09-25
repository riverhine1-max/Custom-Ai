/**
 * OpenAI-style chat API, called straight from the browser with the user's
 * own key. Works with OpenAI (ChatGPT's models), Google Gemini's
 * OpenAI-compatible endpoint, Ollama and LM Studio on your computer,
 * OpenRouter, Groq, and others.
 */
import { alternate, type GenerateRequest, type ModelProvider } from "../core";
import { friendlyError } from "./errors";
import { httpError, readSse } from "./sse";

export interface OpenAIConfig {
  apiKey?: string;
  /** Defaults to OpenAI itself. */
  baseURL?: string;
  model: string;
  /** Name used in error messages ("Google Gemini", "Ollama"…). */
  label: string;
  /** OpenAI's own API uses max_completion_tokens and supports JSON mode. */
  openaiNative?: boolean;
  /** Multiplies the token limit, for models that "think" before answering. */
  headroom?: number;
}

export class OpenAIProvider implements ModelProvider {
  readonly name = "openai-compatible";
  constructor(private cfg: OpenAIConfig) {}

  async generate(req: GenerateRequest): Promise<string> {
    const base = (this.cfg.baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const limit = (req.maxTokens ?? 2000) * (this.cfg.headroom ?? (this.cfg.openaiNative ? 3 : 1));
    const body = {
      model: this.cfg.model,
      stream: true,
      messages: [
        { role: "system", content: req.json ? `${req.system}\n\nRespond with JSON only.` : req.system },
        ...alternate(req.messages),
      ],
      ...(this.cfg.openaiNative ? { max_completion_tokens: limit } : { max_tokens: limit }),
      ...(req.json && this.cfg.openaiNative ? { response_format: { type: "json_object" } } : {}),
    };
    let text = "";
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (!res.ok) throw await httpError(res);
      for await (const ev of readSse(res)) {
        if (ev.data === "[DONE]") break;
        const delta = JSON.parse(ev.data)?.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          req.onText?.(text);
        }
      }
    } catch (e) {
      if (req.signal?.aborted) throw new Error("Stopped.");
      throw friendlyError(e, this.cfg.label);
    }
    if (!text.trim()) throw new Error(`${this.cfg.label} sent back an empty answer. Try again.`);
    return text;
  }
}
