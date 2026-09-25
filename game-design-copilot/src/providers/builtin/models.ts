/**
 * The built-in AI's model sizes. Plain data, safe to import anywhere.
 * The models are open-weight Qwen 3.5 models, run in the browser by WebLLM.
 */
export type BuiltInSize = "light" | "balanced" | "smart";

export interface BuiltInModel {
  id: BuiltInSize;
  label: string;
  model: string; // WebLLM model id without the precision suffix
  download: string; // rough one-time download, for the settings screen
  blurb: string;
}

export const BUILTIN_MODELS: BuiltInModel[] = [
  { id: "light", label: "Light", model: "Qwen3.5-0.8B", download: "about 0.5 GB", blurb: "Fastest, simplest answers. For older computers and phones." },
  { id: "balanced", label: "Balanced", model: "Qwen3.5-2B", download: "about 1.2 GB", blurb: "Good answers on most laptops. Recommended." },
  { id: "smart", label: "Smart", model: "Qwen3.5-4B", download: "about 2.3 GB", blurb: "Best answers. Needs a newer computer with a good graphics chip." },
];

export const DEFAULT_BUILTIN: BuiltInSize = "balanced";

export const findBuiltIn = (id?: string) => BUILTIN_MODELS.find((m) => m.id === id) ?? BUILTIN_MODELS[1];

/** Full WebLLM id. Graphics chips without 16-bit float support need the f32 build. */
export function webllmId(size: BuiltInSize, f16: boolean): string {
  return `${findBuiltIn(size).model}-${f16 ? "q4f16_1" : "q4f32_1"}-MLC`;
}

export type BuiltInPhase = "idle" | "checking" | "downloading" | "loading" | "ready" | "unsupported" | "error";

export interface BuiltInStatus {
  phase: BuiltInPhase;
  engine?: "chrome" | "webllm" | "test";
  /** 0–1 while downloading or loading */
  progress?: number;
  /** Plain-language line for the UI */
  message: string;
}

export const UNSUPPORTED_MESSAGE =
  "This browser can't run the free built-in AI. It needs WebGPU: use the latest Chrome or Edge on a computer, or Safari on a Mac with macOS 26. " +
  "If you'd rather, you can connect an online AI instead in AI settings.";
