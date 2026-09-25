/**
 * An open AI model running inside the browser on your graphics chip, via
 * WebLLM (WebGPU). The model downloads once and is then cached by the
 * browser, so later visits start in seconds and work offline.
 *
 * The heavy WebLLM library is only loaded when Ludomuse is first used.
 */
import { alternate, type GenerateRequest } from "../../core";
import { webllmId, type BuiltInSize } from "./models";

type WebLlm = typeof import("@mlc-ai/web-llm");
type Engine = import("@mlc-ai/web-llm").MLCEngineInterface;

export interface Progress {
  progress: number; // 0–1
  downloading: boolean;
  text: string;
}

/** Is WebGPU usable here, and does the graphics chip support 16-bit floats? */
export async function checkWebGPU(): Promise<{ ok: boolean; f16: boolean }> {
  const gpu = (globalThis.navigator as unknown as { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } })?.gpu;
  if (!gpu) return { ok: false, f16: false };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, f16: false };
    return { ok: true, f16: adapter.features.has("shader-f16") };
  } catch {
    return { ok: false, f16: false };
  }
}

export class WebLlmEngine {
  readonly kind = "webllm" as const;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private engine: Engine, readonly modelId: string) {}

  /** Download (first time) and load the model. `workerUrl` is the bundled worker script. */
  static async create(size: BuiltInSize, f16: boolean, workerUrl: string | null, onProgress: (p: Progress) => void): Promise<WebLlmEngine> {
    const webllm: WebLlm = await import("@mlc-ai/web-llm");
    const modelId = webllmId(size, f16);
    const initProgressCallback = (r: { progress: number; text: string }) => {
      onProgress({ progress: r.progress, downloading: /fetch|download/i.test(r.text) && r.progress < 1, text: r.text });
    };
    let engine: Engine;
    try {
      if (!workerUrl || typeof Worker === "undefined") throw new Error("no worker");
      const worker = new Worker(new URL(workerUrl, document.baseURI), { type: "module" });
      engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback }, { context_window_size: 4096 });
    } catch (e) {
      if ((e as Error)?.message !== "no worker") console.warn("[Ludomuse] worker failed, running on the page instead", e);
      engine = await webllm.CreateMLCEngine(modelId, { initProgressCallback }, { context_window_size: 4096 });
    }
    return new WebLlmEngine(engine, modelId);
  }

  static async isDownloaded(size: BuiltInSize, f16: boolean): Promise<boolean> {
    try {
      const webllm: WebLlm = await import("@mlc-ai/web-llm");
      return await webllm.hasModelInCache(webllmId(size, f16));
    } catch {
      return false;
    }
  }

  static async removeDownload(size: BuiltInSize, f16: boolean): Promise<void> {
    const webllm: WebLlm = await import("@mlc-ai/web-llm");
    await webllm.deleteModelAllInfoInCache(webllmId(size, f16));
  }

  /** One answer at a time: the model can only do one thing at once. */
  generate(req: GenerateRequest): Promise<string> {
    const run = this.queue.then(() => this.run(req));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async run(req: GenerateRequest): Promise<string> {
    const stop = () => void this.engine.interruptGenerate();
    req.signal?.addEventListener("abort", stop);
    let raw = "";
    try {
      const chunks = await this.engine.chat.completions.create({
        messages: [
          { role: "system", content: req.json ? `${req.system}\n\nRespond with JSON only.` : req.system },
          ...alternate(req.messages).map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
        max_tokens: req.maxTokens ?? 500,
        temperature: req.json ? 0.2 : 0.7,
        ...(req.json ? { response_format: { type: "json_object" as const } } : {}),
        extra_body: { enable_thinking: false },
      });
      for await (const c of chunks) {
        const d = c.choices[0]?.delta?.content;
        if (!d) continue;
        raw += d;
        const visible = stripThinking(raw);
        if (visible) req.onText?.(visible);
      }
    } catch (e) {
      if (req.signal?.aborted) throw new Error("Stopped.");
      throw new Error(`Ludomuse had a problem: ${(e as Error)?.message ?? e}`);
    } finally {
      req.signal?.removeEventListener("abort", stop);
    }
    if (req.signal?.aborted) throw new Error("Stopped.");
    return stripThinking(raw);
  }
}

/** Remove any <think>…</think> section (and hide an unfinished one while streaming). */
export function stripThinking(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>\s*/g, "");
  const open = out.indexOf("<think>");
  if (open >= 0) out = out.slice(0, open);
  return out.trimStart();
}
