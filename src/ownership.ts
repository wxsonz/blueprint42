// Who can still free a heap block (docs/VISUALS.md, "The heap bar"). C has
// no owners, only pointers: a block can be freed while some pointer the
// program can reach still holds its address. The moment the last one goes
// (its frame returns, or it's overwritten), nothing can free it any more:
// it's lost, a leak from then on, whatever happens later.
//
// Reachable means: from a variable on some frame's stack or a static (and
// the struct fields shown through them), a return value on its way back, or
// a pointer inside a block that is itself reachable. This is claimed only
// when every live block's bytes were read whole (blocks up to 48 bytes, gdb
// engine); otherwise a pointer could hide in bytes nobody read, and nothing
// is said.
import type { Ev, Snap, Trace, V } from './interp';

export interface Lost {
  cell: number; // the block
  at: number; // the event after which nothing points at it
  fn: string | null; // the function running then
  why: 'ret' | 'write' | 'other';
  line: number;
  file?: string;
}

// A value shown only as text (an array, a struct not unfolded) whose type
// could hold a pointer: pointers in it can't be seen, so nothing is claimed.
const plain = /^(?:(?:const|unsigned|signed|volatile)\s+)*(?:char|short|int|long|long long|float|double|size_t|ssize_t|_Bool|bool)(?:\s*\[\d*\])*$/;
const hidden = (x: { val: V; type: string }) => x.val.k === 'raw' && !plain.test(x.type.trim());
// a struct shown with its fields is seen through them (one level: a field
// that is itself only text could hide one)
const opaque = (c: { val: V; type: string; fields?: { val: V; type: string }[] }) => hidden(c) && !(c.fields?.length && !c.fields.some(hidden));

function reachable(snap: Snap, extra: V | null): Set<number> | null {
  if (snap.heap.some((c) => !c.whole)) return null; // bytes nobody read: can't say
  if ([...snap.statics, ...snap.stack.flatMap((f) => f.cells)].some(opaque)) return null;
  const out = new Set<number>();
  const todo: number[] = [];
  const root = (v: V | null | undefined) => {
    if (v?.k === 'ptr' && v.to !== null && !out.has(v.to)) (out.add(v.to), todo.push(v.to));
  };
  for (const c of [...snap.statics, ...snap.stack.flatMap((f) => f.cells)]) {
    root(c.val);
    for (const f of c.fields ?? []) root(f.val);
  }
  root(extra);
  const byId = new Map(snap.heap.map((c) => [c.id, c]));
  while (todo.length) {
    const c = byId.get(todo.pop()!);
    for (const p of c?.ptrs ?? []) if (!out.has(p.to)) (out.add(p.to), todo.push(p.to));
  }
  return out;
}

const memo = new WeakMap<Trace, Lost[]>();

export function lostBlocks(trace: Trace): Lost[] {
  const hit = memo.get(trace);
  if (hit) return hit;
  const out: Lost[] = [];
  if (trace.engine === 'gdb') {
    const lost = new Set<number>();
    let prev: Set<number> | null = null;
    // a value returned stays reachable until the caller's next step stores it (or doesn't)
    let carried: V | null = null;
    const frames = new Map<number, string>();
    trace.evs.forEach((e: Ev, i) => {
      if (e.k === 'call' && e.frame !== null) frames.set(e.frame, e.fn);
      if (e.k === 'ret') carried = e.val;
      else if (e.k === 'step') carried = null;
      const snap = trace.snaps[i + 1];
      if (!snap) return;
      const now = reachable(snap, carried);
      // main returning is the exit: what's left then is a leak at exit, said as such
      const exit = e.k === 'ret' && e.caller === null;
      if (now && prev && !exit) {
        for (const c of snap.heap) {
          if (lost.has(c.id) || now.has(c.id) || !prev.has(c.id)) continue;
          lost.add(c.id);
          out.push({ cell: c.id, at: i, fn: e.k === 'ret' ? e.fn : e.frame !== null ? frames.get(e.frame) ?? null : null, why: e.k === 'ret' ? 'ret' : e.k === 'write' ? 'write' : 'other', line: e.line, file: e.file });
        }
      }
      prev = now;
    });
  }
  memo.set(trace, out);
  return out;
}

// What to say about a lost block.
export function lostText(l: Lost): string {
  if (l.why === 'ret') return `${l.fn ?? 'a function'} returned without freeing it or handing it on`;
  if (l.why === 'write') return `its last pointer was overwritten${l.fn ? ` in ${l.fn}` : ''}`;
  return 'nothing points at it any more';
}

// The same, short enough for a heap card.
export function lostShort(l: Lost): string {
  if (l.why === 'ret') return `lost when ${l.fn ?? 'its function'} returned`;
  if (l.why === 'write') return 'lost: last pointer overwritten';
  return 'lost: nothing points at it';
}
