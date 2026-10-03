// Machine placement. Positions are keyed by stable symbol id and survive
// edits. Author-placed (pinned) positions are never moved by the tool.
//
// Projects (M5): every .c file is a module. An expanded module is a wall
// drawn around its machines; a collapsed one is a single block. Node
// positions are always world coordinates; moving a module moves its nodes,
// and a collapsed module's nodes stay where they would be if it opened.
import type { FnInfo, Model } from './parse';
import type { Blueprint, Sprite } from './blueprint';

export { CELL_PX, folded, type FrameRow, frameRows, INV_HEAD_PX, MAX_FIELDS, MH, MW, shut, SLOT_PX } from './machine';
import { folded, machineSize, MH, shut } from './machine';
export const MOD_W = 6; // collapsed module block width, cells
export const MOD_DOORS = 6; // doors listed on a collapsed block before "+n more"
const COL_GAP = 5; // cells between module columns, room for belts
const ROW_GAP = 2;

export interface Place {
  x: number;
  y: number;
  pinned: boolean;
}

export interface NodeState {
  id: string;
  name: string;
  file: string; // module ('' outside a project)
  place: Place;
  stale: boolean; // symbol lost to a parse error; last known node kept
  fn: FnInfo | null;
}

export interface ModuleState {
  file: string;
  x: number; // top-left of the block, or of the wall when expanded
  y: number;
  pinned: boolean;
  collapsed: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Rectangle a node reserves on the grid, including ports, statics and inventory.
export function footprint(n: NodeState): Rect {
  // a machine holds everything inside it (storage, stations, memory); one
  // cell each side for its ports
  const m = machineSize(n.fn);
  return { x: n.place.x - 1, y: n.place.y, w: m.w + 2, h: m.h };
}

const overlap = (a: Rect, b: Rect, pad = 1) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// A module's public functions: what other files can call. main counts too.
export function doorsOf(fns: (FnInfo | null)[]): FnInfo[] {
  return fns.filter((f): f is FnInfo => !!f && !f.isStatic).sort((a, b) => a.startLine - b.startLine);
}

export function blockHeight(doors: number): number {
  const rows = Math.min(doors, MOD_DOORS) + (doors > MOD_DOORS ? 1 : 0);
  return Math.max(MH, 1.9 + rows * 0.55 + 0.4);
}

// The nodes, counting each machine added or removed (Layout.nodesOf keeps
// each file's machines until the count moves).
class NodeMap extends Map<string, NodeState> {
  changes = 0;
  override set(id: string, n: NodeState): this {
    this.changes++;
    return super.set(id, n);
  }
  override delete(id: string): boolean {
    this.changes++;
    return super.delete(id);
  }
  override clear(): void {
    this.changes++;
    super.clear();
  }
}

export class Layout {
  nodes: Map<string, NodeState> = new NodeMap();
  private byFile = { at: -1, files: new Map<string, NodeState[]>() };
  modules = new Map<string, ModuleState>();
  // Author-routed belts: key "caller>callee" ('' caller = the process) → the
  // cell centre the belt's middle leg passes through.
  waypoints = new Map<string, { x: number; y: number }>();
  private graph = ''; // the file-to-file call graph modules were last packed for
  // Goes up with every change to a position, a module or a route: a scene
  // built from this layout is kept until it does (route.ts buildScene).
  rev = 0;

  // Code outside these methods that changes positions, modules or routes
  // says so here (or the grid keeps drawing the old scene).
  touch(): void {
    this.rev++;
  }

  // An author's route for a belt ("caller>callee"), or back to automatic.
  setRoute(key: string, p: { x: number; y: number } | null): void {
    this.touch();
    if (p) this.waypoints.set(key, p);
    else this.waypoints.delete(key);
  }

  reset(): void {
    this.touch();
    this.graph = '';
    folded.clear();
    shut.clear();
    this.nodes.clear();
    this.modules.clear();
    this.waypoints.clear();
  }

  // ---------------- modules ----------------

  hidden(n: NodeState): boolean {
    return !!n.file && !!this.modules.get(n.file)?.collapsed;
  }

  visible(): NodeState[] {
    return [...this.nodes.values()].filter((n) => !this.hidden(n));
  }

  // A file's machines, in the order they were added. A frame asks once per
  // module, so they're kept by file until a machine is added or removed.
  nodesOf(file: string): readonly NodeState[] {
    const changes = (this.nodes as NodeMap).changes;
    if (this.byFile.at !== changes) {
      const files = new Map<string, NodeState[]>();
      for (const n of this.nodes.values()) {
        const list = files.get(n.file);
        if (list) list.push(n);
        else files.set(n.file, [n]);
      }
      this.byFile = { at: changes, files };
    }
    return this.byFile.files.get(file) ?? [];
  }

  // The wall around a module's machines (whether or not it is expanded).
  private wall(file: string): Rect | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of this.nodesOf(file)) {
      const f = footprint(n);
      x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x + f.w); y1 = Math.max(y1, f.y + f.h);
    }
    if (!isFinite(x0)) return null;
    return { x: x0 - 0.5, y: y0 - 1.5, w: x1 - x0 + 1, h: y1 - y0 + 2 };
  }

  moduleRect(file: string): Rect {
    const m = this.modules.get(file);
    if (!m) return { x: 0, y: 0, w: 0, h: 0 };
    if (m.collapsed) return { x: m.x, y: m.y, w: MOD_W, h: blockHeight(doorsOf(this.nodesOf(file).map((n) => n.fn)).length) };
    return this.wall(file) ?? { x: m.x, y: m.y, w: MOD_W, h: MH };
  }

  // Keep an expanded module's origin on its wall after its machines move.
  private refresh(file: string): void {
    const m = this.modules.get(file);
    const w = this.wall(file);
    if (m && w && !m.collapsed && (m.x !== w.x || m.y !== w.y)) (this.touch(), (m.x = w.x), (m.y = w.y));
  }

  private shift(file: string, dx: number, dy: number): void {
    const m = this.modules.get(file);
    if (!m || (!dx && !dy)) return;
    this.touch();
    m.x += dx;
    m.y += dy;
    for (const n of this.nodesOf(file)) (n.place.x += dx), (n.place.y += dy);
  }

  moduleAt(wx: number, wy: number): { file: string; header: boolean } | null {
    for (const m of [...this.modules.values()].reverse()) {
      const r = this.moduleRect(m.file);
      if (wx < r.x || wx >= r.x + r.w || wy < r.y || wy >= r.y + r.h) continue;
      if (m.collapsed) return { file: m.file, header: true };
      if (wy < r.y + 1.2) return { file: m.file, header: true };
    }
    return null;
  }

  // Author drags a module: pinned from then on; refused if it would overlap.
  moveModule(file: string, x: number, y: number): boolean {
    const m = this.modules.get(file);
    if (!m) return false;
    const r = this.moduleRect(file);
    const next = { ...r, x: r.x + (x - m.x), y: r.y + (y - m.y) };
    for (const o of this.modules.values()) if (o.file !== file && overlap(next, this.moduleRect(o.file), 0.5)) return false;
    this.touch();
    this.shift(file, x - m.x, y - m.y);
    m.pinned = true;
    return true;
  }

  setCollapsed(file: string, collapsed: boolean, model: Model | null): void {
    const m = this.modules.get(file);
    if (!m || m.collapsed === collapsed) return;
    this.touch();
    if (!collapsed) {
      // Open where the block was: the wall's top-left lands on the block's.
      const w = this.wall(file);
      if (w) for (const n of this.nodesOf(file)) (n.place.x += m.x - w.x), (n.place.y += m.y - w.y);
      m.collapsed = false;
    } else {
      this.refresh(file);
      m.collapsed = true;
    }
    if (model) this.pack(model);
  }

  unpinModule(file: string, model: Model): void {
    const m = this.modules.get(file);
    if (!m) return;
    this.touch();
    m.pinned = false;
    this.pack(model);
  }

  // Module placement: columns by the longest chain of cross-file calls, the
  // way machines are layered inside a file. Only auto-placed modules move;
  // they flow around pinned ones.
  pack(model: Model): void {
    if (!this.modules.size) return;
    this.touch();
    const fileOfFn = new Map(model.fns.map((f) => [f.name, f.file]));
    this.graph = [...new Set(model.fns.flatMap((f) => f.calls.map((c) => fileOfFn.get(c.callee)).filter((t) => t && t !== f.file).map((t) => `${f.file}>${t}`)))].sort().join('|');
    for (const f of this.modules.keys()) this.refresh(f);
    const files = [...this.modules.keys()].sort((a, b) => model.files.indexOf(a) - model.files.indexOf(b));
    const fileOf = new Map(model.fns.map((f) => [f.name, f.file]));
    const out = new Map<string, Set<string>>();
    const into = new Map<string, Set<string>>();
    for (const f of model.fns) for (const c of f.calls) {
      const to = fileOf.get(c.callee);
      if (!to || to === f.file) continue;
      if (!out.has(f.file)) out.set(f.file, new Set());
      out.get(f.file)!.add(to);
      if (!into.has(to)) into.set(to, new Set());
      into.get(to)!.add(f.file);
    }
    const depth = new Map<string, number>();
    const onPath = new Set<string>();
    const walk = (file: string, d: number) => {
      if (onPath.has(file) || (depth.get(file) ?? -1) >= d) return;
      depth.set(file, d);
      onPath.add(file);
      for (const t of out.get(file) ?? []) walk(t, d + 1);
      onPath.delete(file);
    };
    const mainFile = model.byName.get('main')?.file;
    const roots = files.filter((f) => f === mainFile || !(into.get(f)?.size));
    for (const r of roots.sort((a, b) => (a === mainFile ? -1 : b === mainFile ? 1 : 0))) walk(r, 0);
    for (const f of files) if (!depth.has(f)) walk(f, 0);

    const cols: string[][] = [];
    for (const f of files) (cols[depth.get(f) ?? 0] ??= []).push(f);
    const pinned = files.filter((f) => this.modules.get(f)!.pinned).map((f) => this.moduleRect(f));
    const rowOf = new Map<string, number>();
    let x = 0;
    cols.forEach((col, d) => {
      if (d > 0) {
        const order = new Map(col.map((f, i) => [f, i]));
        const bary = (f: string) => {
          const cs = [...(into.get(f) ?? [])].filter((c) => rowOf.has(c));
          return cs.length ? cs.reduce((a, c) => a + rowOf.get(c)!, 0) / cs.length : 1e9;
        };
        col.sort((a, b) => bary(a) - bary(b) || order.get(a)! - order.get(b)!);
      }
      let y = 0;
      let wmax = 0;
      col.forEach((f, i) => {
        rowOf.set(f, i);
        const m = this.modules.get(f)!;
        const r = this.moduleRect(f);
        if (m.pinned) return;
        let tries = 0;
        let hit: Rect | undefined;
        while ((hit = pinned.find((p) => overlap({ ...r, x, y }, p, 1))) && tries++ < 100) y = hit.y + hit.h + ROW_GAP;
        this.shift(f, x - m.x, y - m.y);
        y += r.h + ROW_GAP;
        wmax = Math.max(wmax, r.w);
      });
      x += (wmax || MOD_W) + COL_GAP;
    });
  }

  // ---------------- blueprints ----------------

  // `full`: every position (the browser's own backup). Otherwise only what
  // the author decided — pinned machines and modules, open/closed modules
  // that differ from the default, routes — so .blueprint42/blueprint.json
  // doesn't churn when auto-placement moves things. Node positions are
  // relative to their module in a project (v2).
  toBlueprint(sprites: Sprite[], full: boolean, mainFile?: string): Blueprint {
    const project = this.modules.size > 0;
    const nodes: Blueprint['nodes'] = {};
    for (const n of this.nodes.values()) {
      if (!full && !n.place.pinned) continue;
      const m = n.file ? this.modules.get(n.file) : undefined;
      nodes[n.id] = { x: n.place.x - (m?.x ?? 0), y: n.place.y - (m?.y ?? 0), pinned: n.place.pinned };
    }
    const waypoints = Object.fromEntries([...this.waypoints].map(([k, p]) => [k, { x: p.x, y: p.y }]));
    const fold = { ...(folded.size ? { folded: [...folded].sort() } : {}), ...(shut.size ? { shut: [...shut].sort() } : {}) };
    if (!project) return { version: 1, nodes, waypoints, sprites, ...fold };
    const modules: NonNullable<Blueprint['modules']> = {};
    for (const m of this.modules.values()) {
      if (!full && !m.pinned && m.collapsed === (m.file !== mainFile)) continue;
      modules[m.file] = { x: m.x, y: m.y, pinned: m.pinned, collapsed: m.collapsed };
    }
    return { version: 2, nodes, modules, waypoints, sprites, ...fold };
  }

  applyBlueprint(bp: Blueprint, model: Model, full: boolean): void {
    this.touch();
    folded.clear();
    for (const k of bp.folded ?? []) folded.add(k);
    shut.clear();
    for (const k of bp.shut ?? []) shut.add(k);
    for (const [file, b] of Object.entries(bp.modules ?? {})) {
      const m = this.modules.get(file);
      if (!m) continue;
      m.collapsed = b.collapsed;
      m.pinned = b.pinned;
      if (full || b.pinned) this.shift(file, b.x - m.x, b.y - m.y);
    }
    for (const [id, p] of Object.entries(bp.nodes)) {
      const n = this.nodes.get(id);
      if (!n) continue;
      const m = bp.version === 2 && n.file ? this.modules.get(n.file) : undefined;
      n.place = { x: (m?.x ?? 0) + p.x, y: (m?.y ?? 0) + p.y, pinned: p.pinned };
    }
    // keep each module's origin on its machines' wall
    for (const m of this.modules.values()) {
      const w = this.wall(m.file);
      if (!w) continue;
      if (m.collapsed) for (const n of this.nodesOf(m.file)) (n.place.x += m.x - w.x), (n.place.y += m.y - w.y);
      else (m.x = w.x), (m.y = w.y);
    }
    this.waypoints.clear();
    for (const [k, p] of Object.entries(bp.waypoints)) this.waypoints.set(k, { x: p.x, y: p.y });
    if (!full && model.project) this.pack(model);
  }

  // Back to the auto layout: nothing pinned, no hand-routed belts. (The
  // author's sprites stay where they are.)
  tidy(model: Model): void {
    this.touch();
    for (const n of this.nodes.values()) n.place.pinned = false;
    for (const m of this.modules.values()) m.pinned = false;
    this.waypoints.clear();
    this.graph = '';
    this.reflow(model);
  }

  // Machines whose footprints overlap (pairs of ids), among those shown.
  overlaps(): [string, string][] {
    const ns = this.visible();
    const out: [string, string][] = [];
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = footprint(ns[i]);
        const b = footprint(ns[j]);
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) out.push([ns[i].id, ns[j].id]);
      }
    }
    return out;
  }

  // A saved layout from smaller machines can overlap: lay the auto-placed
  // ones out again, then free pinned ones that still collide. Returns how
  // many machines moved.
  settle(model: Model): number {
    if (!this.overlaps().length) return 0;
    this.touch();
    const before = new Map([...this.nodes].map(([id, n]) => [id, `${n.place.x},${n.place.y}`]));
    this.reflow(model);
    for (let round = 0; round < 3; round++) {
      const pairs = this.overlaps();
      if (!pairs.length) break;
      for (const [, b] of pairs) {
        const n = this.nodes.get(b);
        if (n) n.place.pinned = false;
      }
      this.reflow(model);
    }
    return [...this.nodes].filter(([id, n]) => before.get(id) !== `${n.place.x},${n.place.y}`).length;
  }

  // A frame changed height (a struct folded or unfolded): lay the auto-placed
  // machines out again, per module, from the same origin. Pinned ones stay.
  reflow(model: Model): void {
    this.touch();
    const groups = model.project ? model.files : [''];
    for (const file of groups) {
      const fns = model.fns.filter((f) => f.file === file && this.nodes.has(f.id));
      if (!fns.length) continue;
      const fresh = new Layout();
      fresh.layered(model, fns);
      let ox = 0, oy = 0;
      if (model.project) {
        const m = this.modules.get(file);
        const w = fresh.wall(file);
        if (m && w) (ox = m.x - w.x), (oy = m.y - w.y);
      } else {
        // keep the layout where it was: its auto machines' top-left corner stays put
        const auto = fns.filter((f) => !this.nodes.get(f.id)!.place.pinned);
        if (auto.length) {
          const min = (l: Layout, k: 'x' | 'y') => Math.min(...auto.map((f) => l.nodes.get(f.id)!.place[k]));
          ox = min(this, 'x') - min(fresh, 'x');
          oy = min(this, 'y') - min(fresh, 'y');
        }
      }
      for (const f of fns) {
        const n = this.nodes.get(f.id)!;
        const p = fresh.nodes.get(f.id)!.place;
        if (!n.place.pinned) n.place = { x: p.x + ox, y: p.y + oy, pinned: false };
      }
      if (file) this.refresh(file);
    }
    if (model.project) this.pack(model);
  }

  // ---------------- nodes ----------------

  // Reconcile nodes with a fresh parse. Returns ids renamed this round (old → new).
  sync(model: Model): Map<string, string> {
    this.touch();
    const renamed = new Map<string, string>();
    const present = new Map(model.fns.map((f) => [f.id, f]));
    const missing = [...this.nodes.keys()].filter((id) => !present.has(id));
    const added = [...present.keys()].filter((id) => !this.nodes.has(id));
    const rename = (from: string, to: string) => {
      const old = this.nodes.get(from)!;
      this.nodes.delete(from);
      this.nodes.set(to, { ...old, id: to });
      renamed.set(from, to);
      const oldName = old.name;
      const newName = present.get(to)!.name;
      for (const [k, v] of [...this.waypoints]) {
        const [f, t] = k.split('>');
        if (f !== oldName && t !== oldName) continue;
        this.waypoints.delete(k);
        this.waypoints.set(`${f === oldName ? newName : f}>${t === oldName ? newName : t}`, v);
      }
      missing.splice(missing.indexOf(from), 1);
      added.splice(added.indexOf(to), 1);
    };

    // A static that gains (or loses) a namesake in another file changes key
    // between name and name@file; it is still the same machine.
    for (const id of [...missing]) {
      const n = this.nodes.get(id)!;
      const to = added.find((a) => {
        const f = present.get(a)!;
        return f.file === n.file && f.cname === (n.fn?.cname ?? n.name);
      });
      if (to) rename(id, to);
    }
    // Rename heuristic (SPEC §6, prototype answer): exactly one symbol vanished
    // and exactly one appeared in the same edit → same machine, new name.
    if (missing.length === 1 && added.length === 1 && this.nodes.get(missing[0])!.file === present.get(added[0])!.file) rename(missing[0], added[0]);

    for (const id of missing) {
      const n = this.nodes.get(id)!;
      // broken code never clears the grid
      if (model.error && (!model.project || model.error.file === n.file)) n.stale = true;
      else this.nodes.delete(id);
    }
    const moved: FnInfo[] = [];
    for (const [id, fn] of present) {
      const n = this.nodes.get(id);
      if (!n) continue;
      if (n.file !== fn.file) {
        // the function moved to another file: it gets a place in its new module
        this.nodes.delete(id);
        moved.push(fn);
        continue;
      }
      n.fn = fn;
      n.name = fn.name;
      n.stale = fn.broken;
    }
    const toPlace = [...added.map((id) => present.get(id)!), ...moved];

    if (!model.project) {
      if (toPlace.length) {
        if (this.nodes.size === 0) this.layered(model, model.fns);
        else for (const fn of toPlace) this.placeNear(fn, model);
      }
      return renamed;
    }

    // ---- modules ----
    let changed = toPlace.length > 0 || missing.length > 0;
    const mainFile = model.byName.get('main')?.file;
    const fresh: string[] = [];
    for (const file of model.files) {
      if (this.modules.has(file)) continue;
      // Collapsed by default (SPEC M5); the module with main starts open.
      this.modules.set(file, { file, x: 0, y: 0, pinned: false, collapsed: file !== mainFile });
      fresh.push(file);
      changed = true;
    }
    for (const file of [...this.modules.keys()]) {
      if (!model.files.includes(file) && !this.nodesOf(file).length) {
        this.modules.delete(file);
        changed = true;
      }
    }
    for (const file of fresh) {
      const m = this.modules.get(file)!;
      this.layered(model, model.fns.filter((f) => f.file === file && !this.nodes.has(f.id)));
      const w = this.wall(file);
      if (w) for (const n of this.nodesOf(file)) (n.place.x += m.x - w.x), (n.place.y += m.y - w.y);
    }
    for (const fn of toPlace) if (!this.nodes.has(fn.id)) this.placeNear(fn, model);
    // A new cross-file call moves modules into new columns, even with no new function.
    const fileOf = new Map(model.fns.map((f) => [f.name, f.file]));
    const graph = [...new Set(model.fns.flatMap((f) => f.calls.map((c) => fileOf.get(c.callee)).filter((t) => t && t !== f.file).map((t) => `${f.file}>${t}`)))].sort().join('|');
    if (graph !== this.graph) changed = true;
    if (changed) this.pack(model);
    return renamed;
  }

  // First placement (Sugiyama-style): columns by longest call path, so every
  // callee sits right of all its callers; rows ordered by the average row of
  // their callers to cut crossings. Recursive edges are ignored for layering.
  // In a project this lays out one module's functions at a time.
  private layered(model: Model, fns: FnInfo[]): void {
    this.touch();
    const inSet = new Set(fns.map((f) => f.name));
    const callees = new Map<string, string[]>();
    const callers = new Map<string, string[]>();
    for (const f of fns) {
      const out = [...new Set(f.calls.map((c) => c.callee))].filter((c) => c !== f.name && inSet.has(c));
      callees.set(f.name, out);
      for (const c of out) {
        if (!callers.has(c)) callers.set(c, []);
        callers.get(c)!.push(f.name);
      }
    }
    // longest path from any root, cycle-safe (a node on the current path is skipped)
    const depth = new Map<string, number>();
    const visiting = new Set<string>();
    const walk = (name: string, d: number) => {
      if (visiting.has(name) || (depth.get(name) ?? -1) >= d) return;
      depth.set(name, d);
      visiting.add(name);
      for (const c of callees.get(name) ?? []) walk(c, d + 1);
      visiting.delete(name);
    };
    const roots = fns.filter((f) => f.name === 'main' || !(callers.get(f.name) ?? []).length);
    for (const r of roots.length ? roots : fns.slice(0, 1)) walk(r.name, 0);
    for (const f of fns) if (!depth.has(f.name)) walk(f.name, 0);

    const cols: FnInfo[][] = [];
    for (const f of fns) (cols[depth.get(f.name)!] ??= []).push(f);
    // columns as wide as their widest machine, 3 cells apart for belts
    const colX: number[] = [];
    for (let d = 0, x = 0; d < cols.length; d++) {
      colX[d] = x;
      x += Math.max(0, ...(cols[d] ?? []).map((f) => machineSize(f).w)) + 3;
    }
    const rowOf = new Map<string, number>();
    cols.forEach((col, d) => {
      if (d > 0) {
        const order = new Map(col.map((f, i) => [f.name, i]));
        const bary = (f: FnInfo) => {
          const cs = (callers.get(f.name) ?? []).filter((c) => rowOf.has(c));
          return cs.length ? cs.reduce((a, c) => a + rowOf.get(c)!, 0) / cs.length : 1e9;
        };
        col.sort((a, b) => bary(a) - bary(b) || order.get(a.name)! - order.get(b.name)!);
      }
      let y = 0;
      col.forEach((f, i) => {
        rowOf.set(f.name, i);
        this.nodes.set(f.id, { id: f.id, name: f.name, file: f.file, place: { x: colX[d], y, pinned: false }, stale: f.broken, fn: f });
        y += machineSize(f).h + 2;
      });
    });
    void model;
  }

  // New symbol mid-session: nearest free spot right of its first caller in
  // the same module, else under the module's machines.
  private placeNear(fn: FnInfo, model: Model): void {
    this.touch();
    const caller = model.fns.find((f) => f.file === fn.file && f.calls.some((c) => c.callee === fn.name) && this.nodes.has(f.id));
    const bottom = this.bottom(model.project ? fn.file : null);
    const left = model.project ? Math.min(...this.nodesOf(fn.file).map((n) => n.place.x), Infinity) : 0;
    const base = caller ? this.nodes.get(caller.id)!.place : { x: isFinite(left) ? left : this.modules.get(fn.file)?.x ?? 0, y: bottom + 2 };
    const n: NodeState = { id: fn.id, name: fn.name, file: fn.file, place: { x: base.x + (caller ? machineSize(this.nodes.get(caller.id)!.fn).w + 3 : 0), y: base.y, pinned: false }, stale: fn.broken, fn };
    for (let dy = 0; dy < 200; dy++) {
      for (const sign of [1, -1]) {
        n.place.y = base.y + dy * sign;
        if (this.isFree(n)) {
          this.nodes.set(fn.id, n);
          return;
        }
      }
    }
    this.nodes.set(fn.id, n);
  }

  private bottom(file: string | null): number {
    let b = -Infinity;
    for (const n of this.nodes.values()) {
      if (file !== null ? n.file !== file : this.hidden(n)) continue;
      const f = footprint(n);
      b = Math.max(b, f.y + f.h);
    }
    return isFinite(b) ? b : (file !== null ? this.modules.get(file)?.y ?? 0 : 0);
  }

  isFree(n: NodeState, ignore?: string): boolean {
    const f = footprint(n);
    for (const o of this.nodes.values()) {
      if (o.id === n.id || o.id === ignore) continue;
      if (this.hidden(o) && o.file !== n.file) continue;
      if (overlap(f, footprint(o), 0)) return false;
    }
    // An open module's machines stay clear of every other module.
    if (n.file && !this.hidden(n)) {
      for (const m of this.modules.values()) if (m.file !== n.file && overlap(f, this.moduleRect(m.file), 0)) return false;
    }
    return true;
  }

  // Author drags a node. Pinned from then on; refused if it would overlap.
  setPos(id: string, x: number, y: number): boolean {
    const n = this.nodes.get(id);
    if (!n) return false;
    if (n.place.x === x && n.place.y === y) return true;
    const trial: NodeState = { ...n, place: { ...n.place, x, y } };
    if (!this.isFree(trial)) return false;
    this.touch();
    n.place.x = x;
    n.place.y = y;
    n.place.pinned = true;
    if (n.file) this.refresh(n.file);
    return true;
  }

  unpin(id: string, model: Model): void {
    const n = this.nodes.get(id);
    if (!n || !n.fn) return;
    this.touch();
    this.nodes.delete(id);
    const fresh = new Layout();
    const fns = model.project ? model.fns.filter((f) => f.file === n.file) : model.fns;
    fresh.layered(model, fns);
    const auto = fresh.nodes.get(id);
    let ox = 0, oy = 0;
    if (model.project) {
      // same offset from the module's other machines as a fresh layout would give
      const anchor = fns.map((f) => f.id).find((fid) => fid !== id && this.nodes.has(fid) && fresh.nodes.has(fid));
      if (anchor) (ox = this.nodes.get(anchor)!.place.x - fresh.nodes.get(anchor)!.place.x), (oy = this.nodes.get(anchor)!.place.y - fresh.nodes.get(anchor)!.place.y);
    }
    n.place = { x: (auto?.place.x ?? n.place.x) + ox, y: (auto?.place.y ?? n.place.y) + oy, pinned: false };
    this.nodes.set(id, n);
    if (!this.isFree(n)) {
      this.nodes.delete(id);
      this.placeNear(n.fn, model);
    }
    if (model.project) this.pack(model);
  }

  // Hit-test in world units (fractional). The frame panel counts as the node.
  at(wx: number, wy: number): NodeState | null {
    for (const n of [...this.nodes.values()].reverse()) {
      if (this.hidden(n)) continue;
      const { x, y } = n.place;
      const m = machineSize(n.fn);
      if (wx >= x && wx < x + m.w && wy >= y && wy < y + m.h) return n;
    }
    return null;
  }
}
