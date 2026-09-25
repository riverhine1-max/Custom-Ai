/** The chat: messages with copy / edit / regenerate, the notes cards, and the message box. */
import React from "react";
import type { ChatMessageRecord, ModeId, ProjectState, Stage } from "../core";
import { MODES, PLAYBOOKS, findMode } from "../core";
import { dicePrompt, rollDesignDice } from "../core/extras";
import { Markdown } from "./Markdown";
import { MemoryCard } from "./MemoryCard";
import { ConsequencesCard } from "./ConsequencesCard";
import { CopyButton, Icons, useDismiss } from "./bits";
import type { BuiltInStatus } from "../providers/builtin/models";

export interface PendingTurn {
  text: string;
  mode: ModeId;
  stream: string;
  stage: Stage;
}

interface Props {
  state: ProjectState;
  messages: ChatMessageRecord[];
  pending: PendingTurn | null;
  busy: boolean;
  mode: ModeId;
  topic: string;
  setMode: (m: ModeId) => void;
  setTopic: (t: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onRegenerate: () => void;
  onEditLast: (text: string) => void;
  onApply: (csId: string, opIds: string[]) => void;
  onDismiss: (csId: string, opIds: string[]) => void;
  onUndo: (csId: string, opIds?: string[]) => void;
  banner?: React.ReactNode;
  aiStatus?: BuiltInStatus | null;
}

const STAGE_TEXT: Record<Stage, string> = {
  thinking: "Thinking…",
  writing: "Writing…",
  remembering: "Saving to your notes…",
  analyzing: "Checking what this change affects…",
};

export function ChatView(p: Props) {
  const [draft, setDraft] = React.useState("");
  const [atBottom, setAtBottom] = React.useState(true);
  const scroller = React.useRef<HTMLDivElement>(null);
  const box = React.useRef<HTMLTextAreaElement>(null);
  const lastRoll = React.useRef<string | undefined>(undefined);
  const [rolling, setRolling] = React.useState(false);
  const mode = findMode(p.mode);

  const scrollToBottom = (smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };

  // Follow new content, unless the user scrolled up to read.
  React.useEffect(() => {
    if (atBottom) scrollToBottom();
  }, [p.messages.length, p.pending?.stream, p.pending?.stage]);
  React.useEffect(() => scrollToBottom(), []);

  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 240) + "px";
  }, [draft]);

  // Esc stops a reply that's being written.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && p.pending && p.onStop();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.pending, p.onStop]);

  const send = () => {
    const t = draft.trim();
    if (!t || p.busy) return;
    p.onSend(t);
    setDraft("");
    setAtBottom(true);
  };

  const csById = new Map(p.state.changeSets.map((c) => [c.id, c]));
  const lastUserIdx = (() => {
    for (let i = p.messages.length - 1; i >= 0; i--) if (p.messages[i].role === "user") return i;
    return -1;
  })();
  const empty = p.messages.length === 0 && !p.pending;

  return (
    <div className="chat">
      <div
        className="chat-scroll"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
      >
        <div className="thread">
          {p.banner}
          {empty && (
            <div className="empty-chat">
              <h2>{p.mode === "concept" ? "Tell me about your game idea." : "What do you want to work on?"}</h2>
              <p>Rough ideas are fine. I'll ask questions, point out problems, and keep notes of what you decide.</p>
              <div className="starters">
                {mode.starters.map((s) => (
                  <button key={s} className="starter" onClick={() => { setDraft(s); box.current?.focus(); }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {p.messages.map((m, i) => (
            <Message
              key={m.id}
              m={m}
              state={p.state}
              busy={p.busy}
              isLastUser={i === lastUserIdx && !p.pending}
              isLatestAnswer={i === lastUserIdx + 1 && !p.pending}
              cs={m.meta?.changeSetId ? csById.get(m.meta.changeSetId) : undefined}
              onRegenerate={p.onRegenerate}
              onEditLast={p.onEditLast}
              onApply={p.onApply}
              onDismiss={p.onDismiss}
              onUndo={p.onUndo}
            />
          ))}

          {p.pending && (
            <>
              <div className="msg user">
                <div className="bubble">{p.pending.text}</div>
              </div>
              <div className="msg ai" aria-live="polite">
                {p.pending.stream ? <Markdown text={p.pending.stream} /> : null}
                {p.aiStatus && ["checking", "downloading", "loading"].includes(p.aiStatus.phase) && !p.pending.stream ? (
                  <div className="ai-progress">
                    <span>{p.aiStatus.message}</span>
                    <progress max={1} value={p.aiStatus.progress ?? undefined} />
                    <span className="small muted">This happens once. Next time it starts in seconds.</span>
                  </div>
                ) : (
                  <span className="stage">
                    <span className="dot" aria-hidden="true" />
                    {STAGE_TEXT[p.pending.stage]}
                    <span className="muted small">Esc to stop</span>
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {!atBottom && (
        <button className="to-bottom" aria-label="Jump to the latest message" onClick={() => { scrollToBottom(true); setAtBottom(true); }}>
          <Icons.down />
        </button>
      )}

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="composer-box">
          <label htmlFor="composer-text" className="sr-only">Message</label>
          <textarea
            id="composer-text"
            ref={box}
            rows={1}
            value={draft}
            placeholder={p.mode === "concept" ? "Describe your game idea…" : `Message your game designer (${mode.label})…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="composer-bar">
            <ModeMenu mode={p.mode} setMode={p.setMode} />
            <button
              type="button"
              className={`dice-btn${rolling ? " rolling" : ""}`}
              title="Design dice: get a random twist to try"
              aria-label="Roll the design dice"
              onClick={() => {
                const r = rollDesignDice(lastRoll.current);
                lastRoll.current = r.text;
                setDraft(dicePrompt(r));
                setRolling(true);
                window.setTimeout(() => setRolling(false), 600);
                requestAnimationFrame(() => box.current?.focus());
              }}
            >
              <Icons.dice /> <span className="dice-label">Dice</span>
            </button>
            {p.mode === "coach" && (
              <label className="topic-pick">
                <span className="sr-only">What to design</span>
                <select id="coach-topic" value={p.topic} onChange={(e) => p.setTopic(e.target.value)}>
                  {PLAYBOOKS.map((pb) => (
                    <option key={pb.id} value={pb.id}>{pb.label}</option>
                  ))}
                </select>
              </label>
            )}
            <span className="spacer" />
            {p.pending ? (
              <button type="button" className="send stop" onClick={p.onStop} aria-label="Stop">
                <Icons.stop />
              </button>
            ) : (
              <button type="submit" className="send" disabled={!draft.trim() || p.busy} aria-label="Send">
                <Icons.send />
              </button>
            )}
          </div>
        </div>
        <p className="composer-hint">Enter to send · Shift + Enter for a new line</p>
      </form>
    </div>
  );
}

function ModeMenu({ mode, setMode }: { mode: ModeId; setMode: (m: ModeId) => void }) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const current = findMode(mode);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="mode-pill" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {current.label}
        <Icons.chevron />
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="menu-title">How should I help?</p>
          {MODES.map((m) => (
            <button
              key={m.id}
              role="menuitemradio"
              aria-checked={m.id === mode}
              className="menu-item"
              onClick={() => { setMode(m.id); setOpen(false); }}
            >
              <span className="mi-label">{m.label}{m.id === mode && <Icons.check />}</span>
              <span className="mi-desc">{m.short}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Message(props: {
  m: ChatMessageRecord;
  state: ProjectState;
  cs?: ProjectState["changeSets"][number];
  busy: boolean;
  isLastUser: boolean;
  isLatestAnswer: boolean;
  onRegenerate: () => void;
  onEditLast: (text: string) => void;
  onApply: Props["onApply"];
  onDismiss: Props["onDismiss"];
  onUndo: Props["onUndo"];
}) {
  const { m, state, cs, busy } = props;
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(m.content);

  if (m.role === "user") {
    if (editing) {
      return (
        <div className="msg user">
          <form
            className="edit-box"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              setEditing(false);
              props.onEditLast(text.trim());
            }}
          >
            <label htmlFor={`edit-${m.id}`} className="sr-only">Edit your message</label>
            <textarea id={`edit-${m.id}`} className="textarea" autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} />
            <div className="row">
              <span className="small muted">Sends again and replaces the reply below.</span>
              <span className="spacer" />
              <button type="button" className="btn ghost xs" onClick={() => { setEditing(false); setText(m.content); }}>Cancel</button>
              <button className="btn primary xs" disabled={busy}>Send</button>
            </div>
          </form>
        </div>
      );
    }
    return (
      <div className="msg user">
        {m.mode && m.mode !== "chat" && (
          <span className="msg-mode">
            {findMode(m.mode).label}
            {m.topic ? ` · ${PLAYBOOKS.find((x) => x.id === m.topic)?.label ?? ""}` : ""}
          </span>
        )}
        <div className="bubble">{m.content}</div>
        <div className="msg-actions">
          <CopyButton text={m.content} />
          {props.isLastUser && (
            <button className="iconbtn" disabled={busy} onClick={() => { setText(m.content); setEditing(true); }} title="Edit" aria-label="Edit">
              <Icons.edit />
              <span className="iconbtn-label">Edit</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  if (m.meta?.kind === "consequences" && m.meta.consequences) {
    return (
      <div className="msg ai">
        <ConsequencesCard c={m.meta.consequences} />
      </div>
    );
  }

  if (m.meta?.kind === "error") {
    return (
      <div className="msg ai">
        {m.content ? <Markdown text={m.content} /> : null}
        <div className="msg-error">
          <p>{m.meta.error ?? "Something went wrong."}</p>
          {props.isLatestAnswer && (
            <button className="btn xs" disabled={busy} onClick={props.onRegenerate}>
              <Icons.redo /> Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="msg ai">
      <Markdown text={m.content} />
      {m.meta?.warnings?.map((w, i) => (
        <p key={i} className="warning-chip">{w}</p>
      ))}
      {cs && (
        <MemoryCard
          cs={cs}
          state={state}
          busy={busy}
          onApply={(ids) => props.onApply(cs.id, ids)}
          onDismiss={(ids) => props.onDismiss(cs.id, ids)}
          onUndo={(ids) => props.onUndo(cs.id, ids)}
        />
      )}
      <div className="msg-actions">
        <CopyButton text={m.content} />
        {props.isLatestAnswer && (
          <button className="iconbtn" disabled={busy} onClick={props.onRegenerate} title="Write a new answer" aria-label="Regenerate">
            <Icons.redo />
            <span className="iconbtn-label">Regenerate</span>
          </button>
        )}
      </div>
    </div>
  );
}
