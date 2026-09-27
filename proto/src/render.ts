// Grid engine: camera, hosts, hit-testing and playback timing. Routing lives
// in route.ts; every pixel is delegated to the active skin (skins/*.ts).
import { CELL_PX, INV_HEAD_PX, MH, MOD_DOORS, MW, SLOT_PX, doorsOf, frameRows, type Layout } from './layout';
import type { Model } from './parse';
import { fmtVal, type Ev, type Payload, type Snap, type SnapCell, type SnapField, type SnapFrame, type Trace, type V } from './interp';
import { buildScene, crossings, hostKey, isModuleKey, procPlace, type Belt, type Scene } from './route';
import type { CrateInfo, Dc, Pt, Rect, RowInfo, RunState, Skin, StripInfo, ValueKind } from './skins/types';
import type { BoundValue, Sprite } from './blueprint';
import type { Violation } from './invariants';

export { procPlace, type Belt };

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

export function evDuration(e: Ev): number {
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

export function frameAt(trace: Trace, pos: number): { snap: Snap; ev: Ev | null; t: number; i: number; si: number } {
  const n = trace.evs.length;
  const p = Math.max(0, Math.min(pos, n));
  const i = Math.floor(p);
  const t = p - i;
  const ev = t > 0 && i < n ? trace.evs[i] : null;
  const si = ev && t >= switchAt(ev) ? i + 1 : i;
  return { snap: trace.snaps[si], ev, t, i, si };
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

function staticCellId(trace: Trace | null, fn: string, name: string): number | null {
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

function valueOf(c: SnapCell, frame: SnapFrame | null, trace: Trace | null, live: Set<number> | null): { text: string; kind: ValueKind } {
  if (c.val.k === 'undef') return { text: '?', kind: 'undef' };
  if (c.val.k === 'ptr') {
    if (c.val.to === null && !c.val.label) return { text: 'NULL', kind: 'null' };
    const dangling = c.val.to !== null && live !== null && !live.has(c.val.to);
    if (c.str && !dangling) return { text: clip(c.str, 12), kind: 'ptr' }; // a char *: the text, not the address
    const name = c.val.label ?? pointeeName(trace, c.val.to!, frame);
    return { text: `→${name}`, kind: dangling ? 'dangling' : 'ptr' };
  }
  if (c.val.k === 'raw') return { text: c.val.text, kind: 'int' };
  return { text: fmtVal(c.val, c.type), kind: 'int' };
}

// A quoted string cut to a readable length (never shrunk to fit).
export function clip(q: string, n: number): string {
  const inner = q.replace(/^"/, '').replace(/"?…?$/, '');
  const whole = /"$/.test(q);
  return inner.length <= n && whole ? q : `"${inner.slice(0, n)}…`;
}

function fieldValue(f: SnapField, trace: Trace | null): { text: string; kind: ValueKind } {
  if (f.val.k === 'ptr') {
    if (f.val.to === null && !f.val.label) return { text: 'NULL', kind: 'null' };
    if (f.str) return { text: clip(f.str, 12), kind: 'ptr' };
    return { text: `→${f.val.label ?? pointeeName(trace, f.val.to!, null)}`, kind: 'ptr' };
  }
  if (f.val.k === 'undef') return { text: '?', kind: 'undef' };
  if (f.val.k === 'raw') return { text: f.val.text, kind: 'int' };
  return { text: fmtVal(f.val, f.type), kind: 'int' };
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
        if (ev.k === 'call' && t < switchAt(ev)) fading = { host: target, alpha: t / switchAt(ev) };
        if (ev.k === 'ret') fading = { host: target, alpha: Math.max(0.15, 1 - (t / switchAt(ev)) * 0.85) };
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
    const flash = ev && ev.k === 'write' && t >= switchAt(ev) ? { cell: ev.cell, a: 1 - (t - switchAt(ev)) / (1 - switchAt(ev)) } : null;
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
    const newFrame = ev?.k === 'call' && t >= switchAt(ev) ? ev.frame : null;
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
        const grow = inNew ? Math.min(1, ((t - switchAt(ev!)) / (1 - switchAt(ev!))) * 1.4) : 1;
        const curve = this.wireCurve(a, b);
        const pts: Pt[] = [];
        for (let i = 0; i <= 40 * grow; i++) pts.push(bez(curve, i / 40));
        if (pts.length > 1) skin.wire(dc, pts, grow >= 1);
      }
      g.restore();
    }

    // ---- things in motion ----
    g.save();
    if (ev && trace) {
      const belt = animKey ? scene.belts.find((b) => b.key === animKey) : null;
      if ((ev.k === 'call' || ev.k === 'ret') && belt) {
        const walk = new PathWalk(belt.pts.map((p) => this.sp(p)));
        const travel = Math.min(1, t / switchAt(ev));
        const ease = travel < 0.5 ? 2 * travel * travel : 1 - Math.pow(-2 * travel + 2, 2) / 2;
        if (travel < 1 && ev.k === 'call') {
          if (!ev.args.length) {
            const p = walk.at(ease * walk.length);
            skin.plate(dc, p[0], p[1], '()', 'void');
          }
          // real data rides the belt: strings as text, structs as crates
          const after = trace.snaps[fr!.i + 1] ?? null;
          let gap = 0;
          ev.args.forEach((a) => {
            const d = ease * walk.length - gap;
            gap += a.data?.k === 'struct' ? cs * 2.6 : cs * 0.8;
            if (d < 0) return;
            const p = walk.at(d);
            if (a.data?.k === 'struct') skin.crate(dc, p[0], p[1], crateOf(a.data, 'arg'));
            else if (a.data?.k === 'str') skin.plate(dc, p[0], p[1], clip(a.data.text, 18), 'ptr');
            else skin.plate(dc, p[0], p[1], argLabel(a.val, a.text, trace, after), a.val.k === 'ptr' ? 'ptr' : 'arg');
          });
        } else if (travel < 1 && ev.k === 'ret') {
          const p = walk.at((1 - ease) * walk.length);
          if (ev.data?.k === 'struct') skin.crate(dc, p[0], p[1], crateOf(ev.data, 'ret'));
          else if (ev.data?.k === 'str') skin.plate(dc, p[0], p[1], clip(ev.data.text, 18), 'ret');
          else skin.plate(dc, p[0], p[1], ev.val.k === 'void' ? 'void' : retLabel(ev.val, trace), ev.val.k === 'void' ? 'void' : 'ret');
        }
      }
      if (ev.k === 'write' && ev.via !== null && t < switchAt(ev)) {
        const a = anchors.get(ev.via);
        const b = anchors.get(ev.cell);
        if (a && b) {
          const [x, y] = bez(this.wireCurve(a, b), Math.min(1, t / switchAt(ev)));
          skin.pulse(dc, x, y);
          skin.plate(dc, x, y - cs * 0.42, fmtVal(ev.val), 'arg');
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
