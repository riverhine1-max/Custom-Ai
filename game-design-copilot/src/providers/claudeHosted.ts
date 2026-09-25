/**
 * Hosted-Claude adapter for the claude.ai demo page. It calls the page's
 * `sample` capability, which answers on the viewer's own Claude account —
 * no API key involved. Browser-only.
 *
 * The capability has no system role, so the system prompt goes in a
 * leading user turn, and the whole request must stay under 64 KiB.
 */
import { alternate, type GenerateRequest, type ModelProvider, type ModelMessage } from "../core";

interface SampleFn {
  (input: string | ModelMessage[], options?: Record<string, unknown>): Promise<{ text: string; truncated: boolean }>;
}

const MAX_BYTES = 60_000; // leave headroom under the 64 KiB cap

export class HostedClaudeProvider implements ModelProvider {
  readonly name = "claude-hosted";
  constructor(private sample: SampleFn) {}

  async generate(req: GenerateRequest): Promise<string> {
    const instructions = `<instructions>\n${req.system}${req.json ? "\n\nRespond with JSON only." : ""}\n</instructions>`;
    let turns = alternate(req.messages);
    const size = (ts: ModelMessage[]) => new TextEncoder().encode(instructions + ts.map((t) => t.content).join("")).length;
    // drop the oldest turns until it fits (never the instructions or the latest message)
    while (turns.length > 1 && size(turns) > MAX_BYTES) turns = alternate(turns.slice(1));
    const input: ModelMessage[] = [{ role: "user", content: instructions }, ...turns];
    try {
      const res = await this.sample(input, {
        cache: false,
        signal: req.signal,
        // the clerk is a short, routine extraction: the quick tier answers in seconds
        modelTier: req.purpose === "clerk" ? "quick" : "default",
        onText: req.onText ? ({ text }: { text: string }) => req.onText!(text) : undefined,
      });
      return res.text;
    } catch (e) {
      const err = e as { code?: string; message?: string; text?: string };
      const access = "This page doesn't have permission to use Claude yet. Reload the page, allow Claude when asked, then press Try again.";
      const friendly: Record<string, string> = {
        not_granted: access,
        not_declared: access,
        capability_disabled: access,
        capability_removed: "This Claude app version can't run the copilot. Update the app or open the page in a browser.",
        rate_limited: "Too many requests right now, or your Claude usage limit was reached. Try again in a bit.",
        sampling_disabled: "Claude isn't available for this account.",
        prompt_too_large: "This project's context got too large for one request.",
        session_expired: "Please sign in to claude.ai again.",
        cancelled: "Stopped.",
      };
      const known = friendly[err.code ?? ""];
      const looksLikeAccess = /access|permission|grant|allow/i.test(err.message ?? "");
      throw new Error(known ?? (looksLikeAccess ? access : `Claude couldn't answer (${err.message ?? err.code ?? "unknown error"}). Press Try again.`));
    }
  }
}
