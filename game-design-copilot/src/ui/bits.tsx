/** Small shared UI pieces: status pills, icons, copy helper, relative time. */
import React from "react";
import type { Status } from "../core";
import { STATUS_WORD } from "../core";

export const STATUS_LABEL = STATUS_WORD;

export function Pill({ status }: { status: Status }) {
  return <span className={`pill ${status}`}>{STATUS_LABEL[status]}</span>;
}

/** A status pill that is also a dropdown. */
export function StatusSelect({ status, onChange, id }: { status: Status; onChange: (s: Status) => void; id: string }) {
  return (
    <select id={id} aria-label="Status" className={`pill ${status}`} value={status} onChange={(e) => onChange(e.target.value as Status)}>
      {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

const stroke = (d: string, i: number) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />;
const icon = (d: string[]) =>
  function Icon() {
    return <svg viewBox="0 0 24 24" aria-hidden="true">{d.map(stroke)}</svg>;
  };

export const Icons = {
  send: icon(["M12 19V5", "M6 11l6-6 6 6"]),
  stop: icon(["M8 8h8v8H8z"]),
  menu: icon(["M4 7h16", "M4 12h16", "M4 17h16"]),
  panel: icon(["M4 5h16v14H4z", "M15 5v14"]),
  plus: icon(["M12 5v14", "M5 12h14"]),
  copy: icon(["M9 9h10v10H9z", "M5 15V5h10"]),
  check: icon(["M5 12.5l4.5 4.5L19 7.5"]),
  edit: icon(["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"]),
  redo: icon(["M4 12a8 8 0 0 1 14-5.3L20 9", "M20 4v5h-5", "M20 12a8 8 0 0 1-14 5.3L4 15", "M4 20v-5h5"]),
  down: icon(["M12 5v14", "M6 13l6 6 6-6"]),
  undo: icon(["M9 14L4 9l5-5", "M4 9h11a5 5 0 0 1 0 10h-3"]),
  gear: icon(["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"]),
  sun: icon(["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M12 2v2", "M12 20v2", "M4.9 4.9l1.4 1.4", "M17.7 17.7l1.4 1.4", "M2 12h2", "M20 12h2", "M4.9 19.1l1.4-1.4", "M17.7 6.3l1.4-1.4"]),
  moon: icon(["M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"]),
  auto: icon(["M12 3a9 9 0 1 0 0 18z", "M12 3a9 9 0 0 1 0 18"]),
  chevron: icon(["M8 10l4 4 4-4"]),
  close: icon(["M6 6l12 12", "M18 6L6 18"]),
  notes: icon(["M6 4h12v16H6z", "M9 8h6", "M9 12h6", "M9 16h4"]),
  chat: icon(["M5 5h14v10H9l-4 4z"]),
  plan: icon(["M7 3h7l4 4v14H7z", "M14 3v4h4", "M10 12h5", "M10 16h5"]),
  spark: icon(["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"]),
  more: icon(["M5 12h.01", "M12 12h.01", "M19 12h.01"]),
};

export function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

/** Copy text; falls back to a hidden textarea where the clipboard API is refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** A small icon button that copies text and shows a check for a moment. */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      className={`iconbtn ${className ?? ""}`}
      title={done ? "Copied" : label}
      aria-label={done ? "Copied" : label}
      onClick={async () => setDone(await copyText(text))}
    >
      {done ? <Icons.check /> : <Icons.copy />}
      <span className="iconbtn-label">{done ? "Copied" : label}</span>
    </button>
  );
}

/** A two-step button: first click arms it, second confirms. (The claude.ai viewer blocks confirm() dialogs.) */
export function ConfirmButton({ label, confirmLabel, onConfirm, className }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={`btn xs ${armed ? "danger" : "ghost"} ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/** Close a popup when clicking outside it or pressing Escape. */
export function useDismiss(open: boolean, close: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}
