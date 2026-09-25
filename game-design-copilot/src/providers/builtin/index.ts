/**
 * THE BUILT-IN AI
 * ===============
 * Free, no account, no key. It runs on the device the app is open on:
 *   1. If Chrome's own built-in AI is ready, use it (nothing to download).
 *   2. Otherwise run an open model in the browser with WebLLM (one-time
 *      download, cached afterwards).
 *   3. If the browser can't do either, explain what to do instead.
 */
import { SMALL_MODEL_BUDGET, type GenerateRequest, type ModelProvider } from "../../core";
import { ChromeAiEngine, chromeAiReady } from "./chrome";
import { WebLlmEngine, checkWebGPU } from "./webllm";
import { UNSUPPORTED_MESSAGE, findBuiltIn, type BuiltInSize, type BuiltInStatus } from "./models";

export * from "./models";
export { stripThinking } from "./webllm";

interface Engine {
  kind: "chrome" | "webllm" | "test";
  generate(req: GenerateRequest): Promise<string>;
}

/** Tests can install a fake engine here instead of downloading a real model. */
type TestHook = { __GDC_TEST_ENGINE__?: { generate(req: GenerateRequest): Promise<string> } };

export interface BuiltInOptions {
  size: BuiltInSize;
  /** URL of the bundled WebLLM worker script (null = run on the page). */
  workerUrl?: string | null;
  /** Use Chrome's built-in AI when it's ready. Default true. */
  preferChrome?: boolean;
}

export class BuiltInProvider implements ModelProvider {
  readonly name = "builtin";
  readonly budget = SMALL_MODEL_BUDGET;
  private engine: Engine | null = null;
  private loading: Promise<Engine> | null = null;
  private listeners = new Set<(s: BuiltInStatus) => void>();
  private f16 = true;
  status: BuiltInStatus = { phase: "idle", message: "The built-in AI starts the first time you send a message." };

  constructor(private opts: BuiltInOptions) {}

  get size(): BuiltInSize {
    return this.opts.size;
  }

  subscribe(fn: (s: BuiltInStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private set(s: BuiltInStatus) {
    this.status = s;
    for (const fn of this.listeners) fn(s);
  }

  /** Get the AI ready now (e.g. from a "Download now" button). */
  prepare(): Promise<void> {
    return this.ensure().then(() => undefined);
  }

  async generate(req: GenerateRequest): Promise<string> {
    const engine = await this.ensure();
    return engine.generate(req);
  }

  async isDownloaded(): Promise<boolean> {
    if (this.engine) return true;
    const { ok, f16 } = await checkWebGPU();
    return ok && WebLlmEngine.isDownloaded(this.opts.size, f16);
  }

  async removeDownload(): Promise<void> {
    const { f16 } = await checkWebGPU();
    await WebLlmEngine.removeDownload(this.opts.size, f16);
    this.engine = null;
    this.set({ phase: "idle", message: "Removed. It will download again the next time you use it." });
  }

  private ensure(): Promise<Engine> {
    if (this.engine) return Promise.resolve(this.engine);
    if (this.loading) return this.loading;
    this.loading = this.load().then(
      (e) => {
        this.engine = e;
        this.loading = null;
        return e;
      },
      (err) => {
        this.loading = null;
        throw err;
      },
    );
    return this.loading;
  }

  private async load(): Promise<Engine> {
    const fake = (globalThis as TestHook).__GDC_TEST_ENGINE__;
    if (fake) {
      this.set({ phase: "ready", engine: "test", message: "Built-in AI ready (test engine)." });
      return { kind: "test", generate: (r) => fake.generate(r) };
    }

    this.set({ phase: "checking", message: "Checking what this device can run…" });
    if (this.opts.preferChrome !== false && (await chromeAiReady())) {
      this.set({ phase: "ready", engine: "chrome", message: "Using Chrome's built-in AI on this device." });
      return new ChromeAiEngine();
    }

    const gpu = await checkWebGPU();
    if (!gpu.ok) {
      this.set({ phase: "unsupported", message: UNSUPPORTED_MESSAGE });
      throw new Error(UNSUPPORTED_MESSAGE);
    }
    this.f16 = gpu.f16;
    const model = findBuiltIn(this.opts.size);
    const cached = await WebLlmEngine.isDownloaded(this.opts.size, gpu.f16);
    this.set({
      phase: cached ? "loading" : "downloading",
      engine: "webllm",
      progress: 0,
      message: cached ? "Starting the built-in AI…" : `Downloading the free built-in AI (${model.download}, one time only)…`,
    });
    try {
      const engine = await WebLlmEngine.create(this.opts.size, gpu.f16, this.opts.workerUrl ?? "./webllm-worker.js", (p) => {
        this.set({
          phase: p.downloading ? "downloading" : "loading",
          engine: "webllm",
          progress: p.progress,
          message: p.downloading
            ? `Downloading the free built-in AI (${model.download}, one time only)… ${Math.round(p.progress * 100)}%`
            : `Starting the built-in AI… ${Math.round(p.progress * 100)}%`,
        });
      });
      this.set({ phase: "ready", engine: "webllm", progress: 1, message: `Built-in AI ready (${model.label}). It runs on this device.` });
      return engine;
    } catch (e) {
      const msg = friendlyLoadError(e);
      this.set({ phase: "error", engine: "webllm", message: msg });
      throw new Error(msg);
    }
  }
}

function friendlyLoadError(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/quota|storage|space/i.test(m)) return "There isn't enough free space to store the built-in AI. Free up some disk space, or pick the Light size in AI settings.";
  if (/memory|out of|device (was )?lost|OOM/i.test(m)) return "This device ran out of graphics memory. Pick the Light size in AI settings and try again.";
  if (/fetch|network|Failed to fetch|load failed/i.test(m)) return "The built-in AI couldn't download. Check your internet connection and try again (it's only needed the first time).";
  return `The built-in AI couldn't start: ${m}`;
}
