/**
 * Claude's API, called straight from the browser with the user's own key.
 */
import { alternate, type GenerateRequest, type ModelProvider } from "../core";
import { friendlyError } from "./errors";
import { httpError, readSse } from "./sse";

export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  constructor(private cfg: { apiKey: string; model: string }) {}

  async generate(req: GenerateRequest): Promise<string> {
    let text = "";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.cfg.apiKey,
          "anthropic-version": "2023-06-01",
          // Claude's API only answers pages directly when asked to.
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: this.cfg.model,
          max_tokens: req.maxTokens ?? 2000,
          stream: true,
          system: req.json ? `${req.system}\n\nRespond with JSON only.` : req.system,
          messages: alternate(req.messages),
        }),
        signal: req.signal,
      });
      if (!res.ok) throw await httpError(res);
      for await (const ev of readSse(res)) {
        const data = JSON.parse(ev.data);
        if (data.type === "content_block_delta" && data.delta?.type === "text_delta") {
          text += data.delta.text;
          req.onText?.(text);
        } else if (data.type === "error") {
          throw Object.assign(new Error(data.error?.message ?? "Claude error"), { status: 500 });
        }
      }
    } catch (e) {
      if (req.signal?.aborted) throw new Error("Stopped.");
      throw friendlyError(e, "Claude");
    }
    return text;
  }
}
