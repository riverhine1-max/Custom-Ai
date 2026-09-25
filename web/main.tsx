/**
 * THE WEB APP ENTRY
 * Everything runs here in the browser: the design logic (CopilotService),
 * your games (IndexedDB in this browser), and the AI (Ludomuse, the free AI
 * on this device, by default). There is no server and no account.
 *
 * It's also an installable app: a web app manifest plus a small service
 * worker (sw.js) let Chrome, Edge and Safari install it with its own icon
 * and window, and open it offline. The Windows desktop build (desktop/)
 * loads these same files.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { App, type Host, type InstallApi, type InstallState } from "../src/ui/App";
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

/* ---------- install as an app ---------- */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
const isDesktopApp = /Electron/i.test(navigator.userAgent);
const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

function makeInstall(): InstallApi | undefined {
  if (isDesktopApp || !("serviceWorker" in navigator)) return undefined;
  let deferred: InstallPromptEvent | null = null;
  let state: InstallState = standalone() ? "installed" : isSafari ? "manual" : "none";
  const listeners = new Set<(s: InstallState) => void>();
  const set = (s: InstallState) => {
    state = s;
    for (const fn of listeners) fn(s);
  };
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    if (!standalone()) set("available");
  });
  window.addEventListener("appinstalled", () => set("installed"));
  return {
    state: () => state,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    prompt: async () => {
      if (!deferred) return;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      set(choice.outcome === "accepted" ? "installed" : "none");
    },
    manualHint: /iphone|ipad|ipod/i.test(navigator.userAgent)
      ? "To install: tap the Share button, then “Add to Home Screen”."
      : "To install: in Safari's menu bar choose File → Add to Dock.",
  };
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || isDesktopApp || location.protocol === "file:") return;
  if (location.hostname === "localhost" && !location.search.includes("sw=1")) return; // keep dev reloads fresh
  navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("[copilot] offline support unavailable", e));
}

/** Fade out the loading screen once the app has drawn, after a short minimum so it's seen. */
function hideSplash() {
  const el = document.getElementById("splash");
  if (!el) return;
  const w = window as unknown as { __splashStart?: number; __splashTimer?: number };
  const quick = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = Math.max(0, (quick ? 300 : 1900) - (Date.now() - (w.__splashStart ?? Date.now())));
  setTimeout(() => {
    el.classList.add("done");
    clearInterval(w.__splashTimer);
    setTimeout(() => el.remove(), 600);
  }, wait);
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
  const host: Host = { prefs, saveFile, ai: aiApi, themeToggle: true, backups: true, notice, install: makeInstall() };
  createRoot(document.getElementById("root")!).render(<App client={service} host={host} />);
  requestAnimationFrame(() => requestAnimationFrame(hideSplash));
  registerServiceWorker();
}

start();
