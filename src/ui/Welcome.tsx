/**
 * WELCOME: the first thing a new user sees. Pick the AI that powers the
 * designer: Ludomuse (free, on this device), ChatGPT or Claude. Everything
 * can be changed later in AI settings.
 */
import React from "react";
import type { ProviderId } from "../providers/presets";
import { AppMark, Icons } from "./bits";

interface Choice {
  id: ProviderId;
  name: string;
  tag: string;
  blurb: string;
  needs: string;
  cta: string;
}

const CHOICES: Choice[] = [
  {
    id: "builtin",
    name: "Ludomuse",
    tag: "Free · no account",
    blurb: "The copilot's own AI. It runs on this device, keeps your ideas private, and works offline after a one-time download.",
    needs: "A recent Chrome or Edge (or Safari on macOS 26). Downloads about 1.2 GB once.",
    cta: "Use Ludomuse",
  },
  {
    id: "openai",
    name: "ChatGPT",
    tag: "OpenAI · API key",
    blurb: "OpenAI's models. Longer, more detailed answers.",
    needs: "An OpenAI API key (pay per use, usually cents per session). ChatGPT Plus doesn't include it.",
    cta: "Use ChatGPT",
  },
  {
    id: "anthropic",
    name: "Claude",
    tag: "Anthropic · API key",
    blurb: "Anthropic's models. Careful, thoughtful design feedback.",
    needs: "An Anthropic API key (pay per use).",
    cta: "Use Claude",
  },
];

export function Welcome({ onPick }: { onPick: (id: ProviderId) => void }) {
  const noGpu = typeof navigator !== "undefined" && !("gpu" in navigator) && !("LanguageModel" in globalThis);
  const first = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => first.current?.focus(), []);
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <AppMark size={64} />
        <p className="welcome-kicker">Game Design Copilot</p>
        <h1 id="welcome-title">Choose your designer’s brain.</h1>
        <p className="welcome-lede">Your copilot asks questions, gives honest feedback, and keeps notes of every decision. Pick the AI that powers it. You can switch any time in AI settings.</p>
        <div className="welcome-grid">
          {CHOICES.map((c, i) => (
            <article key={c.id} className={`welcome-card${i === 0 ? " main" : ""}`}>
              <div className="wc-top">
                <h2>{c.name}</h2>
                <span className={`badge${i === 0 ? " free" : ""}`}>{c.tag}</span>
              </div>
              <p>{c.blurb}</p>
              <p className="small muted">{c.needs}</p>
              {i === 0 && noGpu && <p className="small warn-text">This browser can’t run Ludomuse. Pick ChatGPT or Claude, or open the app in Chrome or Edge.</p>}
              <button ref={i === 0 ? first : undefined} className={`btn${i === 0 ? " primary" : ""}`} onClick={() => onPick(c.id)}>
                {c.cta} <span aria-hidden="true">→</span>
              </button>
            </article>
          ))}
        </div>
        <p className="small muted welcome-foot"><Icons.spark /> Not sure? Start with Ludomuse. More choices (Gemini, a model on your computer) are in AI settings.</p>
      </div>
    </div>
  );
}
