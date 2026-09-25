/** "What this change affects": runs when you change something already decided. */
import React from "react";
import type { Consequences } from "../core";
import { CopyButton } from "./bits";
import { consequencesAsText } from "./text";

export function ConsequencesCard({ c }: { c: Consequences }) {
  const list = (xs: string[]) => (xs.length ? <ul>{xs.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted small">Nothing noted.</p>);
  return (
    <section className="conseq" aria-label="What this change affects">
      <div className="conseq-head">
        <div>
          <h3>What this change affects</h3>
          <p>{c.whatChanged}</p>
        </div>
        <CopyButton text={consequencesAsText(c)} />
      </div>
      <div className="conseq-grid">
        <div className="conseq-cell wide">
          <h4>Parts of your game affected</h4>
          <ul>
            {c.systemsAffected.map((s, i) => (
              <li key={i}>
                <strong>{s.name}:</strong> {s.impact}
              </li>
            ))}
          </ul>
        </div>
        <div className="conseq-cell problems">
          <h4>Watch out for</h4>
          {list(c.problems)}
        </div>
        <div className="conseq-cell opps">
          <h4>New possibilities</h4>
          {list(c.opportunities)}
        </div>
        <div className="conseq-cell wide">
          <h4>Try this in a playtest</h4>
          {list(c.tests)}
        </div>
      </div>
      <p className="conseq-foot">Your decision stands. This is just what to keep an eye on.</p>
    </section>
  );
}
