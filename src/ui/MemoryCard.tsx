/**
 * The small card under a reply that shows what was saved to your game notes,
 * which AI ideas are waiting for a yes/no, and (folded away) anything that
 * wasn't saved and why.
 */
import React from "react";
import type { ChangeSet, ProjectState, ProposedOp } from "../core";
import { describeOp } from "../core";
import { Icons } from "./bits";

interface Props {
  cs: ChangeSet;
  state: ProjectState;
  busy: boolean;
  onApply: (opIds: string[]) => void;
  onDismiss: (opIds: string[]) => void;
  onUndo: (opIds?: string[]) => void;
}

export function refTitles(cs: ChangeSet): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of cs.ops) if (p.op.type === "create_item") m[p.op.ref] = p.op.title;
  return m;
}

export function opLabel(p: ProposedOp, cs: ChangeSet, state: ProjectState) {
  return p.label ?? describeOp(p.op, state, refTitles(cs));
}

export function applyLabel(p: ProposedOp) {
  return p.op.origin === "ai_suggested" && p.op.type === "create_item" ? "Keep idea" : "Save";
}

export function MemoryCard({ cs, state, busy, onApply, onDismiss, onUndo }: Props) {
  const saved = cs.ops.filter((p) => p.state === "applied");
  const waiting = cs.ops.filter((p) => p.state === "pending");
  const skipped = cs.ops.filter((p) => p.state === "invalid" || p.state === "dismissed" || p.state === "reverted");
  if (!saved.length && !waiting.length && !skipped.length) return null;

  return (
    <div className="notes-card">
      {saved.length > 0 && (
        <section className="nc-block saved" aria-label="Saved to your notes">
          <div className="nc-head">
            <span className="nc-title"><Icons.check /> Saved to your notes</span>
            <button className="linkbtn" disabled={busy} onClick={() => onUndo()}>
              Undo{saved.length > 1 ? " all" : ""}
            </button>
          </div>
          <ul>
            {saved.map((p) => (
              <li key={p.opId}>
                <span>{opLabel(p, cs, state)}</span>
                {saved.length > 1 && (
                  <button className="linkbtn quiet" disabled={busy} onClick={() => onUndo([p.opId])} aria-label="Undo this one">
                    Undo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {waiting.length > 0 && (
        <section className="nc-block waiting" aria-label="Waiting for your answer">
          <div className="nc-head">
            <span className="nc-title"><Icons.spark /> {waiting.every((p) => p.op.origin === "ai_suggested") ? "Want to keep these ideas?" : "Should I save these?"}</span>
            {waiting.length > 1 && (
              <button className="linkbtn" disabled={busy} onClick={() => onApply(waiting.map((p) => p.opId))}>
                Keep all
              </button>
            )}
          </div>
          <ul>
            {waiting.map((p) => (
              <li key={p.opId}>
                <span>
                  {opLabel(p, cs, state)}
                  {p.op.origin !== "ai_suggested" && p.note && <small className="nc-note">{p.note}</small>}
                </span>
                <span className="nc-actions">
                  <button className="btn xs" disabled={busy} onClick={() => onApply([p.opId])}>
                    {applyLabel(p)}
                  </button>
                  <button className="btn xs ghost" disabled={busy} onClick={() => onDismiss([p.opId])}>
                    No thanks
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {waiting.some((p) => p.op.origin === "ai_suggested") && <p className="nc-foot">Kept ideas are saved as ideas, not decisions. You decide later.</p>}
        </section>
      )}

      {skipped.length > 0 && (
        <details className="nc-skipped">
          <summary>
            {skipped.length} {skipped.length === 1 ? "thing" : "things"} not saved
          </summary>
          <ul>
            {skipped.map((p) => (
              <li key={p.opId}>
                <span className={p.state === "invalid" ? "" : "struck"}>{opLabel(p, cs, state)}</span>
                <small className="nc-note">
                  {p.state === "dismissed" ? "You said no thanks." : p.state === "reverted" ? "Undone." : p.note ?? "Not saved."}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
