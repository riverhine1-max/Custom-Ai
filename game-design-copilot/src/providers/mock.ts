/**
 * Stand-in providers:
 * - ScriptedProvider: tests hand it a function that decides each answer.
 * - OfflineProvider: explains what's missing when an online AI isn't set up.
 */
import type { GenerateRequest, ModelProvider } from "../core";

export class ScriptedProvider implements ModelProvider {
  readonly name = "scripted";
  readonly calls: GenerateRequest[] = [];
  constructor(private answer: (req: GenerateRequest, callIndex: number) => string | Promise<string>) {}
  async generate(req: GenerateRequest): Promise<string> {
    this.calls.push(req);
    const text = await this.answer(req, this.calls.length - 1);
    req.onText?.(text);
    return text;
  }
}

export class OfflineProvider implements ModelProvider {
  readonly name = "offline";
  constructor(private hint = "") {}
  async generate(req: GenerateRequest): Promise<string> {
    if (req.purpose !== "reply") return req.purpose === "clerk" ? '{"ops":[]}' : "{}";
    const text =
      `**This AI isn't set up yet.** ${this.hint}\n\n` +
      "Open **AI settings** in the bottom-left corner. The **Built-in AI** is free and needs no account.";
    req.onText?.(text);
    return text;
  }
}
