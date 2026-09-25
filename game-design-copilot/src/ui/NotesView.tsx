/**
 * NOTES: everything the copilot knows about your game, in four parts:
 * the game itself, things still to decide, past decisions, and ruled-out
 * ideas. You can edit any of it directly.
 */
import React from "react";
import type { ConceptSlot, DesignItem, ItemKind, MemoryEdit, ProjectState, Status } from "../core";
import { CONCEPT_SLOTS, ITEM_KINDS, kindLabel, pad } from "../core";
import { ConfirmButton, StatusSelect, timeAgo } from "./bits";

type Edit = (e: MemoryEdit) => void;
export type NotesTab = "game" | "questions" | "decisions" | "ruled";

interface Props {
  state: ProjectState;
  busy: boolean;
  edit: Edit;
  analyze: (itemIds: string[]) => void;
  tab: NotesTab;
  setTab: (t: NotesTab) => void;
}

export function NotesView({ state, busy, edit, analyze, tab, setTab }: Props) {
  const open = state.questions.filter((q) => q.status === "open").length;
  const ruled = state.items.filter((i) => i.status === "rejected").length;
  const tabs: { id: NotesTab; label: string; n?: number }[] = [
    { id: "game", label: "Your game" },
    { id: "questions", label: "To decide", n: open },
    { id: "decisions", label: "Decisions", n: state.decisions.length },
    { id: "ruled", label: "Ruled out", n: ruled },
  ];
  return (
    <div className="page">
      <div className="page-head">
        <h1>Notes</h1>
        <p>Everything your designer remembers about this game. Edit anything; your changes save right away.</p>
      </div>
      <div className="segmented" role="tablist" aria-label="Notes sections">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {t.n ? <span className="seg-n">{t.n}</span> : null}
          </button>
        ))}
      </div>
      {tab === "game" && <GameNotes state={state} busy={busy} edit={edit} analyze={analyze} />}
      {tab === "questions" && <ToDecide state={state} edit={edit} />}
      {tab === "decisions" && <Decisions state={state} edit={edit} />}
      {tab === "ruled" && <RuledOut state={state} edit={edit} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Your game                                                            */
/* ------------------------------------------------------------------ */

type Filter = "all" | "confirmed" | "likely" | "proposed";

const GROUPS: { title: string; kinds: ItemKind[] }[] = [
  { title: "Mechanics, weapons and abilities", kinds: ["mechanic", "weapon", "ability"] },
  { title: "Characters", kinds: ["character"] },
  { title: "Enemies", kinds: ["enemy"] },
  { title: "Bosses", kinds: ["boss"] },
  { title: "World and levels", kinds: ["level"] },
  { title: "Story", kinds: ["narrative"] },
  { title: "Art and style", kinds: ["art"] },
  { title: "Screens and controls", kinds: ["ui"] },
  { title: "Limits (team, time, tech)", kinds: ["constraint"] },
  { title: "Inspirations", kinds: ["reference"] },
  { title: "Other", kinds: ["other"] },
];
const CAN_CHECK = new Set<ItemKind>(["pillar", "loop", "system", "mechanic", "weapon", "ability", "enemy", "boss", "level", "constraint"]);

function GameNotes({ state, busy, edit, analyze }: Omit<Props, "tab" | "setTab">) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [adding, setAdding] = React.useState(false);
  const live = state.items.filter((i) => i.status !== "rejected");
  const visible = (i: DesignItem) => filter === "all" || i.status === filter;

  const placed = new Set<string>();
  const subtree = (root: DesignItem, depth: number): { it: DesignItem; depth: number }[] => {
    placed.add(root.id);
    const out = [{ it: root, depth }];
    for (const c of live.filter((x) => x.parentId === root.id && !placed.has(x.id))) out.push(...subtree(c, depth + 1));
    return out;
  };
  const byOrder = (a: DesignItem, b: DesignItem) => (a.order ?? 0) - (b.order ?? 0);
  const sections: { title: string; rows: { it: DesignItem; depth: number }[] }[] = [];
  const take = (title: string, kinds: ItemKind[]) => {
    const pool = live.filter((i) => kinds.includes(i.kind) && !placed.has(i.id)).sort(byOrder);
    const ids = new Set(pool.map((i) => i.id));
    const roots = pool.filter((i) => !(i.parentId && ids.has(i.parentId)));
    sections.push({ title, rows: roots.flatMap((r) => (placed.has(r.id) ? [] : subtree(r, 0))) });
  };
  live.filter((i) => i.kind === "concept").forEach((i) => placed.add(i.id));
  take("Main goals (pillars)", ["pillar"]);
  take("Core loop", ["loop"]);
  take("Systems", ["system"]);
  for (const g of GROUPS) take(g.title, g.kinds);

  const count = (f: Filter) => (f === "all" ? live.length : live.filter((i) => i.status === f).length);

  return (
    <div className="stack">
      <ConceptSlots state={state} edit={edit} busy={busy} />

      <div className="toolbar">
        <div className="chips" role="group" aria-label="Show">
          {(["all", "confirmed", "likely", "proposed"] as Filter[]).map((f) => (
            <button key={f} className="chip-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {{ all: "Everything", confirmed: "Decided", likely: "Probably", proposed: "Ideas" }[f]} <span className="muted">{count(f)}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add something"}</button>
      </div>

      {adding && <AddItem state={state} onAdd={(e) => { edit(e); setAdding(false); }} />}

      {sections.map((s) => {
        const rows = s.rows.filter((r) => visible(r.it));
        if (!rows.length) return null;
        return (
          <section key={s.title} className="section">
            <h2>{s.title}</h2>
            <div className="items">
              {rows.map(({ it, depth }) => (
                <ItemRow key={it.id} it={it} depth={depth} state={state} busy={busy} edit={edit} analyze={analyze} />
              ))}
            </div>
          </section>
        );
      })}

      {live.filter((i) => i.kind !== "concept").length === 0 && (
        <p className="notice">Nothing here yet. As you chat, the things you decide show up here. You can also add them yourself.</p>
      )}

      <label className="toggle quiet-setting" title="When this is on, nothing is saved from the chat until you click Save.">
        <input
          id="review-all"
          type="checkbox"
          checked={state.project.settings.reviewAll}
          onChange={(e) => edit({ type: "set_settings", settings: { reviewAll: e.target.checked } })}
        />
        Ask me before saving anything from the chat
      </label>
    </div>
  );
}

function ConceptSlots({ state, edit, busy }: { state: ProjectState; edit: Edit; busy: boolean }) {
  const [editing, setEditing] = React.useState<ConceptSlot | null>(null);
  const [value, setValue] = React.useState("");
  return (
    <section className="section">
      <h2>The basics</h2>
      <div className="slot-grid">
        {CONCEPT_SLOTS.map((s) => {
          const it = state.items.find((i) => i.kind === "concept" && i.slot === s.slot && i.status !== "rejected");
          return (
            <div key={s.slot} className={`slot${it ? "" : " unknown"}`}>
              <span className="slot-label">
                {s.label}
                {it && it.status !== "confirmed" && <span className={`pill ${it.status}`}>{it.status === "likely" ? "Probably" : "Idea"}</span>}
              </span>
              {editing === s.slot ? (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = value.trim();
                    if (!v) return;
                    if (it) edit({ type: "update_item", itemId: it.id, patch: { title: v } });
                    else edit({ type: "create_item", kind: "concept", slot: s.slot, title: v, status: "confirmed" });
                    if (it && it.status !== "confirmed") edit({ type: "set_status", itemId: it.id, status: "confirmed" });
                    setEditing(null);
                  }}
                >
                  <input id={`slot-${s.slot}`} className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
                  <button className="btn xs primary" disabled={busy}>Save</button>
                  <button type="button" className="btn xs ghost" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : (
                <button className="slot-value" onClick={() => { setEditing(s.slot); setValue(it?.title ?? ""); }} title={it ? "Edit" : "Set"}>
                  {it ? it.title : "Not decided yet"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ItemRow({ it, depth, state, busy, edit, analyze }: { it: DesignItem; depth: number; state: ProjectState; busy: boolean; edit: Edit; analyze: (ids: string[]) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(it.title);
  const [summary, setSummary] = React.useState(it.summary);
  const [rationale, setRationale] = React.useState(it.rationale ?? "");
  const [parentId, setParentId] = React.useState(it.parentId ?? "");
  const parents = state.items.filter((p) => p.id !== it.id && p.kind !== "concept" && p.status !== "rejected");

  if (editing) {
    return (
      <div className={`item editing depth-${Math.min(depth, 3)}`}>
        <form
          className="edit-grid"
          onSubmit={(e) => {
            e.preventDefault();
            edit({ type: "update_item", itemId: it.id, patch: { title: title.trim() || it.title, summary: summary.trim(), rationale: rationale.trim() || undefined, parentId: parentId || null } });
            setEditing(false);
          }}
        >
          <label className="field"><span>Name</span><input id={`t-${it.id}`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span>How it works</span><textarea id={`s-${it.id}`} className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} /></label>
          <label className="field"><span>Why (optional)</span><input id={`r-${it.id}`} className="input" value={rationale} onChange={(e) => setRationale(e.target.value)} /></label>
          <label className="field">
            <span>Part of</span>
            <select id={`p-${it.id}`} className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">(nothing, top level)</option>
              {parents.map((p) => <option key={p.id} value={p.id}>{kindLabel(p.kind)}: {p.title}</option>)}
            </select>
          </label>
          <div className="row">
            <button className="btn primary" disabled={busy}>Save</button>
            <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className={`item ${it.status} depth-${Math.min(depth, 3)}`}>
      <div className="title-line">
        <span className="title">{it.title}</span>
        <span className="kind">{kindLabel(it.kind)}</span>
      </div>
      <div className="item-actions">
        <StatusSelect id={`st-${it.id}`} status={it.status} onChange={(s: Status) => edit({ type: "set_status", itemId: it.id, status: s })} />
        <button className="btn xs ghost" onClick={() => setEditing(true)}>Edit</button>
        {it.status === "confirmed" && CAN_CHECK.has(it.kind) && (
          <button className="btn xs ghost" disabled={busy} onClick={() => analyze([it.id])} title="Ask what this affects elsewhere in your game">
            What does it affect?
          </button>
        )}
        <ConfirmButton label="Delete" confirmLabel="Really delete?" onConfirm={() => edit({ type: "delete_item", itemId: it.id })} />
      </div>
      {it.summary && <p className="summary">{it.summary}</p>}
      {it.rationale && <p className="why">Why: {it.rationale}</p>}
    </div>
  );
}

function AddItem({ state, onAdd }: { state: ProjectState; onAdd: Edit }) {
  const [kind, setKind] = React.useState<ItemKind>("mechanic");
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [status, setStatus] = React.useState<Status>("confirmed");
  const [parentId, setParentId] = React.useState("");
  const parents = state.items.filter((p) => p.kind !== "concept" && p.status !== "rejected");
  return (
    <form
      className="addform"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd({ type: "create_item", kind, title: title.trim(), summary: summary.trim(), status, parentId: parentId || null });
      }}
    >
      <label className="field">
        <span>What is it?</span>
        <select id="add-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as ItemKind)}>
          {ITEM_KINDS.filter((k) => k !== "concept").map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select id="add-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          <option value="confirmed">Decided</option>
          <option value="likely">Probably</option>
          <option value="proposed">Idea</option>
          <option value="rejected">Ruled out</option>
        </select>
      </label>
      <label className="field">
        <span>Part of</span>
        <select id="add-parent" className="select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">(nothing, top level)</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{kindLabel(p.kind)}: {p.title}</option>)}
        </select>
      </label>
      <label className="field wide"><span>Name</span><input id="add-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Perfect dodge" /></label>
      <label className="field wide"><span>How it works</span><textarea id="add-summary" className="textarea" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Dodging right before a hit slows time and keeps your combo going." /></label>
      <div className="wide row"><button className="btn primary" disabled={!title.trim()}>Add to notes</button></div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* To decide / Decisions / Ruled out                                    */
/* ------------------------------------------------------------------ */

function ToDecide({ state, edit }: { state: ProjectState; edit: Edit }) {
  const [text, setText] = React.useState("");
  const [resolving, setResolving] = React.useState<string | null>(null);
  const [answer, setAnswer] = React.useState("");
  const open = state.questions.filter((q) => q.status === "open").reverse();
  const closed = state.questions.filter((q) => q.status !== "open").reverse();
  const title = (id: string) => state.items.find((i) => i.id === id)?.title;
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Questions your game still needs answers to. Your designer adds them as they come up; you answer them here or in the chat.</p>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (text.trim().length < 3) return; edit({ type: "add_question", question: text.trim() }); setText(""); }}>
        <label htmlFor="new-q" className="sr-only">New question</label>
        <input id="new-q" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a question, e.g. Does gliding use stamina?" />
        <button className="btn">Add</button>
      </form>
      {open.length === 0 && <p className="notice">Nothing to decide right now.</p>}
      {open.map((q) => (
        <div key={q.id} className="q">
          <span className="q-text">{q.question}</span>
          {q.why && <p className="q-why">{q.why}</p>}
          {q.relatedItemIds.length > 0 && <div className="tags">{q.relatedItemIds.map((id) => title(id) && <span key={id} className="tag">{title(id)}</span>)}</div>}
          {resolving === q.id ? (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (!answer.trim()) return; edit({ type: "resolve_question", questionId: q.id, resolution: answer.trim() }); setResolving(null); setAnswer(""); }}>
              <input id={`ans-${q.id}`} className="input" autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" />
              <button className="btn primary xs">Save</button>
              <button type="button" className="btn ghost xs" onClick={() => setResolving(null)}>Cancel</button>
            </form>
          ) : (
            <div className="row">
              <button className="btn xs" onClick={() => { setResolving(q.id); setAnswer(""); }}>Answer</button>
              <button className="btn xs ghost" onClick={() => edit({ type: "drop_question", questionId: q.id })}>Not needed</button>
            </div>
          )}
        </div>
      ))}
      {closed.length > 0 && (
        <details>
          <summary className="small muted" style={{ cursor: "pointer" }}>{closed.length} answered or dropped</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            {closed.map((q) => (
              <div key={q.id} className="q done">
                <span className="q-text">{q.question}</span>
                <p className="q-why">{q.status === "resolved" ? `Answer: ${q.resolution}` : "Marked not needed."}</p>
                <div className="row"><button className="btn xs ghost" onClick={() => edit({ type: "reopen_question", questionId: q.id })}>Reopen</button></div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Decisions({ state, edit }: { state: ProjectState; edit: Edit }) {
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ title: "", before: "", after: "", reason: "" });
  const list = [...state.decisions].sort((a, b) => b.number - a.number);
  const title = (id: string) => state.items.find((i) => i.id === id)?.title;
  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted" style={{ margin: 0, flex: 1 }}>Big choices you made and why. Ask "why did we…?" in the chat and your designer answers from here.</p>
        <button className="btn" onClick={() => setAdding((a) => !a)}>{adding ? "Cancel" : "+ Add a decision"}</button>
      </div>
      {adding && (
        <form className="addform" onSubmit={(e) => { e.preventDefault(); if (!f.title.trim() || !f.after.trim()) return; edit({ type: "add_decision", title: f.title, before: f.before.trim() || undefined, after: f.after, reason: f.reason.trim() || undefined }); setF({ title: "", before: "", after: "", reason: "" }); setAdding(false); }}>
          <label className="field wide"><span>What was decided about</span><input id="d-title" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Healing" /></label>
          <label className="field"><span>Before (optional)</span><input id="d-before" className="input" value={f.before} onChange={(e) => setF({ ...f, before: e.target.value })} /></label>
          <label className="field"><span>Now</span><input id="d-after" className="input" value={f.after} onChange={(e) => setF({ ...f, after: e.target.value })} /></label>
          <label className="field wide"><span>Why</span><input id="d-reason" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
          <div className="wide"><button className="btn primary">Save decision</button></div>
        </form>
      )}
      {list.length === 0 && <p className="notice">No decisions yet. When you pick between options or change something, it's written down here.</p>}
      {list.map((d) => (
        <article key={d.id} className="decision">
          <div className="row">
            <span className="stamp">Decision {pad(d.number)}</span>
            <span className="small muted">{timeAgo(d.createdAt)}</span>
          </div>
          <h3>{d.title}</h3>
          <dl className="change">
            {d.before && (<><dt>Before</dt><dd className="before">{d.before}</dd></>)}
            <dt>{d.before ? "Now" : "Chosen"}</dt><dd>{d.after}</dd>
            {d.reason && (<><dt>Why</dt><dd>{d.reason}</dd></>)}
            {d.alternatives?.length ? (<><dt>Other options</dt><dd>{d.alternatives.join(" · ")}</dd></>) : null}
          </dl>
          {d.itemIds.length > 0 && <div className="tags">{d.itemIds.map((id) => title(id) && <span key={id} className="tag">{title(id)}</span>)}</div>}
        </article>
      ))}
    </div>
  );
}

function RuledOut({ state, edit }: { state: ProjectState; edit: Edit }) {
  const ruled = state.items.filter((i) => i.status === "rejected");
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>Ideas you said no to. Your designer won't suggest these again unless you bring one back.</p>
      {ruled.length === 0 && <p className="notice">Nothing ruled out yet. Say "I don't want X" in the chat, or set something to "Ruled out" in Your game.</p>}
      {ruled.length > 0 && (
        <div className="items">
          {ruled.map((it) => (
            <div key={it.id} className="item rejected">
              <div className="title-line"><span className="title">{it.title}</span><span className="kind">{kindLabel(it.kind)}</span></div>
              <div className="item-actions">
                <button className="btn xs" onClick={() => edit({ type: "set_status", itemId: it.id, status: "proposed" })}>Bring back as an idea</button>
                <ConfirmButton label="Delete" confirmLabel="Really delete?" onConfirm={() => edit({ type: "delete_item", itemId: it.id })} />
              </div>
              <p className="summary">{it.rationale ? `Why: ${it.rationale}` : "No reason written down."}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
