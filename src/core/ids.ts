/**
 * ID and clock helpers. Tests can swap these for deterministic versions
 * with setIdSource / setClock so snapshots stay stable.
 */

let idSource: (prefix: string) => string = (prefix) => {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36).slice(-4);
  return `${prefix}_${time}${rand}`;
};

let clock: () => string = () => new Date().toISOString();

export function newId(prefix: string): string {
  return idSource(prefix);
}

export function now(): string {
  return clock();
}

/** For tests: make ids like it_1, it_2… */
export function setIdSource(fn: (prefix: string) => string): void {
  idSource = fn;
}

/** For tests: freeze or script the clock. */
export function setClock(fn: () => string): void {
  clock = fn;
}

export function sequentialIds(): (prefix: string) => string {
  const counts: Record<string, number> = {};
  return (prefix) => {
    counts[prefix] = (counts[prefix] ?? 0) + 1;
    return `${prefix}_${counts[prefix]}`;
  };
}
