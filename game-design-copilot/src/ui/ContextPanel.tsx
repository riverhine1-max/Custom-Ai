/** The "Summary" side panel: your game at a glance. */
import React from "react";
import type { ProjectState } from "../core";
import { CONCEPT_SLOTS } from "../core";
import { Icons, Pill, timeAgo } from "./bits";
import { applyLabel, opLabel } from "./MemoryCard";

interface Props {
  state: ProjectState;
  busy: boolean;
  onClose: () => void;
  onApply: (csId: string, opIds: string[]) => void;
  onDismiss: (csId: string, opIds: string[]) => void;
  openNotes: (tab: "game" | "questions") => void;
}

export function ContextPanel({ state, busy, onClose, onApply, onDismiss, openNotes }: Props) {
  const concept = CONCEPT_SLOTS.map((s) => ({ ...s, it: state.items.find((i) => i.kind === "concept" && i.slot === s.slot && i.status !== "rejected") }));
  const known = concept.filter((c) => c.it);
  const unknown = concept.length - known.length;
  const pillars = state.items.filter((i) => i.kind === "pillar" && i.status !== "rejected").sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const loop = state.items.filter((i) => i.kind === "loop" && i.status !== "rejected").sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const waiting = state.changeSets.flatMap((cs) => cs.ops.filter((p) => p.state === "pending").map((p) => ({ cs, p }))).slice(-6).reverse();
  const open = state.questions.filter((q) => q.status === "open");
  const recent = [...state.events].reverse().slice(0, 5);

  return (
    <aside className="summary" aria-label="Game summary">
      <div className="summary-head">
        <h2>Summary</h2>
        <button className="iconbtn" onClick={onClose} aria-label="Close summary"><Icons.close /></button>
      </div>

      <section className="sum-section">
        <h3>The basics</h3>
        {known.length ? (
          <dl className="kv">
            {known.map((c) => (
              <React.Fragment key={c.slot}>
                <dt>{c.label}</dt>
                <dd>{c.it!.title}{c.it!.status !== "confirmed" && <> <Pill status={c.it!.status} /></>}</dd>
              </React.Fragment>
            ))}
          </dl>
        ) : (
          <p className="muted small">Nothing decided yet.</p>
        )}
        {unknown > 0 && (
          <button className="linkbtn" onClick={() => openNotes("game")}>{unknown} still open</button>
        )}
      </section>

      {waiting.length > 0 && (
        <section className="sum-section">
          <h3>Waiting for you</h3>
          <div className="waiting">
            {waiting.map(({ cs, p }) => (
              <div key={p.opId} className="w-item">
                <span>{opLabel(p, cs, state)}</span>
                <span className="row">
                  <button className="btn xs" disabled={busy} onClick={() => onApply(cs.id, [p.opId])}>{applyLabel(p)}</button>
                  <button className="btn xs ghost" disabled={busy} onClick={() => onDismiss(cs.id, [p.opId])}>No thanks</button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="sum-section">
        <h3>Main goals</h3>
        {pillars.length ? (
          <ul className="plain">
            {pillars.map((p) => <li key={p.id}>{p.title}{p.status !== "confirmed" && <> <Pill status={p.status} /></>}</li>)}
          </ul>
        ) : (
          <p className="muted small">None yet. Ask: "Suggest main goals for my game."</p>
        )}
      </section>

      <section className="sum-section">
        <h3>Core loop</h3>
        {loop.length ? (
          <div className="loop-chain">
            {loop.map((l, i) => (
              <React.Fragment key={l.id}>
                {i > 0 && <span aria-hidden="true">→</span>}
                <span className="step">{l.title}</span>
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="muted small">Not worked out yet. Try "Step by step" → Core loop.</p>
        )}
      </section>

      <section className="sum-section">
        <h3>To decide · {open.length}</h3>
        {open.length ? (
          <ul className="plain">{open.slice(-4).map((q) => <li key={q.id}>{q.question}</li>)}</ul>
        ) : (
          <p className="muted small">Nothing right now.</p>
        )}
        {open.length > 4 && <button className="linkbtn" onClick={() => openNotes("questions")}>See all {open.length}</button>}
      </section>

      {recent.length > 0 && (
        <section className="sum-section">
          <h3>Recent changes</h3>
          <ul className="plain recent">
            {recent.map((e) => (
              <li key={e.id}>
                <span>{e.label}</span>
                <time dateTime={e.at}>{timeAgo(e.at)}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
