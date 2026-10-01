// "When did this change?" (docs/OBJECTIVES.md, nice to have 1): every step
// where a variable's value really changed, and the statement that changed it.
// A local is the same name in every call of its function (each call has its
// own cell); a static, its one cell; a heap block, its cell. From the
// snapshots, so it's what the run did, whichever engine recorded it.
import type { Snap, SnapCell, Trace, V } from './interp';

export type ChangeRef = { fn: string; name: string } | { cell: number };
export interface Change {
  at: number; // the event the new value appears after (play to it: the statement is lit)
  line: number; // 0-based: the statement that changed it
  file?: string;
  frame: number | null; // which call (frame id), or null for a static or a block
  before: string;
  after: string;
}

const valText = (c: SnapCell | undefined): string => {
  if (!c) return '';
  const v: V = c.val;
  // (a pointer whose block was freed is relabelled "freed #n": the address it
  // holds is the same, so it isn't a change of the pointer)
  const label = v.k === 'ptr' && v.label?.startsWith('freed ') ? undefined : v.k === 'ptr' ? v.label : undefined;
  const base = v.k === 'int' ? String(v.v) : v.k === 'ptr' ? (v.to === null ? 'NULL' : `→${label ?? v.to}`) : v.k === 'raw' ? v.text : v.k;
  // a pointer's value is its address: what it points at changing (freed,
  // written through it) is the target's change, not the pointer's
  if (v.k === 'ptr') return base;
  const fields = c.fields?.map((f) => `${f.name}=${f.str ?? JSON.stringify(f.val)}`).join(',') ?? '';
  return fields ? `${base} {${fields}}` : base;
};

// the cell ids a reference covers
export function cellsOf(t: Trace, ref: ChangeRef): Set<number> {
  if ('cell' in ref) return new Set([ref.cell]);
  const out = new Set<number>();
  for (const [id, info] of t.cells) if (info.name === ref.name && info.owner === ref.fn) out.add(id);
  return out;
}

function find(s: Snap, ids: Set<number>): Map<number, { c: SnapCell; frame: number | null }> {
  const m = new Map<number, { c: SnapCell; frame: number | null }>();
  for (const c of s.statics) if (ids.has(c.id)) m.set(c.id, { c, frame: null });
  for (const c of s.heap) if (ids.has(c.id)) m.set(c.id, { c, frame: null });
  for (const f of s.stack) for (const c of f.cells) if (ids.has(c.id)) m.set(c.id, { c, frame: f.id });
  return m;
}

export function changesOf(t: Trace, ref: ChangeRef): Change[] {
  const ids = cellsOf(t, ref);
  if (!ids.size) return [];
  const out: Change[] = [];
  // the line each frame last stopped on: under gdb a step's snapshot is taken
  // before its line runs, so a change seen at a stop was made by the line before
  const lastLine = new Map<number, { line: number; file?: string }>();
  let prev = find(t.snaps[0], ids);
  t.evs.forEach((e, i) => {
    const next = find(t.snaps[i + 1], ids);
    for (const [id, now] of next) {
      const was = prev.get(id);
      if (!was) continue; // a new call's copy arriving isn't a change
      const a = valText(was.c), b = valText(now.c);
      if (a === b) continue;
      const by = e.k === 'step' && e.frame !== null ? lastLine.get(e.frame) ?? { line: e.line, file: e.file } : { line: e.line, file: e.file };
      out.push({ at: i, line: by.line, ...(by.file ? { file: by.file } : {}), frame: now.frame, before: a, after: b });
    }
    if (e.frame !== null && e.k !== 'call') lastLine.set(e.frame, { line: e.line, file: e.file });
    prev = next;
  });
  return out;
}
