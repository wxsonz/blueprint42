// Real execution (M3): send the buffer to the trace server, then turn gdb's
// timeline into the same Trace the renderer plays for the interpreter.
import type { Model } from './parse';
import { fmtVal, type CellInfo, type Ev, type Snap, type SnapCell, type Trace, type V } from './interp';
import type { BoundValue, Sprite } from './blueprint';

// ---------------- wire format (server/tracer.py) ----------------

interface GVal {
  type: string;
  kind: 'int' | 'ptr' | 'struct' | 'array' | 'raw';
  v?: number;
  str?: string;
  strFull?: boolean;
  text?: string;
  fields?: (GVal & { name: string })[];
  items?: (GVal & { index: number })[];
  len?: number;
  elem?: number;
}
interface GVar extends GVal {
  name: string;
  addr: number | null;
  size: number;
  owner?: string;
}
type GEv =
  | { k: 'call'; id: number; fn: string }
  | { k: 'ret'; id: number; value: GVal | null }
  | { k: 'alloc'; id: number; addr: number; size: number; line: number | null }
  | { k: 'free'; id: number }
  | { k: 'badfree'; addr: number; line: number | null };
interface GStop {
  line: number | null;
  events: GEv[];
  frames: { id: number; fn: string; line: number | null; vars: GVar[]; delta?: boolean }[];
  statics: GVar[];
  heap: { id: number; addr: number; size: number; hex: string; line: number | null }[];
  heapIds?: number[]; // live blocks (heap then only lists blocks whose bytes changed)
  bound?: Record<string, BoundValue>;
  exited?: boolean;
}
export interface GResult {
  ok: boolean;
  error?: string;
  compile?: { flags: string[]; text: string; diagnostics: { line: number; col: number; severity: string; msg: string }[] };
  stops?: GStop[];
  exit?: number | null;
  signal?: string | null;
  truncated?: boolean;
  stdout?: string;
  stderr?: string;
  ms?: number;
  flags?: string[];
  bindingScopes?: Record<string, { scope: 'fn' | 'global'; fn?: string }>;
}

export interface GdbRequest {
  src: string;
  files?: Record<string, string>;
  defines?: string[];
  stdin?: string;
  fns: string[];
  maxSteps?: number;
  maxSeconds?: number;
  bindings?: Sprite[];
}

export async function requestTrace(req: GdbRequest, signal?: AbortSignal): Promise<GResult | 'unavailable'> {
  let res: Response;
  try {
    res = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ftb': '1' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return 'unavailable';
  }
  if (res.status === 404 || res.status === 405) return 'unavailable';
  if (!res.ok) return { ok: false, error: `trace server: HTTP ${res.status}` };
  return (await res.json()) as GResult;
}

// ---------------- conversion ----------------

// The tracer sends only what changed at each stop (delta frames and statics).
// Rebuild full stops: every frame with all its variables, every static.
export function expandStops(stops: GStop[]): GStop[] {
  const frameVars = new Map<number, Map<string, GVar>>();
  const statics = new Map<string, GVar>();
  const blocks = new Map<number, GStop['heap'][number]>();
  let bound: Record<string, BoundValue> | undefined;
  return stops.map((st) => {
    for (const b of st.heap) blocks.set(b.id, b);
    const heap = st.heapIds ? st.heapIds.map((id) => blocks.get(id)!).filter(Boolean) : st.heap;
    if (st.bound) bound = { ...bound, ...st.bound };
    const frames = st.frames.map((f) => {
      let vars = frameVars.get(f.id);
      if (!vars || !f.delta) {
        vars = new Map();
        frameVars.set(f.id, vars);
      }
      for (const v of f.vars) vars.set(v.name, v);
      return { ...f, vars: [...vars.values()] };
    });
    for (const v of st.statics) statics.set(`${v.owner ?? ''}.${v.name}`, v);
    return { ...st, frames, statics: st.exited ? [] : [...statics.values()], heap, ...(bound ? { bound } : {}) };
  });
}

const SIGNALS: Record<string, string> = {
  SIGSEGV: 'segmentation fault',
  SIGBUS: 'bus error',
  SIGABRT: 'abort (often a failed free or assert)',
  SIGFPE: 'arithmetic error (division by zero?)',
};

function preview(hex: string, size: number): string {
  const bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
  const nul = bytes.indexOf(0);
  const text = bytes.slice(0, nul < 0 ? bytes.length : nul);
  const printable = text.every((b) => (b >= 32 && b < 127) || b === 10 || b === 9);
  if (printable && (text.length > 0 || nul === 0)) {
    const s = String.fromCharCode(...text).replace(/\n/g, '\\n').replace(/\t/g, '\\t');
    return `"${s.length > 14 ? s.slice(0, 14) + '…' : s}"${nul < 0 && size > bytes.length ? '…' : ''}`;
  }
  return bytes.slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join(' ') + (bytes.length > 6 ? ' …' : '');
}

// Does `line` assign to `name`? Used to decide when an uninitialised local
// starts holding a real value (gdb shows whatever garbage was on the stack).
function assigns(line: string, name: string): boolean {
  const n = name.replace(/[$^]/g, '\\$&');
  return new RegExp(`(^|[^\\w.>])${n}\\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)|(\\+\\+|--)\\s*${n}\\b|\\b${n}\\s*(\\+\\+|--)`).test(line);
}

interface Region {
  addr: number;
  size: number;
  cell: number;
  name: string;
  elem?: number;
  heap?: number; // block id
}

export function convertGdb(r: GResult, model: Model, src: string): Trace {
  const lines = src.split('\n');
  const stops = expandStops(r.stops ?? []);
  const cells = new Map<number, CellInfo>();
  const types = new Map<number, string>();
  let nextCell = 1;
  const newCell = (info: CellInfo, type: string) => {
    const id = nextCell++;
    cells.set(id, info);
    types.set(id, type);
    return id;
  };

  // live state
  const stack: { id: number; fn: string; cells: Map<string, number>; line: number | null }[] = [];
  const statics = new Map<string, number>(); // "owner.name" -> cell
  const heapCell = new Map<number, number>(); // block id -> cell
  const heapSize = new Map<number, number>();
  const heapLine = new Map<number, number | null>();
  const heapAddr = new Map<number, { addr: number; size: number; cell: number; freed: boolean; id: number }>();
  const heapSlots = new Map<number, number>();
  const usedSlots = new Set<number>();
  const vals = new Map<number, V>();
  const raw = new Map<number, string>(); // last raw json per cell, for change detection
  const defined = new Set<number>();
  const evs: Ev[] = [];
  const snaps: Snap[] = [];
  const warnings: string[] = [];
  const boundIds = new Set<string>();
  let currentBound: Record<string, BoundValue> | undefined;
  for (const id of Object.keys(r.bindingScopes ?? {})) boundIds.add(id);
  if (boundIds.size) currentBound = Object.create(null);

  const snapCell = (id: number): SnapCell => ({ id, name: cells.get(id)!.name, type: types.get(id) ?? '', val: vals.get(id) ?? { k: 'undef' } });
  const snapshot = (): Snap => ({
    stack: stack.map((f) => ({ id: f.id, fn: f.fn, cells: [...f.cells.values()].map(snapCell) })),
    statics: [...statics.values()].map(snapCell),
    heap: [...heapCell.values()].map(snapCell),
    ...(currentBound ? { bound: Object.fromEntries([...boundIds].map((id) => [id, currentBound![id] ?? { bound: false }])) } : {}),
  });
  const emit = (e: Ev) => {
    evs.push(e);
    snaps.push(snapshot());
  };
  snaps.push(snapshot());

  // ---- values ----
  let regions: Region[] = [];
  const buildRegions = (stop: GStop) => {
    regions = [];
    for (const f of stop.frames) {
      const fc = stack.find((s) => s.id === f.id)?.cells;
      for (const v of f.vars) if (v.addr !== null && fc?.has(v.name)) regions.push({ addr: v.addr, size: v.size, cell: fc.get(v.name)!, name: v.name, elem: v.elem });
    }
    for (const v of stop.statics) {
      const c = statics.get(`${v.owner ?? ''}.${v.name}`);
      if (c !== undefined && v.addr !== null) regions.push({ addr: v.addr, size: v.size, cell: c, name: v.name, elem: v.elem });
    }
    for (const b of heapAddr.values()) if (!b.freed) regions.push({ addr: b.addr, size: b.size, cell: b.cell, name: `#${b.id}`, heap: b.id });
  };
  const resolve = (p: number): V => {
    if (p === 0) return { k: 'ptr', to: null };
    for (const g of regions) {
      if (p < g.addr || p >= g.addr + Math.max(1, g.size)) continue;
      const off = p - g.addr;
      if (off === 0 && !g.elem) return { k: 'ptr', to: g.cell };
      if (g.elem) return { k: 'ptr', to: g.cell, label: `${g.name}[${Math.floor(off / g.elem)}]${off % g.elem ? `+${off % g.elem}` : ''}` };
      return { k: 'ptr', to: g.cell, label: `${g.name}+${off}` };
    }
    for (const b of heapAddr.values()) if (b.freed && p >= b.addr && p < b.addr + b.size) return { k: 'ptr', to: b.cell, label: `freed #${b.id}` };
    return { k: 'raw', text: `0x${p.toString(16)}` };
  };
  const text = (g: GVal): string => {
    if (g.kind === 'int') return fmtVal({ k: 'int', v: g.v! }, g.type);
    if (g.kind === 'ptr') return fmtVal(resolve(g.v!));
    if (g.kind === 'struct') return `{${(g.fields ?? []).map((f) => `${f.name} ${text(f)}`).join(', ')}}`;
    if (g.kind === 'array') {
      const items = g.items ?? [];
      if ((g.len ?? 0) <= 16) return `[${items.map(text).join(', ')}]`;
      return items.length ? items.map((i) => `[${i.index}] ${text(i)}`).join(' · ') : `${g.len}× all zero`;
    }
    return g.text ?? '?';
  };
  const toV = (g: GVal | null): V => {
    if (!g) return { k: 'void' };
    if (g.kind === 'int') return { k: 'int', v: g.v! };
    if (g.kind === 'ptr') return resolve(g.v!);
    return { k: 'raw', text: text(g) };
  };

  const frameOf = (id: number) => stack.find((f) => f.id === id);
  const fnInfo = (fn: string) => model.byName.get(fn);
  let lastLine = 0;
  let exitCode: number | null = r.exit ?? null;

  const addFrame = (id: number, fn: string, stop: GStop) => {
    const data = stop.frames.find((f) => f.id === id);
    const info = fnInfo(fn);
    const cs = new Map<string, number>();
    for (const v of data?.vars ?? []) {
      const c = newCell({ name: v.name, owner: fn, frame: id }, v.type);
      cs.set(v.name, c);
      if (info?.params.some((p) => p.name === v.name)) defined.add(c);
    }
    const caller = stack[stack.length - 1] ?? null;
    stack.push({ id, fn, cells: cs, line: data?.line ?? null });
    return { caller, data };
  };

  for (const stop of stops) {
    const nextBound = stop.bound;
    for (const id of Object.keys(nextBound ?? {})) boundIds.add(id);
    for (const e of stop.events) {
      const top = stack[stack.length - 1] ?? null;
      if (e.k === 'call') {
        for (const [id, scope] of Object.entries(r.bindingScopes ?? {})) if (scope.scope === 'fn' && scope.fn === e.fn) {
          currentBound = { ...currentBound, [id]: { bound: false } };
        }
        const { caller, data } = addFrame(e.id, e.fn, stop);
        buildRegions(stop);
        const f = frameOf(e.id)!;
        const params = fnInfo(e.fn)?.params ?? [];
        for (const v of data?.vars ?? []) {
          const c = f.cells.get(v.name)!;
          raw.set(c, JSON.stringify(v));
          vals.set(c, defined.has(c) ? toV(v) : { k: 'undef' });
        }
        emit({
          k: 'call', line: data?.line ? data.line - 1 : lastLine, frame: e.id, fn: e.fn, caller: caller?.fn ?? null,
          args: params.map((p) => {
            const c = f.cells.get(p.name);
            const val = c !== undefined ? vals.get(c)! : { k: 'undef' as const };
            return { name: p.name, val, text: fmtVal(val) };
          }),
        });
      } else if (e.k === 'ret') {
        const f = frameOf(e.id);
        if (!f) continue;
        const idx = stack.indexOf(f);
        stack.splice(idx, 1);
        for (const [id, scope] of Object.entries(r.bindingScopes ?? {})) if (scope.scope === 'fn' && scope.fn === f.fn) {
          currentBound = { ...currentBound, [id]: { bound: false } };
        }
        const caller = stack[idx - 1] ?? null;
        let val = toV(e.value);
        if (f.fn === 'main' && val.k === 'void' && exitCode !== null) val = { k: 'int', v: exitCode };
        emit({ k: 'ret', line: f.line ? f.line - 1 : lastLine, frame: e.id, fn: f.fn, caller: caller?.fn ?? null, val });
      } else if (e.k === 'alloc') {
        const c = newCell({ name: `#${e.id}`, owner: 'heap', frame: -2 }, `${e.size} bytes`);
        heapCell.set(e.id, c);
        heapSize.set(e.id, e.size);
        heapLine.set(e.id, e.line ? e.line - 1 : null);
        heapAddr.set(e.addr, { addr: e.addr, size: e.size, cell: c, freed: false, id: e.id });
        let slot = 0;
        while (usedSlots.has(slot)) slot++;
        usedSlots.add(slot);
        heapSlots.set(c, slot);
        vals.set(c, { k: 'raw', text: 'uninitialised' });
        emit({ k: 'alloc', line: e.line ? e.line - 1 : lastLine, frame: top?.id ?? null, cell: c, size: e.size });
      } else if (e.k === 'free') {
        const c = heapCell.get(e.id);
        if (c === undefined) continue;
        heapCell.delete(e.id);
        usedSlots.delete(heapSlots.get(c)!);
        for (const b of heapAddr.values()) if (b.id === e.id) b.freed = true;
        emit({ k: 'free', line: lastLine, frame: top?.id ?? null, cell: c });
      } else if (e.k === 'badfree') {
        warnings.push(`free() of a pointer that malloc never returned (0x${e.addr.toString(16)}), line ${e.line ?? '?'}`);
      }
    }

    // ---- writes: every value that changed since the last stop ----
    buildRegions(stop);
    const top = stack[stack.length - 1] ?? null;
    const via = (target: Region | undefined): number | null => {
      if (!top || !target) return null;
      const data = stop.frames.find((f) => f.id === top.id);
      for (const v of data?.vars ?? []) {
        if (v.kind === 'ptr' && v.v !== undefined && v.v >= target.addr && v.v < target.addr + Math.max(1, target.size)) {
          const c = top.cells.get(v.name);
          if (c !== undefined && cells.get(c)!.frame !== cells.get(target.cell)!.frame) return c;
        }
      }
      return null;
    };
    for (const f of stop.frames) {
      const fs = frameOf(f.id);
      if (!fs) continue;
      const prevLine = fs.line;
      const lineText = prevLine ? lines[prevLine - 1] ?? '' : '';
      for (const v of f.vars) {
        const c = fs.cells.get(v.name);
        if (c === undefined) continue;
        const now = JSON.stringify(v);
        const changed = raw.get(c) !== now;
        if (!defined.has(c) && (changed || assigns(lineText, v.name))) defined.add(c);
        raw.set(c, now);
        if (!defined.has(c)) continue;
        const nv = toV(v);
        if (JSON.stringify(nv) === JSON.stringify(vals.get(c))) continue;
        vals.set(c, nv);
        const region = regions.find((g) => g.cell === c);
        const w = fs.id === top?.id ? null : via(region);
        emit({ k: 'write', line: (prevLine ?? 1) - 1, frame: top?.id ?? null, cell: c, val: nv, via: w, text: `${v.name} = ${fmtVal(nv, v.type)}` });
      }
      fs.line = f.line;
    }
    for (const v of stop.statics) {
      const key = `${v.owner ?? ''}.${v.name}`;
      let c = statics.get(key);
      if (c === undefined) {
        c = newCell({ name: v.name, owner: v.owner ?? '', frame: -1 }, v.type);
        statics.set(key, c);
        vals.set(c, toV(v));
        raw.set(c, JSON.stringify(v));
        continue;
      }
      const nv = toV(v);
      if (JSON.stringify(nv) === JSON.stringify(vals.get(c))) continue;
      vals.set(c, nv);
      const w = via(regions.find((g) => g.cell === c));
      emit({ k: 'write', line: lastLine, frame: top?.id ?? null, cell: c, val: nv, via: w, text: `${v.name} = ${text(v)}` });
    }
    for (const b of stop.heap) {
      const c = heapCell.get(b.id);
      if (c === undefined) continue;
      const nv: V = { k: 'raw', text: preview(b.hex, b.size) };
      if (JSON.stringify(nv) === JSON.stringify(vals.get(c))) continue;
      const first = vals.get(c)?.k === 'raw' && (vals.get(c) as { text: string }).text === 'uninitialised';
      vals.set(c, nv);
      if (first && /^00( 00)*/.test(nv.text)) continue;
      const w = via(regions.find((g) => g.cell === c));
      emit({ k: 'write', line: lastLine, frame: top?.id ?? null, cell: c, val: nv, via: w, text: `#${b.id} = ${nv.text}` });
    }

    if (stop.line !== null && top) {
      lastLine = stop.line - 1;
      // The sample represents this completed gdb stop. Earlier call/write/
      // heap events still carry the preceding sample.
      if (nextBound !== undefined) currentBound = nextBound;
      emit({ k: 'step', line: lastLine, frame: top.id });
    } else if (stop.exited && evs.length) {
      // The inferior no longer has readable memory. Clear globals as well.
      currentBound = Object.create(null);
      snaps[snaps.length - 1] = snapshot();
    }
  }

  // Only a program that exited can leak: a truncated or crashed run just
  // stopped with blocks still in use.
  const exited = !r.truncated && !r.signal;
  const leaks = exited ? [...heapCell.entries()].map(([id, c]) => ({ cell: c, size: heapSize.get(id) ?? 0, line: heapLine.get(id) ?? null })) : [];
  let error: Trace['error'] = null;
  if (r.signal) {
    error = { msg: `${r.signal}: ${SIGNALS[r.signal] ?? 'the program was killed by a signal'}`, line: lastLine };
    emit({ k: 'error', line: lastLine, frame: stack[stack.length - 1]?.id ?? null, msg: error.msg });
  }
  return {
    engine: 'gdb',
    evs,
    snaps,
    cells,
    exit: exitCode !== null ? { k: 'int', v: exitCode } : null,
    error,
    truncated: !!r.truncated,
    stdout: r.stdout,
    heapSlots,
    leaks,
    warnings,
  };
}
