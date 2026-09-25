import { beforeEach } from "vitest";
import { setClock, setIdSource, sequentialIds } from "../src/core/ids";
import type { ChangeOp, DesignItem, ProjectState } from "../src/core";
import { emptyState } from "../src/core";

/** Deterministic ids and a ticking clock for every test. */
export function deterministic() {
  beforeEach(() => {
    setIdSource(sequentialIds());
    let t = Date.parse("2026-09-25T12:00:00Z");
    setClock(() => new Date((t += 1000)).toISOString());
  });
}

export function stateWith(items: Partial<DesignItem>[]): ProjectState {
  const s = emptyState("Test game", "pr_test");
  s.items = items.map((p, n) => ({
    id: p.id ?? `it_x${n}`,
    kind: p.kind ?? "mechanic",
    title: p.title ?? `Item ${n}`,
    summary: p.summary ?? "",
    status: p.status ?? "confirmed",
    parentId: p.parentId ?? null,
    slot: p.slot,
    origin: p.origin ?? "user",
    rationale: p.rationale,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  }));
  return s;
}

export const op = <T extends ChangeOp>(o: T) => o;
