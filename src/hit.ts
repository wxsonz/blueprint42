// Hit-testing and rects: what's under the pointer, and where things are.
import { CELL_PX, MW, SLOT_PX, type Layout } from './layout';
import { HEAD, ROW, interiorAt, planOf, rowMid, type Station } from './interior';
import { geomOf, procBlockH, procH, shut, slotsOf, termText } from './machine';
import { buildScene, procPlace, type Belt } from './route';
import type { Pt, Rect } from './skins/types';
import type { Trace } from './interp';
import { eventPair, frameAt, frameHosts, sceneAt, spriteWorldRect, type Entity, type ViewState } from './playback';

// Where a belt crosses a module's wall: [point, whether the wall edge is vertical].
export function wallCrossings(pts: Pt[], r: Rect): [Pt, boolean][] {
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
  if (pp && wx >= pp.x && wx < pp.x + MW && wy >= pp.y && wy < pp.y + procH(termText(s.trace))) return { k: 'proc' };
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
export function heapSlotRect(layout: Layout, slot: number, trace?: Trace | null): Rect | null {
  const pp = procPlace(layout);
  return pp ? { x: pp.x, y: pp.y + procBlockH(trace) + 1.2 + slot * 1.1, w: 1, h: 1 } : null;
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
      return pp ? { x: pp.x, y: pp.y, w: MW, h: procH(termText(s.trace)) } : null;
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
    else if (s.trace.heapSlots?.has(ev.cell)) dst = heapSlotRect(s.layout, s.trace.heapSlots.get(ev.cell)!, s.trace);
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

// The struct row a click lands on (to fold or unfold it), in world units.
export function foldAt(s: ViewState, wx: number, wy: number): { fn: string; name: string } | null {
  const scene = sceneAt(s);
  for (const h of scene.hosts.values()) {
    const fn = h.module ? null : s.model?.byName.get(h.fn) ?? null;
    if (!fn || fn.broken || shut.has(fn.name)) continue;
    const g = geomOf(fn);
    if (wx < h.x + g.store.x || wx >= h.x + g.store.x + g.store.w) continue;
    const slots = slotsOf(fn);
    const i = slots.findIndex((sl, k) => wy >= h.y + g.store.slotTop[k] && wy < h.y + g.store.slotTop[k] + SLOT_PX / CELL_PX);
    if (i >= 0 && slots[i].fold) return { fn: h.fn, name: slots[i].name };
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
export function stationAt(s: ViewState, wx: number, wy: number): { fn: string; line: number; st: Station } | null {
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
    return hit ? { fn: fn.name, line: hit.line, st: hit } : null;
  }
  return null;
}

