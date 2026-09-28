// Grid engine: camera, hosts, hit-testing and playback timing. Routing lives
// in route.ts; every pixel is delegated to the active skin (skins/*.ts).
import { CELL_PX, INV_HEAD_PX, MH, MOD_DOORS, MW, SLOT_PX, doorsOf, frameRows, type Layout } from './layout';
import { HEAD, ROW, interiorAt, planOf, rowMid, stopX, textX, type InteriorState, type Plan, type Station } from './interior';
import { roomScene, roomTimeline, slotsOf, slotValue } from './room';
import type { FnInfo } from './parse';
import type { Model } from './parse';
import { fmtVal, type Ev, type Payload, type Snap, type SnapCell, type SnapFrame, type Trace, type V } from './interp';
import { buildScene, crossings, hostKey, isModuleKey, procPlace, type Belt, type Scene } from './route';
import { clip, fieldValue, pointeeName, staticCellId, valueOf } from './values';
import type { CrateInfo, Dc, InteriorInfo, Pt, Rect, RowInfo, RunState, Skin, StationInfo, StripInfo, ValueKind } from './skins/types';
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
  room?: string | null; // the function whose machine the author has entered
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
const ROOM_MS = 340; // entering or leaving a machine
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
  return MODE === 'focus' && !!e && (e.k === 'call' || e.k === 'ret' || (e.k === 'write' && e.via !== null));
}

// The room (a function the author entered) paces its own statements and
// skips everything else; otherwise each event has its kind's duration.
export function roomOf(s: { room?: string | null; model: Model | null }): { fn: FnInfo; plan: Plan } | null {
  const fn = s.room ? s.model?.byName.get(s.room) : undefined;
  return fn && !fn.broken ? { fn, plan: planOf(fn) } : null;
}

export function durationAt(trace: Trace, i: number, room: { fn: FnInfo; plan: Plan } | null): number {
  return room ? roomTimeline(trace, room.fn, room.plan).dur[i] : evDuration(trace.evs[i]);
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
    const fn = s.model?.byName.get(h.fn) ?? null;
    const hh = MH + (fn ? (INV_HEAD_PX + frameRows(fn).length * SLOT_PX + 6) / CELL_PX : 0);
    if (wx >= h.x && wx < h.x + MW && wy >= h.y && wy < h.y + hh) return { k: 'node', id: `func:${h.fn}`, copy: h.copy };
  }
  for (const n of s.layout.visible()) {
    const st = n.fn?.statics ?? [];
    for (let i = 0; i < st.length; i++) {
      const cx = n.place.x + i, cy = n.place.y - 2;
      if (wx >= cx && wx < cx + 1 && wy >= cy && wy < cy + 1) return { k: 'static', fn: n.name, name: st[i].name };
    }
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
  return h ? { x: h.x, y: h.y, w: h.w, h: h.h + h.inv } : null;
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
    if (h.module || wx < h.x || wx >= h.x + MW) continue;
    const fn = s.model?.byName.get(h.fn) ?? null;
    const rows = frameRows(fn);
    const top = h.y + MH + 6 / CELL_PX + INV_HEAD_PX / CELL_PX;
    const i = Math.floor((wy - top) / (SLOT_PX / CELL_PX));
    if (i >= 0 && i < rows.length && rows[i].fold) return { fn: h.fn, name: rows[i].name };
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

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }

  get cs(): number {
    return CELL_PX * this.cam.zoom;
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
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
    const z = Math.max(0.3, Math.min(2.5, this.cam.zoom * f));
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
    this.target.zoom = Math.max(0.3, Math.min(1.5, zx, zy));
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
      const m = s.layout.modules.get(w.file);
      g.save();
      skin.wall(dc, this.rectW(w.rect.x, w.rect.y, w.rect.w, w.rect.h), {
        name: w.file, fns: s.layout.nodesOf(w.file).length, live: liveFiles.has(w.file), pinned: !!m?.pinned,
        selected: selKey === `m:${w.file}`, hovered: hovKey === `m:${w.file}`,
        head: this.rectW(w.rect.x, w.rect.y, w.rect.w, 1.2),
      });
      g.restore();
    }

    // ---- ghost slot for a recursive function's first copy ----
    for (const h of scene.hosts.values()) {
      if (h.copy !== 2 || liveHosts.has(h.key)) continue;
      g.save();
      skin.ghost(dc, this.rectW(h.x, h.y, MW, MH), `spawns ${h.fn} #2`);
      g.restore();
    }

    // ---- belts: drawn quiet → live → focused, with gaps cut at crossings ----
    const visible = scene.belts.filter((b) => {
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

    // ---- nodes: homes, plus live (or fading) recursive copies ----
    const portsOf = (hk: string) => {
      const p = scene.ports.get(hk);
      return { inPorts: (p?.in ?? []).map((y) => this.sy(y)), outPorts: (p?.out ?? []).map((y) => this.sy(y)) };
    };
    const hostsToDraw = [...scene.hosts.values()].filter((h) => h.copy === 1 || liveHosts.has(h.key));
    for (const h of hostsToDraw) {
      const node = s.layout.nodes.get(`func:${h.fn}`);
      if (!node) continue;
      const frames = framesOnHost.get(h.key) ?? [];
      const state: RunState = errHost === h.key || (errHost === h.fn && h.copy === 1) ? 'error' : topHost === h.key ? 'running' : frames.length ? 'waiting' : 'idle';
      let waitingOn: string | null = null;
      if (state === 'waiting') waitingOn = st[st.indexOf(frames[frames.length - 1]) + 1]?.fn ?? null;
      const selectedHere = selKey === `n:${node.id}` && ((s.selected as { copy?: number }).copy ?? 1) === h.copy;
      const hoveredHere = hovKey === `n:${node.id}` && ((s.hovered as { copy?: number }).copy ?? 1) === h.copy;
      g.save();
      if (fading?.host === h.key) g.globalAlpha = fading.alpha;
      skin.node(dc, this.rectW(h.x, h.y, MW, MH), {
        name: h.copy > 1 ? `${h.fn} #${h.copy}` : h.fn,
        state, waitingOn, frames: frames.length, stale: node.stale, pinned: h.copy === 1 && node.place.pinned,
        isStatic: !!node.fn?.isStatic, params: node.fn?.params.length ?? 0,
        selected: selectedHere, hovered: hoveredHere,
        editing: h.copy === 1 && s.editorFn === h.fn, hasFrame: !!node.fn && node.fn.params.length + node.fn.locals.length > 0,
        copy: h.copy, ...portsOf(h.key),
      });
      g.restore();
    }

    // ---- collapsed modules (M5): one block per file, doors listed ----
    for (const h of scene.hosts.values()) {
      if (!h.module) continue;
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

    for (const n of s.layout.visible()) {
      (n.fn?.statics ?? []).forEach((v, i) => {
        const r = this.rectW(n.place.x + i + 0.12, n.place.y - 2 + 0.12, 0.76, 0.76);
        const id = staticCellId(trace, n.name, v.name);
        const cell = id !== null ? snap?.statics.find((c) => c.id === id) ?? null : null;
        g.save();
        g.strokeStyle = 'rgba(128,128,128,0.55)';
        g.lineWidth = Math.max(1, 2 * z);
        g.beginPath();
        g.moveTo(r.x + r.w / 2, r.y + r.h);
        g.lineTo(r.x + r.w / 2, this.sy(n.place.y));
        g.stroke();
        skin.chest(dc, r, {
          name: v.name,
          value: cell ? valueOf(cell, null, trace, null).text : null,
          flash: flash && id === flash.cell ? flash.a : 0,
          recent: id !== null && id === recent,
          selected: selKey === `s:${n.name}.${v.name}`,
          hovered: hovKey === `s:${n.name}.${v.name}`,
        });
        g.restore();
        if (id !== null) anchors.set(id, { y: r.y + r.h / 2, left: r.x, right: r.x + r.w });
      });
    }

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

    const prevSnap = trace && fr ? trace.snaps[Math.max(0, fr.si - 1)] : null;
    for (const h of hostsToDraw) {
      const fn = s.model?.byName.get(h.fn);
      const frows = frameRows(fn ?? null);
      const count = frows.length;
      if (!fn || !count) continue;
      if (fading?.host === h.key && ev?.k === 'call') continue; // frame appears when the argument lands
      const frames = framesOnHost.get(h.key) ?? [];
      const frame = frames[frames.length - 1] ?? null;
      const returned = !frame && h.copy === 1 && trace && fr ? lastReturned(trace, h.fn, fr.si) : null;
      const shown = frame ?? returned;
      const X = this.sx(h.x);
      const Y = this.sy(h.y + MH) + 6 * z;
      const W = MW * cs;
      const panel: Rect = { x: X, y: Y, w: W, h: (INV_HEAD_PX + count * SLOT_PX + 6) * z };
      const byName = new Map(shown?.cells.map((c) => [c.name, c]) ?? []);
      const rows: RowInfo[] = frows.map((row, i) => {
        const rect: Rect = { x: X, y: Y + (INV_HEAD_PX + i * SLOT_PX) * z, w: W, h: SLOT_PX * z };
        if (row.depth === 1) {
          // a struct field: live value, lit when it changed on this step
          const parent = byName.get(row.parent!) ?? null;
          const f = row.more ? undefined : parent?.fields?.find((x) => x.name === row.name);
          const val = f ? fieldValue(f, trace) : { text: '', kind: 'none' as ValueKind };
          const before = parent ? prevSnap?.stack.flatMap((x) => x.cells).concat(prevSnap.statics).find((c) => c.id === parent.id)?.fields?.find((x) => x.name === row.name) : undefined;
          const changed = !!frame && !!f && !!before && fieldValue(before, trace).text !== val.text;
          return { name: row.more ? `  ${row.name}` : `  .${row.name}`, value: val.text, kind: val.kind, param: row.param, recent: changed, flash: 0, rect, depth: 1, fold: null };
        }
        const cell = byName.get(row.name) ?? null;
        const val = cell ? valueOf(cell, shown, trace, frame ? live : null) : { text: '', kind: 'none' as ValueKind };
        if (frame && cell) anchors.set(cell.id, { y: rect.y + rect.h / 2, left: X, right: X + W });
        return {
          name: row.fold ? `${row.fold === 'open' ? '▾' : '▸'} ${row.name}` : row.name, value: val.text, kind: val.kind, param: row.param,
          recent: !!frame && !!cell && recent === cell.id,
          flash: frame && cell && flash && flash.cell === cell.id ? flash.a : 0,
          rect, depth: 0, fold: row.fold ?? null,
        };
      });
      g.save();
      if (fading?.host === h.key) g.globalAlpha = fading.alpha;
      skin.frame(dc, panel, {
        mode: frame ? 'live' : returned ? 'returned' : 'none',
        stacked: Math.max(0, frames.length - 1),
        rows,
        head: { x: X, y: Y, w: W, h: INV_HEAD_PX * z },
      });
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
    if (s.room) this.drawRoom(s, skin, now, dc);
  }

  // ---------------- enter the machine ----------------

  private roomAnim: { from: Rect; start: number; dir: 1 | -1 } | null = null;
  private roomHits: { rect: Rect; back: Rect; stations: { y0: number; y1: number; line: number }[] } | null = null;

  // Grow the room out of the machine (a screen rect), or shrink it back.
  enterRoom(from: Rect, now: number): void {
    this.roomAnim = { from, start: now, dir: 1 };
  }
  leaveRoom(to: Rect, now: number): void {
    this.roomAnim = { from: to, start: now, dir: -1 };
  }
  // True once a leave animation has finished (the room can be dropped).
  roomGone(now: number): boolean {
    return !!this.roomAnim && this.roomAnim.dir < 0 && now - this.roomAnim.start > ROOM_MS;
  }
  machineRect(s: ViewState, fn: string): Rect {
    const n = s.layout.nodes.get(`func:${fn}`) ?? [...s.layout.nodes.values()].find((x) => x.name === fn);
    return n ? this.rectW(n.place.x, n.place.y, MW, MH) : { x: this.w / 2, y: this.h / 2, w: 1, h: 1 };
  }

  roomAt(x: number, y: number): { k: 'back' } | { k: 'station'; line: number } | { k: 'inside' } | { k: 'outside' } | null {
    const h = this.roomHits;
    if (!h) return null;
    const inR = (r: Rect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    if (inR(h.back)) return { k: 'back' };
    if (!inR(h.rect)) return { k: 'outside' };
    for (const st of h.stations) if (y >= st.y0 && y < st.y1 && x > h.rect.x + h.rect.w * 0.3) return { k: 'station', line: st.line };
    return { k: 'inside' };
  }

  private drawRoom(s: ViewState, skin: Skin, now: number, dc: Dc): void {
    const room = roomOf(s);
    const trace = s.trace;
    if (!room || !trace || !trace.evs.length) return (this.roomHits = null), undefined;
    const { fn, plan } = room;
    const g = this.g;
    const a = this.roomAnim;
    let k = 1;
    if (a) {
      const u = Math.max(0, Math.min(1, (now - a.start) / ROOM_MS));
      k = 1 - Math.pow(1 - u, 3);
      if (a.dir < 0) k = 1 - k;
    }
    const full: Rect = { x: 14, y: 10, w: this.w - 28, h: this.h - 90 };
    const from = a?.from ?? full;
    const R: Rect = { x: from.x + (full.x - from.x) * k, y: from.y + (full.y - from.y) * k, w: from.w + (full.w - from.w) * k, h: from.h + (full.h - from.h) * k };
    // the factory stays, faintly, around the room
    g.save();
    g.globalAlpha = k;
    g.fillStyle = skin.spotlight;
    g.fillRect(0, 0, this.w, this.h);
    g.fillStyle = skin.spotlight;
    g.fillRect(0, 0, this.w, this.h);
    g.restore();
    const sc = roomScene(trace, fn, plan, s.pos);
    const headH = 40;
    const title = `inside ${fn.cname}${sc.beat === null ? ' · not called yet' : sc.idle ? (sc.live ? ' · waiting on a call' : ' · waiting for the next call') : ''}`;
    // the floor
    g.save();
    g.beginPath();
    g.rect(R.x, R.y, R.w, R.h);
    g.clip();
    g.fillStyle = skin.casing;
    g.fillRect(R.x, R.y, R.w, R.h);
    skin.background(dc, this.cam.x, this.cam.y);
    g.restore();
    const hdc: Dc = { ...dc, z: 1.5, cs: CELL_PX * 1.5 };
    skin.wall(hdc, R, { name: title, fns: 0, live: sc.live && !sc.idle, pinned: false, selected: false, hovered: false, head: { x: R.x, y: R.y, w: R.w, h: headH } });
    const back: Rect = { x: R.x + R.w - 190, y: R.y + 6, w: 176, h: headH - 12 };
    skin.plate(hdc, back.x + back.w / 2, back.y + back.h / 2, '← factory  (Esc)', 'void');
    this.roomHits = { rect: R, back, stations: [] };
    if (k < 0.97) return;

    // ---- geometry: storage on the left, stations on the right, room for flights between ----
    const slots = slotsOf(fn);
    const b = sc.beat;
    const before = b ? trace.snaps[b.before] : sc.snap;
    const after = b ? trace.snaps[Math.min(b.after, trace.snaps.length - 1)] : sc.snap;
    const fBefore = b ? before.stack.find((f) => f.id === b.frame) ?? null : null;
    const fAfter = b ? after.stack.find((f) => f.id === b.frame) ?? fBefore : null;
    const vals0 = slots.map((sl) => slotValue(sl, fn.name, fBefore, before, trace));
    const vals1 = slots.map((sl) => slotValue(sl, fn.name, fAfter, after, trace));
    const memN = slots.filter((_, i) => vals1[i].bytes || vals0[i].bytes).length;
    const MEM_H = 66; // one strip on the memory floor, at zoom 1
    const rowsH0 = INV_HEAD_PX + slots.length * SLOT_PX + 12;
    const availH = R.h - headH - 30;
    const z = Math.max(0.7, Math.min(1.8, availH / (Math.max(rowsH0, plan.h * 1.1) + memN * (MEM_H + 8) + 20), (R.w - 50) / (250 + 90 + plan.w * 1.1)));
    const zI = z * 1.1;
    const rdc: Dc = { ...dc, z, cs: CELL_PX * z };
    const idc: Dc = { ...dc, z: zI, cs: CELL_PX * zI };
    const top = R.y + headH + 14;
    const SX = R.x + 22;
    const SW = 250 * z;
    const TX = SX + SW + 90 * z;
    const content = sc.idle ? 0.8 : 1;

    // which writes have landed, per chip (staggered)
    const writes = sc.writes.slice(0, 10);
    const chipU = (n: number, f: number) => Math.max(0, Math.min(1, (f - 0.1 * n) / 0.7));
    const arrived = new Set<string>();
    writes.forEach((w, n) => chipU(n, sc.landed) >= 1 && arrived.add(w.key));
    if (sc.landed >= 1) for (const w of writes) arrived.add(w.key);

    // ---- storage: variables on the left, the memory they point at along the floor ----
    g.save();
    g.globalAlpha *= content;
    const anchors = new Map<string, Pt>();
    const cells = new Map<string, Rect>(); // a slot's strip
    const rows: RowInfo[] = [];
    const stripsToDraw: { r: Rect; key: string; name: string; bytes: number[]; marks: { label: string; index: number }[] }[] = [];
    let y = top + INV_HEAD_PX * z;
    const memTop = R.y + R.h - 16 - memN * (MEM_H + 8) * z;
    let my = memTop;
    slots.forEach((sl, i) => {
      const v = arrived.has(sl.key) ? vals1[i] : vals0[i];
      const rect: Rect = { x: SX, y, w: SW, h: SLOT_PX * z };
      const hit = writes.some((w) => w.key === sl.key) && arrived.has(sl.key);
      rows.push({
        name: sl.kind === 'field' ? `  .${sl.name}` : sl.kind === 'more' ? `  ${sl.name}` : sl.kind === 'static' ? `${sl.name} (static)` : sl.name,
        value: v.text, kind: v.kind, param: sl.param, recent: hit, flash: hit && !sc.idle ? Math.max(0, 1 - sc.landed * 0.6) : 0, rect, depth: sl.depth, fold: null,
      });
      anchors.set(sl.key, [SX + SW, y + rect.h / 2]);
      y += rect.h;
      const bytes = v.bytes ?? vals1[i].bytes;
      if (bytes) {
        const r: Rect = { x: SX, y: my, w: R.x + R.w - 22 - SX, h: MEM_H * z };
        const path = sl.kind === 'field' ? `${sl.key.slice(2).split('.')[0]}->${sl.name}` : sl.name;
        stripsToDraw.push({ r, key: sl.key, name: path, bytes, marks: v.marks });
        cells.set(sl.key, r);
        my += (MEM_H + 8) * z;
      }
    });
    const panel: Rect = { x: SX, y: top, w: SW, h: y - top + 6 * z };
    skin.frame(rdc, panel, { mode: sc.live ? 'live' : sc.beat ? 'returned' : 'none', stacked: 0, rows, head: { x: SX, y: top, w: SW, h: INV_HEAD_PX * z } });
    for (const st of stripsToDraw) {
      const wrote = writes.filter((w) => w.key === st.key && w.index !== undefined && arrived.has(st.key));
      // the pointer's row points down at its memory
      const from = anchors.get(st.key);
      if (from) {
        g.save();
        g.strokeStyle = skin.casing === '#000' ? '#555' : 'rgba(128,128,128,0.6)';
        g.setLineDash([3, 3]);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(from[0] - 6, from[1]);
        g.lineTo(from[0] + 10 * z, from[1]);
        g.lineTo(from[0] + 10 * z, st.r.y);
        g.stroke();
        g.restore();
      }
      skin.strip(rdc, st.r, {
        label: `${st.name} → memory (${st.bytes.length} bytes shown)`, bound: true, bytes: st.bytes, length: st.bytes.length, pointer: null,
        markers: [...st.marks.map((m) => ({ label: m.label, index: m.index, sampledIndex: m.index })), ...wrote.slice(-1).map((w) => ({ label: 'wrote', index: w.index!, sampledIndex: w.index! }))],
        selected: false, hovered: false,
      });
    }
    g.restore();

    // ---- stations ----
    const frameId = b?.frame ?? null;
    const state: InteriorState | null = frameId !== null ? interiorAt(trace, plan, frameId, sc.interiorAt) : null;
    const active = b?.station ?? null;
    const override = b && active !== null && b.kind === 'switch' && !sc.idle
      ? { station: active, text: `${sc.compute} → ${sc.landed >= 1 || sc.phase === 'write' ? String(b.result ?? '?') : '…'}`, result: sc.phase === 'write' ? b.result ?? null : null }
      : null;
    const info = interiorInfo(plan, state, {
      x: TX, y: top, z: zI, title: 'stations', mode: sc.live ? 'live' : sc.beat ? 'returned' : 'none',
      readout: (sw, snapIdx) => (frameId === null ? '' : readoutOf(sw, trace, snapIdx === null ? after : trace.snaps[snapIdx], frameId, fn.name)),
      override,
      hot: b && active !== null && b.kind !== 'switch' && !sc.idle && sc.phase !== 'read' && sc.compute ? { station: active, text: sc.compute } : null,
    });
    g.save();
    g.globalAlpha *= content;
    skin.interior(idc, { x: TX, y: top, w: plan.w * zI, h: plan.h * zI }, info);
    g.restore();
    const stopOf = (k2: number): Pt => [TX + stopX(plan.stations[k2].depth) * zI, top + rowMid(plan.stations[k2].row) * zI];
    this.roomHits.stations = plan.stations.filter((st) => st.kind !== 'else').map((st) => ({ y0: top + (HEAD + st.row * ROW) * zI, y1: top + (HEAD + (st.row + (st.kind === 'if' || st.kind === 'loop' ? 2 : 1)) * ROW) * zI, line: st.line }));

    // ---- doors ----
    const entry: Pt = [SX + SW + 45 * z, R.y + headH];
    const exit: Pt = [TX + stopX(0) * zI, R.y + R.h];
    skin.door(dc, entry, false, b?.kind === 'entry' && !sc.idle);
    skin.door(dc, exit, false, b?.kind === 'exit' && !sc.idle);
    if (b?.kind === 'entry' || (b && sc.idle === false)) {
      const caller = trace.evs[b.kind === 'entry' ? b.from : b.from]?.k === 'call' ? (trace.evs[b.from] as { caller: string | null }).caller : null;
      if (b.kind === 'entry') skin.plate(rdc, entry[0], entry[1] + 16 * z, `from ${caller ?? 'the process'}`, 'void');
    }

    // ---- flights ----
    if (!b || sc.idle) return;
    const curve = (p: Pt, q: Pt): [Pt, Pt, Pt, Pt] => {
      const dx = (q[0] - p[0]) * 0.45;
      return [p, [p[0] + dx, p[1]], [q[0] - dx, q[1]], q];
    };
    const at = active !== null ? stopOf(active) : exit;
    const cellAt = (key: string, index: number | undefined): Pt => {
      const r = cells.get(key);
      if (r && index !== undefined) {
        const shown = Math.min(24, stripsToDraw.find((x) => x.key === key)!.bytes.length);
        const pad = Math.max(4, 7 * z);
        const tw = r.w - pad * 2;
        const th = Math.max(11, r.h * 0.27);
        return [r.x + pad + (Math.min(index, shown - 1) + 0.5) * (tw / shown), r.y + r.h * 0.31 + th / 2];
      }
      return anchors.get(key) ?? [SX + SW, top];
    };
    const B = b.bounds;
    const ev = trace.evs[b.from];
    // reads: slot → station
    if (b.kind !== 'entry' && (sc.phase === 'read' || (b.kind === 'exit' && sc.p < 0.6))) {
      const f = b.kind === 'exit' ? sc.p / 0.6 : sc.p / B.read;
      sc.reads.slice(0, 8).forEach((r, n) => {
        const u = chipU(n, f);
        if (u <= 0 || u >= 1) return;
        const [x, yy] = bez(curve(anchors.get(r.key) ?? [SX + SW, top], at), u);
        skin.pulse(rdc, x, yy);
        skin.plate(rdc, x, yy - 12 * z, r.text, 'arg');
      });
    }
    // calls: out through the callee's door, back in with the result
    if (b.calls.length && active !== null) {
      const c = b.calls.find((x) => x.call <= Math.floor(s.pos) && (x.ret === null || x.ret >= Math.floor(s.pos))) ?? b.calls[0];
      const door: Pt = [R.x + R.w, at[1]];
      skin.door(dc, door, true, sc.phase === 'out' || sc.phase === 'wait' || sc.phase === 'in');
      skin.plate(dc, door[0] - 60, door[1] - 18, c.fn, 'void');
      const call = trace.evs[c.call];
      const args = call.k === 'call' ? `${c.fn}(${call.args.map((x) => argLabel(x.val, x.text, trace, trace.snaps[c.call + 1])).join(', ')})` : c.fn;
      if (sc.phase === 'out') {
        const u = Math.max(0, Math.min(1, (sc.p - B.compute) / Math.max(0.01, B.out - B.compute)));
        const [x, yy] = bez(curve(at, door), u);
        skin.plate(rdc, x, yy - 12 * z, clip(args, 40), 'arg');
      } else if (sc.phase === 'wait') {
        skin.plate(rdc, door[0] - 90 * z, door[1] + 16 * z, `waiting on ${c.fn}…`, 'void');
        skin.pulse(rdc, door[0], door[1]);
      } else if (sc.phase === 'in' && c.ret !== null) {
        const r = trace.evs[c.ret];
        const u = Math.max(0, Math.min(1, (sc.p - B.out) / Math.max(0.01, B.in - B.out)));
        const [x, yy] = bez(curve(door, at), u);
        skin.plate(rdc, x, yy - 12 * z, r.k === 'ret' ? (r.val.k === 'void' ? 'void' : retLabel(r.val, trace)) : '', 'ret');
      }
    }
    // writes: station (or the entry door) → slot
    if (sc.phase === 'write' || b.kind === 'entry') {
      const origin: Pt = b.kind === 'entry' ? entry : at;
      writes.forEach((w, n) => {
        const u = chipU(n, sc.landed);
        if (u <= 0 || u >= 1) return;
        const [x, yy] = bez(curve(origin, cellAt(w.key, w.index)), u);
        skin.pulse(rdc, x, yy);
        skin.plate(rdc, x, yy - 12 * z, w.text, 'ret');
      });
    }
    // exit: the result leaves through the door under the stations
    if (b.kind === 'exit' && sc.p >= 0.6 && ev?.k === 'ret') {
      const u = (sc.p - 0.6) / 0.4;
      const [x, yy] = bez(curve(at, exit), Math.min(1, u));
      skin.plate(rdc, x, yy - 12 * z, ev.val.k === 'void' ? 'void' : retLabel(ev.val, trace), ev.val.k === 'void' ? 'void' : 'ret');
    }
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
