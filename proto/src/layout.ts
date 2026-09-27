// Machine placement. Positions are keyed by stable symbol id and survive
// edits. Author-placed (pinned) positions are never moved by the tool.
import type { FnInfo, Model } from './parse';

export const MW = 4; // node footprint, cells
export const MH = 3;
export const SLOT_PX = 20;
export const INV_HEAD_PX = 20;
export const CELL_PX = 40;

export interface Place {
  x: number;
  y: number;
  pinned: boolean;
}

export interface NodeState {
  id: string;
  name: string;
  place: Place;
  stale: boolean; // symbol lost to a parse error; last known node kept
  fn: FnInfo | null;
}

export function invCells(fn: FnInfo | null): number {
  const slots = fn ? fn.params.length + fn.locals.length : 0;
  if (!slots) return 0;
  return Math.ceil((INV_HEAD_PX + slots * SLOT_PX + 12) / CELL_PX);
}

// Rectangle a node reserves on the grid, including ports, statics and inventory.
export function footprint(n: NodeState): { x: number; y: number; w: number; h: number } {
  const st = n.fn?.statics.length ? 2 : 0;
  return { x: n.place.x - 1, y: n.place.y - st, w: MW + 2, h: MH + st + invCells(n.fn) };
}

const overlap = (a: ReturnType<typeof footprint>, b: ReturnType<typeof footprint>, pad = 1) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export class Layout {
  nodes = new Map<string, NodeState>();
  // Author-routed belts: key "caller>callee" ('' caller = the process) → the
  // cell centre the belt's middle leg passes through.
  waypoints = new Map<string, { x: number; y: number }>();

  reset(): void {
    this.nodes.clear();
    this.waypoints.clear();
  }

  // Reconcile nodes with a fresh parse. Returns ids renamed this round (old → new).
  sync(model: Model): Map<string, string> {
    const renamed = new Map<string, string>();
    const present = new Map(model.fns.map((f) => [f.id, f]));
    const missing = [...this.nodes.keys()].filter((id) => !present.has(id));
    const added = [...present.keys()].filter((id) => !this.nodes.has(id));

    // Rename heuristic (SPEC §6, prototype answer): exactly one symbol vanished
    // and exactly one appeared in the same edit → same machine, new name.
    if (missing.length === 1 && added.length === 1) {
      const old = this.nodes.get(missing[0])!;
      this.nodes.delete(missing[0]);
      this.nodes.set(added[0], { ...old, id: added[0] });
      renamed.set(missing[0], added[0]);
      const oldName = old.name;
      const newName = present.get(added[0])!.name;
      for (const [k, v] of [...this.waypoints]) {
        const [f, t] = k.split('>');
        if (f !== oldName && t !== oldName) continue;
        this.waypoints.delete(k);
        this.waypoints.set(`${f === oldName ? newName : f}>${t === oldName ? newName : t}`, v);
      }
      added.length = 0;
      missing.length = 0;
    }

    for (const id of missing) {
      const n = this.nodes.get(id)!;
      if (model.error) n.stale = true; // broken code never clears the grid
      else this.nodes.delete(id);
    }
    for (const [id, fn] of present) {
      const n = this.nodes.get(id);
      if (n) {
        n.fn = fn;
        n.name = fn.name;
        n.stale = fn.broken;
      }
    }

    if (added.length) {
      if (this.nodes.size === 0) this.layered(model);
      else for (const id of added) this.placeNear(present.get(id)!, model);
    }
    return renamed;
  }

  // First placement: columns by call depth from the roots.
  // First placement (Sugiyama-style): columns by longest call path, so every
  // callee sits right of all its callers; rows ordered by the average row of
  // their callers to cut crossings. Recursive edges are ignored for layering.
  private layered(model: Model): void {
    const callees = new Map<string, string[]>();
    const callers = new Map<string, string[]>();
    for (const f of model.fns) {
      const out = [...new Set(f.calls.map((c) => c.callee))].filter((c) => c !== f.name && model.byName.has(c));
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
    const roots = model.fns.filter((f) => f.name === 'main' || !(callers.get(f.name) ?? []).length);
    for (const r of roots.length ? roots : model.fns.slice(0, 1)) walk(r.name, 0);
    for (const f of model.fns) if (!depth.has(f.name)) walk(f.name, 0);

    const cols: FnInfo[][] = [];
    for (const f of model.fns) (cols[depth.get(f.name)!] ??= []).push(f);
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
        y += f.statics.length ? 2 : 0;
        this.nodes.set(f.id, { id: f.id, name: f.name, place: { x: d * 7, y, pinned: false }, stale: f.broken, fn: f });
        y += MH + invCells(f) + 2;
      });
    });
  }

  // New symbol mid-session: nearest free spot right of its first caller.
  private placeNear(fn: FnInfo, model: Model): void {
    const caller = model.fns.find((f) => f.calls.some((c) => c.callee === fn.name) && this.nodes.has(f.id));
    const base = caller ? this.nodes.get(caller.id)!.place : { x: 0, y: this.bottom() + 2 };
    const n: NodeState = { id: fn.id, name: fn.name, place: { x: base.x + (caller ? 7 : 0), y: base.y, pinned: false }, stale: fn.broken, fn };
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

  private bottom(): number {
    let b = 0;
    for (const n of this.nodes.values()) {
      const f = footprint(n);
      b = Math.max(b, f.y + f.h);
    }
    return b;
  }

  isFree(n: NodeState, ignore?: string): boolean {
    const f = footprint(n);
    for (const o of this.nodes.values()) {
      if (o.id === n.id || o.id === ignore) continue;
      if (overlap(f, footprint(o), 0)) return false;
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
    n.place.x = x;
    n.place.y = y;
    n.place.pinned = true;
    return true;
  }

  unpin(id: string, model: Model): void {
    const n = this.nodes.get(id);
    if (!n || !n.fn) return;
    this.nodes.delete(id);
    const fresh = new Layout();
    fresh.layered(model);
    const auto = fresh.nodes.get(id);
    n.place = { x: auto?.place.x ?? n.place.x, y: auto?.place.y ?? n.place.y, pinned: false };
    this.nodes.set(id, n);
    if (!this.isFree(n)) {
      this.nodes.delete(id);
      this.placeNear(n.fn, model);
    }
  }

  // Hit-test in world units (fractional). The frame panel counts as the node.
  at(wx: number, wy: number): NodeState | null {
    for (const n of [...this.nodes.values()].reverse()) {
      const { x, y } = n.place;
      const h = MH + (invCells(n.fn) ? (INV_HEAD_PX + ((n.fn!.params.length + n.fn!.locals.length) * SLOT_PX) + 10) / CELL_PX : 0);
      if (wx >= x && wx < x + MW && wy >= y && wy < y + h) return n;
    }
    return null;
  }
}
