// A machine is its inside (docs/decisions/026-machine-inside.md): the node on the grid holds
// its storage (params, locals, fields, statics), its stations (one per
// statement) and a memory floor (the bytes behind each char *). The geometry
// here is in grid cells and comes from the code alone, never from a run, so
// layout can place machines before anything executes.
import { planOf, rowMid } from './interior';
import type { FnInfo, Var } from './parse';

export const MW = 4; // the machine's motor (the skin's node sprite), cells
export const MH = 3;
export const SLOT_PX = 20;
export const INV_HEAD_PX = 20;
export const CELL_PX = 40;

// The process box grows with what the program printed, so the whole output
// shows (up to PROC_LINES lines, 13 px each; past that, a count of the rest).
export const PROC_LINES = 12;
export function procLines(out: string | undefined): number {
  return out ? Math.min(PROC_LINES, out.replace(/\n$/, '').split('\n').length) : 0;
}
export function procH(out: string | undefined): number {
  return MH + (Math.max(0, procLines(out) - 2) * 13) / CELL_PX;
}

// Struct variables unfold into their fields under their own row. Folded
// ones ("fnKey.var") show just the one row. Open by default: seeing the
// struct is the point.
export const MAX_FIELDS = 6;
export const folded = new Set<string>();

// Machines the author closed (by function key): just the motor and the line
// it's on. Everything else shows its inside.
export const shut = new Set<string>();
export const SHUT_W = MW + 2;
export const SHUT_H = 6;

export interface FrameRow {
  name: string; // variable, or field under `parent`
  param: boolean;
  depth: 0 | 1;
  parent?: string;
  fold?: 'open' | 'closed'; // a struct row that can fold
  more?: number; // a "+n more" row
}

export function frameRows(fn: FnInfo | null): FrameRow[] {
  if (!fn) return [];
  const rows: FrameRow[] = [];
  const add = (v: FnInfo['params'][number], param: boolean) => {
    const fs = v.fields ?? [];
    const open = fs.length > 0 && !folded.has(`${fn.name}.${v.name}`);
    rows.push({ name: v.name, param, depth: 0, ...(fs.length ? { fold: open ? 'open' : 'closed' } : {}) });
    if (!open) return;
    for (const f of fs.slice(0, MAX_FIELDS)) rows.push({ name: f.name, param, depth: 1, parent: v.name });
    if (fs.length > MAX_FIELDS) rows.push({ name: `+${fs.length - MAX_FIELDS} more`, param, depth: 1, parent: v.name, more: fs.length - MAX_FIELDS });
  };
  for (const v of fn.params) add(v, true);
  for (const v of fn.locals) add(v, false);
  return rows;
}

// ---------------- storage slots ----------------

export interface Slot {
  key: string; // c:name, f:parent.field, s:name, m:parent (a "+n more" row)
  name: string;
  depth: 0 | 1;
  param: boolean;
  kind: 'cell' | 'field' | 'static' | 'more';
  type: string;
  fold?: 'open' | 'closed';
}

const isText = (type: string) => /\bchar\b/.test(type) && type.includes('*');

export function slotsOf(fn: FnInfo): Slot[] {
  const vars = new Map<string, Var>([...fn.params, ...fn.locals].map((v) => [v.name, v]));
  const out: Slot[] = frameRows(fn).map((r) => {
    if (r.more) return { key: `m:${r.parent}`, name: r.name, depth: 1, param: r.param, kind: 'more', type: '' };
    if (r.depth === 1) {
      const f = vars.get(r.parent!)?.fields?.find((x) => x.name === r.name);
      return { key: `f:${r.parent}.${r.name}`, name: r.name, depth: 1, param: r.param, kind: 'field', type: f?.type ?? '' };
    }
    return { key: `c:${r.name}`, name: r.name, depth: 0, param: r.param, kind: 'cell', type: vars.get(r.name)?.type ?? '', ...(r.fold ? { fold: r.fold } : {}) };
  });
  for (const v of fn.statics) out.push({ key: `s:${v.name}`, name: v.name, depth: 0, param: false, kind: 'static', type: v.type });
  return out;
}

// ---------------- geometry (cells, from the machine's top-left) ----------------

const PAD = 0.3;
const HEAD = 0.8; // the wall's title
const STORE_W = 5.6;
const GAP = 1.6; // between storage and stations: room for values in flight
const STATION_ZOOM = 1.15; // stations draw a little larger than the grid
const MEM_H = 1.6;
const MEM_GAP = 0.25;

export interface Geom {
  w: number;
  h: number;
  head: number; // title height
  motor: { x: number; y: number; w: number; h: number }; // the node sprite
  store: { x: number; y: number; w: number; rows: number }; // panel top-left, width, row count (incl. its header)
  stations: { x: number; y: number; w: number; h: number; zoom: number };
  memory: { x: number; y: number; w: number; keys: string[] }; // one strip per key
  memH: number;
  memGap: number;
  entryY: number; // where calls come in (left side)
}

let geomCache = new WeakMap<FnInfo, Geom>();
let foldKey = '';

export function geomOf(fn: FnInfo): Geom {
  // folding a struct changes the rows: start over
  const fk = [...folded].join('|');
  if (fk !== foldKey) (foldKey = fk), (geomCache = new WeakMap());
  const hit = geomCache.get(fn);
  if (hit) return hit;
  const plan = planOf(fn);
  const slots = slotsOf(fn);
  const motor = { x: PAD, y: HEAD + 0.2, w: MW, h: MH };
  const storeTop = motor.y + MH + 0.3;
  const storeH = (INV_HEAD_PX + slots.length * SLOT_PX + 8) / CELL_PX;
  const st = { x: PAD + STORE_W + GAP, y: HEAD + 0.2, w: (plan.w * STATION_ZOOM) / CELL_PX, h: (plan.h * STATION_ZOOM) / CELL_PX, zoom: STATION_ZOOM };
  const keys = slots.filter((s) => s.kind !== 'more' && s.kind !== 'static' && isText(s.type)).map((s) => s.key);
  const memTop = Math.max(storeTop + storeH, st.y + st.h) + 0.4;
  const w = st.x + st.w + PAD;
  const g: Geom = {
    w, h: memTop + keys.length * (MEM_H + MEM_GAP) + (keys.length ? 0.1 : -0.2), head: HEAD, motor,
    store: { x: PAD, y: storeTop, w: STORE_W, rows: slots.length },
    stations: st,
    memory: { x: PAD, y: memTop, w: w - PAD * 2, keys },
    memH: MEM_H, memGap: MEM_GAP,
    entryY: motor.y + MH * 0.5,
  };
  geomCache.set(fn, g);
  return g;
}

export function machineSize(fn: FnInfo | null): { w: number; h: number } {
  if (!fn || fn.broken) return { w: MW + 2, h: MH + 1 };
  if (shut.has(fn.name)) return { w: SHUT_W, h: SHUT_H };
  const g = geomOf(fn);
  return { w: Math.ceil(g.w), h: Math.ceil(g.h) };
}

// A storage slot's row (cells from the machine's top): its middle.
export function slotY(g: Geom, index: number): number {
  return g.store.y + (INV_HEAD_PX + index * SLOT_PX + SLOT_PX / 2) / CELL_PX;
}

// Where a call made on `line` leaves the machine (its right side): the row
// of the statement that makes it.
export function callPortY(fn: FnInfo, line: number): number | null {
  if (shut.has(fn.name)) return null; // no stations showing: ports spread along the side
  const plan = planOf(fn);
  const s = plan.byLine.get(line);
  if (s === undefined) return null;
  const g = geomOf(fn);
  return g.stations.y + (rowMid(plan.stations[s].row) * g.stations.zoom) / CELL_PX;
}
