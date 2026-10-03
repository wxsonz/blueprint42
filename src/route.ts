// Scene building: where recursive copies go, which port each call uses, and
// how every belt is routed so lines never share a segment.
//
// Hosts: every function has a home node (copy 1). A frame that is not the
// function's first live frame is hosted by a spawned copy (copy 2, 3, …),
// placed in reserved slots next to the home, so recursion reads as a chain of
// factories rather than one machine talking to itself.
import { MH, MW, footprint, type Layout, type NodeState } from './layout';
import { callPortY, folded, geomOf, machineSize, procBlockH, shut } from './machine';
import { reportCheck } from './diag';
//
// Modules (M5): a collapsed module is one host (key "mod:<file>"). Calls
// from outside land on it; all calls between the same two hosts share one
// belt (the trunk), whose `lines` count the call sites it carries.
import type { Model } from './parse';
import type { Trace } from './interp';
import type { Pt } from './skins/types';

export const MAX_COPIES = 10; // including the home node

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Host {
  key: string; // "fn" for the home, "fn#k" for copy k, "mod:<file>" for a collapsed module
  fn: string;
  copy: number; // 1 = home
  x: number;
  y: number;
  w: number; // body size, cells (MW × MH for a machine)
  h: number;
  inv: number; // frame panel height, cells
  module?: string; // set on a collapsed module's host
}

export const moduleKey = (file: string) => `mod:${file}`;
export const isModuleKey = (k: string) => k.startsWith('mod:');

export interface Belt {
  key: string; // "<fromHost>><toHost>"; the process is ''
  from: string; // function names ('' = the process)
  to: string;
  fromHost: string;
  toHost: string;
  pts: Pt[];
  lines: number[];
  custom: boolean;
  chain: boolean; // recursive hand-off between copies
  transient: boolean; // exists only while that call is live
  callees: string[]; // functions this belt delivers to (several on a trunk into a module)
  srcFile: string; // file the call sites (lines) are in
}

export interface Scene {
  hosts: Map<string, Host>;
  copies: Map<string, number>; // fn -> number of reserved copies incl. home
  belts: Belt[];
  ports: Map<string, { in: number[]; out: number[] }>; // host key -> world y's
  obstacles: Rect[];
  moduleOf: Map<string, string>; // function → its collapsed module's host key
  walls: { file: string; rect: Rect }[]; // expanded modules
}

export const hostKey = (fn: string, copy: number) => (copy <= 1 ? fn : `${fn}#${copy}`);

// ---------- helpers ----------

const maxCache = new WeakMap<Trace, Map<string, number>>();
function maxFrames(trace: Trace | null, fn: string): number {
  if (!trace) return 0;
  let m = maxCache.get(trace);
  if (!m) {
    m = new Map();
    for (const s of trace.snaps) {
      const count = new Map<string, number>();
      for (const f of s.stack) count.set(f.fn, (count.get(f.fn) ?? 0) + 1);
      for (const [k, v] of count) m.set(k, Math.max(m.get(k) ?? 0, v));
    }
    maxCache.set(trace, m);
  }
  return m.get(fn) ?? 0;
}

// What a scene reads of a trace, worked out ahead (a long window's, while it
// converts: main.ts windowTrace), so its first frame doesn't pay for it.
export function warmScene(trace: Trace): void {
  maxFrames(trace, '');
}

const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// A scene's obstacles by the cells of a grid they cover: "is this clear?"
// tries only the ones nearby (an obstacle that overlaps a rect shares a cell
// with it), with the same answer as trying them all, and `first` finds the
// same one: the earliest added.
const NEAR_CELL = 8;
class Near {
  private cells = new Map<number, number[]>();
  constructor(readonly list: Rect[]) {}
  add(r: Rect): void {
    const i = this.list.length;
    this.list.push(r);
    this.cellsOf(r, 0, (k) => {
      const l = this.cells.get(k);
      if (l) l.push(i);
      else this.cells.set(k, [i]);
    });
  }
  // the cells under r, grown by pad (when it grows)
  private cellsOf(r: Rect, pad: number, f: (key: number) => void): void {
    const p = Math.max(0, pad);
    const x1 = Math.floor((r.x + r.w + p) / NEAR_CELL), y1 = Math.floor((r.y + r.h + p) / NEAR_CELL);
    for (let cx = Math.floor((r.x - p) / NEAR_CELL); cx <= x1; cx++) {
      for (let cy = Math.floor((r.y - p) / NEAR_CELL); cy <= y1; cy++) f(cx * 65536 + cy);
    }
  }
  // does an obstacle (not one of `skip`) overlap r, with `pad` around it?
  any(r: Rect, pad: number, skip: Rect[] = []): boolean {
    let hit = false;
    this.cellsOf(r, pad, (k) => {
      if (hit) return;
      for (const i of this.cells.get(k) ?? []) {
        const o = this.list[i];
        sceneStats.near++;
        if (!skip.includes(o) && overlaps(r, o, pad)) return void (hit = true);
      }
    });
    return hit;
  }
  // the earliest added obstacle around r that passes `ok`
  first(r: Rect, ok: (o: Rect) => boolean): Rect | undefined {
    let best = Infinity;
    this.cellsOf(r, 0, (k) => {
      for (const i of this.cells.get(k) ?? []) if (i < best && ok(this.list[i])) best = i;
    });
    return this.list[best];
  }
}

function hostRect(h: Host): Rect {
  return { x: h.x, y: h.y, w: h.w, h: h.h + h.inv };
}

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i--) {
    const [a, b, c] = [out[i - 1], out[i], out[i + 1]];
    if ((Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(b[0] - c[0]) < 1e-6) || (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(b[1] - c[1]) < 1e-6)) out.splice(i, 1);
  }
  return out;
}

export function procPlace(layout: Layout): { x: number; y: number } | null {
  const main = layout.nodes.get('func:main');
  if (!main) return null;
  if (layout.hidden(main)) {
    const r = layout.moduleRect(main.file);
    return { x: r.x - 7, y: r.y };
  }
  return { x: main.place.x - 7, y: main.place.y };
}

// ---------- scene ----------

interface Edge {
  key: string;
  from: string;
  to: string;
  A: Host | null; // null = the process
  B: Host;
  lines: number[];
  chain: boolean;
  transient: boolean;
  callees: Set<string>;
  srcFile: string;
  sy: number;
  ty: number;
}

// ---------- the scene, built once per change ----------
// A frame, the minimap, the follow camera and every hit test ask for the same
// scene, many times a frame. It is built again only when something it is made
// of changes: the layout (its revision), the model, the trace, folded and
// shut machines, and the live calls a frame adds (`transient`). A layout
// keeps the last few (a frame in a recursion asks for two: with and without
// the copies' live calls); one for another model or trace is let go.
export const sceneStats = { builds: 0, pairs: 0, near: 0 }; // scenes really built, belt pairs tried for crossings, obstacles tried while routing (tests, tools/scale.mjs)
interface Kept { rev: number; model: Model | null; trace: Trace | null; fold: string; live: string; scene: Scene; print: string; hits: number }
const kept = new WeakMap<Layout, Kept[]>();
const KEEP = 4;
const foldKey = () => `${[...folded].join('|')}#${[...shut].join('|')}`;
// what the scene reads of the layout (dev builds check a kept scene against
// it now and then: a change made without Layout.touch() is reported, not drawn stale)
function layoutPrint(l: Layout): string {
  let s = '';
  for (const [id, n] of l.nodes) s += `${id}@${n.file}:${n.place.x},${n.place.y};`;
  for (const [f, m] of l.modules) s += `${f}:${m.x},${m.y},${+m.collapsed};`;
  for (const [k, p] of l.waypoints) s += `${k}:${p.x},${p.y};`;
  return s;
}

export function buildScene(layout: Layout, model: Model | null, trace: Trace | null, transient: [string, string][] = []): Scene {
  const fold = foldKey();
  const live = transient.map(([a, b]) => `${a}>${b}`).join(',');
  const list = kept.get(layout) ?? [];
  const i = list.findIndex((k) => k.rev === layout.rev && k.model === model && k.trace === trace && k.fold === fold && k.live === live);
  if (i >= 0) {
    const hit = list[i];
    if (import.meta.env.DEV && ++hit.hits % 60 === 0 && hit.print !== layoutPrint(layout)) {
      reportCheck({ check: 'scene kept', detail: 'the layout changed without Layout.touch(): the scene was built again', at: null });
      list.splice(i, 1);
      return buildScene(layout, model, trace, transient);
    }
    if (i) list.unshift(...list.splice(i, 1));
    return hit.scene;
  }
  const scene = computeScene(layout, model, trace, transient);
  const next = [{ rev: layout.rev, model, trace, fold, live, scene, print: import.meta.env.DEV ? layoutPrint(layout) : '', hits: 0 }, ...list.filter((k) => k.model === model && k.trace === trace)];
  kept.set(layout, next.slice(0, KEEP));
  return scene;
}

// The scene, built now (buildScene keeps it; tests and tools call this to
// measure or compare a fresh one).
export function computeScene(layout: Layout, model: Model | null, trace: Trace | null, transient: [string, string][] = []): Scene {
  sceneStats.builds++;
  const hosts = new Map<string, Host>();
  const copies = new Map<string, number>();
  const obstacles: Rect[] = [];
  const near = new Near(obstacles);
  const moduleOf = new Map<string, string>();
  const scene: Scene = { hosts, copies, belts: [], ports: new Map(), obstacles, moduleOf, walls: [] };
  if (!model) return scene;

  for (const n of layout.nodes.values()) {
    if (layout.hidden(n)) {
      moduleOf.set(n.name, moduleKey(n.file));
      continue;
    }
    const size = machineSize(n.fn);
    hosts.set(n.name, { key: n.name, fn: n.name, copy: 1, x: n.place.x, y: n.place.y, w: size.w, h: size.h, inv: 0 });
    const f = footprint(n);
    near.add({ x: f.x + 1, y: f.y, w: f.w - 2, h: f.h });
  }
  for (const m of layout.modules.values()) {
    const r = layout.moduleRect(m.file);
    if (!m.collapsed) {
      scene.walls.push({ file: m.file, rect: r });
      continue;
    }
    const key = moduleKey(m.file);
    hosts.set(key, { key, fn: key, copy: 1, x: r.x, y: r.y, w: r.w, h: r.h, inv: 0, module: m.file });
    near.add(r);
  }
  const pp = procPlace(layout);
  const procRect: Rect | null = pp ? { x: pp.x, y: pp.y, w: MW, h: procBlockH(trace) } : null;
  if (procRect) near.add(procRect);

  // ---- reserve copy slots next to each recursive function ----
  for (const f of model.fns) {
    const home = layout.nodes.get(f.id);
    if (!home || layout.hidden(home)) continue;
    const selfRec = f.calls.some((c) => c.callee === f.name);
    const want = Math.min(MAX_COPIES, Math.max(selfRec ? 2 : 0, maxFrames(trace, f.name)));
    copies.set(f.name, Math.max(1, want));
    let prev = { x: home.place.x, y: home.place.y };
    const { w, h } = machineSize(f);
    for (let c = 2; c <= want; c++) {
      const cands: [number, number][] = [[prev.x + w + 3, prev.y], [prev.x, prev.y + h + 1], [prev.x + w + 3, prev.y + h + 1]];
      for (let d = 2; d < 30; d++) cands.push([prev.x, prev.y + d * (h + 1)], [prev.x + w + 3, prev.y + d * (h + 1)]);
      const spot = cands.find(([x, y]) => !near.any({ x, y, w, h }, 0.9)) ?? cands[0];
      prev = { x: spot[0], y: spot[1] };
      hosts.set(hostKey(f.name, c), { key: hostKey(f.name, c), fn: f.name, copy: c, x: prev.x, y: prev.y, w, h, inv: 0 });
      near.add({ x: prev.x, y: prev.y, w, h });
    }
  }

  // ---- edges: calls between homes, recursive chains, the process, live extras ----
  const edges: Edge[] = [];
  const seen = new Map<string, Edge>();
  const addEdge = (from: string, to: string, A: Host | null, B: Host, line: number | null, chain: boolean, isTransient: boolean, callee: string, srcFile: string) => {
    const key = `${A ? A.key : ''}>${B.key}`;
    const have = seen.get(key);
    if (have) {
      if (line !== null) have.lines.push(line);
      have.callees.add(callee);
      return;
    }
    const e: Edge = { key, from, to, A, B, lines: line === null ? [] : [line], chain, transient: isTransient, callees: new Set([callee]), srcFile, sy: 0, ty: 0 };
    seen.set(key, e);
    edges.push(e);
  };
  // A function's host: its own node, or the collapsed module it is inside.
  const home = (fn: string) => hosts.get(fn) ?? hosts.get(moduleOf.get(fn) ?? '');
  const mainHost = home('main');
  if (pp && mainHost) addEdge('', mainHost.fn, null, mainHost, null, false, false, 'main', '');
  for (const f of model.fns) {
    const A = home(f.name);
    if (!A) continue;
    for (const c of f.calls) {
      if (A.module) {
        // inside a collapsed module: only calls that leave it are drawn
        const B = home(c.callee);
        if (B && B !== A) addEdge(A.fn, B.fn, A, B, c.line, false, false, c.callee, f.file);
        continue;
      }
      if (c.callee === f.name) {
        // recursion: home -> copy 2 -> copy 3 ...
        const n = copies.get(f.name) ?? 1;
        for (let k = 1; k < n; k++) addEdge(f.name, f.name, hosts.get(hostKey(f.name, k))!, hosts.get(hostKey(f.name, k + 1))!, c.line, true, false, f.name, f.file);
        continue;
      }
      const B = home(c.callee);
      if (B) addEdge(f.name, B.fn, A, B, c.line, false, false, c.callee, f.file);
    }
  }
  for (const [a, b] of transient) {
    const A = hosts.get(a);
    const B = hosts.get(b);
    if (A && B && A !== B && !seen.has(`${a}>${b}`)) addEdge(A.fn, B.fn, A, B, null, false, true, B.fn, '');
  }

  // ---- ports: every edge gets its own slot on each side ----
  const outs = new Map<string, Edge[]>();
  const ins = new Map<string, Edge[]>();
  for (const e of edges) {
    const ak = e.A ? e.A.key : '';
    if (!outs.has(ak)) outs.set(ak, []);
    outs.get(ak)!.push(e);
    if (!ins.has(e.B.key)) ins.set(e.B.key, []);
    ins.get(e.B.key)!.push(e);
  }
  const portY = (top: number, i: number, k: number, h = MH) => top + 0.95 + ((h - 1.55) * (i + 0.5)) / k;
  const fnOf = (h: Host) => (h.module ? null : model.byName.get(h.fn) ?? null);
  for (const [k, list] of outs) {
    const top = k === '' ? pp!.y : hosts.get(k)!.y;
    list.sort((a, b) => a.B.y - b.B.y || a.B.x - b.B.x);
    list.forEach((e, i) => (e.sy = portY(top, i, list.length, k === '' ? MH : hosts.get(k)!.h)));
    // a machine's calls leave at the row of the statement that makes them
    const f = k ? fnOf(hosts.get(k)!) : null;
    if (f) {
      const used: number[] = [];
      for (const e of list) {
        const y = e.lines.length ? callPortY(f, e.lines[0]) : null;
        if (y === null) continue;
        let sy = top + y;
        while (used.some((u) => Math.abs(u - sy) < 0.3)) sy += 0.35;
        used.push(sy);
        e.sy = sy;
      }
    }
    if (k) scene.ports.set(k, { in: [], out: list.map((e) => e.sy) });
  }
  for (const [k, list] of ins) {
    const h = hosts.get(k)!;
    list.sort((a, b) => (a.A?.y ?? pp!.y) - (b.A?.y ?? pp!.y) || (a.A?.x ?? -1e9) - (b.A?.x ?? -1e9));
    const f = fnOf(h);
    // into a machine: its entry door, beside its motor
    if (f) {
      const g = geomOf(f);
      list.forEach((e, i) => (e.ty = h.y + g.motor.y + 0.5 + ((g.motor.h - 1) * (i + 0.5)) / list.length));
    } else list.forEach((e, i) => (e.ty = portY(h.y, i, list.length, h.h)));
    const p = scene.ports.get(k) ?? { in: [], out: [] };
    p.in = list.map((e) => e.ty);
    scene.ports.set(k, p);
  }

  // ---- routing ----
  interface Vert { e: Edge; which: 'only' | 'exit' | 'entry'; gapL: number; gapW: number; type: 'LR' | 'LL' | 'RR'; ly: number; ry: number; x?: number }
  const verts: Vert[] = [];
  const vertsOf = new Map<Edge, Vert[]>();
  const addVert = (v: Vert) => {
    verts.push(v);
    const l = vertsOf.get(v.e);
    if (l) l.push(v);
    else vertsOf.set(v.e, [v]);
  };
  const plan = new Map<Edge, { kind: 'simple' | 'corridor' | 'custom'; cy?: number }>();
  // corridors taken so far, by half-cell row (a new one keeps 0.45 from them)
  const corridors = new Map<number, { y: number; x0: number; x1: number }[]>();
  const corridorNear = (y: number, lo: number, hi: number) => {
    for (let b = Math.floor((y - 0.45) / 0.5); b <= Math.floor((y + 0.45) / 0.5); b++) {
      for (const c of corridors.get(b) ?? []) if (Math.abs(c.y - y) < 0.45 && c.x0 < hi && lo < c.x1) return true;
    }
    return false;
  };
  const clearOf = (r: Rect, skip: Rect[]) => !near.any(r, -0.05, skip);
  const rectOfHost = (h: Host | null): Rect | null => (h ? near.first(hostRect(h), (o) => o.x === h.x && o.y <= h.y && o.y + o.h >= h.y + h.h) ?? hostRect(h) : procRect);

  for (const e of edges) {
    const ax = (e.A ? e.A.x + e.A.w : pp!.x + MW);
    const bx = e.B.x;
    const custom = !e.transient ? layout.waypoints.get(e.key) : undefined;
    if (custom) {
      plan.set(e, { kind: 'custom' });
      continue;
    }
    const skip = [rectOfHost(e.A), rectOfHost(e.B)].filter((r): r is Rect => !!r);
    if (bx - ax >= 1) {
      const y0 = Math.min(e.sy, e.ty) - 0.15;
      const y1 = Math.max(e.sy, e.ty) + 0.15;
      if (clearOf({ x: ax + 0.05, y: y0, w: bx - ax - 0.1, h: y1 - y0 }, skip)) {
        plan.set(e, { kind: 'simple' });
        addVert({ e, which: 'only', gapL: ax, gapW: bx - ax, type: 'LR', ly: e.sy, ry: e.ty });
        continue;
      }
    }
    // Corridor: leave through the exit gap, run along a free row, enter
    // through the gap left of the callee.
    const forward = bx - ax >= 1;
    const lo = forward ? ax + 0.3 : bx - 3;
    const hi = forward ? bx - 0.3 : ax + 3;
    const ideal = forward ? (e.sy + e.ty) / 2 : Math.min(e.A ? e.A.y : pp!.y, e.B.y) - 1;
    let cy = ideal;
    for (let k = 0; k < 120; k++) {
      const y = ideal + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
      const bar = { x: lo, y: y - 0.3, w: hi - lo, h: 0.6 };
      if (near.any(bar, 0.05)) continue;
      if (corridorNear(y, lo, hi)) continue;
      cy = y;
      break;
    }
    const row = Math.floor(cy / 0.5);
    const taken = corridors.get(row);
    if (taken) taken.push({ y: cy, x0: lo, x1: hi });
    else corridors.set(row, [{ y: cy, x0: lo, x1: hi }]);
    plan.set(e, { kind: 'corridor', cy });
    addVert({ e, which: 'exit', gapL: ax, gapW: 3, type: forward ? 'LR' : 'LL', ly: e.sy, ry: cy });
    addVert({ e, which: 'entry', gapL: bx - 3, gapW: 3, type: forward ? 'LR' : 'RR', ly: cy, ry: e.ty });
  }

  // Channels: verticals sharing a gap get distinct x, ordered to avoid crossings.
  const groups = new Map<number, Vert[]>();
  for (const v of verts) {
    const k = Math.round(v.gapL * 2) / 2;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(v);
  }
  const rank = (v: Vert) => (v.type === 'LL' ? 0 : v.type === 'RR' ? 3 : v.ry < v.ly ? 1 : 2);
  for (const [gapL, list] of groups) {
    list.sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? a.ly - b.ly : rank(a) === 2 ? b.ly - a.ly : a.ly - b.ly));
    const W = Math.max(1, Math.min(...list.map((v) => v.gapW)));
    list.forEach((v, i) => (v.x = gapL + (W * (i + 1)) / (list.length + 1)));
  }

  for (const e of edges) {
    const ax = (e.A ? e.A.x + e.A.w : pp!.x + MW);
    const bx = e.B.x;
    const p = plan.get(e)!;
    let pts: Pt[];
    if (p.kind === 'custom') {
      const w = layout.waypoints.get(e.key)!;
      pts = [[ax, e.sy], [w.x, e.sy], [w.x, w.y], [bx - 0.5, w.y], [bx - 0.5, e.ty], [bx, e.ty]];
    } else if (p.kind === 'simple') {
      const tx = vertsOf.get(e)![0].x!;
      pts = [[ax, e.sy], [tx, e.sy], [tx, e.ty], [bx, e.ty]];
    } else {
      const ex = vertsOf.get(e)!.find((v) => v.which === 'exit')!.x!;
      const nx = vertsOf.get(e)!.find((v) => v.which === 'entry')!.x!;
      pts = [[ax, e.sy], [ex, e.sy], [ex, p.cy!], [nx, p.cy!], [nx, e.ty], [bx, e.ty]];
    }
    scene.belts.push({
      key: e.key, from: e.from, to: e.to, fromHost: e.A ? e.A.key : '', toHost: e.B.key,
      pts: simplify(pts), lines: e.lines, custom: p.kind === 'custom', chain: e.chain, transient: e.transient,
      callees: [...e.callees], srcFile: e.srcFile,
    });
  }
  return scene;
}

// Points where belt `a` crosses belt `b` (perpendicular segments, away from ends).
export function crossings(a: Pt[], b: Pt[]): { x: number; y: number; horizontal: boolean }[] {
  const out: { x: number; y: number; horizontal: boolean }[] = [];
  const eps = 0.12;
  for (let i = 0; i + 1 < a.length; i++) {
    const [p, q] = [a[i], a[i + 1]];
    const aH = Math.abs(p[1] - q[1]) < 1e-6;
    for (let j = 0; j + 1 < b.length; j++) {
      const [r, s] = [b[j], b[j + 1]];
      const bH = Math.abs(r[1] - s[1]) < 1e-6;
      if (aH === bH) continue;
      const [h0, h1, v0, v1] = aH ? [p, q, r, s] : [r, s, p, q];
      const x = v0[0];
      const y = h0[1];
      const hx0 = Math.min(h0[0], h1[0]), hx1 = Math.max(h0[0], h1[0]);
      const vy0 = Math.min(v0[1], v1[1]), vy1 = Math.max(v0[1], v1[1]);
      if (x > hx0 + eps && x < hx1 - eps && y > vy0 + eps && y < vy1 - eps) out.push({ x, y, horizontal: aH });
    }
  }
  return out;
}

// Which belts of a scene cross which, and where, worked out once per scene
// (a frame asks every time it draws): for each belt, the belts that cross
// it, with the points as crossings(other, belt) gives them. Pairs come from
// a grid of cells, each segment in every cell it passes (two segments that
// cross share the cell of the crossing), not from trying every pair.
export interface Crossing { other: Belt; pts: { x: number; y: number; horizontal: boolean }[] }
const crossed = new WeakMap<Scene, Map<Belt, Crossing[]>>();
const CROSS_CELL = 8;
export function crossingsOf(scene: Scene): Map<Belt, Crossing[]> {
  const hit = crossed.get(scene);
  if (hit) return hit;
  const { belts } = scene;
  const cells = new Map<string, number[]>();
  belts.forEach((b, i) => {
    for (let k = 0; k + 1 < b.pts.length; k++) {
      const [p, q] = [b.pts[k], b.pts[k + 1]];
      const cx1 = Math.floor(Math.max(p[0], q[0]) / CROSS_CELL), cy1 = Math.floor(Math.max(p[1], q[1]) / CROSS_CELL);
      for (let cx = Math.floor(Math.min(p[0], q[0]) / CROSS_CELL); cx <= cx1; cx++) {
        for (let cy = Math.floor(Math.min(p[1], q[1]) / CROSS_CELL); cy <= cy1; cy++) {
          const key = `${cx},${cy}`;
          const list = cells.get(key);
          if (!list) cells.set(key, [i]);
          else if (list[list.length - 1] !== i) list.push(i);
        }
      }
    }
  });
  const out = new Map<Belt, Crossing[]>();
  const add = (b: Belt, c: Crossing) => {
    const list = out.get(b);
    if (list) list.push(c);
    else out.set(b, [c]);
  };
  const tried = new Set<number>();
  for (const list of cells.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let c = a + 1; c < list.length; c++) {
        const i = list[a], j = list[c]; // i < j: belts go in in order
        const key = i * belts.length + j;
        if (tried.has(key)) continue;
        tried.add(key);
        sceneStats.pairs++;
        const jOverI = crossings(belts[j].pts, belts[i].pts);
        if (!jOverI.length) continue; // (the same points either way round)
        add(belts[i], { other: belts[j], pts: jOverI });
        add(belts[j], { other: belts[i], pts: crossings(belts[i].pts, belts[j].pts) });
      }
    }
  }
  crossed.set(scene, out);
  return out;
}

// The gaps cut into each belt, for belts drawn in this order: a belt passes
// under every later one that crosses it (the same points, in the same order,
// as trying each later belt in turn).
export function gapsFor(scene: Scene, drawn: Belt[]): Crossing['pts'][] {
  const cross = crossingsOf(scene);
  const at = new Map(drawn.map((b, i) => [b, i]));
  return drawn.map((b, i) => {
    const later = (cross.get(b) ?? []).filter((c) => (at.get(c.other) ?? -1) > i);
    if (later.length > 1) later.sort((p, q) => at.get(p.other)! - at.get(q.other)!);
    return later.flatMap((c) => c.pts);
  });
}

export function nodeOfHost(layout: Layout, h: Host): NodeState | undefined {
  return layout.nodes.get(`func:${h.fn}`);
}
