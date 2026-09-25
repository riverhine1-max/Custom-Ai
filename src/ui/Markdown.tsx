/**
 * A small Markdown renderer that builds React elements directly (no HTML
 * strings, so model output can never inject markup). Supports what the
 * designer writes: headings, paragraphs, bold/italic/code/strike, links,
 * nested lists, task lists, tables, quotes, code blocks, rules.
 */
import React from "react";
import { CopyButton } from "./bits";

type Node = React.ReactNode;

export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={className ?? "md"}>{renderBlocks(text.replace(/\r\n?/g, "\n").split("\n"))}</div>;
}

function renderBlocks(lines: string[]): Node[] {
  const out: Node[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // fenced code
    const fence = line.match(/^\s*```(\w*)/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(
        <div key={key++} className="md-codewrap">
          <CopyButton text={body.join("\n")} className="md-codecopy" />
          <pre className="md-code">
            <code>{body.join("\n")}</code>
          </pre>
        </div>,
      );
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = (["h3", "h3", "h4", "h5"] as const)[level - 1];
      out.push(<Tag key={key++}>{inline(h[2])}</Tag>);
      i++;
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push(<blockquote key={key++}>{renderBlocks(body)}</blockquote>);
      continue;
    }
    if (isTableStart(lines, i)) {
      const rows: string[][] = [];
      const header = splitRow(lines[i]);
      i += 2;
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) rows.push(splitRow(lines[i++]));
      out.push(
        <div key={key++} className="md-table">
          <table>
            <thead>
              <tr>{header.map((c, n) => <th key={n}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, rn) => (
                <tr key={rn}>{header.map((_, n) => <td key={n}>{inline(r[n] ?? "")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (isListItem(line)) {
      const block: string[] = [];
      while (i < lines.length && (isListItem(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && block.length) || (!lines[i].trim() && i + 1 < lines.length && isListItem(lines[i + 1])))) {
        if (lines[i].trim()) block.push(lines[i]);
        i++;
      }
      out.push(<React.Fragment key={key++}>{renderList(block)}</React.Fragment>);
      continue;
    }
    // paragraph: gather until blank or another block starts
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) para.push(lines[i++]);
    out.push(<p key={key++}>{joinLines(para)}</p>);
  }
  return out;
}

function joinLines(lines: string[]): Node[] {
  const out: Node[] = [];
  lines.forEach((l, n) => {
    if (n > 0) out.push(" ");
    out.push(<React.Fragment key={n}>{inline(l.trim())}</React.Fragment>);
  });
  return out;
}

function startsBlock(lines: string[], i: number) {
  const l = lines[i];
  return /^\s*```/.test(l) || /^#{1,4}\s/.test(l) || /^\s*>/.test(l) || isListItem(l) || isTableStart(lines, i) || /^\s*(---|\*\*\*)\s*$/.test(l);
}

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
function isListItem(l: string) {
  return LIST_RE.test(l);
}

function isTableStart(lines: string[], i: number) {
  return /\|/.test(lines[i]) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1]);
}

function splitRow(l: string): string[] {
  return l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

interface Item {
  ordered: boolean;
  text: string;
  children: string[];
}

function renderList(block: string[]): Node {
  const base = (block[0].match(/^(\s*)/)?.[1].length ?? 0);
  const items: Item[] = [];
  for (const l of block) {
    const m = l.match(LIST_RE);
    const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
    if (m && indent <= base + 1) items.push({ ordered: /\d/.test(m[2]), text: m[3], children: [] });
    else if (items.length) items[items.length - 1].children.push(l.slice(Math.min(indent, base + 2)));
  }
  const ordered = items[0]?.ordered;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag>
      {items.map((it, n) => {
        const task = it.text.match(/^\[( |x|X)\]\s+(.*)$/);
        return (
          <li key={n} className={task ? "md-task" : undefined}>
            {task ? <span className={`md-box${task[1].trim() ? " on" : ""}`} aria-hidden="true" /> : null}
            {inline(task ? task[2] : it.text)}
            {it.children.length ? renderBlocks(it.children) : null}
          </li>
        );
      })}
    </Tag>
  );
}

/** Inline formatting: code, links, bold, italic, strikethrough. */
export function inline(s: string): Node[] {
  const out: Node[] = [];
  const re = /(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\s][^*]*\*)|((?<!\w)_[^_\s][^_]*_(?!\w))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (m[2]) {
      const label = t.slice(1, t.indexOf("]"));
      out.push(
        <a key={k++} href={m[3]} target="_blank" rel="noreferrer noopener">
          {label}
        </a>,
      );
    } else if (m[4]) out.push(<strong key={k++}>{inline(t.slice(2, -2))}</strong>);
    else if (m[5]) out.push(<del key={k++}>{inline(t.slice(2, -2))}</del>);
    else out.push(<em key={k++}>{inline(t.slice(1, -1))}</em>);
    last = m.index + t.length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
