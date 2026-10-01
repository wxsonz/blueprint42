// Playback logic with no drawing: sprite rects, playback timing, the return
// card, hosts (which node shows which frame) and M5.5 readouts and labels.
import type { Breakpoint } from './history';
import type { Layout } from './layout';
import type { Station } from './interior';
import { beatDuration, leafText } from './beats';
import type { Model } from './parse';
import { fmtVal, type Ev, type Payload, type Snap, type SnapFrame, type Trace, type V } from './interp';
import { buildScene, hostKey, type Belt, type Scene } from './route';
import { clip, fieldValue, pointeeName, valueOf } from './values';
import type { Pt, Rect, StripInfo } from './skins/types';
import type { BoundValue, Sprite } from './blueprint';
import type { Violation } from './invariants';

export type Entity =
  | { k: 'node'; id: string; copy?: number }
  | { k: 'belt'; key: string }
  | { k: 'static'; fn: string; name: string }
  | { k: 'sprite'; id: string }
  | { k: 'module'; file: string }
  | { k: 'proc' };

export const entKey = (e: Entity | null): string =>
  !e ? '' : e.k === 'node' ? `n:${e.id}` : e.k === 'belt' ? `b:${e.key}` : e.k === 'static' ? `s:${e.fn}.${e.name}` : e.k === 'sprite' ? `sp:${e.id}` : e.k === 'module' ? `m:${e.file}` : 'p';

export interface ViewState {
  layout: Layout;
  model: Model | null;
  trace: Trace | null;
  pos: number;
  selected: Entity | null;
  hovered: Entity | null;
  editorFn: string | null;
  sprites?: Sprite[];
  violations?: Violation[];
  defines?: string[]; // the run's -D flags (a sample's)…
  project?: { run: { defines: string[] } } | null; // …or a project's
  breaks?: Breakpoint[]; // statements playback pauses on (src/history.ts)
}

// World footprint is shared by drawing, fitting and hit testing. A sampled
// capacity can widen a strip, but unknown capacity never produces a fake size.
export function spriteWorldRect(sprite: Sprite, bound?: BoundValue): Rect {
  const cap = bound?.bound && Number.isFinite(bound.length) ? Math.max(0, bound.length!) : null;
  const width = sprite.kind === 'strip' ? cap === null ? 5.2 : Math.min(8.2, 4.4 + Math.log2(cap + 1) * 0.55) :
    sprite.kind === 'train' || sprite.kind === 'stack' ? 2.8 : 2.2;
  return { x: sprite.x, y: sprite.y, w: width, h: sprite.kind === 'strip' ? 2.35 : 1.55 };
}

export function spriteStripInfo(sprite: Sprite, trace: Trace | null, pos: number, selected = false, hovered = false): StripInfo {
  const fr = trace?.evs.length ? frameAt(trace, pos) : null;
  const sample = fr?.snap ?? trace?.snaps[0];
  const value = sample?.bound?.[sprite.id];
  const known = !!value?.bound && !value.error;
  const length = known && Number.isFinite(value.length) ? Math.max(0, value.length!) : null;
  const before = fr?.ev ? trace!.snaps[fr.i].bound?.[sprite.id] : undefined;
  const after = fr?.ev ? trace!.snaps[fr.i + 1].bound?.[sprite.id] : undefined;
  const sameBlock = !!before?.bound && !!after?.bound && before.pointer !== undefined && before.pointer !== null && before.pointer === after.pointer;
  const markers = known ? (value.markers ?? []).filter((m) => Number.isFinite(m.index)).map((m) => {
    const a = sameBlock ? before?.markers?.find((x) => x.label === m.label) : undefined;
    const b = sameBlock ? after?.markers?.find((x) => x.label === m.label) : undefined;
    return { label: m.label, index: a && b && Number.isFinite(a.index) && Number.isFinite(b.index) ? a.index + (b.index - a.index) * fr!.t : m.index, sampledIndex: m.index };
  }) : [];
  return {
    label: sprite.label || sprite.binding?.expr || 'strip', bound: known,
    bytes: known && Array.isArray(value.bytes) ? value.bytes.filter((b) => Number.isInteger(b) && b >= 0 && b <= 255) : [],
    length, pointer: known && Number.isFinite(value.pointer) ? value.pointer! : null,
    markers, error: value?.error, selected, hovered,
  };
}

// ---------------- playback timing ----------------
//
// Two ways to play (the author's call, see docs/decisions/):
// - fast: every event plays once, the camera only pans;
// - focus: a call, a return, or a write through a pointer becomes a small
//   scene. The sender is flagged, the data travels 2–3 times, the receiver
//   is flagged when it lands, and the rest of the grid is dimmed.

export type AnimMode = 'fast' | 'focus';
export let MODE: AnimMode = 'fast';
export const setAnimMode = (m: AnimMode) => void (MODE = m);
export const animMode = () => MODE;

// A focus scene, in seconds at 1×. A call (or a write through a pointer)
// waits at the sender to be read, travels once, then stays parked at the
// receiver while its frame fills in. A return first shows its card — what
// went in, what came out — over a dimmed grid, then sends the result back
// once and holds it at the caller. The more there is to read, the longer.
interface Scene3 { lead: number; pass: number; hold: number; total: number }
const sceneCache = new WeakMap<Ev, Scene3>();
const cardLines = new WeakMap<Ev, number>(); // filled by prepareStage()
const clampS = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export interface DuelEnd { at: Pt; rect: Rect | null; name: string }
export interface Duel { key: string; kind: 'call' | 'ret' | 'write'; i: number; beatFrom?: number; left: DuelEnd & { verb: string }; right: DuelEnd & { verb: string }; p: number; label: string }
export const clipCode = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
function sceneOf(e: Ev): Scene3 {
  let hit = sceneCache.get(e);
  if (hit) return hit;
  const weigh = (d?: Payload) => (!d ? 1 : d.k === 'struct' ? 1 + Math.min(6, d.fields.length) : 1 + Math.min(3, Math.floor(d.text.length / 16)));
  const pass = 1.1;
  if (e.k === 'ret') {
    const lines = cardLines.get(e) ?? weigh(e.data) + 2;
    const lead = clampS(1.8 + 0.35 * lines, 2.5, 7);
    const hold = clampS(0.9 + 0.25 * weigh(e.data), 1.2, 3);
    hit = { lead, pass, hold, total: lead + pass + hold };
  } else {
    const lines = e.k === 'call' ? Math.max(1, e.args.reduce((a, x) => a + weigh(x.data), 0)) : 1;
    const lead = clampS(1.2 + 0.4 * lines, 1.5, 5);
    const hold = clampS(1.0 + 0.3 * lines, 1.2, 4);
    hit = { lead, pass, hold, total: lead + pass + hold };
  }
  sceneCache.set(e, hit);
  return hit;
}

// ---- the return card: what went in, what came out ----

export interface CardRow {
  name: string;
  depth: 0 | 1; // 1 = a field of the row above
  in: string; // at the call
  out?: string; // at the return (only for what the caller can see: through pointers)
  changed?: boolean;
}
export interface ReturnCard {
  fn: string;
  caller: string | null;
  rows: CardRow[];
  ret: CardRow[]; // the result: one row, or a struct's fields
}

const cardCache = new WeakMap<Trace, Map<number, ReturnCard | null>>();
export function returnCard(trace: Trace, i: number): ReturnCard | null {
  let m = cardCache.get(trace);
  if (!m) cardCache.set(trace, (m = new Map()));
  if (m.has(i)) return m.get(i)!;
  const e = trace.evs[i];
  let card: ReturnCard | null = null;
  if (e?.k === 'ret') {
    let c = i - 1;
    while (c >= 0 && !(trace.evs[c].k === 'call' && trace.evs[c].frame === e.frame)) c--;
    const call = c >= 0 ? (trace.evs[c] as Extract<Ev, { k: 'call' }>) : null;
    const snapThen = call ? trace.snaps[c + 1] : null; // just after the call
    const snapNow = trace.snaps[i]; // just before the return
    const all = (sn: Snap | null) => new Map((sn ? [...sn.statics, ...sn.heap, ...sn.stack.flatMap((f) => f.cells)] : []).map((x) => [x.id, x]));
    const thenCells = all(snapThen);
    const nowCells = all(snapNow);
    const frameThen = snapThen?.stack.find((f) => f.id === e.frame);
    const frameNow = snapNow.stack.find((f) => f.id === e.frame);
    const rows: CardRow[] = [];
    for (const a of call?.args ?? []) {
      const c0 = frameThen?.cells.find((x) => x.name === a.name);
      const c1 = frameNow?.cells.find((x) => x.name === a.name);
      const viaPtr = a.val.k === 'ptr' && a.val.to !== null;
      if (c0?.fields?.length) {
        // a struct: its fields as they came in and, behind a pointer, as they go back
        rows.push({ name: a.name, depth: 0, in: a.data?.k === 'struct' ? a.data.via ?? a.data.type : c0.type });
        for (const f of c0.fields.slice(0, 8)) {
          const inText = fieldValue(f, trace).text;
          const f1 = viaPtr ? c1?.fields?.find((x) => x.name === f.name) : undefined;
          const outText = f1 ? fieldValue(f1, trace).text : undefined;
          rows.push({ name: f.name, depth: 1, in: inText, ...(outText !== undefined ? { out: outText, changed: outText !== inText } : {}) });
        }
      } else if (viaPtr && !c0?.str) {
        // int *n: what it pointed at, then and now
        const to = (a.val as { to: number }).to;
        const t0 = thenCells.get(to);
        const t1 = nowCells.get(to);
        const name = (a.val as { label?: string }).label ?? pointeeName(trace, to, null).split('.').pop();
        const v0 = t0 ? valueOf(t0, null, trace, null).text : '?';
        const v1 = t1 ? valueOf(t1, null, trace, null).text : undefined;
        rows.push({ name: a.name, depth: 0, in: `→${name} = ${v0}`, ...(v1 !== undefined ? { out: `→${name} = ${v1}`, changed: v1 !== v0 } : {}) });
      } else if (c0?.str || c1?.str) {
        // char *: the text it pointed at, then and now (a buffer may have been filled)
        const s0 = c0?.str ? clip(c0.str, 14) : a.text;
        const s1 = c1?.str ? clip(c1.str, 14) : undefined;
        rows.push({ name: a.name, depth: 0, in: s0, ...(s1 !== undefined ? { out: s1, changed: s1 !== s0 } : {}) });
      } else rows.push({ name: a.name, depth: 0, in: c0 ? valueOf(c0, null, trace, null).text : a.text });
    }
    const ret: CardRow[] = [];
    if (e.data?.k === 'struct') {
      ret.push({ name: 'returns', depth: 0, in: '', out: e.data.via ?? e.data.type });
      for (const f of e.data.fields.slice(0, 8)) ret.push({ name: f.name, depth: 1, in: '', out: f.text.startsWith('"') ? clip(f.text, 14) : f.text });
    } else if (e.data?.k === 'str') ret.push({ name: 'returns', depth: 0, in: '', out: clip(e.data.text, 18) });
    else ret.push({ name: 'returns', depth: 0, in: '', out: e.val.k === 'void' ? 'void' : retLabel(e.val, trace) });
    card = { fn: e.fn, caller: e.caller, rows, ret };
  }
  m.set(i, card);
  return card;
}

// Size each return's card, so its scene lasts long enough to read.
export function prepareStage(trace: Trace | null): void {
  if (!trace) return;
  trace.evs.forEach((e, i) => {
    if (e.k !== 'ret') return;
    const c = returnCard(trace, i);
    if (c) cardLines.set(e, c.rows.length + c.ret.length);
  });
}

// Events that get a focus scene.
export function staged(e: Ev | null): boolean {
  return MODE === 'focus' && !!e && (e.k === 'call' || e.k === 'ret');
}

// How long event i takes at 1×: a statement's share of its beat (every
// machine animates its statements), or the event kind's own time (calls and
// returns ride the belts).
export function durationAt(trace: Trace, model: Model | null, i: number): number {
  const b = model ? beatDuration(trace, model, i, MODE) : null;
  return b ?? evDuration(trace.evs[i]);
}

export function evDuration(e: Ev): number {
  if (staged(e)) return sceneOf(e).total;
  if (MODE === 'focus' && e.k === 'step') return 0.16;
  switch (e.k) {
    case 'call':
    case 'ret':
      return 1.05;
    case 'write':
      return e.via !== null ? 0.9 : 0.55;
    case 'eval':
      return 0.45;
    case 'error':
      return 0.6;
    case 'step':
      return 0.24;
    case 'alloc':
      return 0.6;
    case 'free':
      return 0.55;
    case 'out':
      return 0.7;
    case 'in':
      return 0.7;
  }
}

export function switchAt(e: Ev): number {
  switch (e.k) {
    case 'call':
      return 0.78;
    case 'ret':
      return 0.92;
    case 'write':
      return e.via !== null ? 0.62 : 0.3;
    case 'alloc':
      return 0.35;
    case 'free':
      return 0.7;
    default:
      return 0;
  }
}

// Where an event's animation is at local time t (0..1).
export interface Phase {
  travel: number; // 0..1 along the belt or wire, this pass
  pass: number;
  passes: number;
  switched: boolean; // the state after the event is showing
  before: number; // 0..1 progress up to the switch
  after: number; // 0..1 progress after the switch
  lead: number; // 0..1 through the wait at the sender (focus)
  land: number; // 1..0 through the wait at the receiver (focus)
  parked: 'read' | 'card' | 'hold' | null; // focus: standing still to be read (card: a return's in/out card)
  secs: number; // seconds into the current wait, for blinking
}

export function phaseOf(e: Ev, t: number): Phase {
  if (!staged(e)) {
    const sw = switchAt(e);
    const switched = t >= sw;
    return {
      travel: sw ? Math.min(1, t / sw) : 1, pass: 0, passes: 1, switched,
      before: sw ? Math.min(1, t / sw) : 1, after: switched ? (sw < 1 ? (t - sw) / (1 - sw) : 1) : 0, lead: 0, land: 0, parked: null, secs: 0,
    };
  }
  const T = sceneOf(e);
  const sec = t * T.total;
  const arrive = T.lead + T.pass;
  const waiting = e.k === 'ret' ? 'card' : 'read';
  if (sec < T.lead) return { travel: 0, pass: 0, passes: 1, switched: false, before: sec / arrive, after: 0, lead: sec / T.lead, land: 0, parked: waiting, secs: sec };
  if (sec < arrive) return { travel: (sec - T.lead) / T.pass, pass: 0, passes: 1, switched: false, before: sec / arrive, after: 0, lead: 0, land: 0, parked: null, secs: 0 };
  const after = (sec - arrive) / T.hold;
  return { travel: 1, pass: 0, passes: 1, switched: true, before: 1, after, lead: 0, land: 1 - after, parked: 'hold', secs: sec - arrive };
}

export function frameAt(trace: Trace, pos: number): { snap: Snap; ev: Ev | null; t: number; i: number; si: number; ph: Phase | null } {
  const n = trace.evs.length;
  const p = Math.max(0, Math.min(pos, n));
  const i = Math.floor(p);
  const t = p - i;
  const ev = t > 0 && i < n ? trace.evs[i] : null;
  const ph = ev ? phaseOf(ev, t) : null;
  const si = ph?.switched ? i + 1 : i;
  return { snap: trace.snaps[si], ev, t, i, si, ph };
}

// The last frame a function had before snapshot `si`, if it has returned.
const retCache = new WeakMap<Trace, { at: number; fn: string; frame: SnapFrame }[]>();
// The return a frame made, once playback has reached it: its value, and the
// event index (so the panel can light up while it leaves).
const retByFrame = new WeakMap<Trace, Map<number, { at: number; val: V }>>();
export function returnOf(trace: Trace, frameId: number | null, pos: number): { at: number; val: V } | null {
  if (frameId === null) return null;
  let m = retByFrame.get(trace);
  if (!m) {
    m = new Map();
    trace.evs.forEach((e, j) => { if (e.k === 'ret' && e.frame != null) m!.set(e.frame, { at: j, val: e.val }); });
    retByFrame.set(trace, m);
  }
  const r = m.get(frameId);
  return r && r.at < pos ? r : null;
}

export function lastReturned(trace: Trace, fn: string, si: number): SnapFrame | null {
  let list = retCache.get(trace);
  if (!list) {
    list = [];
    trace.evs.forEach((e, j) => {
      if (e.k !== 'ret') return;
      const f = trace.snaps[j].stack.find((x) => x.id === e.frame);
      if (f) list!.push({ at: j + 1, fn: e.fn, frame: f });
    });
    retCache.set(trace, list);
  }
  for (let k = list.length - 1; k >= 0; k--) if (list[k].fn === fn && list[k].at <= si) return list[k].frame;
  return null;
}

// ---------------- hosts: which node shows which frame ----------------

// The first live frame of a function lives on its home node; each deeper
// one on the next spawned copy (the last copy absorbs any overflow).
export function frameHosts(snap: Snap | null, scene: Scene): Map<number, string> {
  const out = new Map<number, string>();
  const count = new Map<string, number>();
  for (const f of snap?.stack ?? []) {
    const mk = scene.moduleOf.get(f.fn);
    if (mk) {
      out.set(f.id, mk);
      continue;
    }
    const k = (count.get(f.fn) ?? 0) + 1;
    count.set(f.fn, k);
    out.set(f.id, hostKey(f.fn, Math.min(k, scene.copies.get(f.fn) ?? 1)));
  }
  return out;
}

export function liveHostPairs(snap: Snap | null, hosts: Map<number, string>): [string, string][] {
  const st = snap?.stack ?? [];
  const out: [string, string][] = [];
  if (st.length) out.push(['', hosts.get(st[0].id)!]);
  for (let i = 0; i + 1 < st.length; i++) {
    const [a, b] = [hosts.get(st[i].id)!, hosts.get(st[i + 1].id)!];
    if (a !== b) out.push([a, b]); // a call inside one collapsed module has no belt
  }
  return out;
}

// The belt an animating call/return travels on, as host keys.
export function eventPair(trace: Trace, i: number, ev: Ev, base: Scene): [string, string] | null {
  if (ev.k !== 'call' && ev.k !== 'ret') return null;
  const snap = ev.k === 'call' ? trace.snaps[i + 1] : trace.snaps[i];
  const hosts = frameHosts(snap, base);
  const idx = snap.stack.findIndex((f) => f.id === ev.frame);
  if (idx < 0) return null;
  const caller = idx > 0 ? hosts.get(snap.stack[idx - 1].id)! : '';
  const callee = hosts.get(snap.stack[idx].id)!;
  return caller === callee ? null : [caller, callee];
}

// Scene for the current playback position, including belts that only exist
// while a call between copies is live.
export function sceneAt(s: ViewState): Scene {
  const base = buildScene(s.layout, s.model, s.trace);
  if (!s.trace || !s.trace.evs.length) return base;
  const fr = frameAt(s.trace, s.pos);
  const pairs = liveHostPairs(fr.snap, frameHosts(fr.snap, base));
  if (fr.ev) {
    const p = eventPair(s.trace, fr.i, fr.ev, base);
    if (p) pairs.push(p);
  }
  const keys = new Set(base.belts.map((b) => b.key));
  const extra = pairs.filter(([a, b]) => a !== '' && !keys.has(`${a}>${b}`));
  return extra.length ? buildScene(s.layout, s.model, s.trace, extra) : base;
}

export function computeBelts(layout: Layout, model: Model | null, trace: Trace | null = null): Belt[] {
  return buildScene(layout, model, trace).belts;
}

// Where a belt's drag handle sits: the middle of its middle leg.
export function beltHandle(b: Belt): Pt {
  if (b.pts.length >= 4) {
    const [a, c] = [b.pts[1], b.pts[2]];
    return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  }
  const [a, c] = [b.pts[0], b.pts[b.pts.length - 1]];
  return [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
}


// ---------------- M5.5: inside a machine ----------------

// A switch's condition with the values it read: `buf->pos == buf->len` → `6 == 8`.
// Only names and one-level members are replaced; everything else stays as written.
export function readoutOf(sw: Station, trace: Trace, snap: Snap | null, frameId: number, fn: string): string {
  const raw = sw.cond ?? '';
  if (!snap) return '';
  const f = snap.stack.find((x) => x.id === frameId) ?? null;
  let out = raw;
  // an element read replaces `a[i]` whole: the index inside isn't replaced first
  const leaves = sw.leaves ?? [];
  const whole = leaves.filter((l) => l.index !== undefined && leafText(l, fn, f, snap, trace) !== null);
  for (const leaf of [...leaves].sort((a, b) => b.from - a.from)) {
    if (!whole.includes(leaf) && whole.some((w) => leaf.from >= w.from && leaf.to <= w.to)) continue;
    const text = leafText(leaf, fn, f, snap, trace);
    if (text !== null) out = out.slice(0, leaf.from) + text + out.slice(leaf.to);
  }
  return out === raw ? '' : out.replace(/\s+/g, ' ').trim();
}


// A pointer argument shows what it points at when that is a plain value (→a = 3).
export function argLabel(v: V, text: string, trace: Trace, snap: Snap | null): string {
  if (v.k === 'ptr') {
    if (v.to === null) return 'NULL';
    const name = v.label ?? pointeeName(trace, v.to, null).split('.').pop();
    const target = snap ? [...snap.statics, ...snap.stack.flatMap((f) => f.cells)].find((c) => c.id === v.to) : undefined;
    if (target?.val.k === 'int' && !v.label) return `→${name} = ${fmtVal(target.val, target.type)}`;
    if (target?.str) return target.str;
    return `→${name}`;
  }
  return fmtVal(v) === text ? text : fmtVal(v);
}


export function retLabel(v: V, trace: Trace): string {
  if (v.k === 'ptr') return v.to === null ? 'NULL' : `→${pointeeName(trace, v.to, null)}`;
  return fmtVal(v);
}

