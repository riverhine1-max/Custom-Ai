/** GAME PLAN: the design document, built from what you've decided. */
import React from "react";
import type { ProjectState } from "../core";
import { renderDesignDoc } from "../core";
import { Markdown } from "./Markdown";
import { CopyButton } from "./bits";

export function PlanView({ state, saveFile, toast }: { state: ProjectState; saveFile?: (name: string, text: string) => Promise<void>; toast: (s: string) => void }) {
  const [withIdeas, setWithIdeas] = React.useState(false);
  const md = renderDesignDoc(state, { includeProposed: withIdeas });
  const filename = `${state.project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "game"}-plan.md`;
  return (
    <div className="page">
      <div className="page-head">
        <h1>Game plan</h1>
        <p>Your design document. It writes itself from what you've decided, so it's always up to date.</p>
      </div>
      <div className="toolbar">
        <label className="toggle">
          <input id="doc-ideas" type="checkbox" checked={withIdeas} onChange={(e) => setWithIdeas(e.target.checked)} />
          Show ideas that aren't decided yet
        </label>
        <span className="spacer" />
        <CopyButton text={md} label="Copy all" className="boxed" />
        {saveFile && (
          <button className="btn" onClick={() => saveFile(filename, md).then(() => toast("Downloaded."), () => toast("The download was cancelled."))}>
            Download
          </button>
        )}
      </div>
      <div className="doc-paper">
        <Markdown text={md} />
      </div>
    </div>
  );
}
