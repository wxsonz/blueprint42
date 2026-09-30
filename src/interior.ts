// M5.5: inside a machine. A function's body as a small railway, one station
// per statement in code order: `if`/`else` is a switch that forks the track,
// a loop is a switch with a track that runs back up, `return` is an exit.
// This file owns the stations, their geometry (local px at zoom 1) and what
// the trace says about them: where the running line is, which way each
// switch went, how many times a loop ran. It never evaluates a condition
// itself (principle 4): a switch's result comes from the interpreter's
// `eval` event, or (gdb) from the next line the frame executed.
import type { Node } from 'web-tree-sitter';
import type { FnInfo } from './parse';
import type { Ev, Trace } from './interp';

export type StationKind = 'do' | 'if' | 'else' | 'loop' | 'ret' | 'jump' | 'end';

export interface Leaf {
  from: number; // offsets into `cond`
  to: number;
  path: [string] | [string, string]; // `x`, or `a->b` / `a.b`
  keep?: boolean; // read, but shown as written (`i++`, `&x`): a value there would read wrong
  deref?: boolean; // `*p`: the read is of the memory p holds the address of, not of p
  index?: string; // `a[i]`, `a[j + 1]`: an element of array a, at this index (an integer expression of names and numbers)
  derefs?: number; // `**pp`: how many addresses to follow (with deref; 1 when absent)
  chain?: string[]; // `p->next->len`: the fields after path's, each reached through a pointer (`->`)
}

// An index worth resolving: names, numbers and integer operators only (no
// call, no cast, no member access).
export const plainIndex = (t: string) => /^[\w\s+\-*/%()]+$/.test(t) && !/\w\s*\(/.test(t);

export interface Station {
  kind: StationKind;
  line: number; // 0-based row the engine stops at for it (a switch: its condition's row)
  last: number; // last row of the whole statement
  text: string; // one line of source
  depth: number; // 0 = the main line
  row: number; // first layout row (a switch takes two: code, then its readout)
  cond?: string; // a switch's condition as written, without the outer parentheses (leaves index into it)
  leaves?: Leaf[];
  body?: [number, number]; // rows of the branch taken when the condition holds
  inferable?: boolean; // gdb can tell the branch from the next line (the body starts on another row)
  loop?: 'while' | 'for' | 'do';
  owner?: number; // an `else`: its `if`
  end: number; // index of the last station inside this one (itself if none)
  src?: string; // a statement as written (reads index into it)
  reads?: Leaf[]; // what a statement reads: the names it uses, not the plain target of `=`
  calls?: string[]; // functions the statement (or a switch's condition) calls
}

// Geometry, local px at zoom 1.
export const ROW = 18;
export const IND = 14;
export const HEAD = 22;
export const PAD = 6;
export const CHAR = 6.6; // mono width at FONT px
export const FONT = 11;
const MAX_CHARS = 44;
const CELL = 40;

export const stopX = (depth: number) => PAD + 5 + depth * IND; // a stop's centre
export const rowMid = (row: number) => HEAD + row * ROW + ROW / 2;
export const textX = (depth: number) => stopX(depth) + IND + 4;

export interface Track {
  pts: [number, number][];
  kind: 'line' | 'then' | 'else' | 'bypass' | 'back' | 'exit';
  owner: number; // the station that lights it: the switch for branches, the lower station for plain line
}

export interface Plan {
  stations: Station[];
  rows: number;
  tracks: Track[];
  byLine: Map<number, number>; // row → station, for the running line
  w: number; // px
  h: number;
}

const one = (s: string) => s.replace(/\s+/g, ' ').trim();
const clipText = (s: string) => (s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1)}…` : s);
const unparen = (n: Node): Node => (n.type === 'parenthesized_expression' && n.namedChildCount === 1 ? n.namedChild(0)! : n);

// The parts of a condition that have a value in the frame: plain names and
// one-level member access. A callee, a sizeof or a subscripted array stays as written.
export function leavesOf(cond: Node): Leaf[] {
  const out: Leaf[] = [];
  const base = cond.startIndex;
  const walk = (n: Node) => {
    if (n.type === 'sizeof_expression') return;
    if (n.type === 'field_expression') {
      const a = n.childForFieldName('argument');
      const f = n.childForFieldName('field');
      if (a?.type === 'identifier' && f) out.push({ from: n.startIndex - base, to: n.endIndex - base, path: [a.text, f.text] });
      else if (a && f) {
        // a chain `p->next->len`: every step after the first goes through a
        // pointer (`->`); a nested struct (`a->b.c`) isn't read yet
        const fields: string[] = [];
        let x: Node | null = n;
        let arrows = true;
        while (x?.type === 'field_expression') {
          const xf = x.childForFieldName('field');
          if (!xf) break;
          fields.unshift(xf.text);
          const inner: Node | null = x.childForFieldName('argument');
          if (inner?.type === 'field_expression' && x.child(1)?.text !== '->') arrows = false;
          x = inner;
        }
        if (x?.type === 'identifier' && arrows && fields.length >= 2) out.push({ from: n.startIndex - base, to: n.endIndex - base, path: [x.text, fields[0]], chain: fields.slice(1) });
        else walk(a); // otherwise: only the inner part
      } else if (a) walk(a);
      return;
    }
    if (n.type === 'identifier') {
      out.push({ from: n.startIndex - base, to: n.endIndex - base, path: [n.text] });
      return;
    }
    // `*p`: what is read is the memory at p's address (the leaf covers `*p`)
    if (n.type === 'pointer_expression' && n.child(0)?.text === '*') {
      // `*p`, `**pp`: follow the addresses, one per star
      let a = n.childForFieldName('argument') ?? n.namedChild(0);
      let k = 1;
      while (a && a.type === 'pointer_expression' && a.child(0)?.text === '*') (a = a.childForFieldName('argument') ?? a.namedChild(0)), k++;
      if (a?.type === 'identifier') {
        out.push({ from: n.startIndex - base, to: n.endIndex - base, path: [a.text], deref: true, ...(k > 1 ? { derefs: k } : {}) });
        return;
      }
    }
    if (n.type === 'update_expression' || (n.type === 'pointer_expression' && n.child(0)?.text === '&')) {
      const inner: Leaf[] = [];
      const arg = n.childForFieldName('argument') ?? n.namedChild(0);
      if (arg) for (const l of leavesOf(arg)) inner.push({ ...l, from: l.from + arg.startIndex - base, to: l.to + arg.startIndex - base, keep: true });
      out.push(...inner);
      return;
    }
    if (n.type === 'call_expression') {
      const args = n.childForFieldName('arguments');
      if (args) walk(args);
      return;
    }
    if (n.type === 'subscript_expression') {
      const a = n.childForFieldName('argument') ?? n.namedChild(0);
      const i = n.childForFieldName('index') ?? n.namedChild(1);
      // `a[i]` with a plain index: the element is read (and i, to find it)
      if (a?.type === 'identifier' && i && plainIndex(i.text)) out.push({ from: n.startIndex - base, to: n.endIndex - base, path: [a.text], index: i.text });
      if (i) walk(i);
      return;
    }
    for (const c of n.namedChildren) if (c) walk(c);
  };
  walk(cond);
  return out;
}

// Offsets of `leaves` (relative to `node`) made relative to `base`.
const shift = (leaves: Leaf[], node: Node, base: number): Leaf[] => leaves.map((l) => ({ ...l, from: l.from + node.startIndex - base, to: l.to + node.startIndex - base }));

// What a statement reads. The plain target of `=` (`x = …`, `a->b = …`) is
// only written; an index or a pointer on the left is read to find the place.
function readsOf(n: Node): Leaf[] {
  const base = n.startIndex;
  if (n.type === 'declaration') {
    return n.namedChildren.flatMap((d) => {
      const v = d?.type === 'init_declarator' ? d.childForFieldName('value') : null;
      return v ? shift(leavesOf(v), v, base) : [];
    });
  }
  const e = n.type === 'expression_statement' || n.type === 'return_statement' ? n.namedChild(0) : n;
  if (!e) return [];
  if (e.type === 'assignment_expression') {
    const left = e.childForFieldName('left');
    const right = e.childForFieldName('right');
    const op = e.childForFieldName('operator')?.text ?? '=';
    const out = right ? shift(leavesOf(right), right, base) : [];
    // `*p = …` reads p (where to write), not *p: only `*p += …` reads what's there
    const whole = (l: Leaf) => op === '=' && l.from === 0 && l.to === left!.text.length;
    // `*p = …` / `p->next->len = …`: the addresses on the way are read to find the place
    const target = (l: Leaf): Leaf => (whole(l) && l.deref ? { ...l, deref: undefined, derefs: undefined, keep: true } : whole(l) && l.chain ? { ...l, chain: undefined, to: l.from + l.path.join('->').length, keep: true } : l);
    if (left && (op !== '=' || (left.type !== 'identifier' && left.type !== 'field_expression'))) out.unshift(...shift(leavesOf(left).filter((l) => !(whole(l) && l.index !== undefined)).map(target), left, base));
    return out;
  }
  return shift(leavesOf(e), e, base);
}

function callsOf(n: Node): string[] {
  const out: string[] = [];
  const walk = (x: Node) => {
    if (x.type === 'call_expression') {
      const f = x.childForFieldName('function');
      if (f?.type === 'identifier' && !out.includes(f.text)) out.push(f.text);
    }
    for (const c of x.namedChildren) if (c) walk(c);
  };
  walk(n);
  return out;
}

const planCache = new WeakMap<FnInfo, Plan>();

export function planOf(fn: FnInfo): Plan {
  const hit = planCache.get(fn);
  if (hit) return hit;
  const st: Station[] = [];
  let row = 0;
  const push = (s: Omit<Station, 'row' | 'end'>, rows = 1): number => {
    st.push({ ...s, row, end: st.length });
    row += rows;
    return st.length - 1;
  };
  const block = (n: Node | null, depth: number) => {
    if (!n) return;
    if (n.type === 'compound_statement') for (const c of n.namedChildren) c && stmt(c, depth);
    else stmt(n, depth);
  };
  const firstRow = (n: Node | null) => {
    if (!n) return -1;
    if (n.type !== 'compound_statement') return n.startPosition.row;
    const c = n.namedChildren.find((x) => x && x.type !== 'comment');
    return c ? c.startPosition.row : n.startPosition.row;
  };
  const sw = (n: Node, kind: 'if' | 'loop', condNode: Node, body: Node | null, depth: number, text: string, loop?: Station['loop']): number => {
    const c = unparen(condNode);
    const line = kind === 'loop' && loop === 'do' ? condNode.startPosition.row : n.startPosition.row;
    const b0 = firstRow(body);
    return push({
      kind, line, last: n.endPosition.row, text: clipText(text), depth, cond: c.text, leaves: leavesOf(c),
      body: body ? [body.startPosition.row, body.endPosition.row] : undefined,
      inferable: !!body && b0 !== line, loop, calls: callsOf(c),
    }, 2);
  };
  const stmt = (n: Node, depth: number) => {
    const simple = (kind: StationKind) => push({
      kind, line: n.startPosition.row, last: n.endPosition.row, text: clipText(one(n.text.split('\n')[0])), depth,
      src: n.text, reads: readsOf(n), calls: callsOf(n),
    });
    switch (n.type) {
      case 'comment':
      case ';':
        return;
      case 'declaration':
        // a plain declaration runs nothing; a static is set up before main
        if (!n.namedChildren.some((c) => c?.type === 'init_declarator')) return;
        if (n.namedChildren.some((c) => c?.type === 'storage_class_specifier' && c.text === 'static')) return;
        simple('do');
        return;
      case 'expression_statement':
        if (n.namedChild(0)) simple('do');
        return;
      case 'return_statement':
        simple('ret');
        return;
      case 'break_statement':
      case 'continue_statement':
      case 'goto_statement':
        simple('jump');
        return;
      case 'compound_statement':
        block(n, depth);
        return;
      case 'if_statement': {
        const cond = n.childForFieldName('condition')!;
        const cons = n.childForFieldName('consequence');
        const i = sw(n, 'if', cond, cons, depth, `if ${one(cond.text)}`);
        block(cons, depth + 1);
        const alt = n.childForFieldName('alternative');
        if (alt) {
          const body = alt.type === 'else_clause' ? alt.namedChild(0) : alt;
          push({ kind: 'else', line: alt.startPosition.row, last: alt.endPosition.row, text: 'else', depth, owner: i });
          block(body, depth + 1);
        }
        st[i].end = st.length - 1;
        return;
      }
      case 'while_statement': {
        const cond = n.childForFieldName('condition')!;
        const body = n.childForFieldName('body');
        const i = sw(n, 'loop', cond, body, depth, `while ${one(cond.text)}`, 'while');
        block(body, depth + 1);
        st[i].end = st.length - 1;
        return;
      }
      case 'for_statement': {
        const body = n.childForFieldName('body');
        const cond = n.childForFieldName('condition');
        const head = one(n.text.slice(0, body ? body.startIndex - n.startIndex : undefined));
        if (!cond) {
          simple('do');
          return;
        }
        const i = sw(n, 'loop', cond, body, depth, head, 'for');
        block(body, depth + 1);
        st[i].end = st.length - 1;
        return;
      }
      case 'do_statement': {
        // the body comes first; the switch sits at the bottom, where its condition is
        const body = n.childForFieldName('body');
        const cond = n.childForFieldName('condition')!;
        const first = st.length;
        push({ kind: 'do', line: n.startPosition.row, last: n.startPosition.row, text: 'do', depth });
        block(body, depth + 1);
        const i = sw(n, 'loop', cond, body, depth, `while ${one(cond.text)}`, 'do');
        st[first].end = i;
        return;
      }
      default:
        simple('do');
    }
  };
  block(fn.node.childForFieldName('body'), 0);
  push({ kind: 'end', line: fn.endLine, last: fn.endLine, text: '}', depth: 0 });

  // which station a running line belongs to
  const byLine = new Map<number, number>();
  st.forEach((s, i) => {
    if (s.kind === 'if' || s.kind === 'loop' || s.kind === 'end') byLine.set(s.line, i);
    else if (s.kind !== 'else') for (let r = s.line; r <= s.last; r++) if (!byLine.has(r)) byLine.set(r, i);
  });

  const x = stopX;
  const y = rowMid;
  const tracks: Track[] = [];
  // the line through each run of same-depth stations
  const next = (i: number) => {
    const s = st[i];
    for (let j = s.end + 1; j < st.length; j++) {
      if (st[j].depth < s.depth) return -1;
      if (st[j].depth === s.depth) return j;
    }
    return -1;
  };
  const rowY = (k: number) => y(st[k].row + (st[k].kind === 'if' || st[k].kind === 'loop' ? 1 : 0)); // a station's lowest row
  const lastAt = (from: number, to: number, depth: number) => {
    let k = -1;
    for (let q = from; q <= to; q++) if (st[q].depth === depth) k = q;
    return k;
  };
  st.forEach((s, i) => {
    const j = next(i);
    const sx = x(s.depth);
    const bx = x(s.depth + 1);
    if ((s.kind === 'if' || s.kind === 'loop') && s.loop !== 'do') {
      const inside = s.end > i && st[i + 1].depth > s.depth ? st[i + 1] : null;
      // for an if with an else, the then-branch ends before the else row
      const elseAt = s.kind === 'if' ? st.findIndex((t, k) => k > i && k <= s.end && t.kind === 'else' && t.owner === i) : -1;
      if (inside) {
        tracks.push({ kind: 'then', owner: i, pts: [[sx, y(s.row)], [sx, y(s.row) + ROW * 0.55], [bx, y(s.row) + ROW * 1.1], [bx, y(inside.row)]] });
        const lastIn = lastAt(i + 1, elseAt >= 0 ? elseAt - 1 : s.end, s.depth + 1);
        const low = rowY(elseAt >= 0 ? elseAt - 1 : s.end);
        const exits = st[lastIn].kind === 'ret' || st[lastIn].kind === 'jump';
        if (s.kind === 'loop') {
          // round the left of the main line and back into the switch
          const lx = sx - IND * 0.45;
          tracks.push({ kind: 'back', owner: i, pts: [[bx, y(st[lastIn].row)], [bx, low + ROW * 0.5], [lx, low + ROW * 0.5], [lx, y(s.row)], [sx - 4, y(s.row)]] });
        } else if (!exits) {
          // back onto the main line where the if is over
          const to = j >= 0 ? y(st[j].row) : rowY(s.end) + ROW;
          const mx = elseAt >= 0 ? bx - IND * 0.5 : sx;
          tracks.push({ kind: 'then', owner: i, pts: [[bx, y(st[lastIn].row)], [bx, low + ROW * 0.45], [mx, low + ROW * 0.8], [mx, to - ROW * 0.35], [sx, to]] });
        }
      }
    }
    if (s.kind === 'loop' && s.loop === 'do') {
      const top = st.findIndex((t, k) => k < i && t.kind === 'do' && t.end === i);
      if (top >= 0 && top + 1 < i) tracks.push({ kind: 'back', owner: i, pts: [[sx, y(s.row)], [sx - IND * 0.45, y(s.row) - ROW * 0.4], [sx - IND * 0.45, y(st[top + 1].row) + ROW * 0.3], [bx, y(st[top + 1].row)]] });
    }
    if (s.kind === 'else' && s.end > i) {
      tracks.push({ kind: 'else', owner: s.owner!, pts: [[sx, y(s.row)], [sx, y(s.row) + ROW * 0.3], [bx, y(s.row) + ROW * 0.8], [bx, y(st[i + 1].row)]] });
    }
    // on down the same line (a return or a jump leaves it)
    if (j >= 0 && s.kind !== 'ret' && s.kind !== 'jump') {
      const kind: Track['kind'] = s.kind === 'if' ? 'bypass' : s.kind === 'loop' && s.loop !== 'do' ? 'exit' : 'line';
      // an if with an else: the false way leads to the else row
      const elseAt = s.kind === 'if' ? st.findIndex((t, k) => k > i && t.kind === 'else' && t.owner === i) : -1;
      if (elseAt >= 0) {
        tracks.push({ kind, owner: i, pts: [[sx, y(s.row)], [sx, y(st[elseAt].row)]] });
        tracks.push({ kind: 'line', owner: j, pts: [[sx, y(st[elseAt].row)], [sx, y(st[j].row)]] });
      } else tracks.push({ kind, owner: kind === 'line' ? j : i, pts: [[sx, y(s.row)], [sx, y(st[j].row)]] });
    }
  });

  const maxText = Math.max(...st.map((s) => textX(s.depth) + s.text.length * CHAR), 0);
  const w = Math.max(160, Math.min(12 * CELL, maxText + 44 + PAD));
  const h = HEAD + row * ROW + PAD;
  const plan: Plan = { stations: st, rows: row, tracks, byLine, w, h };
  planCache.set(fn, plan);
  return plan;
}

// Grid cells the open interior takes under the frame panel.
export function interiorCells(fn: FnInfo): { w: number; h: number } {
  const p = planOf(fn);
  return { w: Math.ceil(p.w / CELL), h: Math.ceil((p.h + 8) / CELL) };
}

// ---------------- what the trace says ----------------

export interface Decision {
  at: number; // event index at which the result is known
  snap: number; // snapshot holding the operands as the condition read them
  result: boolean;
}

interface FrameRun {
  idx: number[]; // events of this frame, in order
  line: number[];
  decisions: Map<number, Decision[]>; // station → its results, in order
}

const runCache = new WeakMap<Trace, WeakMap<Plan, Map<number, FrameRun>>>();

function frameRun(trace: Trace, plan: Plan, frame: number): FrameRun {
  let byPlan = runCache.get(trace);
  if (!byPlan) runCache.set(trace, (byPlan = new WeakMap()));
  let m = byPlan.get(plan);
  if (!m) byPlan.set(plan, (m = new Map()));
  const hit = m.get(frame);
  if (hit) return hit;
  const run: FrameRun = { idx: [], line: [], decisions: new Map() };
  const add = (s: number, d: Decision) => {
    const list = run.decisions.get(s) ?? [];
    list.push(d);
    run.decisions.set(s, list);
  };
  const evs: Ev[] = trace.evs;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    if (e.frame !== frame) continue;
    // the interpreter's call event carries the caller's line
    if (e.k === 'call' && trace.engine === 'interp') continue;
    run.idx.push(i);
    run.line.push(e.line);
    if (e.k === 'eval') {
      const s = plan.byLine.get(e.line);
      if (s !== undefined) add(s, { at: i, snap: i, result: e.result });
    }
  }
  if (trace.engine === 'gdb') {
    // a switch went the way of the next line the frame ran
    for (let k = 0; k < run.line.length; k++) {
      const s = plan.byLine.get(run.line[k]);
      const station = s !== undefined ? plan.stations[s] : null;
      if (!station || (station.kind !== 'if' && station.kind !== 'loop') || !station.inferable) continue;
      let k2 = k;
      while (k2 + 1 < run.line.length && run.line[k2 + 1] === station.line) k2++;
      if (k2 + 1 >= run.line.length) break;
      const nl = run.line[k2 + 1];
      const [b0, b1] = station.body!;
      add(s!, { at: run.idx[k2 + 1], snap: run.idx[k2] + 1, result: nl >= b0 && nl <= b1 && nl !== station.line });
      k = k2;
    }
  }
  m.set(frame, run);
  return run;
}

export interface InteriorState {
  current: number | null; // station the running line is on
  visited: Set<number>; // stations this frame has reached so far
  decided: Map<number, { d: Decision; count: number | null }>; // switch → its latest result (and a loop's count)
  pending: number | null; // a switch the frame is on, its result not known yet
  // loop rounds as a whole: a loop's results this time through (in, in, …,
  // out), and an if inside it: its result in each of those rounds (null: not
  // reached that round). The last ROUNDS; `older` counts the rounds before.
  rounds: Map<number, { marks: (boolean | null)[]; older: number }>;
}

export const ROUNDS = 12;

// The state of `frame` (a frame of this plan's function) just before event `i` finishes.
export function interiorAt(trace: Trace, plan: Plan, frame: number, i: number): InteriorState {
  const run = frameRun(trace, plan, frame);
  const visited = new Set<number>();
  let current: number | null = null;
  let since = -1; // when the frame arrived on the current station
  for (let k = 0; k < run.idx.length && run.idx[k] <= i; k++) {
    const s = plan.byLine.get(run.line[k]);
    if (s === undefined) continue;
    visited.add(s);
    if (s !== current) since = run.idx[k];
    current = s;
  }
  // A statement the compiler drops (`(void)ac;`) has no line for gdb to stop
  // on, but it ran if the frame got to the next statement in its block (no
  // goto under the Norminette). From the back, so a run of them fills in.
  const st = plan.stations;
  for (let k = st.length - 1; k >= 0; k--) {
    if (visited.has(k) || st[k].kind !== 'do') continue;
    let j = k + 1;
    while (j < st.length && st[j].depth > st[k].depth) j++;
    if (j < st.length && st[j].depth === st[k].depth && visited.has(j)) visited.add(k);
  }
  // before the frame's first stop: the first station
  if (current === null && plan.stations.length) current = 0;
  const decided = new Map<number, { d: Decision; count: number | null }>();
  for (const [s, list] of run.decisions) {
    let count = 0;
    let done: number | null = null;
    let last: Decision | null = null;
    for (const d of list) {
      if (d.at > i) break;
      last = d;
      if (d.result) count++;
      else (done = count), (count = 0);
    }
    if (!last) continue;
    const loop = plan.stations[s].kind === 'loop';
    decided.set(s, { d: last, count: loop ? (last.result ? count : done) : null });
  }
  // on a switch whose result isn't known yet: the latest one is older than this visit
  const cur = current !== null ? plan.stations[current] : null;
  const pending = cur && (cur.kind === 'if' || cur.kind === 'loop') && (decided.get(current!)?.d.at ?? -1) < since ? current : null;
  // rounds: each loop's current time through (since it last exited, or its
  // last one if it has), then each switch inside it, round by round
  const rounds = new Map<number, { marks: (boolean | null)[]; older: number }>();
  const upTo = (k: number) => (run.decisions.get(k) ?? []).filter((d) => d.at <= i);
  for (let L = 0; L < st.length; L++) {
    if (st[L].kind !== 'loop') continue;
    const ds = upTo(L);
    if (!ds.length) continue;
    // the entry: back from the latest decision to just after the false before it
    let a = ds.length - 1;
    while (a > 0 && ds[a - 1].result) a--;
    const entry = ds.slice(a);
    const shown = entry.slice(-ROUNDS);
    const older = entry.length - shown.length;
    rounds.set(L, { marks: shown.map((d) => d.result), older });
    // the switches directly inside it (not inside a nested loop)
    for (let S = L + 1; S <= st[L].end; S++) {
      if (st[S].kind !== 'if') continue;
      let inner = false;
      for (let N = L + 1; N < S; N++) if (st[N].kind === 'loop' && S <= st[N].end) inner = true;
      if (inner) continue;
      const sd = upTo(S);
      rounds.set(S, {
        older,
        marks: shown.map((d, r) => {
          if (!d.result) return null; // the round that left: the body didn't run
          const next = shown[r + 1]?.at ?? (entry[entry.indexOf(d) + 1]?.at ?? Infinity);
          const hit = sd.find((x) => x.at > d.at && x.at <= next);
          return hit ? hit.result : null;
        }),
      });
    }
  }
  return { current, visited, decided, pending, rounds };
}
