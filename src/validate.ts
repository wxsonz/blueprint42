// A trace that checks itself (docs/OBJECTIVES.md, "easy to diagnose", step
// 7): what must hold of any run, whichever engine recorded it. A failure
// means the data is wrong before anything is drawn from it (a converter bug
// shows up where it happens, not as a wrong picture later). Run on every
// trace in dev builds (main.ts, into src/diag.ts) and on every sample in the
// tests (test/validate.test.ts).
import type { Snap, SnapCell, Trace } from './interp';

export interface Problem { check: string; detail: string; at: number | null }

const MAX_PER_CHECK = 5; // examples of each, then a count

export function validateTrace(t: Trace): Problem[] {
  const out: Problem[] = [];
  const counts = new Map<string, number>();
  const fail = (check: string, at: number | null, detail: string) => {
    const n = (counts.get(check) ?? 0) + 1;
    counts.set(check, n);
    if (n <= MAX_PER_CHECK) out.push({ check, detail, at });
  };

  // snapshots and events line up: one before each event, one after the last
  if (t.snaps.length !== t.evs.length + 1) fail('shape', null, `${t.evs.length} events but ${t.snaps.length} snapshots (want ${t.evs.length + 1})`);

  const cellsOf = (s: Snap): SnapCell[] => [...s.statics, ...s.heap, ...s.stack.flatMap((f) => f.cells)];
  const frameFn = new Map<number, string>(); // a frame id is one call of one function
  const cellName = new Map<number, string>();
  let lastSent = 0;
  let lastIn = 0;
  t.snaps.forEach((s, i) => {
    const at = i === 0 ? null : i - 1; // the event this snapshot follows
    // frame ids: unique on a stack, and one function each for the whole run
    const seen = new Set<number>();
    for (const f of s.stack) {
      if (seen.has(f.id)) fail('frame ids', at, `frame ${f.id} is on the stack twice`);
      seen.add(f.id);
      const fn = frameFn.get(f.id);
      if (fn !== undefined && fn !== f.fn) fail('frame ids', at, `frame ${f.id} was ${fn}, now ${f.fn}`);
      frameFn.set(f.id, f.fn);
    }
    // cell ids: known to the trace, and one name each
    for (const c of cellsOf(s)) {
      const info = t.cells.get(c.id);
      if (!info) fail('cell ids', at, `cell ${c.id} (${c.name}) isn't in the trace's cells`);
      const was = cellName.get(c.id);
      if (was !== undefined && was !== c.name) fail('cell ids', at, `cell ${c.id} was ${was}, now ${c.name}`);
      cellName.set(c.id, c.name);
      // a pointer points at a cell the run has (or nowhere)
      if (c.val.k === 'ptr' && c.val.to !== null && !t.cells.has(c.val.to)) fail('pointers', at, `${c.name} points at cell ${c.val.to}, which the run never had`);
    }
    // output and input only move forward
    if (s.out) {
      if (s.out.sent < lastSent) fail('output', at, `${lastSent} bytes had reached the terminal, now ${s.out.sent}`);
      if (t.outText !== undefined && s.out.sent > t.outText.length) fail('output', at, `${s.out.sent} bytes sent, but the output is ${t.outText.length} long`);
      lastSent = s.out.sent;
    }
    if (s.inPos !== undefined) {
      if (s.inPos < lastIn) fail('input', at, `stdin had given ${lastIn} bytes, now ${s.inPos}`);
      if (t.inText !== undefined && s.inPos > t.inText.length) fail('input', at, `${s.inPos} bytes taken from ${t.inText.length} of input`);
      lastIn = s.inPos;
    }
  });

  // each event does what it says to the snapshots either side of it
  t.evs.forEach((e, i) => {
    const before = t.snaps[i];
    const after = t.snaps[i + 1];
    if (!before || !after) return;
    const onStack = (s: Snap, id: number | null) => id !== null && s.stack.some((f) => f.id === id);
    if (e.frame !== null && !onStack(before, e.frame) && !onStack(after, e.frame)) fail('events', i, `${e.k} runs in frame ${e.frame}, on neither stack around it`);
    if (e.k === 'call') {
      const top = after.stack.at(-1);
      if (!top || top.fn !== e.fn) fail('calls', i, `call of ${e.fn}, but the stack's top after it is ${top?.fn ?? 'empty'}`);
      else if (onStack(before, top.id)) fail('calls', i, `call of ${e.fn} pushed no new frame`);
    } else if (e.k === 'ret') {
      const top = before.stack.at(-1);
      if (!top || top.fn !== e.fn) fail('returns', i, `return from ${e.fn}, but the stack's top before it is ${top?.fn ?? 'empty'}`);
      else if (onStack(after, top.id)) fail('returns', i, `return from ${e.fn}, and its frame is still there`);
    } else if (e.k === 'alloc') {
      if (!after.heap.some((c) => c.id === e.cell)) fail('heap', i, `malloc of block ${e.cell}, not on the heap after it`);
      if (before.heap.some((c) => c.id === e.cell)) fail('heap', i, `malloc of block ${e.cell}, already on the heap before it`);
    } else if (e.k === 'free') {
      if (!before.heap.some((c) => c.id === e.cell)) fail('heap', i, `free of block ${e.cell}, not on the heap before it`);
      if (after.heap.some((c) => c.id === e.cell)) fail('heap', i, `free of block ${e.cell}, still on the heap after it`);
    } else if (e.k === 'write') {
      if (!t.cells.has(e.cell)) fail('writes', i, `a write to cell ${e.cell}, which the run never had`);
      if (e.via !== null && !t.cells.has(e.via)) fail('writes', i, `a write through cell ${e.via}, which the run never had`);
    } else if (e.k === 'in') {
      if (e.to < e.from) fail('input', i, `a read of stdin from ${e.from} back to ${e.to}`);
      if (t.inText !== undefined && t.inText.slice(e.from, e.to) !== e.text) fail('input', i, `a read of ${JSON.stringify(e.text)}, but stdin there says ${JSON.stringify(t.inText.slice(e.from, e.to))}`);
    }
  });

  // the heap's slots: a live block has one, and two live blocks never share it
  if (t.heapSlots) t.snaps.forEach((s, i) => {
    const used = new Map<number, number>();
    for (const c of s.heap) {
      const slot = t.heapSlots!.get(c.id);
      if (slot === undefined) fail('heap slots', i ? i - 1 : null, `block ${c.id} (${c.name}) has no slot`);
      else if (used.has(slot)) fail('heap slots', i ? i - 1 : null, `blocks ${used.get(slot)} and ${c.id} share slot ${slot}`);
      else used.set(slot, c.id);
    }
  });

  for (const [check, n] of counts) if (n > MAX_PER_CHECK) out.push({ check, detail: `…and ${n - MAX_PER_CHECK} more`, at: null });
  return out;
}
