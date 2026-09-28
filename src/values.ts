// How a value reads on screen: shared by the frame panels and the room.
import { fmtVal, type SnapCell, type SnapField, type SnapFrame, type Trace } from './interp';
import type { ValueKind } from './skins/types';

export function staticCellId(trace: Trace | null, fn: string, name: string): number | null {
  if (!trace) return null;
  for (const [id, c] of trace.cells) if (c.frame === -1 && c.owner === fn && c.name === name) return id;
  return null;
}

export function pointeeName(trace: Trace | null, to: number, from: SnapFrame | null): string {
  const c = trace?.cells.get(to);
  if (!c) return '?';
  if (!c.owner || c.owner === 'heap') return c.name;
  if (from && from.cells.some((x) => x.id === to)) return c.name;
  return `${c.owner}.${c.name}`;
}

export function valueOf(c: SnapCell, frame: SnapFrame | null, trace: Trace | null, live: Set<number> | null): { text: string; kind: ValueKind } {
  if (c.val.k === 'undef') return { text: '?', kind: 'undef' };
  if (c.val.k === 'ptr') {
    if (c.val.to === null && !c.val.label) return { text: 'NULL', kind: 'null' };
    const dangling = c.val.to !== null && live !== null && !live.has(c.val.to);
    if (c.str && !dangling) return { text: c.str.startsWith('{') ? clipList(c.str, 22) : clip(c.str, 12), kind: 'ptr' }; // a char *: the text, not the address
    const name = c.val.label ?? pointeeName(trace, c.val.to!, frame);
    return { text: `→${name}`, kind: dangling ? 'dangling' : 'ptr' };
  }
  // a pointer into memory no frame owns (argv's array, say) that gdb could
  // read the strings behind: those, not the address
  if (c.val.k === 'raw' && c.str) return { text: c.str.startsWith('{') ? clipList(c.str, 22) : clip(c.str, 12), kind: 'ptr' };
  if (c.val.k === 'raw') return { text: c.val.text, kind: 'int' };
  return { text: fmtVal(c.val, c.type), kind: 'int' };
}

// A list of strings ({"./a.out", "200"}) cut to about n characters.
export function clipList(q: string, n: number): string {
  return q.length <= n ? q : `${q.slice(0, n).replace(/,?\s*"?[^"]*$/, '')}, …}`;
}

// A quoted string cut to a readable length (never shrunk to fit).
export function clip(q: string, n: number): string {
  const inner = q.replace(/^"/, '').replace(/"?…?$/, '');
  const whole = /"$/.test(q);
  return inner.length <= n && whole ? q : `"${inner.slice(0, n)}…`;
}

export function fieldValue(f: SnapField, trace: Trace | null): { text: string; kind: ValueKind } {
  if (f.val.k === 'ptr') {
    if (f.val.to === null && !f.val.label) return { text: 'NULL', kind: 'null' };
    if (f.str) return { text: clip(f.str, 12), kind: 'ptr' };
    return { text: `→${f.val.label ?? pointeeName(trace, f.val.to!, null)}`, kind: 'ptr' };
  }
  if (f.val.k === 'undef') return { text: '?', kind: 'undef' };
  if (f.val.k === 'raw') return { text: f.val.text, kind: 'int' };
  return { text: fmtVal(f.val, f.type), kind: 'int' };
}

