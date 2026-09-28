// Scene building: where recursive copies go, which port each call uses, and
// how every belt is routed so lines never share a segment.
//
// Hosts: every function has a home node (copy 1). A frame that is not the
// function's first live frame is hosted by a spawned copy (copy 2, 3, …),
// placed in reserved slots next to the home, so recursion reads as a chain of
// factories rather than one machine talking to itself.
import { MH, MW, footprint, invCells, type Layout, type NodeState } from './layout';
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

const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

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

export function buildScene(layout: Layout, model: Model | null, trace: Trace | null, transient: [string, string][] = []): Scene {
  const hosts = new Map<string, Host>();
  const copies = new Map<string, number>();
  const obstacles: Rect[] = [];
  const moduleOf = new Map<string, string>();
  const scene: Scene = { hosts, copies, belts: [], ports: new Map(), obstacles, moduleOf, walls: [] };
  if (!model) return scene;

  for (const n of layout.nodes.values()) {
    if (layout.hidden(n)) {
      moduleOf.set(n.name, moduleKey(n.file));
      continue;
    }
    hosts.set(n.name, { key: n.name, fn: n.name, copy: 1, x: n.place.x, y: n.place.y, w: MW, h: MH, inv: invCells(n.fn) });
    const f = footprint(n);
    obstacles.push({ x: f.x + 1, y: f.y, w: f.w - 2, h: f.h });
  }
  for (const m of layout.modules.values()) {
    const r = layout.moduleRect(m.file);
    if (!m.collapsed) {
      scene.walls.push({ file: m.file, rect: r });
      continue;
    }
    const key = moduleKey(m.file);
    hosts.set(key, { key, fn: key, copy: 1, x: r.x, y: r.y, w: r.w, h: r.h, inv: 0, module: m.file });
    obstacles.push(r);
  }
  const pp = procPlace(layout);
  const procRect: Rect | null = pp ? { x: pp.x, y: pp.y, w: MW, h: MH } : null;
  if (procRect) obstacles.push(procRect);

  // ---- reserve copy slots next to each recursive function ----
  for (const f of model.fns) {
    const home = layout.nodes.get(f.id);
    if (!home || layout.hidden(home)) continue;
    const selfRec = f.calls.some((c) => c.callee === f.name);
    const want = Math.min(MAX_COPIES, Math.max(selfRec ? 2 : 0, maxFrames(trace, f.name)));
    copies.set(f.name, Math.max(1, want));
    let prev = { x: home.place.x, y: home.place.y };
    const inv = invCells(f);
    const h = MH + inv;
    for (let c = 2; c <= want; c++) {
      const cands: [number, number][] = [[prev.x + 6, prev.y], [prev.x, prev.y + h + 1], [prev.x + 6, prev.y + h + 1]];
      for (let d = 2; d < 30; d++) cands.push([prev.x, prev.y + d * (h + 1)], [prev.x + 6, prev.y + d * (h + 1)]);
      const spot = cands.find(([x, y]) => !obstacles.some((o) => overlaps({ x, y, w: MW, h }, o, 0.9))) ?? cands[0];
      prev = { x: spot[0], y: spot[1] };
      hosts.set(hostKey(f.name, c), { key: hostKey(f.name, c), fn: f.name, copy: c, x: prev.x, y: prev.y, w: MW, h: MH, inv });
      obstacles.push({ x: prev.x, y: prev.y, w: MW, h });
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
  for (const [k, list] of outs) {
    const top = k === '' ? pp!.y : hosts.get(k)!.y;
    list.sort((a, b) => a.B.y - b.B.y || a.B.x - b.B.x);
    list.forEach((e, i) => (e.sy = portY(top, i, list.length, k === '' ? MH : hosts.get(k)!.h)));
    if (k) scene.ports.set(k, { in: [], out: list.map((e) => e.sy) });
  }
  for (const [k, list] of ins) {
    const h = hosts.get(k)!;
    list.sort((a, b) => (a.A?.y ?? pp!.y) - (b.A?.y ?? pp!.y) || (a.A?.x ?? -1e9) - (b.A?.x ?? -1e9));
    list.forEach((e, i) => (e.ty = portY(h.y, i, list.length, h.h)));
    const p = scene.ports.get(k) ?? { in: [], out: [] };
    p.in = list.map((e) => e.ty);
    scene.ports.set(k, p);
  }

  // ---- routing ----
  interface Vert { e: Edge; which: 'only' | 'exit' | 'entry'; gapL: number; gapW: number; type: 'LR' | 'LL' | 'RR'; ly: number; ry: number; x?: number }
  const verts: Vert[] = [];
  const plan = new Map<Edge, { kind: 'simple' | 'corridor' | 'custom'; cy?: number }>();
  const corridors: { y: number; x0: number; x1: number }[] = [];
  const clearOf = (r: Rect, skip: Rect[]) => !obstacles.some((o) => !skip.includes(o) && overlaps(r, o, -0.05));
  const rectOfHost = (h: Host | null): Rect | null => (h ? obstacles.find((o) => o.x === h.x && o.y <= h.y && o.y + o.h >= h.y + h.h) ?? hostRect(h) : procRect);

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
        verts.push({ e, which: 'only', gapL: ax, gapW: bx - ax, type: 'LR', ly: e.sy, ry: e.ty });
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
      if (obstacles.some((o) => overlaps(bar, o, 0.05))) continue;
      if (corridors.some((c) => Math.abs(c.y - y) < 0.45 && c.x0 < hi && lo < c.x1)) continue;
      cy = y;
      break;
    }
    corridors.push({ y: cy, x0: lo, x1: hi });
    plan.set(e, { kind: 'corridor', cy });
    verts.push({ e, which: 'exit', gapL: ax, gapW: 3, type: forward ? 'LR' : 'LL', ly: e.sy, ry: cy });
    verts.push({ e, which: 'entry', gapL: bx - 3, gapW: 3, type: forward ? 'LR' : 'RR', ly: cy, ry: e.ty });
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
      const tx = verts.find((v) => v.e === e)!.x!;
      pts = [[ax, e.sy], [tx, e.sy], [tx, e.ty], [bx, e.ty]];
    } else {
      const ex = verts.find((v) => v.e === e && v.which === 'exit')!.x!;
      const nx = verts.find((v) => v.e === e && v.which === 'entry')!.x!;
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

export function nodeOfHost(layout: Layout, h: Host): NodeState | undefined {
  return layout.nodes.get(`func:${h.fn}`);
}
