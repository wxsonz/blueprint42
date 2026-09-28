// Grid engine: camera, hosts, hit-testing and playback timing. Routing lives
// in route.ts; every pixel is delegated to the active skin (skins/*.ts).
import { CELL_PX, INV_HEAD_PX, MH, MOD_DOORS, MW, SLOT_PX, doorsOf, frameRows, type Layout } from './layout';
import { HEAD, ROW, interiorAt, planOf, rowMid, stopX, textX, type InteriorState, type Plan, type Station } from './interior';
import { beatDuration, beatNow, computeText, readsOf, READ_END, slotValue, writesOf, type BeatNow } from './beats';
import { geomOf, shut, slotsOf, slotY } from './machine';
import type { FnInfo } from './parse';
import type { Host } from './route';
import type { Model } from './parse';
import { fmtVal, type Ev, type Payload, type Snap, type SnapCell, type SnapFrame, type Trace, type V } from './interp';
import { buildScene, crossings, hostKey, isModuleKey, procPlace, type Belt, type Scene } from './route';
import { clip, fieldValue, pointeeName, staticCellId, valueOf } from './values';
import type { CrateInfo, Dc, InteriorInfo, Pt, Rect, RowInfo, RunState, Skin, StationInfo, StripInfo } from './skins/types';
import type { BoundValue, Sprite } from './blueprint';
import type { Violation } from './invariants';

export { procPlace, type Belt };
export { clip, pointeeName } from './values';

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
// Two ways to play (the author's call, see DECISIONS.md):
// - fast: every event plays once, the camera only pans;
// - focus: a call, a return, or a write through a pointer becomes a small
//   scene. The sender is flagged, the data travels 2–3 times, the receiver
//   is flagged when it lands, and the rest of the grid is dimmed.

export type AnimMode = 'fast' | 'focus';
let MODE: AnimMode = 'fast';
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
const clipCode = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
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
  }
}

function switchAt(e: Ev): number {
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

function liveHostPairs(snap: Snap | null, hosts: Map<number, string>): [string, string][] {
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
function eventPair(trace: Trace, i: number, ev: Ev, base: Scene): [string, string] | null {
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

// Where a belt crosses a module's wall: [point, whether the wall edge is vertical].
function wallCrossings(pts: Pt[], r: Rect): [Pt, boolean][] {
  const out: [Pt, boolean][] = [];
  const between = (v: number, a: number, b: number) => v > Math.min(a, b) + 1e-6 && v < Math.max(a, b) - 1e-6;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [[x0, y0], [x1, y1]] = [pts[i], pts[i + 1]];
    for (const ex of [r.x, r.x + r.w]) {
      if (!between(ex, x0, x1)) continue;
      const y = y0 + ((ex - x0) / (x1 - x0)) * (y1 - y0);
      if (y > r.y && y < r.y + r.h) out.push([[ex, y], true]);
    }
    for (const ey of [r.y, r.y + r.h]) {
      if (!between(ey, y0, y1)) continue;
      const x = x0 + ((ey - y0) / (y1 - y0)) * (x1 - x0);
      if (x > r.x && x < r.x + r.w) out.push([[x, ey], false]);
    }
  }
  return out;
}

function distToPolyline(pts: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

// Hit-test in world units. Topmost first: nodes (and live copies), chests, the process, belts.
export function entityAt(s: ViewState, wx: number, wy: number): Entity | null {
  const sample = s.trace?.evs.length ? frameAt(s.trace, s.pos).snap : s.trace?.snaps[0];
  for (const sprite of [...(s.sprites ?? [])].reverse()) {
    const r = spriteWorldRect(sprite, sample?.bound?.[sprite.id]);
    if (wx >= r.x && wx < r.x + r.w && wy >= r.y && wy < r.y + r.h) return { k: 'sprite', id: sprite.id };
  }
  const node = s.layout.at(wx, wy);
  if (node) return { k: 'node', id: node.id };
  const mod = s.layout.moduleAt(wx, wy);
  if (mod?.header) return { k: 'module', file: mod.file };
  const scene = sceneAt(s);
  const fr = s.trace && s.trace.evs.length ? frameAt(s.trace, s.pos) : null;
  const live = new Set(frameHosts(fr?.snap ?? null, scene).values());
  for (const h of scene.hosts.values()) {
    if (h.copy < 2 || !live.has(h.key)) continue;
    if (wx >= h.x && wx < h.x + h.w && wy >= h.y && wy < h.y + h.h) return { k: 'node', id: `func:${h.fn}`, copy: h.copy };
  }
  const pp = procPlace(s.layout);
  if (pp && wx >= pp.x && wx < pp.x + MW && wy >= pp.y && wy < pp.y + MH) return { k: 'proc' };
  let best: Belt | null = null;
  let bestD = 0.3;
  for (const b of scene.belts) {
    if (b.transient) continue;
    const d = distToPolyline(b.pts, wx, wy);
    if (d < bestD) (best = b), (bestD = d);
  }
  return best ? { k: 'belt', key: best.key } : null;
}

// Heap blocks sit on a shelf under the process, one row per slot.
export function heapSlotRect(layout: Layout, slot: number): Rect | null {
  const pp = procPlace(layout);
  return pp ? { x: pp.x, y: pp.y + MH + 1.2 + slot * 1.1, w: 1, h: 1 } : null;
}

// Focus mode: world rect of who sends ('src'), who receives ('dst'), or
// both, for event i (a call, a return or a write through a pointer), for
// the camera to frame.
export function stageRect(s: ViewState, i: number, which: 'src' | 'dst' | 'both' = 'both'): Rect | null {
  const ev = s.trace?.evs[i];
  if (!s.trace || !ev) return null;
  const scene = buildScene(s.layout, s.model, s.trace);
  const hostR = (k: string): Rect | null => {
    if (k === '') {
      const pp = procPlace(s.layout);
      return pp ? { x: pp.x, y: pp.y, w: MW, h: MH } : null;
    }
    const h = scene.hosts.get(k);
    return h ? { x: h.x, y: h.y, w: h.w, h: h.h + h.inv } : null;
  };
  let src: Rect | null = null;
  let dst: Rect | null = null;
  if (ev.k === 'call' || ev.k === 'ret') {
    const pair = eventPair(s.trace, i, ev, scene);
    if (!pair) return null;
    // a call goes caller → callee, a return callee → caller
    [src, dst] = (ev.k === 'call' ? pair : [pair[1], pair[0]]).map(hostR);
  } else if (ev.k === 'write' && ev.via !== null) {
    // a write through a pointer: the frame holding the pointer → where it points
    // (a static's chest on its home node, a heap block, or another frame)
    const snap = s.trace.snaps[i];
    const hosts = frameHosts(snap, scene);
    const frameOf = (id: number) => snap.stack.find((f) => f.cells.some((c) => c.id === id));
    const via = frameOf(ev.via);
    src = via ? hostR(hosts.get(via.id) ?? '') : null;
    const to = frameOf(ev.cell);
    if (to) dst = hostR(hosts.get(to.id) ?? '');
    else if (s.trace.heapSlots?.has(ev.cell)) dst = heapSlotRect(s.layout, s.trace.heapSlots.get(ev.cell)!);
    else {
      const c = s.trace.cells.get(ev.cell);
      const n = c ? s.layout.visible().find((x) => x.name === c.owner) : undefined;
      const idx = n?.fn?.statics.findIndex((v) => v.name === c!.name) ?? -1;
      if (n && idx >= 0) dst = { x: n.place.x + idx, y: n.place.y - 2, w: 1, h: 1 };
    }
  } else return null;
  const rects = (which === 'src' ? [src] : which === 'dst' ? [dst] : [src, dst]).filter((r): r is Rect => !!r);
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x)), y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w)), y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// World rect of the host running the top frame, for the follow camera.
export function activeHostRect(s: ViewState): Rect | null {
  if (!s.trace || !s.trace.evs.length) return null;
  const scene = sceneAt(s);
  const fr = frameAt(s.trace, s.pos);
  let id: number | null = fr.snap.stack.at(-1)?.id ?? null;
  let snap = fr.snap;
  if (fr.ev?.k === 'call') (snap = s.trace.snaps[fr.i + 1]), (id = fr.ev.frame);
  if (id === null) return null;
  const h = scene.hosts.get(frameHosts(snap, scene).get(id) ?? '');
  if (!h) return null;
  // a big machine: keep the statement it's on in view, with its storage
  const fn = h.module ? null : s.model?.byName.get(h.fn);
  if (!fn || fn.broken || shut.has(fn.name)) return { x: h.x, y: h.y, w: h.w, h: h.h };
  const g = geomOf(fn);
  const plan = planOf(fn);
  const cur = interiorAt(s.trace, plan, id, Math.floor(s.pos)).current;
  const sy = cur !== null ? g.stations.y + (rowMid(plan.stations[cur].row) * g.stations.zoom) / CELL_PX : g.entryY;
  const y0 = Math.min(0, sy - 3);
  return { x: h.x, y: h.y + y0, w: h.w, h: Math.max(sy + 3, Math.min(h.h, 8)) - y0 };
}

// ---------------- M5.5: inside a machine ----------------

// A switch's condition with the values it read: `buf->pos == buf->len` → `6 == 8`.
// Only names and one-level members are replaced; everything else stays as written.
export function readoutOf(sw: Station, trace: Trace, snap: Snap | null, frameId: number, fn: string): string {
  const raw = sw.cond ?? '';
  const f = snap?.stack.find((x) => x.id === frameId) ?? null;
  const cellOf = (name: string): SnapCell | null => {
    const c = f?.cells.find((x) => x.name === name);
    if (c) return c;
    const id = staticCellId(trace, fn, name);
    return id !== null ? snap?.statics.find((x) => x.id === id) ?? null : null;
  };
  let out = raw;
  for (const leaf of [...(sw.leaves ?? [])].sort((a, b) => b.from - a.from)) {
    const c = cellOf(leaf.path[0]);
    let text: string | null = null;
    if (c && leaf.path.length === 1) text = valueOf(c, f, trace, null).text;
    else if (c && leaf.path.length === 2) {
      const fld = c.fields?.find((x) => x.name === leaf.path[1]);
      if (fld) text = fieldValue(fld, trace).text;
    }
    if (text !== null) out = out.slice(0, leaf.from) + text + out.slice(leaf.to);
  }
  return out === raw ? '' : out.replace(/\s+/g, ' ').trim();
}

function interiorInfo(
  plan: Plan, state: InteriorState | null,
  o: {
    x: number; y: number; z: number; title: string; mode: InteriorInfo['mode']; readout: (sw: Station, snap: number | null) => string;
    override?: { station: number; text: string; result: boolean | null } | null; // the switch being worked right now
    hot?: { station: number; text: string } | null; // a statement showing the values it read
  },
): InteriorInfo {
  const P = (px: number, py: number): Pt => [o.x + px * o.z, o.y + py * o.z];
  const live = o.mode === 'live';
  const stations: StationInfo[] = plan.stations.map((st, i) => {
    let readout: StationInfo['readout'] = null;
    if (o.override?.station === i) readout = { text: o.override.text, result: o.override.result };
    else if ((st.kind === 'if' || st.kind === 'loop') && state) {
      const dec = state.decided.get(i);
      if (state.pending === i && live) {
        const v = o.readout(st, null);
        readout = { text: `${v ? `${v} ` : ''}→ …`, result: null };
      } else if (dec) {
        const v = o.readout(st, dec.d.snap);
        readout = { text: `${v ? `${v} ` : ''}→ ${dec.d.result}`, result: dec.d.result };
      }
    }
    const [x, y] = P(stopX(st.depth), rowMid(st.row));
    const hot = o.hot?.station === i;
    return {
      kind: st.kind, text: hot ? o.hot!.text : st.text, hot, x, y, textX: o.x + textX(st.depth) * o.z, readout,
      count: st.kind === 'loop' && state ? state.decided.get(i)?.count ?? null : null,
      state: !state ? 'idle' : state.current === i && live ? 'current' : state.visited.has(i) ? 'visited' : 'idle',
    };
  });
  const tracks = plan.tracks.map((t) => {
    const dec = state?.decided.get(t.owner);
    const lit = !state ? false
      : t.kind === 'line' ? state.visited.has(t.owner)
      : t.kind === 'then' ? dec?.d.result === true
      : t.kind === 'back' ? (dec?.count ?? 0) > 0 || (plan.stations[t.owner].loop === 'do' && dec?.d.result === true)
      : dec?.d.result === false;
    return { pts: t.pts.map(([px, py]) => P(px, py)), lit, back: t.kind === 'back' };
  });
  const cur = state?.current ?? null;
  const token = live && cur !== null ? P(stopX(plan.stations[cur].depth), rowMid(plan.stations[cur].row)) : null;
  return { title: o.title, mode: o.mode, stations, tracks, token, row: ROW * o.z, head: { x: o.x, y: o.y, w: plan.w * o.z, h: HEAD * o.z } };
}

// The struct row a click lands on (to fold or unfold it), in world units.
export function foldAt(s: ViewState, wx: number, wy: number): { fn: string; name: string } | null {
  const scene = sceneAt(s);
  for (const h of scene.hosts.values()) {
    const fn = h.module ? null : s.model?.byName.get(h.fn) ?? null;
    if (!fn || fn.broken || shut.has(fn.name)) continue;
    const g = geomOf(fn);
    if (wx < h.x + g.store.x || wx >= h.x + g.store.x + g.store.w) continue;
    const rows = frameRows(fn);
    const top = h.y + g.store.y + INV_HEAD_PX / CELL_PX;
    const i = Math.floor((wy - top) / (SLOT_PX / CELL_PX));
    if (i >= 0 && i < rows.length && rows[i].fold) return { fn: h.fn, name: rows[i].name };
  }
  return null;
}

// A machine's title bar or motor (where a double-click opens or closes it).
export function machineHeadAt(s: ViewState, wx: number, wy: number): string | null {
  const scene = sceneAt(s);
  for (const h of scene.hosts.values()) {
    const fn = h.module ? null : s.model?.byName.get(h.fn) ?? null;
    if (!fn || wx < h.x || wx >= h.x + h.w || wy < h.y || wy >= h.y + h.h) continue;
    if (shut.has(fn.name)) return fn.name;
    const g = fn.broken ? null : geomOf(fn);
    if (!g) return fn.name;
    const m = g.motor;
    if (wy < h.y + g.head + 0.2 || (wx >= h.x + m.x && wx < h.x + m.x + m.w && wy >= h.y + m.y && wy < h.y + m.y + m.h)) return fn.name;
    return null;
  }
  return null;
}

// The statement a point inside a machine is on: its function and line.
export function stationAt(s: ViewState, wx: number, wy: number): { fn: string; line: number } | null {
  const scene = sceneAt(s);
  for (const h of scene.hosts.values()) {
    const fn = h.module ? null : s.model?.byName.get(h.fn) ?? null;
    if (!fn || fn.broken || shut.has(fn.name)) continue;
    const g = geomOf(fn);
    const lx = (wx - h.x - g.stations.x) * CELL_PX / g.stations.zoom;
    const ly = (wy - h.y - g.stations.y) * CELL_PX / g.stations.zoom;
    const plan = planOf(fn);
    if (lx < 0 || lx > plan.w || ly < HEAD || ly > plan.h) continue;
    const row = Math.floor((ly - HEAD) / ROW);
    let hit: Station | null = null;
    for (const st of plan.stations) if (st.row <= row && st.kind !== 'else') hit = st;
    return hit ? { fn: fn.name, line: hit.line } : null;
  }
  return null;
}

// A pointer argument shows what it points at when that is a plain value (→a = 3).
function argLabel(v: V, text: string, trace: Trace, snap: Snap | null): string {
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

function crateOf(d: Extract<Payload, { k: 'struct' }>, kind: 'arg' | 'ret'): CrateInfo {
  const MAX = 6;
  return { title: d.type, via: d.via, rows: d.fields.slice(0, MAX).map((f) => ({ name: f.name, value: f.text.startsWith('"') ? clip(f.text, 18) : f.text })), more: Math.max(0, d.fields.length - MAX), kind };
}

function retLabel(v: V, trace: Trace): string {
  if (v.k === 'ptr') return v.to === null ? 'NULL' : `→${pointeeName(trace, v.to, null)}`;
  return fmtVal(v);
}

function bez(c: [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  const f = (i: 0 | 1) => u * u * u * c[0][i] + 3 * u * u * t * c[1][i] + 3 * u * t * t * c[2][i] + t * t * t * c[3][i];
  return [f(0), f(1)];
}

interface Anchor {
  y: number;
  left: number;
  right: number;
}

class PathWalk {
  private segs: { x: number; y: number; dx: number; dy: number; len: number; at: number }[] = [];
  length = 0;
  constructor(pts: Pt[]) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x, y] = pts[i];
      const [x2, y2] = pts[i + 1];
      const len = Math.hypot(x2 - x, y2 - y);
      if (len < 1e-6) continue;
      this.segs.push({ x, y, dx: (x2 - x) / len, dy: (y2 - y) / len, len, at: this.length });
      this.length += len;
    }
  }
  at(d: number): Pt {
    d = Math.max(0, Math.min(d, this.length));
    for (const s of this.segs) if (d <= s.at + s.len) return [s.x + s.dx * (d - s.at), s.y + s.dy * (d - s.at)];
    const s = this.segs[this.segs.length - 1];
    return s ? [s.x + s.dx * s.len, s.y + s.dy * s.len] : [0, 0];
  }
}

// ---------------- the view ----------------

export class GridView {
  private g: CanvasRenderingContext2D;
  private dpr = 1;
  w = 0;
  h = 0;
  cam = { x: -2, y: -3, zoom: 1 };
  private target = { x: -2, y: -3, zoom: 1 };
  private last = performance.now();

  constructor(private canvas: HTMLCanvasElement, private lens = false) {
    this.g = canvas.getContext('2d')!;
  }

  // An off-screen view (a lens) has no layout box: its size is set here.
  setSize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    if (this.canvas.width !== Math.round(w * dpr)) this.canvas.width = Math.round(w * dpr);
    if (this.canvas.height !== Math.round(h * dpr)) this.canvas.height = Math.round(h * dpr);
  }

  get cs(): number {
    return CELL_PX * this.cam.zoom;
  }

  // Canvas pixels per CSS pixel, at most the screen's: lowered when the
  // browser can't paint fast enough (painting is most of the cost).
  scale = 0;

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const screen = window.devicePixelRatio || 1;
    this.dpr = this.scale > 0 ? Math.min(screen, this.scale) : screen;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }

  get pixelScale(): number {
    return this.dpr;
  }

  toWorld(px: number, py: number): Pt {
    return [px / this.cs + this.cam.x, py / this.cs + this.cam.y];
  }

  panPx(dx: number, dy: number): void {
    this.cam.x -= dx / this.cs;
    this.cam.y -= dy / this.cs;
    this.target.x = this.cam.x;
    this.target.y = this.cam.y;
  }

  zoomAt(px: number, py: number, f: number): void {
    const [wx, wy] = this.toWorld(px, py);
    const z = Math.max(0.02, Math.min(2.5, this.cam.zoom * f));
    this.cam.zoom = this.target.zoom = z;
    this.cam.x = this.target.x = wx - px / (CELL_PX * z);
    this.cam.y = this.target.y = wy - py / (CELL_PX * z);
  }

  ensureVisible(x: number, y: number, w: number, h: number, margin = 1.5): void {
    const cs = CELL_PX * this.target.zoom;
    const vw = this.w / cs;
    const vh = this.h / cs;
    if (x - margin < this.target.x) this.target.x = x - margin;
    else if (x + w + margin > this.target.x + vw) this.target.x = x + w + margin - vw;
    if (y - margin < this.target.y) this.target.y = y - margin;
    else if (y + h + margin > this.target.y + vh) this.target.y = y + h + margin - vh;
  }

  // Focus mode: glide to frame a rect, zooming in (within limits) to fill the view.
  focusOn(r: Rect, pad = 1.6): void {
    const top = 64;
    const bottom = 64;
    const zx = this.w / ((r.w + pad * 2) * CELL_PX);
    const zy = (this.h - top - bottom) / ((r.h + pad * 2) * CELL_PX);
    this.target.zoom = Math.max(0.55, Math.min(1.35, zx, zy));
    const cs = CELL_PX * this.target.zoom;
    this.target.x = r.x + r.w / 2 - this.w / (2 * cs);
    this.target.y = r.y + r.h / 2 - (top + (this.h - top - bottom) / 2) / cs;
  }

  // Where a run starts, close enough to read the machines' insides: the
  // process and main, at the left. Falls back to fitting everything.
  home(s: ViewState, instant = false): void {
    const pp = procPlace(s.layout);
    if (!pp) return this.fit(s, instant);
    const zoom = Math.max(0.6, Math.min(1, this.h / (14 * CELL_PX)));
    const cs = CELL_PX * zoom;
    this.target.zoom = zoom;
    this.target.x = pp.x - 0.8;
    this.target.y = pp.y - 1.2;
    void cs;
    if (instant) Object.assign(this.cam, this.target);
  }

  fit(s: ViewState, instant = false): void {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x: number, y: number, w: number, h: number) => {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    };
    const scene = buildScene(s.layout, s.model, s.trace);
    for (const o of scene.obstacles) grow(o.x - 1, o.y, o.w + 2, o.h);
    for (const w of scene.walls) grow(w.rect.x, w.rect.y, w.rect.w, w.rect.h);
    for (const b of scene.belts) for (const [x, y] of b.pts) grow(x - 0.5, y - 0.5, 1, 1);
    const slots = s.trace?.heapSlots ? Math.max(-1, ...s.trace.heapSlots.values()) : -1;
    const shelf = slots >= 0 ? heapSlotRect(s.layout, slots) : null;
    if (shelf) grow(shelf.x, shelf.y, 4, 1);
    const sample = s.trace?.evs.length ? frameAt(s.trace, s.pos).snap : s.trace?.snaps[0];
    for (const sprite of s.sprites ?? []) {
      const r = spriteWorldRect(sprite, sample?.bound?.[sprite.id]);
      grow(r.x, r.y, r.w, r.h);
    }
    if (!isFinite(x0)) return;
    const pad = 1.2;
    const zx = this.w / ((x1 - x0 + pad * 2) * CELL_PX);
    // keep clear of the alert banner (top) and the legend dock (bottom)
    const top = 64;
    const bottom = 64;
    const zy = (this.h - top - bottom) / ((y1 - y0 + pad * 2) * CELL_PX);
    this.target.zoom = Math.max(0.02, Math.min(1.5, zx, zy));
    const cs = CELL_PX * this.target.zoom;
    this.target.x = (x0 + x1) / 2 - this.w / (2 * cs);
    this.target.y = (y0 + y1) / 2 - (top + (this.h - top - bottom) / 2) / cs;
    if (instant) Object.assign(this.cam, this.target);
  }

  private sx(x: number): number {
    return (x - this.cam.x) * this.cs;
  }
  private sy(y: number): number {
    return (y - this.cam.y) * this.cs;
  }
  private sp(p: Pt): Pt {
    return [this.sx(p[0]), this.sy(p[1])];
  }
  private rectW(x: number, y: number, w: number, h: number): Rect {
    return { x: this.sx(x), y: this.sy(y), w: w * this.cs, h: h * this.cs };
  }

  // The camera has arrived where it was going.
  settled(): boolean {
    return Math.abs(this.cam.x - this.target.x) < 0.01 && Math.abs(this.cam.y - this.target.y) < 0.01 && Math.abs(this.cam.zoom - this.target.zoom) < 0.001;
  }

  // Whether a world rect shows at all (with a margin for labels and glows).
  private onScreen(x: number, y: number, w: number, h: number, margin = 60): boolean {
    const r = this.rectW(x, y, w, h);
    return r.x + r.w > -margin && r.y + r.h > -margin && r.x < this.w + margin && r.y < this.h + margin;
  }

  draw(s: ViewState, skin: Skin, now: number): void {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const k = 1 - Math.exp(-dt * 12);
    this.cam.x += (this.target.x - this.cam.x) * k;
    this.cam.y += (this.target.y - this.cam.y) * k;
    this.cam.zoom += (this.target.zoom - this.cam.zoom) * k;

    const g = this.g;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cs = this.cs;
    const z = this.cam.zoom;
    const dc: Dc = { g, z, cs, time: now / 1000, vw: this.w, vh: this.h };
    g.save();
    skin.background(dc, this.cam.x, this.cam.y);
    g.restore();

    const trace = s.trace;
    const fr = trace && trace.evs.length ? frameAt(trace, s.pos) : null;
    const snap = fr?.snap ?? trace?.snaps[0] ?? null;
    const ev = fr?.ev ?? null;
    const t = fr?.t ?? 0;
    const ph = fr?.ph ?? null;
    const finished = !!trace && s.pos >= trace.evs.length;
    const selKey = entKey(s.selected);
    const hovKey = entKey(s.hovered);
    const scene = sceneAt(s);

    const hostOf = frameHosts(snap, scene);
    const st = snap?.stack ?? [];
    const framesOnHost = new Map<string, SnapFrame[]>();
    for (const f of st) {
      const hk = hostOf.get(f.id)!;
      if (!framesOnHost.has(hk)) framesOnHost.set(hk, []);
      framesOnHost.get(hk)!.push(f);
    }
    const topHost = st.length ? hostOf.get(st[st.length - 1].id)! : null;
    let errHost: string | null = null;
    if (trace?.error && finished) {
      const last = trace.evs[trace.evs.length - 1];
      for (const [id, hk] of hostOf) if (id === last?.frame) errHost = hk;
      if (!errHost && last?.frame !== null) {
        for (const sn of trace.snaps) for (const f of sn.stack) if (f.id === last.frame) errHost = scene.moduleOf.get(f.fn) ?? f.fn;
      }
    }

    // Animation targets: the belt a call/return rides, and a copy fading in or out.
    let animPair: [string, string] | null = null;
    let fading: { host: string; alpha: number } | null = null;
    if (ev && trace && (ev.k === 'call' || ev.k === 'ret')) {
      animPair = eventPair(trace, fr!.i, ev, scene);
      const target = animPair?.[1];
      if (target && scene.hosts.get(target)!.copy > 1) {
        if (ev.k === 'call' && !ph!.switched) fading = { host: target, alpha: ph!.before };
        if (ev.k === 'ret') fading = { host: target, alpha: Math.max(0.15, 1 - ph!.before * 0.85) };
      }
    }
    const animKey = animPair ? `${animPair[0]}>${animPair[1]}` : null;
    const liveKeys = new Set(liveHostPairs(snap, hostOf).map(([a, b]) => `${a}>${b}`));
    const liveHosts = new Set(hostOf.values());
    if (fading) liveHosts.add(fading.host);

    // ---- focus: what the pointer is on dims everything unrelated ----
    const focus = s.selected ?? s.hovered;
    const focusFn = focus?.k === 'node' ? focus.id.slice(5) : null;
    const fileOfHost = (k: string) => scene.hosts.get(k)?.module ?? s.layout.nodes.get(`func:${scene.hosts.get(k)?.fn}`)?.file;
    const related = (b: Belt) =>
      !focus ? true :
      focus.k === 'belt' ? b.key === focus.key :
      focus.k === 'proc' ? b.from === '' :
      focus.k === 'module' ? fileOfHost(b.fromHost) === focus.file || fileOfHost(b.toHost) === focus.file :
      focusFn !== null ? b.from === focusFn || b.to === focusFn : true;

    // ---- module walls (M5): an expanded file, under everything else ----
    const liveFiles = new Set(st.map((f) => s.layout.nodes.get(`func:${f.fn}`)?.file));
    for (const w of scene.walls) {
      if (!this.onScreen(w.rect.x, w.rect.y, w.rect.w, w.rect.h)) continue;
      const m = s.layout.modules.get(w.file);
      g.save();
      skin.wall(dc, this.rectW(w.rect.x, w.rect.y, w.rect.w, w.rect.h), {
        name: w.file, fns: s.layout.nodesOf(w.file).length, kind: 'module', live: liveFiles.has(w.file), pinned: !!m?.pinned,
        selected: selKey === `m:${w.file}`, hovered: hovKey === `m:${w.file}`,
        head: this.rectW(w.rect.x, w.rect.y, w.rect.w, 1.2),
      });
      g.restore();
    }

    // ---- ghost slot for a recursive function's first copy ----
    for (const h of scene.hosts.values()) {
      if (h.copy !== 2 || liveHosts.has(h.key)) continue;
      g.save();
      skin.ghost(dc, this.rectW(h.x, h.y, h.w, h.h), `spawns ${h.fn} #2`);
      g.restore();
    }

    // ---- belts: drawn quiet → live → focused, with gaps cut at crossings ----
    const visible = scene.belts.filter((b) => {
      // off screen: nothing to draw
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of b.pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
      if (!this.onScreen(x0, y0, x1 - x0, y1 - y0)) return false;
      if (!b.chain) return true;
      const target = scene.hosts.get(b.toHost)!;
      return target.copy === 2 || liveHosts.has(b.toHost);
    });
    const order = (b: Belt) => (related(b) && focus ? 3 : b.key === animKey ? 2 : liveKeys.has(b.key) ? 1 : 0);
    visible.sort((a, b) => order(a) - order(b));
    const drawn: Belt[] = [];
    for (const b of visible) {
      const dim = !related(b);
      g.save();
      g.globalAlpha = dim ? 0.22 : 1;
      // cut a gap in anything already drawn underneath
      g.strokeStyle = skin.casing;
      g.lineCap = 'butt';
      g.lineWidth = 0.34 * cs;
      for (const o of drawn) {
        for (const c of crossings(b.pts, o.pts)) {
          const L = 0.3;
          const [p0, p1] = c.horizontal ? [[c.x - L, c.y], [c.x + L, c.y]] : [[c.x, c.y - L], [c.x, c.y + L]];
          g.globalAlpha = 1;
          g.beginPath();
          g.moveTo(this.sx(p0[0]), this.sy(p0[1]));
          g.lineTo(this.sx(p1[0]), this.sy(p1[1]));
          g.stroke();
        }
      }
      g.globalAlpha = dim ? 0.22 : 1;
      skin.belt(dc, b.pts.map((p) => this.sp(p)), {
        live: b.key === animKey || liveKeys.has(b.key),
        dir: b.key === animKey && ev?.k === 'ret' ? -1 : 1,
        selected: selKey === `b:${b.key}`,
        hovered: hovKey === `b:${b.key}` || (!!focusFn && !dim && !!focus),
        custom: b.custom,
        // a trunk into or out of a collapsed module carries this many call sites
        count: isModuleKey(b.fromHost) || isModuleKey(b.toHost) ? b.lines.length : 0,
      });
      g.restore();
      const predicted = b.from === b.to || isModuleKey(b.from) || isModuleKey(b.to) || !!s.model?.byName.get(b.from)?.calls.some((c) => c.callee === b.to);
      if (b.transient && !predicted) {
        // M4: a call the static picture did not predict (e.g. through a function pointer)
        const [hx, hy] = this.sp(beltHandle(b));
        const rr = Math.max(7, 9 * z);
        g.save();
        g.fillStyle = '#ef5b50';
        g.beginPath(); g.arc(hx, hy, rr, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.font = `700 ${rr * 1.3}px sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', hx, hy + 0.5);
        g.restore();
      }
      drawn.push(b);
    }

    // ---- doors: where a belt passes through the wall of a module it serves ----
    const wallOf = new Map(scene.walls.map((w) => [w.file, w.rect]));
    for (const b of visible) {
      const fa = fileOfHost(b.fromHost);
      const fb = fileOfHost(b.toHost);
      if (fa === fb) continue;
      const live = b.key === animKey || liveKeys.has(b.key);
      for (const file of [fa, fb]) {
        const w = file ? wallOf.get(file) : undefined;
        if (!w) continue;
        for (const [p, vertical] of wallCrossings(b.pts, w)) {
          g.save();
          g.globalAlpha = related(b) ? 1 : 0.35;
          skin.door(dc, this.sp(p), vertical, live);
          g.restore();
        }
      }
    }

    // ---- process ----
    const pp = procPlace(s.layout);
    if (pp) {
      g.save();
      skin.proc(dc, this.rectW(pp.x, pp.y, MW, MH), {
        state: !trace || (!st.length && !finished) ? 'idle' : finished ? (trace.error ? 'crashed' : 'done') : 'running',
        exit: finished && trace?.exit ? fmtVal(trace.exit) : null,
        out: finished ? trace?.stdout : undefined,
        selected: selKey === 'p',
        hovered: hovKey === 'p',
      });
      g.restore();
    }

    // ---- machines: homes, plus live (or fading) recursive copies ----
    // (their insides are drawn further down, once values are known)
    const hostsToDraw = [...scene.hosts.values()].filter((h) => !h.module && (h.copy === 1 || liveHosts.has(h.key)));
    const portsOf = (hk: string) => {
      const p = scene.ports.get(hk);
      return { inPorts: (p?.in ?? []).map((y) => this.sy(y)), outPorts: (p?.out ?? []).map((y) => this.sy(y)) };
    };
    const stateOf = (h: Host): RunState => {
      const frames = framesOnHost.get(h.key) ?? [];
      return errHost === h.key || (errHost === h.fn && h.copy === 1) ? 'error' : topHost === h.key ? 'running' : frames.length ? 'waiting' : 'idle';
    };

    // ---- collapsed modules (M5): one block per file, doors listed ----
    for (const h of scene.hosts.values()) {
      if (!h.module || !this.onScreen(h.x, h.y, h.w, h.h)) continue;
      const inside = framesOnHost.get(h.key) ?? [];
      const liveFns = new Set(inside.map((f) => f.fn));
      const fns = s.layout.nodesOf(h.module).map((n) => n.fn);
      const doors = doorsOf(fns);
      const newest = inside[inside.length - 1];
      g.save();
      skin.module(dc, this.rectW(h.x, h.y, h.w, h.h), {
        name: h.module, fns: fns.length,
        doors: doors.slice(0, MOD_DOORS).map((f) => ({ name: f.cname, live: liveFns.has(f.name), undeclared: f.declared === false })),
        more: Math.max(0, doors.length - MOD_DOORS),
        state: errHost === h.key ? 'error' : topHost === h.key ? 'running' : inside.length ? 'waiting' : 'idle',
        running: newest ? s.model?.byName.get(newest.fn)?.cname ?? newest.fn : null,
        depth: inside.length,
        pinned: !!s.layout.modules.get(h.module)?.pinned,
        selected: selKey === `m:${h.module}`, hovered: hovKey === `m:${h.module}`,
        ...portsOf(h.key),
      });
      g.restore();
    }

    // ---- statics (on homes) + frames (on every drawn host) ----
    const anchors = new Map<number, Anchor>();
    const flash = ev && ev.k === 'write' && ph!.switched ? { cell: ev.cell, a: 1 - ph!.after } : null;
    const lastEv = trace && fr && !ev && fr.i > 0 ? trace.evs[fr.i - 1] : null;
    const recent = lastEv?.k === 'write' ? lastEv.cell : null;
    const live = new Set<number>();
    for (const f of st) for (const c of f.cells) live.add(c.id);
    for (const c of snap?.statics ?? []) live.add(c.id);

    // ---- heap shelf (gdb engine): live blocks, the one being freed, leaks ----
    if (trace?.heapSlots && pp) {
      const shown = new Map<number, SnapCell>();
      for (const c of snap?.heap ?? []) shown.set(c.id, c);
      let freeing: number | null = null;
      if (ev?.k === 'free' && t < switchAt(ev)) {
        const c = trace.snaps[fr!.i].heap.find((x) => x.id === ev.cell);
        if (c) (shown.set(c.id, c), (freeing = c.id));
      }
      const leaked = new Set(finished ? (trace.leaks ?? []).map((l) => l.cell) : []);
      for (const c of shown.values()) {
        const slot = trace.heapSlots.get(c.id);
        const w = slot !== undefined ? heapSlotRect(s.layout, slot) : null;
        if (!w) continue;
        const r = this.rectW(w.x + 0.12, w.y + 0.12, 0.76, 0.76);
        g.save();
        if (freeing === c.id) g.globalAlpha = Math.max(0.1, 1 - t / switchAt(ev!));
        const bytes = (c.type.match(/\d+/) ?? ['?'])[0];
        skin.chest(dc, r, {
          name: `${c.name} ${c.val.k === 'raw' ? c.val.text : ''}`.trim(),
          value: `${bytes}B`,
          flash: flash && flash.cell === c.id ? flash.a : ev?.k === 'alloc' && ev.cell === c.id && t >= switchAt(ev) ? 1 - t : 0,
          recent: c.id === recent,
          selected: false,
          hovered: false,
        });
        if (leaked.has(c.id)) {
          g.strokeStyle = '#e8453a';
          g.lineWidth = 2;
          g.setLineDash([4, 3]);
          g.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
          g.setLineDash([]);
          g.fillStyle = '#e8453a';
          g.font = `700 ${Math.max(9, 11 * z)}px sans-serif`;
          g.textAlign = 'right';
          g.textBaseline = 'middle';
          g.fillText('LEAK', r.x - 8, r.y + r.h / 2);
        }
        g.restore();
        anchors.set(c.id, { y: r.y + r.h / 2, left: r.x, right: r.x + r.w });
        live.add(c.id);
      }
    }

    const now_ = trace && fr ? beatNow(trace, s.model!, s.pos) : null;
    // a Focus scene veils everything but its two ends: machines under the
    // veil draw compact (their insides would barely show, and cost the most)
    const scenePair = ev && staged(ev) && animPair ? new Set(animPair) : null;
    for (const h of hostsToDraw) {
      if (!this.onScreen(h.x, h.y, h.w, h.h)) continue;
      const node = s.layout.nodes.get(`func:${h.fn}`);
      const fn = s.model?.byName.get(h.fn);
      if (!node || !fn) continue;
      const frames = framesOnHost.get(h.key) ?? [];
      const frame = frames[frames.length - 1] ?? null;
      const returned = !frame && h.copy === 1 && trace && fr ? lastReturned(trace, h.fn, fr.si) : null;
      const selected = selKey === `n:${node.id}` && ((s.selected as { copy?: number }).copy ?? 1) === h.copy;
      const hovered = hovKey === `n:${node.id}` && ((s.hovered as { copy?: number }).copy ?? 1) === h.copy;
      g.save();
      if (fading?.host === h.key) g.globalAlpha = fading.alpha;
      this.drawMachine(skin, dc, s, h, fn, node.stale, node.place.pinned, frame, returned, stateOf(h), selected, hovered, now_, frames.length, anchors, live, scene.ports.get(h.key) ?? { in: [], out: [] }, !!scenePair && !scenePair.has(h.key));
      g.restore();
    }

    // ---- authored data sprites; all displayed values come from the selected snapshot ----
    for (const sprite of s.sprites ?? []) {
      const value = snap?.bound?.[sprite.id];
      const world = spriteWorldRect(sprite, value);
      const r = this.rectW(world.x, world.y, world.w, world.h);
      const selected = selKey === `sp:${sprite.id}`;
      const hovered = hovKey === `sp:${sprite.id}`;
      g.save();
      // M4: an invariant that is false at the snapshot on screen
      const si = fr?.si ?? 0;
      const broken = s.violations?.find((v) => v.sprite === sprite.id && si >= v.at && si < v.end);
      const violation = broken ? broken.invariant : undefined;
      if (sprite.kind === 'strip') skin.strip(dc, r, { ...spriteStripInfo(sprite, trace, s.pos, selected, hovered), violation });
      else skin.sprite(dc, r, sprite.kind, {
        label: sprite.label || sprite.binding?.expr || sprite.kind,
        bound: !!value?.bound && !value.error,
        value: value?.bound ? value.value ?? (Number.isFinite(value.number) ? String(value.number) : null) : null,
        error: value?.error, violation, selected, hovered,
      });
      g.restore();
    }

    // ---- pointer wires ----
    // Few pointers: draw them all. Many: only the running frame's, the
    // focused function's, and any wire a write is travelling right now.
    const newFrame = ev?.k === 'call' && ph!.switched ? ev.frame : null;
    const cells: SnapCell[] = [...(snap?.statics ?? []), ...st.flatMap((f) => f.cells)];
    const wired = cells.filter((c) => c.val.k === 'ptr' && c.val.to !== null && anchors.has(c.id));
    const frameOfCell = new Map<number, SnapFrame>();
    for (const f of st) for (const c of f.cells) frameOfCell.set(c.id, f);
    const topId = st[st.length - 1]?.id ?? null;
    const showAll = wired.length <= 4;
    for (const c of wired) {
      if (c.val.k !== 'ptr' || c.val.to === null) continue;
      const a = anchors.get(c.id)!;
      const owner = frameOfCell.get(c.id);
      const travelling = ev?.k === 'write' && ev.via === c.id;
      const focused = !!focusFn && owner?.fn === focusFn;
      if (!showAll && owner?.id !== topId && !focused && !travelling) continue;
      const b = anchors.get(c.val.to);
      g.save();
      if (focus) g.globalAlpha = 0.55;
      if (!live.has(c.val.to)) skin.dangling(dc, [a.right, a.y]);
      else if (!b) {
        // points at something on screen elsewhere, e.g. inside a collapsed module
      } else {
        const inNew = newFrame !== null && st.find((f) => f.id === newFrame)?.cells.some((x) => x.id === c.id);
        const grow = inNew ? Math.min(1, ph!.after * 1.4) : 1;
        const curve = this.wireCurve(a, b);
        const pts: Pt[] = [];
        for (let i = 0; i <= 40 * grow; i++) pts.push(bez(curve, i / 40));
        if (pts.length > 1) skin.wire(dc, pts, grow >= 1);
      }
      g.restore();
    }

    // ---- focus mode: veil everything but the sender and the receiver ----
    if (ev && ph && trace && staged(ev)) {
      const hostRect = (k: string): Rect | null => {
        if (k === '') return pp ? this.rectW(pp.x, pp.y, MW, MH) : null;
        const h = scene.hosts.get(k);
        return h ? this.rectW(h.x, h.y, h.w, h.h + h.inv) : null;
      };
      let src: Rect | null = null;
      let dst: Rect | null = null;
      let redraw: (() => void) | null = null;
      if ((ev.k === 'call' || ev.k === 'ret') && animPair) {
        const [from, to] = animPair;
        [src, dst] = ev.k === 'call' ? [hostRect(from), hostRect(to)] : [hostRect(to), hostRect(from)];
        const belt = scene.belts.find((b) => b.key === animKey);
        if (belt) redraw = () => skin.belt(dc, belt.pts.map((p) => this.sp(p)), { live: true, dir: ev.k === 'ret' ? -1 : 1, selected: false, hovered: true, custom: belt.custom, count: 0 });
      } else if (ev.k === 'write' && ev.via !== null) {
        const a = anchors.get(ev.via);
        const b = anchors.get(ev.cell);
        const row = SLOT_PX * z;
        if (a) src = { x: a.left, y: a.y - row / 2, w: a.right - a.left, h: row };
        if (b) dst = { x: b.left, y: b.y - row / 2, w: b.right - b.left, h: row };
        if (a && b) {
          const curve = this.wireCurve(a, b);
          const pts: Pt[] = [];
          for (let k = 0; k <= 40; k++) pts.push(bez(curve, k / 40));
          redraw = () => skin.wire(dc, pts, true);
        }
      }
      // fade the veil in quickly, out as the receiver takes over
      const veil = Math.min(1, t / 0.03) * (ph.switched ? Math.min(1, (1 - ph.after) / 0.3) : 1);
      const hole = 10 * z;
      g.save();
      g.globalAlpha = veil;
      g.fillStyle = skin.spotlight;
      g.beginPath();
      g.rect(0, 0, this.w, this.h);
      // while a return's card is up, everything is veiled
      if (ph.parked !== 'card') for (const r of [src, dst]) if (r) g.rect(r.x - hole, r.y - hole, r.w + 2 * hole, r.h + 2 * hole);
      g.fill('evenodd');
      g.restore();
      if (redraw && ph.parked !== 'card') {
        g.save();
        redraw();
        g.restore();
      }
      // the sender flashes before the data leaves, the receiver when it lands;
      // both keep a quieter mark while the data goes back and forth
      // two quick flashes, then a steady mark for the rest of the wait
      const blink = (sec: number) => (sec < 0.8 ? 0.55 + 0.45 * Math.cos(sec * Math.PI * 5) : 0.85);
      const sa = ph.parked === 'read' ? blink(ph.secs) : ph.switched ? 0.3 * (1 - ph.after) : 0.4;
      const da = ph.parked === 'hold' ? blink(ph.secs) * Math.min(1, (1 - ph.after) / 0.3) : 0.4;
      g.save();
      if (ph.parked !== 'card') {
        if (src && sa > 0.02) skin.attention(dc, src, sa);
        if (dst && da > 0.02) skin.attention(dc, dst, da);
      }
      g.restore();
    }

    // ---- things in motion ----
    // In focus mode data is drawn at least full size, however far out the
    // camera is: it is there to be read.
    const ddc: Dc = staged(ev) ? { ...dc, z: Math.max(dc.z, 1) } : dc;
    g.save();
    if (ev && trace) {
      const belt = animKey ? scene.belts.find((b) => b.key === animKey) : null;
      if ((ev.k === 'call' || ev.k === 'ret') && belt) {
        const walk = new PathWalk(belt.pts.map((p) => this.sp(p)));
        const travel = ph!.travel;
        const ease = travel < 0.5 ? 2 * travel * travel : 1 - Math.pow(-2 * travel + 2, 2) / 2;
        // In focus the data never blinks out: it stays put while parked, and
        // sits at the receiver for the short dwell that ends each pass.
        const shown = (travel < 1 || staged(ev)) && ph!.parked !== 'card';
        if (shown && ev.k === 'call') {
          if (!ev.args.length) {
            const p = walk.at(Math.min(walk.length, cs * 0.4 + ease * (walk.length - cs * 0.8)));
            skin.plate(ddc, p[0], p[1], '()', 'void');
          }
          // Real data rides the belt as a train that always fits on it:
          // strings as text, structs as crates, every argument visible.
          const after = trace.snaps[fr!.i + 1] ?? null;
          const unit = ddc.z * CELL_PX; // plates are drawn at ddc's scale
          const sizes = ev.args.map((a) => (a.data?.k === 'struct' ? unit * 2.6 : unit * 0.8));
          const L = sizes.reduce((a, b) => a + b, 0);
          // (fast mode keeps its original run: from the port to the end, spaced as before)
          const focus = MODE === 'focus';
          const fit = focus ? Math.min(1, (walk.length * 0.9) / Math.max(1e-6, L)) : 1;
          const head0 = focus ? (L - sizes[0] * 0.5) * fit : 0;
          const head1 = focus ? walk.length - sizes[0] * fit * 0.5 : walk.length;
          const head = head0 + ease * Math.max(0, head1 - head0);
          let gap = 0;
          ev.args.forEach((a, k) => {
            const d = head - gap;
            gap += focus ? ((sizes[k] + (sizes[k + 1] ?? 0)) / 2) * fit : sizes[k];
            if (d < 0) return;
            const p = walk.at(d);
            if (a.data?.k === 'struct') skin.crate(ddc, p[0], p[1], crateOf(a.data, 'arg'));
            else if (a.data?.k === 'str') skin.plate(ddc, p[0], p[1], clip(a.data.text, 18), 'ptr');
            else skin.plate(ddc, p[0], p[1], argLabel(a.val, a.text, trace, after), a.val.k === 'ptr' ? 'ptr' : 'arg');
          });
        } else if (shown && ev.k === 'ret') {
          // The end product includes what the function changed through its
          // pointers: in focus mode those changes ride back with the result.
          const card = MODE === 'focus' && !ev.data ? returnCard(trace, fr!.i) : null;
          const changes: { name: string; value: string }[] = [];
          let parent = '';
          for (const r of card?.rows ?? []) {
            if (!r.depth) parent = r.name;
            if (r.changed && r.out !== undefined) changes.push({ name: r.depth ? `${parent}->${r.name}` : `*${r.name}`, value: r.out });
          }
          const result = ev.val.k === 'void' ? 'void' : `returns ${retLabel(ev.val, trace)}`;
          const crate: CrateInfo | null = changes.length ? { title: `${result} · changed`, rows: changes.slice(0, 6), more: Math.max(0, changes.length - 6), kind: 'ret' } : null;
          const half = (ev.data?.k === 'struct' || crate ? 1.3 : 0.4) * ddc.z * CELL_PX;
          const p = walk.at(MODE === 'focus' ? Math.min(walk.length - half, Math.max(half, (1 - ease) * walk.length)) : (1 - ease) * walk.length);
          if (crate) skin.crate(ddc, p[0], p[1], crate);
          else if (ev.data?.k === 'struct') skin.crate(ddc, p[0], p[1], crateOf(ev.data, 'ret'));
          else if (ev.data?.k === 'str') skin.plate(ddc, p[0], p[1], clip(ev.data.text, 18), 'ret');
          else skin.plate(ddc, p[0], p[1], ev.val.k === 'void' ? 'void' : retLabel(ev.val, trace), ev.val.k === 'void' ? 'void' : 'ret');
        }
      }
      if (ev.k === 'write' && ev.via !== null && ((!ph!.switched && ph!.travel < 1) || ph!.parked)) {
        const a = anchors.get(ev.via);
        const b = anchors.get(ev.cell);
        if (a && b) {
          const [x, y] = bez(this.wireCurve(a, b), Math.max(0.08, Math.min(0.92, ph!.travel)));
          skin.pulse(ddc, x, y);
          skin.plate(ddc, x, y - cs * 0.42, fmtVal(ev.val), 'arg');
        }
      }
    }
    g.restore();

    // ---- selected belt handle ----
    const sel = s.selected;
    if (sel?.k === 'belt') {
      const b = scene.belts.find((x) => x.key === sel.key);
      if (b) skin.beltHandle(dc, this.sp(beltHandle(b)));
    }

    // ---- lenses: the far end of what's happening, when it's off screen ----
    if (!this.lens && trace && fr) {
      const far: { at: Pt; title: string }[] = [];
      const off = (p: Pt) => { const [x, y] = this.sp(p); return x < 0 || y < 0 || x > this.w || y > this.h; };
      if (ev && (ev.k === 'call' || ev.k === 'ret') && animKey) {
        const belt = scene.belts.find((b) => b.key === animKey);
        if (belt) {
          // look inside: at the calling statement, and just past the callee's entry door
          const [a0, b0] = [belt.pts[0], belt.pts[belt.pts.length - 1]];
          const a: Pt = [a0[0] - 7, a0[1]];
          const b: Pt = [b0[0] + 4.5, b0[1] + 1.5];
          const caller = belt.from || 'the process';
          if (ev.k === 'call') {
            if (off(a)) far.push({ at: a, title: `${caller} calls` });
            if (off(b)) far.push({ at: b, title: `→ ${ev.fn}` });
          } else {
            if (off(b)) far.push({ at: b, title: `${ev.fn} returns` });
            if (off(a)) far.push({ at: a, title: `→ back to ${caller}` });
          }
        }
      }
      // a statement writing into memory another machine owns
      if (now_ && now_.phase === 'write') {
        const b = now_.beat;
        const hosts = frameHosts(trace.snaps[Math.min(b.after, trace.snaps.length - 1)], scene);
        for (let i = b.from; i <= b.to && far.length < 2; i++) {
          const e = trace.evs[i];
          if (e.k !== 'write') continue;
          const info = trace.cells.get(e.cell);
          if (!info || info.frame === b.frame || info.frame === -2) continue;
          const owner = info.frame === -1 ? info.owner : trace.snaps[i + 1]?.stack.find((f) => f.id === info.frame)?.fn;
          const hk = info.frame === -1 ? owner : hosts.get(info.frame);
          const h = hk ? scene.hosts.get(hk) : undefined;
          const fn = owner ? s.model?.byName.get(owner) : undefined;
          if (!h || !fn || fn.broken) continue;
          const idx = slotsOf(fn).findIndex((sl) => sl.key === `${info.frame === -1 ? 's' : 'c'}:${info.name}`);
          const at: Pt = shut.has(fn.name) || idx < 0 ? [h.x + h.w / 2, h.y + h.h / 2] : [h.x + geomOf(fn).store.x + geomOf(fn).store.w * 0.6, h.y + slotY(geomOf(fn), idx)];
          if (off(at) && !far.some((f) => f.title.includes(info.name))) far.push({ at, title: `→ ${fn.cname} · ${info.name} changes` });
        }
      }
      this.drawLenses(s, skin, now, dc, far.slice(0, 2));
    }
  }

  private lensViews: GridView[] = [];
  private lensKey = '';
  private lensAt = 0;
  // Small live views of far-away places, in the pane's bottom-right corner.
  private drawLenses(s: ViewState, skin: Skin, now: number, dc: Dc, far: { at: Pt; title: string }[]): void {
    const W = Math.min(320, this.w * 0.3);
    const H = W * 0.62;
    const head = 22;
    far.forEach((f, k) => {
      let v = this.lensViews[k];
      if (!v) this.lensViews[k] = v = new GridView(document.createElement('canvas'), true);
      v.setSize(W, H, this.dpr);
      const zoom = 0.7;
      v.cam.zoom = v.target.zoom = zoom;
      v.cam.x = v.target.x = f.at[0] - W / (2 * CELL_PX * zoom);
      v.cam.y = v.target.y = f.at[1] - H / (2 * CELL_PX * zoom);
      // a whole scene each: repaint ~15 times a second (or when it looks elsewhere)
      const key = `${f.title}|${f.at[0].toFixed(1)},${f.at[1].toFixed(1)}|${skin.id}`;
      if (key !== v.lensKey || now - v.lensAt > 66) {
        v.draw(s, skin, now);
        v.lensKey = key;
        v.lensAt = now;
      }
      const x = this.w - (W + 14) * (k + 1);
      const y = this.h - H - head - 96;
      const g = this.g;
      g.save();
      g.fillStyle = skin.casing;
      g.fillRect(x, y, W, H + head);
      g.drawImage(v.canvas, x, y + head, W, H);
      skin.wall(dc, { x, y, w: W, h: H + head }, { name: f.title, fns: 0, note: '', live: true, pinned: false, selected: false, hovered: false, head: { x, y, w: W, h: head } });
      g.restore();
    });
  }

  // A machine is its inside: storage (variables) on the left, stations
  // (statements) on the right, the memory its char *s point at along the
  // bottom. The statement running now animates: what it reads flies in, it
  // shows its values, what it changes flies out. Zoomed out, only the shell,
  // its motor and the line it's on.
  private drawMachine(
    skin: Skin, dc: Dc, s: ViewState, h: Host, fn: FnInfo, stale: boolean, pinned: boolean,
    frame: SnapFrame | null, returned: SnapFrame | null, state: RunState, selected: boolean, hovered: boolean,
    bn: BeatNow | null, stacked: number, anchors: Map<number, Anchor>, live: Set<number>, ports: { in: number[]; out: number[] },
    compact = false,
  ): void {
    const g = this.g;
    const z = dc.z;
    const cs = this.cs;
    const trace = s.trace;
    const R = this.rectW(h.x, h.y, h.w, h.h);
    // very far out: just the shell, lit if it's working
    if (cs < 8) {
      skin.wall(dc, R, { name: '', fns: 0, note: '', kind: 'machine', live: state === 'running', pinned: false, selected, hovered, head: { x: R.x, y: R.y, w: R.w, h: 0 } });
      return;
    }
    const closed = shut.has(fn.name);
    const geo = fn.broken ? null : geomOf(fn);
    const shown = frame ?? returned;
    const name = `${fn.cname}(${fn.params.map((p) => p.name).join(', ')})${h.copy > 1 ? ` #${h.copy}` : ''}`;
    // a floor under see-through walls (skins that paint whole windows don't
    // need one, and a square floor would show past their rounded corners)
    if (!skin.solidMachines) {
      g.save();
      g.fillStyle = skin.casing;
      g.globalAlpha *= 0.85;
      g.fillRect(R.x, R.y, R.w, R.h);
      g.restore();
    }
    const headH = (geo?.head ?? 0.8) * cs;
    const note = state === 'running' ? 'running' : state === 'waiting' ? 'waiting on a call' : state === 'error' ? 'crashed here' : frame ? '' : returned ? 'done' : '';
    skin.wall(dc, R, { name, fns: 0, note, kind: 'machine', live: state === 'running', pinned: h.copy === 1 && pinned, selected, hovered, head: { x: R.x, y: R.y, w: R.w, h: headH } });
    const m = closed || !geo ? { x: 1, y: 1, w: MW, h: MH } : geo.motor;
    let waitingOn: string | null = null;
    if (state === 'waiting' && frame && trace) {
      const st = frameAt(trace, s.pos).snap.stack;
      waitingOn = st[st.findIndex((f) => f.id === frame.id) + 1]?.fn ?? null;
    }
    skin.node(dc, this.rectW(h.x + m.x, h.y + m.y, MW, MH), {
      name: h.copy > 1 ? `${h.fn} #${h.copy}` : h.fn, state, waitingOn, frames: stacked, stale, pinned: false,
      isStatic: fn.isStatic, params: fn.params.length, selected: false, hovered: false,
      editing: h.copy === 1 && s.editorFn === h.fn, hasFrame: false, copy: h.copy,
      inPorts: ports.in.map((y) => this.sy(y)), outPorts: [],
    });
    for (const y of ports.out) skin.door(dc, [R.x + R.w, this.sy(y)], true, state === 'running');
    if (!geo || !trace) return;
    const plan = planOf(fn);
    const evI = Number.isInteger(s.pos) ? s.pos - 1 : Math.floor(s.pos);
    const act = bn && frame && bn.beat.frame === frame.id ? bn : null;
    const ist = shown ? interiorAt(trace, plan, shown.id, act ? (act.beat.kind === 'switch' && act.landed >= 1 ? act.beat.to + 1 : act.beat.from) : evI) : null;
    const liveMode: InteriorInfo['mode'] = frame ? 'live' : returned ? 'returned' : 'none';

    // ---- closed: the line it's on (with its values while it runs) ----
    if (closed && cs >= 20) {
      const cur = frame && ist?.current != null ? plan.stations[ist.current] : null;
      if (cur) {
        const hot = act && act.phase !== 'read' ? computeText(act.beat, fn, trace) : '';
        const line = act && act.beat.kind === 'switch' && act.landed >= 1 ? `${hot} → ${act.beat.result}` : hot || cur.text;
        skin.plate(dc, R.x + R.w / 2, this.sy(h.y + m.y + MH + 0.9), clipCode(line, 30), act ? 'ptr' : 'void');
      }
      return;
    }
    // ---- zoomed out (or under a Focus veil): its name and the line it's on ----
    if (cs < 20 || compact) {
      const cur = frame && ist?.current != null ? plan.stations[ist.current].text : null;
      if (closed) {
        // small already: the motor says its name; only the running line, if any
        if (cur && state === 'running') skin.plate({ ...dc, z: Math.max(z, 0.6) }, R.x + R.w / 2, R.y + R.h + 8, clipCode(cur, 24), 'ptr');
        return;
      }
      const big: Dc = { ...dc, z: 1, cs: CELL_PX };
      const cx = R.x + R.w / 2;
      skin.plate(big, cx, R.y + R.h * 0.42, fn.cname, state === 'running' ? 'arg' : 'void');
      if (cur && R.h > 40) skin.plate(big, cx, R.y + R.h * 0.42 + 24, clipCode(cur, 30), state === 'running' ? 'ptr' : 'void');
      return;
    }

    // ---- storage ----
    const snapNow = frameAt(trace, s.pos).snap;
    const before = act ? trace.snaps[act.beat.before] : snapNow;
    const after = act ? trace.snaps[Math.min(act.beat.after, trace.snaps.length - 1)] : snapNow;
    const fB = act ? before.stack.find((f) => f.id === act.beat.frame) ?? shown : shown;
    const fA = act ? after.stack.find((f) => f.id === act.beat.frame) ?? fB : shown;
    const writes = act && act.phase === 'write' ? writesOf(act.beat, fn, trace).slice(0, 10) : [];
    const chipU = (n: number, f: number) => Math.max(0, Math.min(1, (f - 0.1 * n) / 0.7));
    const arrived = new Set<string>();
    writes.forEach((w, n) => chipU(n, act!.landed) >= 1 && arrived.add(w.key));
    const slots = slotsOf(fn);
    const X = this.sx(h.x + geo.store.x);
    const Y = this.sy(h.y + geo.store.y);
    const W = geo.store.w * cs;
    const slotAt = new Map<string, Pt>();
    const valueAt = (key: string) => {
      const sl = slots.find((x) => x.key === key)!;
      const late = arrived.has(key);
      return slotValue(sl, fn.name, late ? fA : fB, late ? after : before, trace, frame ? live : null);
    };
    const rows: RowInfo[] = slots.map((sl, i) => {
      const v = valueAt(sl.key);
      const rect: Rect = { x: X, y: Y + (INV_HEAD_PX + i * SLOT_PX) * z, w: W, h: SLOT_PX * z };
      slotAt.set(sl.key, [X + W, rect.y + rect.h / 2]);
      const anchor = { y: rect.y + rect.h / 2, left: X, right: X + W };
      if (frame && sl.kind === 'cell') {
        const c = frame.cells.find((x) => x.name === sl.name);
        if (c) anchors.set(c.id, anchor);
      }
      if (sl.kind === 'static' && h.copy === 1) {
        const id = staticCellId(trace, fn.name, sl.name);
        if (id !== null) anchors.set(id, anchor);
      }
      const hit = arrived.has(sl.key) && writes.some((w) => w.key === sl.key);
      return {
        name: sl.kind === 'field' ? `  .${sl.name}` : sl.kind === 'more' ? `  ${sl.name}` : sl.kind === 'static' ? `${sl.name} (static)` : sl.fold ? `${sl.fold === 'open' ? '▾' : '▸'} ${sl.name}` : sl.name,
        value: v.text, kind: v.kind, param: sl.param, recent: hit, flash: hit ? Math.max(0, 1 - act!.landed * 0.6) : 0,
        rect, depth: sl.depth, fold: sl.fold ?? null,
      };
    });
    skin.frame(dc, { x: X, y: Y, w: W, h: (INV_HEAD_PX + slots.length * SLOT_PX + 8) * z }, { mode: liveMode, stacked: Math.max(0, stacked - 1), rows, head: { x: X, y: Y, w: W, h: INV_HEAD_PX * z } });

    // ---- memory floor ----
    const mem = new Map<string, { r: Rect; len: number }>();
    geo.memory.keys.forEach((key, k) => {
      const r = this.rectW(h.x + geo.memory.x, h.y + geo.memory.y + k * (geo.memH + geo.memGap), geo.memory.w, geo.memH);
      const sl = slots.find((x) => x.key === key)!;
      const v = valueAt(key);
      const bytes = v.bytes ?? [];
      mem.set(key, { r, len: bytes.length });
      const wrote = writes.filter((w) => w.key === key && w.index !== undefined && arrived.has(key));
      const label = sl.kind === 'field' ? `${key.slice(2).split('.')[0]}->${sl.name}` : sl.name;
      if (!v.bytes) {
        // nothing to show yet (NULL, not set, or not in memory the trace saw)
        g.save();
        g.globalAlpha *= 0.6;
        skin.plate(dc, r.x + Math.min(r.w / 2, 120 * z), r.y + r.h / 2, `${label} → ${v.text || '?'}`, 'void');
        g.restore();
        return;
      }
      skin.strip(dc, r, {
        label: `${label} → memory`, bound: !!v.bytes, bytes, length: v.bytes ? bytes.length : null, pointer: null,
        markers: [...v.marks.map((mk) => ({ label: mk.label, index: mk.index, sampledIndex: mk.index })), ...wrote.slice(-1).map((w) => ({ label: 'wrote', index: w.index!, sampledIndex: w.index! }))],
        selected: false, hovered: false,
      });
    });

    // ---- stations ----
    const zI = z * geo.stations.zoom;
    const SX = this.sx(h.x + geo.stations.x);
    const SY = this.sy(h.y + geo.stations.y);
    const compute = act ? computeText(act.beat, fn, trace) : '';
    const info = interiorInfo(plan, ist, {
      x: SX, y: SY, z: zI, title: 'stations', mode: liveMode,
      readout: (sw, si) => (shown ? readoutOf(sw, trace, si === null ? snapNow : trace.snaps[si], shown.id, fn.name) : ''),
      override: act && act.beat.kind === 'switch' ? { station: act.beat.station, text: `${compute} → ${act.landed >= 1 ? String(act.beat.result ?? '?') : '…'}`, result: act.landed >= 1 ? act.beat.result ?? null : null } : null,
      hot: act && act.beat.kind !== 'switch' && act.phase !== 'read' && compute ? { station: act.beat.station, text: compute } : null,
    });
    skin.interior({ ...dc, z: zI, cs: CELL_PX * zI }, { x: SX, y: SY, w: plan.w * zI, h: plan.h * zI }, info);

    // ---- in flight: reads to the station, writes back to storage ----
    if (!act) return;
    const stn = plan.stations[act.beat.station];
    const at: Pt = [SX + stopX(stn.depth) * zI, SY + rowMid(stn.row) * zI];
    const curve = (p: Pt, q: Pt): [Pt, Pt, Pt, Pt] => {
      const dx = (q[0] - p[0]) * 0.45;
      return [p, [p[0] + dx, p[1]], [q[0] - dx, q[1]], q];
    };
    if (act.phase === 'read') {
      readsOf(act.beat, fn, trace).slice(0, 8).forEach((r, n) => {
        const u = chipU(n, act.p / READ_END);
        if (u <= 0 || u >= 1) return;
        const [x, y] = bez(curve(slotAt.get(r.key) ?? [X + W, Y], at), u);
        skin.pulse(dc, x, y);
        skin.plate(dc, x, y - 12 * z, r.text, 'arg');
      });
    }
    writes.forEach((w, n) => {
      const u = chipU(n, act.landed);
      if (u <= 0 || u >= 1) return;
      let to = slotAt.get(w.key) ?? [X + W, Y];
      const mm = mem.get(w.key);
      if (mm && w.index !== undefined && mm.len) {
        const shownN = Math.min(24, mm.len);
        const pad = Math.max(4, 7 * z);
        const tw = mm.r.w - pad * 2;
        to = [mm.r.x + pad + (Math.min(w.index, shownN - 1) + 0.5) * (tw / shownN), mm.r.y + mm.r.h * 0.31 + Math.max(11, mm.r.h * 0.27) / 2];
      }
      const [x, y] = bez(curve(at, to), u);
      skin.pulse(dc, x, y);
      skin.plate(dc, x, y - 12 * z, w.text, 'ret');
    });
  }

  private wireCurve(a: Anchor, b: Anchor): [Pt, Pt, Pt, Pt] {
    const cs = this.cs;
    const ax = (a.left + a.right) / 2;
    const bx = (b.left + b.right) / 2;
    if (Math.abs(ax - bx) < 4) {
      const p0: Pt = [a.right, a.y];
      const p3: Pt = [b.right, b.y];
      const bulge = cs * 0.9;
      return [p0, [p0[0] + bulge, p0[1]], [p3[0] + bulge, p3[1]], p3];
    }
    const p0: Pt = bx > ax ? [a.right, a.y] : [a.left, a.y];
    const p3: Pt = bx > ax ? [b.left, b.y] : [b.right, b.y];
    const dist = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
    const sag = Math.min(cs * 1.6, dist * 0.28);
    const dx = (p3[0] - p0[0]) * 0.3;
    return [p0, [p0[0] + dx, p0[1] + sag], [p3[0] - dx, p3[1] + sag], p3];
  }
}
