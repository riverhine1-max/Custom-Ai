/**
 * Turning a saved AI choice into a working provider. Everything here runs
 * in the browser: Ludomuse on the device, the online services
 * called directly with the user's own key.
 */
import type { ModelProvider } from "../core";
import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import { OfflineProvider } from "./mock";
import { BuiltInProvider, findBuiltIn } from "./builtin";
import { DEFAULT_AI, GEMINI_BASE_URL, OLLAMA_BASE_URL, findPreset, type AiConfig, type AiSettingsView } from "./presets";

export interface ProviderDeps {
  /** URL of the bundled WebLLM worker script. */
  workerUrl?: string | null;
}

export function providerFromConfig(c: AiConfig, deps: ProviderDeps = {}): ModelProvider {
  const preset = findPreset(c.provider);
  const model = c.model?.trim() || preset?.defaultModel || "";
  switch (c.provider) {
    case "builtin":
      return new BuiltInProvider({ size: c.size ?? "balanced", workerUrl: deps.workerUrl });
    case "gemini":
      if (!c.apiKey) return new OfflineProvider("Add your free Gemini key in AI settings, or switch back to Ludomuse.");
      // Gemini "thinks" before answering and that counts against the limit, so allow more room.
      return new OpenAIProvider({ apiKey: c.apiKey, baseURL: c.baseURL || GEMINI_BASE_URL, model, label: "Google Gemini", headroom: 4 });
    case "ollama":
      if (!model) return new OfflineProvider("Pick an Ollama model in AI settings.");
      return new OpenAIProvider({ baseURL: c.baseURL || OLLAMA_BASE_URL, model, label: "Ollama", headroom: 2 });
    case "openai":
      if (!c.apiKey) return new OfflineProvider("Add your OpenAI API key in AI settings, or switch back to Ludomuse.");
      return new OpenAIProvider({ apiKey: c.apiKey, model, label: "OpenAI", openaiNative: true });
    case "anthropic":
      if (!c.apiKey) return new OfflineProvider("Add your Anthropic API key in AI settings, or switch back to Ludomuse.");
      return new AnthropicProvider({ apiKey: c.apiKey, model });
    case "custom":
      if (!c.baseURL || !model) return new OfflineProvider("Add the service's base URL and a model name in AI settings.");
      return new OpenAIProvider({ apiKey: c.apiKey, baseURL: c.baseURL, model, label: "The AI service" });
    default:
      return providerFromConfig(DEFAULT_AI, deps);
  }
}

export function viewOf(c: AiConfig): AiSettingsView {
  const preset = findPreset(c.provider);
  const model = c.model || preset?.defaultModel || "";
  const key = c.apiKey ?? "";
  const size = c.size ?? "balanced";
  return {
    provider: c.provider,
    size,
    model,
    baseURL: c.baseURL ?? "",
    hasKey: key.length > 0,
    keyHint: key.length > 4 ? `…${key.slice(-4)}` : "",
    label: c.provider === "builtin" ? `Ludomuse · ${findBuiltIn(size).label}` : `${preset?.name ?? "AI"}${model ? ` · ${model}` : ""}`,
  };
}

export { BuiltInProvider } from "./builtin";
