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

// ---- why is this value what it is? (nice to have 4) ----
export interface Explanation {
  what: 'unset' | 'set' | 'freed' | 'gone';
  text: string; // one sentence, from the trace
  at: number | null; // the step to look at (the write, the free)
  line: number | null;
}

// The variable's value at playback position `pos`, explained: never set since
// its call began, set at a line (to NULL too), or a pointer into a block that
// was freed (and what a freed block holds: glibc's own bookkeeping).
export function explainValue(t: Trace, pos: number, fn: string, name: string): Explanation | null {
  const i = Math.min(t.evs.length, Math.max(0, Math.floor(pos))); // snapshot i: the state now
  const snap = t.snaps[i];
  const ids = cellsOf(t, { fn, name });
  let cell: SnapCell | undefined;
  let frameId: number | null = null;
  for (const c of snap.statics) if (ids.has(c.id)) cell = c;
  for (const f of [...snap.stack].reverse()) {
    if (cell) break;
    const c = f.cells.find((x) => ids.has(x.id));
    if (c) (cell = c), (frameId = f.id);
  }
  if (!cell) return { what: 'gone', text: `${name} doesn't exist now: no call of ${fn} is running`, at: null, line: null };
  const v = cell.val;
  // the last change to this very cell, at or before now
  const last = changesOf(t, { cell: cell.id }).filter((c) => c.at < i).at(-1) ?? null;
  // when its call began (a local): the call event of its frame
  const began = frameId !== null ? t.evs.findIndex((e) => e.k === 'call' && e.frame === frameId) : -1;
  // a pointer into a heap block that isn't on the heap any more (freed; the
  // converter relabels it "freed #n" at the next stop)
  const target = v.k === 'ptr' && v.to !== null ? v.to : null;
  const freedNow = target !== null && (v.k === 'ptr' && v.label?.startsWith('freed ') || (t.cells.get(target)?.frame === -2 && !snap.heap.some((c) => c.id === target)));
  if (v.k === 'ptr' && target !== null && freedNow) {
    const block = t.cells.get(target)?.name ?? `#${target}`;
    const freeAt = [...t.evs.keys()].filter((k) => k < i && t.evs[k].k === 'free' && (t.evs[k] as { cell: number }).cell === target).at(-1) ?? -1;
    const fe = freeAt >= 0 ? t.evs[freeAt] : null;
    const fnAt = fe && fe.frame !== null ? snapFn(t, freeAt, fe.frame) : null;
    return {
      what: 'freed',
      text: `${name} still holds the address of block ${block}, freed ${fe ? `at step ${freeAt + 1} (line ${fe.line + 1}${fnAt ? `, in ${fnAt}` : ''})` : 'earlier'}. The memory isn't the program's any more: reading it is undefined behaviour, and what's there now is what free left, the allocator's own bookkeeping (glibc keeps a list pointer and a random key in a freed block's first 16 bytes), not the data that was there.`,
      at: freeAt >= 0 ? freeAt : null,
      line: fe ? fe.line : null,
    };
  }
  if (v.k === 'undef' || !last) {
    if (v.k !== 'undef' && began < 0) return { what: 'set', text: `${name} has held ${fmt(v)} since the run began (a static's initial value, or set before the trace started)`, at: null, line: null };
    return {
      what: 'unset',
      text: v.k === 'undef'
        ? `${name} hasn't been set since this call of ${fn} began${began >= 0 ? ` (step ${began + 1})` : ''}: its value is whatever was in that stack memory before, garbage.`
        : `${name} arrived with the call of ${fn}${began >= 0 ? ` at step ${began + 1}` : ''} and hasn't changed since: it's a copy of what the caller passed.`,
      at: began >= 0 ? began : null,
      line: began >= 0 ? t.evs[began].line : null,
    };
  }
  return {
    what: 'set',
    text: `${name} was set to ${last.after} at step ${last.at + 1}, by line ${last.line + 1} (it was ${last.before} before)${v.k === 'ptr' && v.to === null ? ': NULL, so it points at nothing' : ''}.`,
    at: last.at,
    line: last.line,
  };
}

const fmt = (v: V) => (v.k === 'int' ? String(v.v) : v.k === 'ptr' ? (v.to === null ? 'NULL' : 'an address') : v.k === 'raw' ? v.text : v.k);
function snapFn(t: Trace, i: number, frame: number): string | null {
  return t.snaps[i]?.stack.find((f) => f.id === frame)?.fn ?? null;
}
