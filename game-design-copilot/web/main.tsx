/**
 * THE WEB APP ENTRY
 * Everything runs here in the browser: the design logic (CopilotService),
 * your games (IndexedDB in this browser), and the AI (the free built-in AI
 * on this device by default). There is no server and no account.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { App, type Host } from "../src/ui/App";
import type { AiSettingsApi, BuiltInControls } from "../src/ui/AiSettings";
import { CopilotService, MemoryStore, type GenerateRequest, type ModelProvider, type ProjectStore } from "../src/core";
import { IndexedDbStore } from "../src/stores/indexedDb";
import { BuiltInProvider, providerFromConfig, viewOf } from "../src/providers";
import type { BuiltInStatus } from "../src/providers/builtin";
import { DEFAULT_AI, type AiConfig } from "../src/providers/presets";
import "../src/ui/styles.css";

const WORKER_URL = "./webllm-worker.js";

/* ---------- small preferences (this browser only) ---------- */
const prefs: NonNullable<Host["prefs"]> = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage blocked: preferences just aren't remembered */
    }
  },
};

/* ---------- the chosen AI ---------- */
class AiManager {
  config: AiConfig;
  provider: ModelProvider;
  private statusListeners = new Set<(s: BuiltInStatus) => void>();
  private unsub: (() => void) | null = null;
  lastStatus: BuiltInStatus = { phase: "idle", message: "" };

  constructor() {
    let saved: AiConfig | null = null;
    try {
      saved = JSON.parse(prefs.get("gdc.ai") ?? "null");
    } catch {
      saved = null;
    }
    this.config = saved?.provider ? saved : DEFAULT_AI;
    this.provider = this.build(this.config);
  }

  private build(c: AiConfig): ModelProvider {
    this.unsub?.();
    this.unsub = null;
    const p = providerFromConfig(c, { workerUrl: WORKER_URL });
    if (p instanceof BuiltInProvider) {
      this.unsub = p.subscribe((s) => {
        this.lastStatus = s;
        for (const fn of this.statusListeners) fn(s);
      });
    }
    return p;
  }

  set(c: AiConfig) {
    const same = JSON.stringify(c) === JSON.stringify(this.config);
    this.config = c;
    prefs.set("gdc.ai", JSON.stringify(c));
    if (!same) this.provider = this.build(c);
  }

  /** An empty key keeps the key already saved for the same service. */
  merge(next: AiConfig): AiConfig {
    const keep = !next.apiKey && this.config.provider === next.provider ? this.config.apiKey : undefined;
    return {
      provider: next.provider,
      size: next.size,
      apiKey: next.apiKey?.trim() || keep,
      model: next.model?.trim() || undefined,
      baseURL: next.baseURL?.trim() || undefined,
    };
  }

  onStatus(fn: (s: BuiltInStatus) => void) {
    this.statusListeners.add(fn);
    if (this.provider instanceof BuiltInProvider) fn(this.lastStatus);
    return () => this.statusListeners.delete(fn);
  }
}

const ai = new AiManager();

/** What the service talks to: always whichever AI is chosen right now. */
const currentProvider: ModelProvider = {
  get name() {
    return ai.provider.name;
  },
  get budget() {
    return ai.provider.budget;
  },
  generate: (req: GenerateRequest) => ai.provider.generate(req),
};

const builtin: BuiltInControls = {
  active: () => ai.provider instanceof BuiltInProvider,
  subscribe: (fn) => ai.onStatus(fn),
  prepare: async () => {
    if (ai.provider instanceof BuiltInProvider) await ai.provider.prepare();
  },
  isDownloaded: async () => (ai.provider instanceof BuiltInProvider ? ai.provider.isDownloaded() : false),
  removeDownload: async () => {
    if (ai.provider instanceof BuiltInProvider) await ai.provider.removeDownload();
  },
};

const aiApi: AiSettingsApi = {
  get: async () => viewOf(ai.config),
  save: async (c) => {
    const merged = ai.merge(c);
    ai.set(merged);
    return viewOf(merged);
  },
  test: async (c) => {
    const cfg = c ? ai.merge(c) : ai.config;
    const p = JSON.stringify(cfg) === JSON.stringify(ai.config) ? ai.provider : providerFromConfig(cfg, { workerUrl: WORKER_URL });
    if (p.name === "offline") return { ok: false, message: "Fill in the missing details first." };
    try {
      const reply = await p.generate({
        purpose: "reply",
        system: "You are a connection test. Reply with exactly: Connected!",
        messages: [{ role: "user", content: "Are you there?" }],
        maxTokens: 60,
      });
      return { ok: true, message: `It works. The AI replied: “${reply.trim().slice(0, 80)}”` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  },
  ollamaModels: async (baseURL) => {
    const root = (baseURL || "http://localhost:11434/v1").replace(/\/v1\/?$/, "");
    const res = await fetch(`${root}/api/tags`).catch(() => null);
    if (!res || !res.ok) throw new Error("Couldn't reach Ollama. Is it installed and running?");
    const body = (await res.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((m) => m.name);
  },
  builtin,
};

/* ---------- files ---------- */
async function saveFile(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: filename.endsWith(".json") ? "application/json" : "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- start ---------- */
async function start() {
  let store: ProjectStore;
  let notice: string | undefined;
  if (await IndexedDbStore.available()) {
    store = new IndexedDbStore();
  } else {
    store = new MemoryStore();
    notice = "This browser window can't save your games (a private window, perhaps). They'll be gone when you close it, so use Export to keep a copy.";
  }
  const service = new CopilotService(store, currentProvider, { log: (m, e) => console.warn(`[copilot] ${m}`, e ?? "") });
  const host: Host = { prefs, saveFile, ai: aiApi, themeToggle: true, backups: true, notice };
  createRoot(document.getElementById("root")!).render(<App client={service} host={host} />);
}

start();
