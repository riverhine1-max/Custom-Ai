/**
 * HOSTED DEMO ENTRY
 * The same UI and the same CopilotService as the web app, running entirely
 * inside a claude.ai page:
 *   - model:   the page's `sample` capability (the viewer's own Claude account)
 *   - storage: the page's `db` capability, under each viewer's private path
 * If either is unavailable, it falls back to in-memory mode and says so.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { App, type Host } from "../src/ui/App";
import { CopilotService, type GenerateRequest, type ModelProvider, type ProjectStore } from "../src/core";
import { MemoryStore } from "../src/stores/memory";
import { ArtifactDbStore, type ArtifactDb } from "../src/stores/artifactDb";
import { HostedClaudeProvider } from "../src/providers/claudeHosted";
import "../src/ui/styles.css";

type Claude = { use(name: string): Promise<unknown> };
const claude = (window as unknown as { claude?: Claude }).claude;
const use = <T,>(name: string): Promise<T | null> =>
  claude?.use ? Promise.resolve(claude.use(name)).then((x) => (x as T) ?? null, () => null) : Promise.resolve(null);

class UnavailableProvider implements ModelProvider {
  readonly name = "unavailable";
  async generate(_req: GenerateRequest): Promise<string> {
    throw new Error("Claude isn't available in this view. Open this page on claude.ai while signed in to chat with your copilot.");
  }
}

function memoryPrefs(): NonNullable<Host["prefs"]> {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
}

function browserPrefs(scope: string): NonNullable<Host["prefs"]> {
  return {
    get(k) {
      try {
        return window.localStorage.getItem(`${scope}:${k}`);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        window.localStorage.setItem(`${scope}:${k}`, v);
      } catch {
        /* storage blocked */
      }
    },
  };
}

const LIMITS = { changeSets: 60, events: 400 };
const root = createRoot(document.getElementById("root")!);

function render(store: ProjectStore, provider: ModelProvider, host: Host, key: string) {
  const service = new CopilotService(store, provider, { compactLimits: LIMITS, historyMessages: 10, briefBudget: 12000 });
  root.render(<App key={key} client={service} host={host} />);
}

async function connect() {
  const [db, user, sample, downloads] = await Promise.all([
    use<ArtifactDb>("db"),
    use<{ id(): Promise<string | null>; can(name: string): Promise<boolean | null> }>("user"),
    use<ConstructorParameters<typeof HostedClaudeProvider>[0]>("sample"),
    use<{ save(r: { filename: string; data: string }): Promise<unknown> }>("downloads"),
  ]);
  const uid = user ? await user.id().catch(() => null) : null;
  // Viewers and commenters can open the page but can't save data; null means "not told", so try.
  const canWrite = user ? (await user.can("data.write").catch(() => null)) !== false : false;
  const provider: ModelProvider = sample ? new HostedClaudeProvider(sample) : new UnavailableProvider();
  const saveFile = downloads ? async (filename: string, text: string) => void (await downloads.save({ filename, data: text })) : undefined;
  const aiLabel = sample ? "Claude, on your claude.ai account (free here)" : "Claude isn't available in this view";

  if (db && uid && canWrite) {
    render(new ArtifactDbStore(db, uid), provider, { aiLabel, saveFile, prefs: browserPrefs(uid) }, "db");
  } else {
    render(new MemoryStore(), provider, {
      aiLabel,
      saveFile,
      prefs: memoryPrefs(),
      notice: db && uid && !canWrite
        ? "You can try the copilot here, but your access level can't save projects. Ask the page's owner for Contributor access to keep your work."
        : "Projects aren't saved in this view. Open this page on claude.ai, signed in, to keep your work between visits.",
    }, "memory");
  }
}

// Paint a working example straight away; switch to the viewer's own saved
// projects as soon as the platform connects (normally well under a second).
let connected = false;
const fallback = setTimeout(() => {
  if (!connected) render(new MemoryStore(), new UnavailableProvider(), { prefs: memoryPrefs(), aiLabel: "Connecting to Claude…" }, "preview");
}, 1200);
connect().finally(() => {
  connected = true;
  clearTimeout(fallback);
});
