// Grid engine: camera and drawing. Playback timing and hosts live in
// playback.ts, hit-testing and rects in hit.ts, routing in route.ts; every
// pixel is delegated to the active skin (skins/*.ts).
import { CELL_PX, INV_HEAD_PX, MH, MOD_DOORS, MW, SLOT_PX, doorsOf } from './layout';
import { HEAD, ROW, interiorAt, planOf, rowMid, stopX, textX, type InteriorState, type Plan, type Station } from './interior';
import { beatNow, computeText, ptrTag, readsOf, READ_END, slotHistory, slotValue, writesOf, type BeatNow } from './beats';
import { geomOf, procH, procLines, shut, slotsOf, slotY } from './machine';
import type { FnInfo } from './parse';
import type { Host } from './route';
import { fmtVal, type Payload, type SnapCell, type SnapFrame, type Trace, type V } from './interp';
import { buildScene, crossings, isModuleKey, procPlace, type Belt } from './route';
import { clip, staticCellId } from './values';
import { fileCap, fnCaps } from './norm';
import { gfxMode } from './gfx/gfx';
import { GfxLayer, type GfxView } from './gfx/layer';
import { sceneFor } from './gfx/scenes';
import type { CrateInfo, Dc, InteriorInfo, Pt, Rect, RowInfo, RunState, Skin, StationInfo } from './skins/types';

export { procPlace, type Belt };
export { clip, pointeeName } from './values';
import { MODE, argLabel, beltHandle, clipCode, entKey, eventPair, frameAt, frameHosts, lastReturned, returnOf, liveHostPairs, readoutOf, retLabel, returnCard, sceneAt, spriteStripInfo, spriteWorldRect, staged, switchAt, type Duel, type DuelEnd, type ViewState } from './playback';

import { heapSlotRect, wallCrossings } from './hit';

// C's `->`, with a non-breaking hyphen (U+2011): code fonts join an ASCII
// `->` into one arrow glyph, which reads as "points to", not as a field
const ARROW = '\u2011>';
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


function crateOf(d: Extract<Payload, { k: 'struct' }>, kind: 'arg' | 'ret'): CrateInfo {
  const MAX = 6;
  return { title: d.type, via: d.via, rows: d.fields.slice(0, MAX).map((f) => ({ name: f.name, value: f.text.startsWith('"') ? clip(f.text, 18) : f.text })), more: Math.max(0, d.fields.length - MAX), kind };
}


// Light trails for data in flight (skins with a trail hook): the stretch of
// a path just travelled, oldest point first.
const TRAIL_N = 14;
function walkTrail(walk: PathWalk, from: number, to: number): Pt[] {
  const pts: Pt[] = [];
  for (let k = 0; k <= TRAIL_N; k++) pts.push(walk.at(Math.max(0, Math.min(walk.length, from + ((to - from) * k) / TRAIL_N))));
  return pts;
}
function bezTrail(c: [Pt, Pt, Pt, Pt], u: number, span = 0.35): Pt[] {
  const pts: Pt[] = [];
  const u0 = Math.max(0, u - span);
  for (let k = 0; k <= TRAIL_N; k++) pts.push(bez(c, u0 + ((u - u0) * k) / TRAIL_N));
  return pts;
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

// A char * on a belt: what it points at, for reading, then what really
// travels, the pointer (only the address is copied; the bytes stay put).
function strPlate(text: string, val: V, trace: Trace): string {
  const tag = ptrTag(val, trace, null).tag;
  return `${clip(text, 18)} · ${tag ? `ptr→${tag}` : 'ptr'}`;
}

// Each frame's call event and the error it died of, found once per trace.
// …and each heap block's malloc: the line, and the function that called it.
const callMemo = new WeakMap<Trace, { calls: Map<number, number>; errs: Map<number, Trace['evs'][number]>; allocs: Map<number, { line: number; fn: string | null }> }>();
function callsOf(trace: Trace) {
  let m = callMemo.get(trace);
  if (!m) {
    m = { calls: new Map(), errs: new Map(), allocs: new Map() };
    trace.evs.forEach((e, i) => {
      if (e.frame === null) return;
      if (e.k === 'call') m!.calls.set(e.frame, i);
      else if (e.k === 'error') m!.errs.set(e.frame, e);
      else if (e.k === 'alloc') {
        const ci = m!.calls.get(e.frame);
        const call = ci !== undefined ? trace.evs[ci] : null;
        m!.allocs.set(e.cell, { line: e.line + 1, fn: call?.k === 'call' ? call.fn : null });
      }
    });
    callMemo.set(trace, m);
  }
  return m;
}

export class GridView {
  private g: CanvasRenderingContext2D;
  // pointer cells whose line already goes to a byte strip in their machine
  private stripWired = new Set<number>();
  private dpr = 1;
  w = 0;
  h = 0;
  cam = { x: -2, y: -3, zoom: 1 };
  private target = { x: -2, y: -3, zoom: 1 };
  private last = performance.now();

  // the GPU background (GFX: full), under this canvas
  readonly gfx: GfxLayer;
  private still: { key: string; c: HTMLCanvasElement } | null = null; // GFX: simple
  // the background drawn on this canvas: its frames and the last one's cost
  bgFrames = 0;
  bgMs = 0;
  bgKind: 'gpu' | 'canvas' | 'still' | 'off' | 'page' = 'canvas';

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
    this.gfx = new GfxLayer(canvas);
    void this.gfx.init();
  }

  // The skin's background, as GFX says: its GPU scene (the grid canvas is
  // then left clear over it), its canvas drawing, a still of it, or its
  // flat colour. True when the GPU drew it.
  private background(skin: Skin, dc: Dc, now: number): boolean {
    const mode = gfxMode();
    const scene = mode === 'full' ? sceneFor(skin.id) : null;
    if (scene && this.gfx.ok && this.gfx.render(scene, this.gfxView(now))) {
      dc.g.clearRect(0, 0, this.w, this.h);
      this.bgKind = 'gpu';
      return true;
    }
    this.gfx.hide();
    this.bgKind = mode === 'full' ? 'canvas' : mode === 'simple' ? 'still' : 'off';
    const t0 = performance.now();
    const g = dc.g;
    g.save();
    if (mode === 'off') {
      g.fillStyle = skin.casing;
      g.fillRect(0, 0, this.w, this.h);
    } else if (mode === 'simple') {
      // one still picture per skin and size, painted once
      const key = `${skin.id}|${this.w}x${this.h}@${this.dpr}`;
      if (this.still?.key !== key) {
        const c = document.createElement('canvas');
        c.width = Math.round(this.w * this.dpr);
        c.height = Math.round(this.h * this.dpr);
        const cg = c.getContext('2d')!;
        cg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        skin.background({ ...dc, g: cg, time: 0 }, 0, 0);
        this.still = { key, c };
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.still.c, 0, 0);
    } else skin.background(dc, this.cam.x, this.cam.y);
    g.restore();
    this.bgMs = performance.now() - t0;
    this.bgFrames++;
    return false;
  }

  private gfxView(now: number): GfxView {
    return { w: this.w, h: this.h, dpr: this.dpr, time: now / 1000, z: this.cam.zoom, cs: this.cs, camX: this.cam.x, camY: this.cam.y };
  }

  // Idle: the grid rests, but a GPU background keeps moving on its own.
  // False when there's none to move.
  animateGfx(skin: Skin, now: number): boolean {
    const scene = gfxMode() === 'full' && !skin.fullBleed ? sceneFor(skin.id) : null;
    return !!scene && this.gfx.ok && !this.gfx.canvas.hidden && this.gfx.render(scene, this.gfxView(now));
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
    const shelf = slots >= 0 ? heapSlotRect(s.layout, slots, s.trace?.stdout) : null;
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
    if (skin.fullBleed) {
      g.clearRect(0, 0, this.w, this.h); // the page behind shows through
      this.gfx.hide();
      this.bgKind = 'page';
    } else this.background(skin, dc, now);

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
        ...(skin.capacity && s.model ? { cap: fileCap(s.model, w.file) } : {}),
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
      skin.proc(dc, this.rectW(pp.x, pp.y, MW, procH(trace?.stdout)), {
        state: !trace || (!st.length && !finished) ? 'idle' : finished ? (trace.error ? 'crashed' : 'done') : 'running',
        exit: finished && trace?.exit ? fmtVal(trace.exit) : null,
        // what has really reached the terminal by now (gdb engine); before,
        // only the whole output once the program had finished
        out: trace?.outText !== undefined && snap?.out ? trace.outText.slice(0, snap.out.sent) || undefined : finished ? trace?.stdout : undefined,
        args: trace?.args,
        lines: Math.max(2, procLines(trace?.stdout)),
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
        ...(skin.capacity && s.model ? { cap: fileCap(s.model, h.module) } : {}),
      });
      g.restore();
    }

    // ---- statics (on homes) + frames (on every drawn host) ----
    const anchors = new Map<number, Anchor>();
    this.stripWired.clear();
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
        const w = slot !== undefined ? heapSlotRect(s.layout, slot, s.trace?.stdout) : null;
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
    // Where every machine's rows are, from geometry alone, before any is
    // culled: a pointer into a machine off screen (or closed, or too small to
    // show its storage) still has an end to draw its line to. Drawn machines
    // set the same anchors again below.
    if (trace) for (const h of hostsToDraw) this.rowAnchors(s, h, framesOnHost.get(h.key) ?? [], anchors, trace);
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
    // Every pointer gets its line, so a pointer always reads as one. The
    // running frame's, the focused function's and one a write is travelling
    // through are drawn fully; the rest quieter, never hidden.
    const newFrame = ev?.k === 'call' && ph!.switched ? ev.frame : null;
    const cells: SnapCell[] = [...(snap?.statics ?? []), ...st.flatMap((f) => f.cells)];
    const wired = cells.filter((c) => c.val.k === 'ptr' && c.val.to !== null && anchors.has(c.id));
    const frameOfCell = new Map<number, SnapFrame>();
    for (const f of st) for (const c of f.cells) frameOfCell.set(c.id, f);
    const topId = st[st.length - 1]?.id ?? null;
    for (const c of wired) {
      if (c.val.k !== 'ptr' || c.val.to === null) continue;
      const a = anchors.get(c.id)!;
      const owner = frameOfCell.get(c.id);
      const travelling = ev?.k === 'write' && ev.via === c.id;
      const focused = !!focusFn && owner?.fn === focusFn;
      if (this.stripWired.has(c.id)) continue;
      const b = anchors.get(c.val.to);
      g.save();
      if (focus) g.globalAlpha = 0.55;
      if (owner?.id !== topId && !focused && !travelling) g.globalAlpha *= 0.4;
      if (!live.has(c.val.to)) skin.dangling(dc, [a.right, a.y]); // the skin draws it pointing right
      else if (!b) {
        // points at something not drawn here (heap, a collapsed module, off
        // screen): a short stub with its arrow, so it still reads as a pointer
        const L = this.cs * 0.9;
        const pts: Pt[] = [];
        for (let i = 0; i <= 8; i++) pts.push([a.left - (L * i) / 8, a.y]);
        skin.wire(dc, pts, true);
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
        if (k === '') return pp ? this.rectW(pp.x, pp.y, MW, procH(trace.stdout)) : null;
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
          if (skin.trail && ev.args.length) {
            const tail = head - L * fit;
            skin.trail(ddc, walkTrail(walk, tail - unit * 7, head), 'arg');
          }
          let gap = 0;
          ev.args.forEach((a, k) => {
            const d = head - gap;
            gap += focus ? ((sizes[k] + (sizes[k + 1] ?? 0)) / 2) * fit : sizes[k];
            if (d < 0) return;
            const p = walk.at(d);
            if (a.data?.k === 'struct') skin.crate(ddc, p[0], p[1], crateOf(a.data, 'arg'));
            else if (a.data?.k === 'str') skin.plate(ddc, p[0], p[1], strPlate(a.data.text, a.val, trace), 'ptr', 'arg');
            else skin.plate(ddc, p[0], p[1], argLabel(a.val, a.text, trace, after), a.val.k === 'ptr' ? 'ptr' : 'arg', 'arg');
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
          const d = MODE === 'focus' ? Math.min(walk.length - half, Math.max(half, (1 - ease) * walk.length)) : (1 - ease) * walk.length;
          const p = walk.at(d);
          if (skin.trail) skin.trail(ddc, walkTrail(walk, d + ddc.z * CELL_PX * 7, d), 'ret');
          if (crate) skin.crate(ddc, p[0], p[1], crate);
          else if (ev.data?.k === 'struct') skin.crate(ddc, p[0], p[1], crateOf(ev.data, 'ret'));
          else if (ev.data?.k === 'str') skin.plate(ddc, p[0], p[1], strPlate(ev.data.text, ev.val, trace), 'ret', 'ret');
          else skin.plate(ddc, p[0], p[1], ev.val.k === 'void' ? 'void' : retLabel(ev.val, trace), ev.val.k === 'void' ? 'void' : 'ret', 'ret');
        }
      }
      if (ev.k === 'write' && ev.via !== null && ((!ph!.switched && ph!.travel < 1) || ph!.parked)) {
        const a = anchors.get(ev.via);
        const b = anchors.get(ev.cell);
        if (a && b) {
          const wc = this.wireCurve(a, b);
          const u = Math.max(0.08, Math.min(0.92, ph!.travel));
          const [x, y] = bez(wc, u);
          if (skin.trail) skin.trail(ddc, bezTrail(wc, u), 'arg');
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

    // ---- the duel: a transfer whose sender or receiver is off screen pops up
    // side by side, sender on the left, receiver on the right ----
    this.duel = null;
    if (trace && fr) {
      const off = (p: Pt) => { const [x, y] = this.sp(p); return x < 0 || y < 0 || x > this.w || y > this.h; };
      let duel: Duel | null = null;
      const hostRectW = (k: string): Rect | null => { const h = scene.hosts.get(k); return h ? { x: h.x, y: h.y, w: h.w, h: h.h } : null; };
      if (ev && (ev.k === 'call' || ev.k === 'ret') && animKey && animPair) {
        const belt = scene.belts.find((b) => b.key === animKey);
        if (belt) {
          // inside: the calling statement, and just past the callee's entry door
          const [a0, b0] = [belt.pts[0], belt.pts[belt.pts.length - 1]];
          const caller: DuelEnd = { at: [a0[0] - 7, a0[1]], rect: hostRectW(animPair[0]), name: belt.from || 'process' };
          const callee: DuelEnd = { at: [b0[0] + 4.5, b0[1] + 1.5], rect: hostRectW(animPair[1]), name: ev.fn };
          const snapNow = trace.snaps[Math.min(fr.i + 1, trace.snaps.length - 1)];
          const label = ev.k === 'call'
            ? ev.args.map((x) => `${x.name} = ${argLabel(x.val, x.text, trace, snapNow)}`).join(', ') || '()'
            : ev.val.k === 'void' ? 'void' : retLabel(ev.val, trace);
          duel = ev.k === 'call'
            ? { key: `c${fr.i}`, kind: 'call', i: fr.i, left: { ...caller, verb: 'calls' }, right: { ...callee, verb: 'called' }, p: ph?.travel ?? 0, label }
            : { key: `r${fr.i}`, kind: 'ret', i: fr.i, left: { ...callee, verb: 'returns' }, right: { ...caller, verb: 'gets it back' }, p: ph?.travel ?? 0, label };
        }
      }
      // a statement writing into memory another machine owns
      if (!duel && now_ && now_.phase === 'write') {
        const b = now_.beat;
        const hosts = frameHosts(trace.snaps[Math.min(b.after, trace.snaps.length - 1)], scene);
        for (let i = b.from; i <= b.to && !duel; i++) {
          const e = trace.evs[i];
          if (e.k !== 'write') continue;
          const info = trace.cells.get(e.cell);
          if (!info || info.frame === b.frame || info.frame === -2) continue;
          const owner = info.frame === -1 ? info.owner : trace.snaps[i + 1]?.stack.find((f) => f.id === info.frame)?.fn;
          const hk = info.frame === -1 ? owner : hosts.get(info.frame);
          const h = hk ? scene.hosts.get(hk) : undefined;
          const fn = owner ? s.model?.byName.get(owner) : undefined;
          const wk = hosts.get(b.frame);
          const wh = wk ? scene.hosts.get(wk) : undefined;
          const wfn = s.model?.byName.get(b.fn);
          if (!h || !fn || fn.broken || !wh || !wfn) continue;
          const idx = slotsOf(fn).findIndex((sl) => sl.key === `${info.frame === -1 ? 's' : 'c'}:${info.name}`);
          const at: Pt = shut.has(fn.name) || idx < 0 ? [h.x + h.w / 2, h.y + h.h / 2] : [h.x + geomOf(fn).store.x + geomOf(fn).store.w * 0.6, h.y + slotY(geomOf(fn), idx)];
          const plan = planOf(wfn);
          const g2 = geomOf(wfn);
          const from: Pt = shut.has(wfn.name) ? [wh.x + wh.w / 2, wh.y + wh.h / 2] : [wh.x + g2.stations.x + 4, wh.y + g2.stations.y + (rowMid(plan.stations[b.station].row) * g2.stations.zoom) / CELL_PX];
          duel = {
            key: `w${b.from}|${i}`, kind: 'write', i, beatFrom: b.from, p: now_.landed, label: `${info.name} = ${fmtVal(e.val)}`,
            left: { at: from, rect: { x: wh.x, y: wh.y, w: wh.w, h: wh.h }, name: wfn.cname, verb: 'writes' },
            right: { at, rect: { x: h.x, y: h.y, w: h.w, h: h.h }, name: fn.cname, verb: `${info.name} changes` },
          };
        }
      }
      // the page shows it (main.ts renderDuel): clear cards, not more scene
      this.duel = duel && (off(duel.left.at) || off(duel.right.at)) ? duel : null;
    }
  }

  // A transfer whose sender or receiver is off screen, for the page to show.
  duel: Duel | null = null;

  // A machine is its inside: storage (variables) on the left, stations
  // (statements) on the right, the memory its char *s point at along the
  // bottom. The statement running now animates: what it reads flies in, it
  // shows its values, what it changes flies out. Zoomed out, only the shell,
  // its motor and the line it's on.
  // Anchors for a host's variables without drawing it: its storage rows, or
  // its right edge when its storage isn't shown (closed, broken, zoomed out).
  private rowAnchors(s: ViewState, h: Host, frames: SnapFrame[], anchors: Map<number, Anchor>, trace: Trace): void {
    const fn = s.model?.byName.get(h.fn);
    if (!fn) return;
    const cs = this.cs;
    const R = this.rectW(h.x, h.y, h.w, h.h);
    const edge = { y: R.y + R.h / 2, left: R.x, right: R.x + R.w };
    const rows = !fn.broken && !shut.has(fn.name) && cs >= 20;
    const geo = rows ? geomOf(fn) : null;
    const slots = geo ? slotsOf(fn) : [];
    const at = (name: string, kind: 'cell' | 'static'): Anchor => {
      const i = slots.findIndex((sl) => sl.kind === kind && sl.name === name);
      if (!geo || i < 0) return edge;
      return { y: this.sy(h.y + slotY(geo, i)), left: this.sx(h.x + geo.store.x), right: this.sx(h.x + geo.store.x + geo.store.w) };
    };
    for (const f of frames) for (const c of f.cells) anchors.set(c.id, at(c.name, 'cell'));
    if (h.copy !== 1) return;
    for (const v of fn.statics) {
      const id = staticCellId(trace, fn.name, v.name);
      if (id !== null) anchors.set(id, at(v.name, 'static'));
    }
  }

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
    const motorR = this.rectW(h.x + m.x, h.y + m.y, MW, MH);
    const inPorts = ports.in.map((y) => this.sy(y));
    const editing = h.copy === 1 && s.editorFn === h.fn;
    if (skin.dock) {
      // the IN dock: the arguments as they arrived with the call on show
      const on = frame ?? returned;
      const ci = on && trace ? callsOf(trace).calls.get(on.id) : undefined;
      const call = ci !== undefined ? trace!.evs[ci] : null;
      const err = frame && trace ? callsOf(trace).errs.get(frame.id) ?? null : null;
      const before = on && !call && trace?.window && trace.window.from > 0 ? trace.window.from : null;
      skin.dock(dc, motorR, {
        name: h.fn, state, waitingOn, frames: stacked, stale, copy: h.copy, editing, inPorts, before,
        args: call?.k === 'call' ? call.args.map((a) => ({ name: a.name, text: fmtVal(a.val), ...ptrTag(a.val, trace!, on) })) : null,
        last: !frame && !!call,
        crash: state === 'error' && err?.k === 'error' ? { line: err.line + 1, msg: err.msg } : null,
        ...(skin.capacity ? { cap: fnCaps(fn).params } : {}),
      });
    } else skin.node(dc, motorR, {
      name: h.copy > 1 ? `${h.fn} #${h.copy}` : h.fn, state, waitingOn, frames: stacked, stale, pinned: false,
      isStatic: fn.isStatic, params: fn.params.length, selected: false, hovered: false,
      editing, hasFrame: false, copy: h.copy, inPorts, outPorts: [],
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
    const { snap: snapNow, si: snapIdx } = frameAt(trace, s.pos);
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
      const rect: Rect = { x: X, y: this.sy(h.y + geo.store.slotTop[i]), w: W, h: SLOT_PX * z };
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
      // reached fields read as the C that gets there (`buf->len`); own fields as `.len`
      const reached = sl.pool === 'reached';
      const label = sl.kind === 'field' ? (reached ? `${sl.parent}${ARROW}${sl.name}` : `  .${sl.name}`)
        : sl.kind === 'more' ? (reached ? `${sl.parent}: ${sl.name}` : `  ${sl.name}`)
        : sl.fold ? `${sl.fold === 'open' ? '▾' : '▸'} ${sl.name}` : sl.name;
      // what it held before, while its frame runs (the value it holds now is `value`)
      const past = frame && sl.kind !== 'static' ? slotHistory(sl, fn.name, frame.id, trace, arrived.has(sl.key) ? act!.beat.after : act ? act.beat.before : snapIdx) : undefined;
      return {
        name: label, value: v.text, kind: v.kind, param: sl.param, tag: v.tag, recent: hit, flash: hit ? Math.max(0, 1 - act!.landed * 0.6) : 0,
        rect, depth: sl.depth, fold: sl.fold ?? null, past,
      };
    });
    // the Norm's 5 variables count locals and local statics together: on
    // LOCALS, or KEPT when there are only statics
    const varsOn = geo.store.pools.find((pg) => pg.pool === 'local') ?? geo.store.pools.find((pg) => pg.pool === 'kept');
    geo.store.pools.forEach((pg, k) => {
      const PY = this.sy(h.y + pg.y);
      skin.frame(dc, { x: X, y: PY, w: W, h: pg.h * cs }, {
        title: pg.title, mode: liveMode, stacked: k === 0 ? Math.max(0, stacked - 1) : 0,
        rows: rows.slice(pg.first, pg.first + pg.rows), head: { x: X, y: PY, w: W, h: INV_HEAD_PX * z },
        ...(skin.capacity && pg === varsOn ? { cap: fnCaps(fn).vars } : {}),
      });
    });

    // ---- return: the type, and the value once it leaves ----
    {
      const RY = this.sy(h.y + geo.ret.y);
      const RW = geo.ret.w * cs;
      const ret = returnOf(trace, shown?.id ?? null, s.pos);
      const value = fn.ret === 'void' ? (ret ? 'done' : '') : ret ? retLabel(ret.val, trace) : frame ? '…' : '';
      skin.frame(dc, { x: X, y: RY, w: RW, h: geo.ret.h * cs }, {
        title: 'RETURN', mode: liveMode, stacked: 0, head: { x: X, y: RY, w: RW, h: INV_HEAD_PX * z },
        rows: [{ name: fn.ret, value, kind: ret ? 'int' : 'none', param: false, recent: !!ret && s.pos - ret.at < 1, flash: 0,
          rect: { x: X, y: RY + INV_HEAD_PX * z, w: RW, h: SLOT_PX * z }, depth: 0, fold: null }],
      });
    }

    // ---- reached memory: the bytes behind each char * ----
    // where they live, and who allocated them (a heap block's malloc)
    const targetOf = (key: string): number | null => {
      const [parent, field] = key.slice(2).split('.');
      const c = shown?.cells.find((x) => x.name === parent);
      const val = field === undefined ? c?.val : c?.fields?.find((f) => f.name === field)?.val;
      return val?.k === 'ptr' ? val.to : null;
    };
    const allocText = (key: string): string => {
      const id = targetOf(key);
      if (id === null) return '';
      const a = callsOf(trace).allocs.get(id);
      if (a) return ` · malloc ${a.fn ?? '?'}:${a.line}`;
      return trace.window && trace.window.from > 0 ? ` · malloc before step ${trace.window.from}` : '';
    };
    const whereOf = (key: string): string => {
      const id = targetOf(key);
      const owner = id !== null ? trace.cells.get(id)?.owner : undefined;
      return owner === undefined || owner === 'heap' ? '' : owner === '' ? ' (static)' : ' (stack)';
    };
    const mem = new Map<string, { r: Rect; len: number }>();
    geo.memory.keys.forEach((key, k) => {
      const r = this.rectW(h.x + geo.memory.x, h.y + geo.memory.y + k * (geo.memH + geo.memGap), geo.memory.w, geo.memH);
      const sl = slots.find((x) => x.key === key)!;
      const v = valueAt(key);
      const bytes = v.bytes ?? [];
      mem.set(key, { r, len: bytes.length });
      const wrote = writes.filter((w) => w.key === key && w.index !== undefined && arrived.has(key));
      const label = sl.kind === 'field' ? `${key.slice(2).split('.')[0]}${ARROW}${sl.name}` : sl.name;
      if (!v.bytes) {
        // nothing to show yet (NULL, not set, or not in memory the trace
        // saw): say where it points, if anywhere
        g.save();
        g.globalAlpha *= 0.6;
        skin.plate(dc, r.x + r.w / 2, r.y + r.h / 2, clipCode(`${label} → ${v.tag ? `${v.tag}${whereOf(key)}` : v.text || '?'}`, 34), 'void');
        g.restore();
        return;
      }
      skin.strip(dc, r, {
        label: `${label} → ${v.tag ?? '?'}${allocText(key)}`, bound: !!v.bytes, bytes, length: v.bytes ? bytes.length : null, pointer: null,
        markers: [...v.marks.map((mk) => ({ label: mk.label, index: mk.index, sampledIndex: mk.index })), ...wrote.slice(-1).map((w) => ({ label: 'wrote', index: w.index!, sampledIndex: w.index! }))],
        selected: false, hovered: false,
      });
    });

    // a pointer with bytes drawn below gets its line to them (a field in
    // REACHED too, which the global wire pass doesn't know about)
    for (const [key, m] of mem) {
      const from = slotAt.get(key);
      if (!from || !m.len) continue;
      // out of the row's left side, into the strip's left end (as every pointer line)
      const start: Pt = [X, from[1]];
      const to: Pt = [m.r.x, m.r.y + m.r.h / 2];
      const out = Math.max(cs * 0.7, 14 * z);
      const c: [Pt, Pt, Pt, Pt] = [start, [Math.min(start[0], to[0]) - out, start[1]], [Math.min(start[0], to[0]) - out, to[1]], to];
      const pts: Pt[] = [];
      for (let i = 0; i <= 32; i++) pts.push(bez(c, i / 32));
      g.save();
      if (!frame) g.globalAlpha *= 0.4;
      skin.wire(dc, pts, true);
      g.restore();
      const sl = slots.find((x) => x.key === key);
      const cell = sl?.kind === 'cell' ? frame?.cells.find((x) => x.name === sl.name) : undefined;
      if (cell) this.stripWired.add(cell.id);
    }

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
    if (skin.capacity) info.cap = { ...fnCaps(fn).lines, unit: 'lines' };
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
        const c = curve(slotAt.get(r.key) ?? [X + W, Y], at);
        const [x, y] = bez(c, u);
        if (skin.trail) skin.trail(dc, bezTrail(c, u), 'arg');
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
      const c = curve(at, to);
      const [x, y] = bez(c, u);
      if (skin.trail) skin.trail(dc, bezTrail(c, u), 'ret');
      skin.pulse(dc, x, y);
      skin.plate(dc, x, y - 12 * z, w.text, 'ret');
    });
  }

  // A pointer's line leaves its row on the left and plugs into its target's
  // row on the left too, bulging out past whichever is further left (the
  // author's design: storage rows are read from the left, and the lines keep
  // clear of the values on the right).
  private wireCurve(a: Anchor, b: Anchor): [Pt, Pt, Pt, Pt] {
    const cs = this.cs;
    const p0: Pt = [a.left, a.y];
    const p3: Pt = [b.left, b.y];
    const dist = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
    const out = Math.min(cs * 2.4, Math.max(cs * 0.8, dist * 0.3));
    const x = Math.min(p0[0], p3[0]) - out;
    return [p0, [x, p0[1]], [x, p3[1]], p3];
  }

}
