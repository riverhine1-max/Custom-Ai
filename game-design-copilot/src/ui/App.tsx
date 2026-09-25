/**
 * The whole app: a sidebar with your games (like chats in ChatGPT), the
 * home screen, and the open game. It only talks to a CopilotClient, so the
 * same UI runs in the web app and in the hosted claude.ai demo.
 */
import React from "react";
import type { CopilotClient, ProjectSummary } from "../core";
import type { AiSettingsView } from "../providers/presets";
import type { BuiltInStatus } from "../providers/builtin/models";
import { findBuiltIn } from "../providers/builtin/models";
import { Workspace, errText } from "./Workspace";
import { AiSettings, type AiSettingsApi } from "./AiSettings";
import { ConfirmButton, Icons, timeAgo } from "./bits";
import { nameFromIdea } from "./text";

export interface Host {
  /** Web app: the AI settings screen (and the built-in AI controls). */
  ai?: AiSettingsApi;
  /** Demo: a fixed description of the AI in use. */
  aiLabel?: string;
  /** Offer a file download (omitted where the host can't). */
  saveFile?: (filename: string, text: string) => Promise<void>;
  /** A notice shown on the home screen (e.g. "not saved in this view"). */
  notice?: string;
  /** Remember small preferences (last game, theme). */
  prefs?: { get(key: string): string | null; set(key: string, value: string): void };
  /** Show the light/dark switch. */
  themeToggle?: boolean;
  /** Offer Export / Import of games as backup files. */
  backups?: boolean;
}

type Theme = "system" | "light" | "dark";

export function App({ client, host }: { client: CopilotClient; host: Host }) {
  const [projects, setProjects] = React.useState<ProjectSummary[] | null>(null);
  const [current, setCurrent] = React.useState<string | null>(null);
  const [initialMessage, setInitialMessage] = React.useState<string | undefined>();
  const [toastMsg, setToastMsg] = React.useState<string | null>(null);
  const [sideOpen, setSideOpen] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [ai, setAi] = React.useState<AiSettingsView | null>(null);
  const [aiStatus, setAiStatus] = React.useState<BuiltInStatus | null>(null);
  const [downloaded, setDownloaded] = React.useState<boolean | null>(null);
  const [theme, setTheme] = React.useState<Theme>("system");
  const importInput = React.useRef<HTMLInputElement>(null);

  const toast = React.useCallback((s: string) => setToastMsg(s), []);
  React.useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3800);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // Theme: read the saved choice after the first render, then apply changes.
  React.useEffect(() => {
    const saved = host.prefs?.get("gdc.theme") as Theme | null;
    if (saved) setTheme(saved);
  }, [host]);
  React.useEffect(() => {
    if (!host.themeToggle) return;
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    host.prefs?.set("gdc.theme", theme);
  }, [theme, host]);

  // The AI in use, and the built-in AI's download status.
  React.useEffect(() => {
    host.ai?.get().then(setAi).catch(() => undefined);
    return host.ai?.builtin?.subscribe(setAiStatus);
  }, [host]);
  React.useEffect(() => {
    if (ai?.provider !== "builtin") return;
    host.ai?.builtin?.isDownloaded().then(setDownloaded).catch(() => setDownloaded(null));
  }, [ai, host, aiStatus?.phase === "ready"]);

  const refresh = React.useCallback(async () => {
    try {
      let list = await client.listProjects();
      // First visit: add the example so there's something to look at straight away.
      if (list.length === 0 && host.prefs?.get("gdc.example.v2") !== "1") {
        await client.loadExample();
        host.prefs?.set("gdc.example.v2", "1");
        list = await client.listProjects();
      }
      setProjects(list);
      return list;
    } catch (e) {
      toast(errText(e));
      setProjects([]);
      return [];
    }
  }, [client, host, toast]);

  React.useEffect(() => {
    refresh().then((list) => {
      const last = host.prefs?.get("gdc.lastProject");
      if (last && list.some((p) => p.id === last)) setCurrent(last);
    });
  }, [refresh]);

  const open = (id: string | null, first?: string) => {
    setCurrent(id);
    setInitialMessage(first);
    setSideOpen(false);
    host.prefs?.set("gdc.lastProject", id ?? "");
  };

  const startFromIdea = async (idea: string) => {
    try {
      const p = await client.createProject(nameFromIdea(idea), { autoName: true });
      await refresh();
      open(p.id, idea);
    } catch (e) {
      toast(errText(e));
    }
  };

  const exportCurrent = async () => {
    if (!current || !host.saveFile) return;
    try {
      const data = await client.exportProject(current);
      const safe = data.state.project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "game";
      await host.saveFile(`${safe}-backup.json`, JSON.stringify(data, null, 2));
      toast("Backup saved. Keep the file somewhere safe.");
    } catch (e) {
      toast(errText(e));
    }
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const p = await client.importProject(data);
      await refresh();
      open(p.id);
      toast(`Imported “${p.name}”.`);
    } catch (e) {
      toast(e instanceof SyntaxError ? "That file isn't a Game Design Copilot backup." : errText(e));
    }
  };

  const prepare = () => {
    host.ai?.builtin?.prepare().catch(() => undefined);
  };

  const usingBuiltin = ai?.provider === "builtin";
  const phase = aiStatus?.phase;
  const aiBanner = !host.ai ? undefined : usingBuiltin && (phase === "unsupported" || phase === "error") ? (
    <div className="ai-banner bad">
      <div>{aiStatus!.message}</div>
      <div className="row">
        {phase === "error" && <button className="btn" onClick={prepare}>Try again</button>}
        <button className="btn" onClick={() => setAiOpen(true)}>AI settings</button>
      </div>
    </div>
  ) : undefined;

  const setupBanner =
    host.ai && usingBuiltin && !aiBanner ? (
      phase === "checking" || phase === "downloading" || phase === "loading" ? (
        <div className="ai-banner">
          <div>{aiStatus!.message}</div>
          <progress max={1} value={aiStatus!.progress ?? undefined} />
          <div className="small muted">You can keep using the app. The first reply waits until it's ready.</div>
        </div>
      ) : downloaded === false && phase !== "ready" ? (
        <div className="ai-banner">
          <div>
            <strong>Your free AI runs on this device.</strong> No account needed. The first time, it downloads once ({findBuiltIn(ai?.size).download}); after that it starts in seconds and works offline.
          </div>
          <div className="row">
            <button className="btn primary" onClick={prepare}>Get it ready now</button>
            <button className="btn ghost" onClick={() => setAiOpen(true)}>Options</button>
          </div>
        </div>
      ) : undefined
    ) : undefined;

  const aiName = ai ? (ai.provider === "builtin" ? `Built-in AI · ${phase === "ready" ? "ready" : downloaded ? "downloaded" : findBuiltIn(ai.size).label}` : ai.label) : "…";

  return (
    <div className="shell">
      {sideOpen && <div className="scrim only-mobile" onClick={() => setSideOpen(false)} />}
      <aside className={`sidebar${sideOpen ? " open" : ""}`} aria-label="Your games">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span className="brand-name">Game Design Copilot</span>
        </div>
        <button className="btn new-game" onClick={() => open(null)}>
          <Icons.plus /> New game
        </button>
        <p className="side-label">Your games</p>
        <nav className="game-list">
          {projects?.map((p) => (
            <div key={p.id} className={`game-item${current === p.id ? " on" : ""}`}>
              <button className="game-open" onClick={() => open(p.id)} aria-current={current === p.id ? "page" : undefined}>
                <span className="gi-name">{p.name}</span>
                <span className="gi-meta">{p.confirmedCount} decided · {timeAgo(p.updatedAt)}</span>
              </button>
              <ConfirmButton
                className="gi-del"
                label="Delete"
                confirmLabel="Delete?"
                onConfirm={async () => {
                  try {
                    await client.deleteProject(p.id);
                    if (current === p.id) open(null);
                    refresh();
                  } catch (e) {
                    toast(errText(e));
                  }
                }}
              />
            </div>
          ))}
          {projects?.length === 0 && <p className="muted small" style={{ padding: "0 10px" }}>No games yet.</p>}
        </nav>
        <div className="side-foot">
          {host.backups && (
            <div className="backup-row">
              <button className="btn xs ghost" disabled={!current} onClick={exportCurrent} title="Save this game to a file">Export game</button>
              <button className="btn xs ghost" onClick={() => importInput.current?.click()} title="Open a game from a backup file">Import</button>
              <input
                ref={importInput}
                id="import-file"
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) importFile(f);
                }}
              />
            </div>
          )}
          {host.ai ? (
            <button className="ai-button" onClick={() => setAiOpen(true)}>
              <span className={`ai-dot${usingBuiltin ? (phase === "unsupported" || phase === "error" ? " bad" : " on") : " on"}`} aria-hidden="true" />
              <span className="ai-text">
                <span className="ai-small">AI settings</span>
                <span className="ai-name">{aiName}</span>
              </span>
              <Icons.gear />
            </button>
          ) : (
            host.aiLabel && (
              <div className="ai-button static">
                <span className="ai-dot on" aria-hidden="true" />
                <span className="ai-text">
                  <span className="ai-small">AI</span>
                  <span className="ai-name">{host.aiLabel}</span>
                </span>
              </div>
            )
          )}
          {host.themeToggle && (
            <div className="theme-switch" role="group" aria-label="Theme">
              {([["system", Icons.auto, "Match my device"], ["light", Icons.sun, "Light"], ["dark", Icons.moon, "Dark"]] as const).map(([id, I, label]) => (
                <button key={id} aria-pressed={theme === id} title={label} aria-label={label} onClick={() => setTheme(id)}>
                  <I />
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="shell-main">
        {current ? (
          <Workspace
            key={current}
            client={client}
            projectId={current}
            host={host}
            toast={toast}
            openSidebar={() => setSideOpen(true)}
            onRenamed={refresh}
            initialMessage={initialMessage}
            banner={aiBanner}
            aiStatus={usingBuiltin ? aiStatus : null}
          />
        ) : (
          <Home
            projects={projects}
            notice={host.notice}
            banner={aiBanner ?? setupBanner}
            onStart={startFromIdea}
            onOpen={(id) => open(id)}
            openSidebar={() => setSideOpen(true)}
            noAccount={!!host.ai}
          />
        )}
      </main>

      {aiOpen && host.ai && (
        <AiSettings api={host.ai} onClose={() => setAiOpen(false)} onSaved={(v) => { setAi(v); toast("AI settings saved."); }} />
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}

function Home({ projects, notice, banner, onStart, onOpen, openSidebar, noAccount }: {
  projects: ProjectSummary[] | null;
  /** True in the standalone app (its AI needs no account); false on claude.ai. */
  noAccount?: boolean;
  notice?: string;
  banner?: React.ReactNode;
  onStart: (idea: string) => Promise<void> | void;
  onOpen: (id: string) => void;
  openSidebar: () => void;
}) {
  const [idea, setIdea] = React.useState("");
  const [starting, setStarting] = React.useState(false);
  const example = projects?.find((p) => /\(example\)$/.test(p.name));
  const ideas = [
    "A fast third-person game about a squirrel samurai with a sword and a gun",
    "A cozy farming game, but the crops are haunted",
    "A puzzle game where you rewind time to fix mistakes",
  ];
  return (
    <div className="scroll">
      <div className="home">
        <button className="iconbtn only-mobile home-menu" onClick={openSidebar} aria-label="Open menu"><Icons.menu /></button>
        {banner}
        {notice && <p className="notice warn">{notice}</p>}
        <h1>What game are you making?</h1>
        <p className="lede">Describe it in a sentence or two. Your designer will ask questions, help you decide, and keep notes as you go.{noAccount ? " Free, no account needed." : ""}</p>
        <form
          className="idea-box"
          onSubmit={(e) => {
            e.preventDefault();
            const t = idea.trim();
            if (!t || starting) return;
            setStarting(true);
            Promise.resolve(onStart(t)).finally(() => setStarting(false));
          }}
        >
          <label htmlFor="idea" className="sr-only">Your game idea</label>
          <textarea
            id="idea"
            rows={3}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="A game about…"
          />
          <div className="idea-bar">
            <span className="muted small">Rough is fine. You can change anything later.</span>
            <button className="btn primary" disabled={!idea.trim() || starting}>{starting ? "Starting…" : "Start designing"}</button>
          </div>
        </form>
        <div className="idea-chips">
          {ideas.map((s) => (
            <button key={s} className="starter" onClick={() => setIdea(s)}>{s}</button>
          ))}
        </div>

        <ol className="how">
          <li><strong>Describe your idea.</strong> A sentence is enough to start.</li>
          <li><strong>Decide together.</strong> Your designer asks one question at a time and gives honest feedback.</li>
          <li><strong>Your notes fill in.</strong> What you decide is saved. Nothing the AI suggests counts until you say yes.</li>
        </ol>

        {example && (
          <button className="example-card" onClick={() => onOpen(example.id)}>
            <span className="ex-label">See an example</span>
            <span className="ex-name">{example.name.replace(/ \(example\)$/, "")}</span>
            <span className="ex-desc">A short design session for a squirrel samurai game, showing notes, ideas, decisions and a change check.</span>
          </button>
        )}
      </div>
    </div>
  );
}
