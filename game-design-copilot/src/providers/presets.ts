/**
 * The AI choices shown on the AI settings screen. Plain data, safe to
 * import anywhere. The built-in AI is the default; the others are optional
 * online services that need the user's own account and key.
 * Add a provider = add an entry here and a case in providerFromConfig().
 */
import type { BuiltInSize } from "./builtin/models";

export type ProviderId = "builtin" | "gemini" | "ollama" | "openai" | "anthropic" | "custom";

export interface Preset {
  id: ProviderId;
  name: string;
  cost: string; // shown as a badge
  free: boolean;
  blurb: string;
  needsKey: boolean;
  keyUrl?: string; // where to get a key
  keyLabel?: string;
  baseURL?: string; // OpenAI-compatible endpoint
  defaultModel: string;
  models: { id: string; label: string }[]; // suggestions; any model name can be typed
  note?: string; // privacy or setup note
}

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const OLLAMA_BASE_URL = "http://localhost:11434/v1";

export const BUILTIN_PRESET: Preset = {
  id: "builtin",
  name: "Built-in AI",
  cost: "Free · no account",
  free: true,
  blurb: "Runs on this device. Nothing to sign up for, no key. The first time, it downloads once.",
  needsKey: false,
  defaultModel: "",
  models: [],
};

/** Optional online services (each needs its own account and key). */
export const PRESETS: Preset[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    cost: "Free",
    free: true,
    blurb: "Free key from Google, good answers. The easiest free option.",
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    keyLabel: "Get a free Gemini key",
    baseURL: GEMINI_BASE_URL,
    defaultModel: "gemini-3.8-flash",
    models: [{ id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (free)" }],
    note: "On the free tier, Google may use what you send to improve its products. The free tier also limits how many messages you can send per minute and per day.",
  },
  {
    id: "ollama",
    name: "On your computer (Ollama)",
    cost: "Free and private",
    free: true,
    blurb: "Runs an AI model on your own computer. No key, nothing leaves your machine. Needs a fairly powerful computer.",
    needsKey: false,
    keyUrl: "https://ollama.com/download",
    keyLabel: "Download Ollama",
    baseURL: OLLAMA_BASE_URL,
    defaultModel: "",
    models: [],
    note: "Install Ollama, download a model with `ollama pull <name>`, then press “Find my models”. Smaller models give simpler answers.",
  },
  {
    id: "openai",
    name: "ChatGPT (OpenAI)",
    cost: "Pay per use",
    free: false,
    blurb: "Uses OpenAI's models with an API key. A typical design session costs a few cents with GPT-6 Luna.",
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    keyLabel: "Get an OpenAI API key",
    defaultModel: "gpt-6-luna",
    models: [
      { id: "gpt-6-luna", label: "GPT-6 Luna (cheapest)" },
      { id: "gpt-6-sol", label: "GPT-6 Sol (smarter, costs more)" },
    ],
    note: "A ChatGPT Plus subscription doesn't cover the API. API use is billed separately by OpenAI.",
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    cost: "Pay per use",
    free: false,
    blurb: "Uses Claude with an Anthropic API key.",
    needsKey: true,
    keyUrl: "https://platform.claude.com/settings/keys",
    keyLabel: "Get an Anthropic API key",
    defaultModel: "claude-sonnet-5",
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (cheaper)" },
    ],
  },
  {
    id: "custom",
    name: "Other (OpenAI-compatible)",
    cost: "Varies",
    free: false,
    blurb: "Any service with an OpenAI-style API, such as OpenRouter, Groq or LM Studio.",
    needsKey: true,
    defaultModel: "",
    models: [],
    note: "Paste the service's base URL (it usually ends in /v1), your key, and a model name from that service.",
  },
];

export const findPreset = (id: string | undefined) => (id === "builtin" ? BUILTIN_PRESET : PRESETS.find((p) => p.id === id));

/** The saved AI choice (kept in this browser). */
export interface AiConfig {
  provider: ProviderId;
  /** Built-in AI size. */
  size?: BuiltInSize;
  apiKey?: string;
  model?: string;
  baseURL?: string;
}

export const DEFAULT_AI: AiConfig = { provider: "builtin", size: "balanced" };

/** What the settings screen is shown about the saved choice (the key itself is masked). */
export interface AiSettingsView {
  provider: ProviderId;
  size: BuiltInSize;
  model: string;
  baseURL: string;
  hasKey: boolean;
  keyHint: string; // e.g. "…a1b2"
  label: string; // e.g. "Built-in AI · Balanced"
}
