/**
 * AI SETTINGS
 * Ludomuse, the free AI, is the default: it runs on this device with no
 * account or key. Online services are optional, for people who already
 * have an account with one.
 */
import React from "react";
import { BUILTIN_MODELS, type BuiltInSize, type BuiltInStatus } from "../providers/builtin/models";
import { BUILTIN_PRESET, PRESETS, findPreset, type AiConfig, type AiSettingsView, type ProviderId } from "../providers/presets";
import { Icons } from "./bits";

export interface BuiltInControls {
  active(): boolean;
  subscribe(fn: (s: BuiltInStatus) => void): () => void;
  prepare(): Promise<void>;
  isDownloaded(): Promise<boolean>;
  removeDownload(): Promise<void>;
}

export interface AiSettingsApi {
  get(): Promise<AiSettingsView>;
  save(c: AiConfig): Promise<AiSettingsView>;
  test(c?: AiConfig): Promise<{ ok: boolean; message: string }>;
  ollamaModels(baseURL?: string): Promise<string[]>;
  builtin?: BuiltInControls;
}

export function AiSettings({ api, onClose, onSaved, initialProvider }: {
  api: AiSettingsApi;
  onClose: () => void;
  onSaved: (v: AiSettingsView) => void;
  /** Open with this AI already picked (used by the welcome screen). */
  initialProvider?: ProviderId;
}) {
  const [current, setCurrent] = React.useState<AiSettingsView | null>(null);
  const [provider, setProvider] = React.useState<ProviderId>("builtin");
  const [size, setSize] = React.useState<BuiltInSize>("balanced");
  const [showOnline, setShowOnline] = React.useState(false);
  const [key, setKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [model, setModel] = React.useState("");
  const [baseURL, setBaseURL] = React.useState("");
  const [status, setStatus] = React.useState<{ ok: boolean; message: string } | null>(null);
  const [working, setWorking] = React.useState<"" | "test" | "save" | "find" | "download" | "remove">("");
  const [ollama, setOllama] = React.useState<string[]>([]);
  const [bi, setBi] = React.useState<BuiltInStatus | null>(null);
  const [downloaded, setDownloaded] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    api.get().then((v) => {
      setCurrent(v);
      const start = initialProvider ?? v.provider;
      setProvider(start);
      setSize(v.size);
      setModel(start === v.provider ? v.model : findPreset(start)?.defaultModel ?? "");
      setBaseURL(start === v.provider ? v.baseURL : "");
      setShowOnline(start !== "builtin");
    }).catch(() => undefined);
    const unsub = api.builtin?.subscribe(setBi);
    api.builtin?.isDownloaded().then(setDownloaded).catch(() => setDownloaded(null));
    return () => {
      unsub?.();
    };
  }, [api, initialProvider]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const preset = findPreset(provider) ?? BUILTIN_PRESET;
  const isBuiltin = provider === "builtin";
  const sameAsSaved = current?.provider === provider;
  const unsaved = !current || current.provider !== provider || (isBuiltin && current.size !== size) || (!isBuiltin && (key.trim() !== "" || model !== current.model || baseURL !== current.baseURL));
  const config = (): AiConfig =>
    isBuiltin ? { provider: "builtin", size } : { provider, apiKey: key.trim() || undefined, model: model.trim() || undefined, baseURL: baseURL.trim() || undefined };

  const choose = (id: ProviderId) => {
    setProvider(id);
    setStatus(null);
    setKey("");
    const p = findPreset(id)!;
    setModel(current?.provider === id ? current.model : p.defaultModel);
    setBaseURL(current?.provider === id ? current.baseURL : "");
  };

  const save = async (): Promise<AiSettingsView | null> => {
    setWorking("save");
    setStatus(null);
    try {
      const v = await api.save(config());
      setCurrent(v);
      onSaved(v);
      if (v.provider === "builtin") {
        setDownloaded(await api.builtin?.isDownloaded().catch(() => null) ?? null);
        setStatus({ ok: true, message: "Saved. You're using Ludomuse, the free AI." });
      } else {
        const t = await api.test();
        setStatus(t.ok ? { ok: true, message: "Saved. " + t.message } : { ok: false, message: "Saved, but the test failed: " + t.message });
      }
      return v;
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      setWorking("");
    }
  };

  const download = async () => {
    if (unsaved && !(await save())) return;
    setWorking("download");
    setStatus(null);
    try {
      await api.builtin?.prepare();
      setDownloaded(true);
      setStatus({ ok: true, message: "Ludomuse is ready. It will work offline from now on." });
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setWorking("");
    }
  };

  const remove = async () => {
    setWorking("remove");
    try {
      await api.builtin?.removeDownload();
      setDownloaded(false);
      setStatus({ ok: true, message: "Removed the downloaded model to free up space." });
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setWorking("");
    }
  };

  const test = async () => {
    setWorking("test");
    setStatus(null);
    try {
      setStatus(await api.test(config()));
    } finally {
      setWorking("");
    }
  };

  const findModels = async () => {
    setWorking("find");
    try {
      const list = await api.ollamaModels(baseURL || undefined);
      setOllama(list);
      if (list.length && !model) setModel(list[0]);
      setStatus(list.length ? null : { ok: false, message: "Ollama is running but has no models yet. In a terminal, run: ollama pull <model name>" });
    } catch (e) {
      setStatus({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setWorking("");
    }
  };

  const busyBuiltin = bi && ["checking", "downloading", "loading"].includes(bi.phase);
  const needsKeyNow = !isBuiltin && preset.needsKey && !key.trim() && !(sameAsSaved && current?.hasKey);

  return (
    <div className="modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ai-title">
        <div className="modal-head">
          <div>
            <h2 id="ai-title">AI settings</h2>
            <p>Ludomuse is the app's own AI. It's free, needs no account, and runs right here on your device.</p>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close"><Icons.close /></button>
        </div>

        <button role="radio" aria-checked={isBuiltin} className={`provider big${isBuiltin ? " on" : ""}`} onClick={() => choose("builtin")}>
          <span className="prov-top">
            <span className="prov-name">Ludomuse</span>
            <span className="badge free">Free · no account</span>
          </span>
          <span className="prov-blurb">{BUILTIN_PRESET.blurb} After that it works offline.</span>
          {current?.provider === "builtin" && <span className="prov-current">In use now</span>}
        </button>

        {isBuiltin && (
          <div className="modal-form">
            <div className="size-grid" role="radiogroup" aria-label="Ludomuse size">
              {BUILTIN_MODELS.map((m) => (
                <button key={m.id} role="radio" aria-checked={size === m.id} className={`size-opt${size === m.id ? " on" : ""}`} onClick={() => setSize(m.id)}>
                  <span className="size-name">{m.label}{m.id === "balanced" && <span className="muted"> · recommended</span>}</span>
                  <span className="size-dl">Download {m.download}</span>
                  <span className="size-blurb">{m.blurb}</span>
                </button>
              ))}
            </div>
            {bi && bi.phase !== "idle" && (
              <div className={`bi-status ${bi.phase}`} role="status">
                <span>{bi.message}</span>
                {busyBuiltin && <progress max={1} value={bi.progress ?? undefined} />}
              </div>
            )}
            {downloaded === true && !busyBuiltin && bi?.phase !== "ready" && <p className="modal-note">Downloaded on this device. It starts in a few seconds and works offline.</p>}
            <p className="modal-note">
              Ludomuse is the copilot's game-design setup running on an open model (Qwen 3.5) on your graphics chip, using WebGPU (current Chrome, Edge, or Safari on macOS 26). If Chrome's own built-in AI (Gemini Nano) is already set up on this computer, Ludomuse runs on that instead and nothing is downloaded.
            </p>
          </div>
        )}

        <details className="online" open={showOnline} onToggle={(e) => setShowOnline((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Use an online AI instead (needs an account and a key)</summary>
          <div className="provider-grid" role="radiogroup" aria-label="Online AI">
            {PRESETS.map((p) => (
              <button key={p.id} role="radio" aria-checked={provider === p.id} className={`provider${provider === p.id ? " on" : ""}`} onClick={() => choose(p.id)}>
                <span className="prov-top">
                  <span className="prov-name">{p.name}</span>
                  <span className="badge">{p.cost}</span>
                </span>
                <span className="prov-blurb">{p.blurb}</span>
                {current?.provider === p.id && <span className="prov-current">In use now</span>}
              </button>
            ))}
          </div>

          {!isBuiltin && (
            <div className="modal-form">
              {preset.needsKey && (
                <label className="field">
                  <span>API key</span>
                  <span className="key-row">
                    <input id="ai-key" className="input" type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)}
                      placeholder={sameAsSaved && current?.hasKey ? `Saved (${current.keyHint}). Paste a new one to replace it.` : "Paste your key here"} />
                    <button type="button" className="btn xs ghost" onClick={() => setShowKey((s) => !s)}>{showKey ? "Hide" : "Show"}</button>
                  </span>
                </label>
              )}
              {preset.keyUrl && <a className="key-link" href={preset.keyUrl} target="_blank" rel="noreferrer noopener">{preset.keyLabel} ↗</a>}
              {(provider === "custom" || provider === "ollama") && (
                <label className="field">
                  <span>{provider === "ollama" ? "Ollama address (leave empty for the usual one)" : "Base URL"}</span>
                  <input id="ai-base" className="input" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder={provider === "ollama" ? "http://localhost:11434/v1" : "https://openrouter.ai/api/v1"} />
                </label>
              )}
              <label className="field">
                <span>Model</span>
                <span className="key-row">
                  <input id="ai-model" className="input" list="ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === "ollama" ? "Press “Find my models”" : "Model name"} />
                  {provider === "ollama" && <button type="button" className="btn xs" disabled={working !== ""} onClick={findModels}>{working === "find" ? "Looking…" : "Find my models"}</button>}
                </span>
                <datalist id="ai-models">
                  {[...preset.models.map((m) => m.id), ...ollama].map((m) => <option key={m} value={m}>{preset.models.find((x) => x.id === m)?.label ?? m}</option>)}
                </datalist>
              </label>
              {preset.models.length > 1 && (
                <div className="chips">
                  {preset.models.map((m) => <button key={m.id} type="button" className="chip-btn" aria-pressed={model === m.id} onClick={() => setModel(m.id)}>{m.label}</button>)}
                </div>
              )}
              {preset.note && <p className="modal-note">{preset.note}</p>}
            </div>
          )}
        </details>

        {status && <p className={`status-line ${status.ok ? "ok" : "bad"}`} role="status">{status.message}</p>}

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>Close</button>
          <span className="spacer" />
          {isBuiltin ? (
            <>
              {downloaded === true && current?.provider === "builtin" && current.size === size ? (
                <button className="btn ghost" disabled={working !== "" || !!busyBuiltin} onClick={remove}>{working === "remove" ? "Removing…" : "Remove download"}</button>
              ) : (
                <button className="btn" disabled={working !== "" || !!busyBuiltin} onClick={download}>{busyBuiltin || working === "download" ? "Getting ready…" : "Download now"}</button>
              )}
              <button className="btn primary" disabled={working !== "" || !unsaved} onClick={save}>{working === "save" ? "Saving…" : unsaved ? "Use Ludomuse" : "Saved"}</button>
            </>
          ) : (
            <>
              <button className="btn" disabled={working !== "" || needsKeyNow} onClick={test}>{working === "test" ? "Testing…" : "Test"}</button>
              <button className="btn primary" disabled={working !== "" || needsKeyNow} onClick={save}>{working === "save" ? "Saving…" : "Save"}</button>
            </>
          )}
        </div>
        <p className="modal-privacy">Everything stays in this browser. Keys for online AIs are stored only here and sent only to that service.</p>
      </div>
    </div>
  );
}
