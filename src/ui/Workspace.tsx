/** One open game: a header with tabs (Chat, Notes, Game plan) and an optional Summary panel. */
import React from "react";
import type { CopilotClient, MemoryEdit, ModeId, Workspace as WS } from "../core";
import { ChatView, type PendingTurn } from "./ChatView";
import { ContextPanel } from "./ContextPanel";
import { NotesView, type NotesTab } from "./NotesView";
import { PlanView } from "./PlanView";
import { Icons } from "./bits";
import type { Host } from "./App";
import type { BuiltInStatus } from "../providers/builtin/models";

type View = "chat" | "notes" | "plan";

interface Props {
  client: CopilotClient;
  projectId: string;
  host: Host;
  toast: (s: string) => void;
  openSidebar: () => void;
  onRenamed: () => void;
  initialMessage?: string;
  banner?: React.ReactNode;
  /** Ludomuse's setup progress (null when another AI is in use). */
  aiStatus?: BuiltInStatus | null;
}

export function Workspace({ client, projectId, host, toast, openSidebar, onRenamed, initialMessage, banner, aiStatus }: Props) {
  const [ws, setWs] = React.useState<WS | null>(null);
  const [view, setView] = React.useState<View>("chat");
  const [notesTab, setNotesTab] = React.useState<NotesTab>("game");
  const [pending, setPending] = React.useState<PendingTurn | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState<ModeId>("chat");
  const [topic, setTopic] = React.useState("core_loop");
  const [summaryOpen, setSummaryOpen] = React.useState(() => host.prefs?.get("gdc.summary") === "1");
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const abort = React.useRef<AbortController | null>(null);
  const sentInitial = React.useRef(false);

  React.useEffect(() => {
    let live = true;
    client
      .getWorkspace(projectId)
      .then((w) => {
        if (!live) return;
        setWs(w);
        const filled = w.state.items.filter((i) => i.kind === "concept").length;
        setMode(filled < 4 ? "concept" : "chat");
      })
      .catch((e) => toast(errText(e)));
    return () => {
      live = false;
    };
  }, [client, projectId]);

  const act = React.useCallback(
    async (fn: () => Promise<WS>, done?: string) => {
      setBusy(true);
      try {
        setWs(await fn());
        if (done) toast(done);
      } catch (e) {
        toast(errText(e));
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const send = React.useCallback(
    async (text: string, m: ModeId = mode, t: string | undefined = mode === "coach" ? topic : undefined) => {
      const ctl = new AbortController();
      abort.current = ctl;
      setBusy(true);
      setView("chat");
      setPending({ text, mode: m, stream: "", stage: "thinking" });
      try {
        const next = await client.sendMessage(
          projectId,
          { text, mode: m, topic: m === "coach" ? t : undefined },
          {
            onText: (s) => setPending((p) => (p ? { ...p, stream: s } : p)),
            onStage: (s) => setPending((p) => (p ? { ...p, stage: s } : p)),
          },
          ctl.signal,
        );
        setWs(next);
        onRenamed(); // the project name may have been set from a decided title
      } catch (e) {
        toast(errText(e));
        try {
          setWs(await client.getWorkspace(projectId));
        } catch {
          /* keep what we have */
        }
      } finally {
        setPending(null);
        setBusy(false);
        abort.current = null;
      }
    },
    [client, projectId, mode, topic, toast, onRenamed],
  );

  // A game started from the home screen sends its first message straight away.
  React.useEffect(() => {
    if (ws && initialMessage && !sentInitial.current && ws.messages.length === 0) {
      sentInitial.current = true;
      send(initialMessage, "concept");
    }
  }, [ws, initialMessage, send]);

  if (!ws) return <div className="loading">Opening your game…</div>;
  const { state, messages } = ws;

  const rewindThen = async (textFor: (old: string) => string) => {
    setBusy(true);
    try {
      const r = await client.rewindLastTurn(projectId);
      setWs(r.workspace);
      setBusy(false);
      await send(textFor(r.text), r.mode ?? mode, r.topic);
    } catch (e) {
      toast(errText(e));
      setBusy(false);
    }
  };

  const edit = (e: MemoryEdit) => act(() => client.editMemory(projectId, e));
  const apply = (csId: string, ids: string[]) => act(() => client.applyChanges(projectId, csId, ids));
  const dismiss = (csId: string, ids: string[]) => act(() => client.dismissChanges(projectId, csId, ids));
  const undo = (csId: string, ids?: string[]) => act(() => client.undoChanges(projectId, csId, ids), "Undone.");
  const analyze = (ids: string[]) => {
    setView("chat");
    act(() => client.analyzeConsequences(projectId, ids), "Added to the chat: what this affects.");
  };
  const toggleSummary = () => {
    setSummaryOpen((o) => {
      host.prefs?.set("gdc.summary", o ? "0" : "1");
      return !o;
    });
  };

  const waiting = state.changeSets.reduce((n, c) => n + c.ops.filter((p) => p.state === "pending").length, 0);
  const openQ = state.questions.filter((q) => q.status === "open").length;
  const TABS: { id: View; label: string; icon: () => React.ReactElement; badge?: number }[] = [
    { id: "chat", label: "Chat", icon: Icons.chat, badge: waiting || undefined },
    { id: "notes", label: "Notes", icon: Icons.notes, badge: openQ || undefined },
    { id: "plan", label: "Game plan", icon: Icons.plan },
  ];

  return (
    <div className={`workspace${summaryOpen ? " with-summary" : ""}`}>
      <header className="ws-head">
        <button className="iconbtn only-mobile" onClick={openSidebar} aria-label="Open menu"><Icons.menu /></button>
        {renaming ? (
          <form
            className="rename"
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              setRenaming(false);
              if (n && n !== state.project.name) act(() => client.editMemory(projectId, { type: "rename_project", name: n })).then(onRenamed);
            }}
          >
            <label htmlFor="rename-input" className="sr-only">Game name</label>
            <input id="rename-input" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
          </form>
        ) : (
          <button className="game-name" title="Rename" onClick={() => { setName(state.project.name); setRenaming(true); }}>
            {state.project.name}
            <Icons.edit />
          </button>
        )}
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <button key={t.id} aria-current={view === t.id ? "page" : undefined} onClick={() => setView(t.id)}>
              <t.icon />
              <span className="tab-label">{t.label}</span>
              {t.badge ? <span className={`badge-n${t.id === "chat" ? " hot" : ""}`} title={t.id === "chat" ? "Ideas waiting for your answer" : "Questions to decide"}>{t.badge}</span> : null}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <button className={`btn ghost xs summary-toggle${summaryOpen ? " on" : ""}`} onClick={toggleSummary} aria-pressed={summaryOpen}>
          <Icons.panel /> <span className="tab-label">Summary</span>
        </button>
      </header>

      <div className="ws-body">
        <div className="ws-main">
          {view === "chat" && (
            <ChatView
              state={state}
              messages={messages}
              pending={pending}
              busy={busy}
              mode={mode}
              topic={topic}
              setMode={setMode}
              setTopic={setTopic}
              onSend={(t) => send(t)}
              onStop={() => abort.current?.abort()}
              onRegenerate={() => rewindThen((old) => old)}
              onEditLast={(t) => rewindThen(() => t)}
              onApply={apply}
              onDismiss={dismiss}
              onUndo={undo}
              banner={banner}
              aiStatus={aiStatus}
            />
          )}
          {view === "notes" && (
            <div className="scroll"><NotesView state={state} busy={busy} edit={edit} analyze={analyze} tab={notesTab} setTab={setNotesTab} /></div>
          )}
          {view === "plan" && (
            <div className="scroll"><PlanView state={state} saveFile={host.saveFile} toast={toast} /></div>
          )}
        </div>
        {summaryOpen && (
          <>
            <div className="scrim only-narrow" onClick={toggleSummary} />
            <ContextPanel
              state={state}
              busy={busy}
              onClose={toggleSummary}
              onApply={apply}
              onDismiss={dismiss}
              openNotes={(tab) => { setNotesTab(tab); setView("notes"); }}
            />
          </>
        )}
      </div>
    </div>
  );
}

export function errText(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
