// Real execution (M3): send the buffer to the trace server, then turn gdb's
// timeline into the same Trace the renderer plays for the interpreter.
import type { Model } from './parse';
import { EngineError, fmtVal, type CellInfo, type Ev, type Payload, type Snap, type SnapCell, type SnapField, type SnapFrame, type StdBuf, type Trace, type V } from './interp';
import type { BoundValue, Sprite } from './blueprint';
import { allAtOnce, inSlices } from './slices';

// ---------------- wire format (server/tracer.py) ----------------

interface GVal {
  type: string;
  kind: 'int' | 'ptr' | 'struct' | 'array' | 'raw';
  v?: number;
  str?: string;
  strFull?: boolean;
  strs?: string[]; // a char **: the strings it points at, up to its NULL
  strsFull?: boolean;
  text?: string;
  fields?: (GVal & { name: string })[];
  items?: (GVal & { index: number })[];
  len?: number;
  elem?: number;
  deref?: GVal; // a struct pointer's pointee
  hex?: string; // a char array's bytes (up to 48)
  ro?: boolean; // a char * into the program's read-only memory (a literal)
}
interface GVar extends GVal {
  name: string;
  addr: number | null;
  size: number;
  owner?: string;
  ownerFile?: string | null;
}
// `file` is project-relative (the sandbox buffer is "sandbox.c").
// `pre` (a window's first stop): the frame or block already existed when the
// window began; it is there, not being called or allocated now.
type GEv =
  | { k: 'call'; id: number; fn: string; file?: string | null; pre?: boolean }
  | { k: 'ret'; id: number; value: GVal | null }
  | { k: 'alloc'; id: number; addr: number; size: number; line: number | null; file?: string | null; pre?: boolean }
  | { k: 'free'; id: number }
  | { k: 'badfree'; addr: number; line: number | null; file?: string | null }
  | { k: 'out'; fd: number; n: number; text: string; via: 'printf' | 'write'; line?: number | null; file?: string | null };
interface GStop {
  line: number | null;
  file?: string | null;
  events: GEv[];
  frames: { id: number; fn: string; file?: string | null; line: number | null; vars: GVar[]; delta?: boolean }[];
  statics: GVar[];
  heap: { id: number; addr: number; size: number; hex: string; line: number | null; file?: string | null }[];
  heapIds?: number[]; // live blocks (heap then only lists blocks whose bytes changed)
  stack?: number[]; // live frames, oldest first (frames then only lists the ones re-read)
  bound?: Record<string, BoundValue>;
  exited?: boolean;
  stdbuf?: StdBuf | null; // printf's buffer after this stop, when it changed
  inPos?: number; // stdin's offset after this stop, when it changed
}
// How a window was fetched (the tracer's session, for the nerd stats).
export interface WindowStats {
  start: number | 'here' | 'rerun'; // the savepoint it started from, or where the program already was
  silentSteps: number;
  silentMs: number;
  recordMs: number;
  recorded: number;
  savepoints: number[];
  every: number;
  total: number | null; // the run's length, once it has been seen to end
}

export interface GResult {
  ok: boolean;
  error?: string;
  compile?: { flags: string[]; text: string; diagnostics: { file?: string; line: number; col: number; severity: string; msg: string }[] };
  stops?: GStop[];
  exit?: number | null;
  signal?: string | null;
  truncated?: boolean;
  stdout?: string;
  outMode?: 'terminal' | 'pipe';
  args?: string[];
  stderr?: string;
  window?: { from: number | null; to: number }; // the steps this trace covers
  outBefore?: string; // stdout written before the window began
  stdinText?: string; // the stdin it ran with (echoed by the server, or set by the page)
  steps?: number; // steps the run reached
  stats?: WindowStats;
  ms?: number;
  flags?: string[];
  bindingScopes?: Record<string, { scope: 'fn' | 'global'; fn?: string; file?: string }>;
}

export interface GdbRequest {
  src?: string; // the sandbox buffer, or…
  project?: { files: Record<string, string> }; // …a project's current buffers (M5)
  files?: Record<string, string>;
  defines?: string[];
  stdin?: string;
  args?: string[];
  fns: string[];
  maxSteps?: number;
  terminal?: boolean; // stdout a terminal (default) or a pipe
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
  const lastFrame = new Map<number, GStop['frames'][number]>(); // a frame's last record, for the ones not re-sent
  const statics = new Map<string, GVar>();
  const blocks = new Map<number, GStop['heap'][number]>();
  let bound: Record<string, BoundValue> | undefined;
  return stops.map((st) => {
    for (const b of st.heap) blocks.set(b.id, b);
    const heap = st.heapIds ? st.heapIds.map((id) => blocks.get(id)!).filter(Boolean) : st.heap;
    if (st.bound) bound = { ...bound, ...st.bound };
    const sent = st.frames.map((f) => {
      let vars = frameVars.get(f.id);
      if (!vars || !f.delta) {
        vars = new Map();
        frameVars.set(f.id, vars);
      }
      for (const v of f.vars) vars.set(v.name, v);
      const full = { ...f, vars: [...vars.values()] };
      lastFrame.set(f.id, full);
      return full;
    });
    // a waiting caller whose bytes didn't change isn't re-sent: it is as it was
    const frames = st.stack ? st.stack.map((id) => lastFrame.get(id)).filter((f): f is GStop['frames'][number] => !!f) : sent;
    for (const v of st.statics) statics.set(`${v.owner ?? ''}.${v.ownerFile ?? ''}.${v.name}`, v);
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

// `sources`: the sandbox buffer, or a project's files by path.
// The tracer's stops into a Trace, in stages: setup (the tables), stops (one
// gdb stop at a time), finish (leaks, a crash's signal, the Trace). A failure
// says which stage, and at which stop (EngineError).
export function convertGdb(r: GResult, model: Model, sources: string | Record<string, string>): Trace {
  const mark: { stage: string; at: number | null } = { stage: 'setup', at: null };
  try {
    return allAtOnce(convertStages(r, model, sources, mark));
  } catch (e) {
    throw new EngineError('gdb', mark.stage, mark.at, e);
  }
}

// The same, in slices between frames (src/slices.ts): a window of 20,000
// steps is most of a second of work, and the page keeps drawing meanwhile.
export async function convertGdbSliced(r: GResult, model: Model, sources: string | Record<string, string>): Promise<Trace> {
  const mark: { stage: string; at: number | null } = { stage: 'setup', at: null };
  try {
    return await inSlices(convertStages(r, model, sources, mark));
  } catch (e) {
    throw new EngineError('gdb', mark.stage, mark.at, e);
  }
}

function* convertStages(r: GResult, model: Model, sources: string | Record<string, string>, mark: { stage: string; at: number | null }): Generator<void, Trace, void> {
  const split = new Map<string, string[]>();
  const linesOf = (file: string | null | undefined): string[] => {
    const k = typeof sources === 'string' ? '' : file ?? '';
    if (!split.has(k)) split.set(k, (typeof sources === 'string' ? sources : sources[k] ?? '').split('\n'));
    return split.get(k)!;
  };
  // gdb names a function by its C name and file; the picture by its key.
  const keys = new Map<string, string>();
  const keyOf = (name: string, file: string | null | undefined): string => {
    if (!model.project) return name;
    const k = `${name}|${file ?? ''}`;
    if (!keys.has(k)) {
      const f = model.fns.find((x) => x.cname === name && x.file === file) ?? model.fns.find((x) => x.cname === name && !x.isStatic);
      keys.set(k, f?.name ?? name);
    }
    return keys.get(k)!;
  };
  const fileOf = (file: string | null | undefined): string | undefined => (model.project && file ? file : undefined);
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
  const stack: { id: number; fn: string; cname: string; file: string | null; cells: Map<string, number>; line: number | null }[] = [];
  const statics = new Map<string, number>(); // "owner.name" -> cell
  const heapCell = new Map<number, number>(); // block id -> cell
  const heapSize = new Map<number, number>();
  const heapLine = new Map<number, number | null>();
  const heapFile = new Map<number, string | undefined>();
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

  // What the picture shows through a cell: a string, a struct's fields.
  const extras = new Map<number, { str?: string; fields?: SnapField[]; bytes?: number[]; lit?: boolean; ptrs?: { to: number; off: number }[]; whole?: boolean }>();
  const snapCell = (id: number): SnapCell => ({ id, name: cells.get(id)!.name, type: types.get(id) ?? '', val: vals.get(id) ?? { k: 'undef' }, ...extras.get(id) });
  let outText = r.outBefore ?? '';
  const errSpans: [number, number][] = [];
  const inText = r.stdinText ?? '';
  let inPos: number | null = null;
  let buf: StdBuf | null = null;
  // Snapshots share what didn't change: a list of cells is reused while every
  // cell in it holds the same value and extras (both are replaced, never
  // edited in place), so memory grows with changes, not with depth × steps.
  const shared = new Map<string, { ids: number[]; vals: (V | undefined)[]; ex: unknown[]; cells: SnapCell[] }>();
  const shareCells = (key: string, ids: number[]): SnapCell[] => {
    const prev = shared.get(key);
    if (prev && prev.ids.length === ids.length && ids.every((id, i) => id === prev.ids[i] && vals.get(id) === prev.vals[i] && extras.get(id) === prev.ex[i])) return prev.cells;
    const next = { ids, vals: ids.map((id) => vals.get(id)), ex: ids.map((id) => extras.get(id)), cells: ids.map(snapCell) };
    shared.set(key, next);
    return next.cells;
  };
  const frameSnaps = new Map<number, SnapFrame>();
  const snapFrame = (f: { id: number; fn: string; cells: Map<string, number> }): SnapFrame => {
    const list = shareCells(`f${f.id}`, [...f.cells.values()]);
    const prev = frameSnaps.get(f.id);
    if (prev && prev.cells === list && prev.fn === f.fn) return prev;
    const next = { id: f.id, fn: f.fn, cells: list };
    frameSnaps.set(f.id, next);
    return next;
  };
  const snapshot = (): Snap => ({
    ...(r.outMode ? { out: { sent: outText.length, buf } } : {}),
    ...(inPos !== null ? { inPos } : {}),
    stack: stack.map(snapFrame),
    statics: shareCells('s', [...statics.values()]),
    heap: shareCells('h', [...heapCell.values()]),
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
      const c = statics.get(`${v.owner ?? ''}.${v.ownerFile ?? ''}.${v.name}`);
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
  const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/"/g, '\\"');
  const quote = (g: GVal): string | undefined => {
    if (g.kind !== 'ptr' || !g.v) return undefined;
    // a char **: its strings, as a list ({"./a.out", "200"})
    if (g.strs) return `{${g.strs.map((x) => `"${esc(x.length > 24 ? x.slice(0, 24) : x)}"`).join(', ')}${g.strsFull ? '' : ', …'}}`;
    if (g.str === undefined) return undefined;
    const s = esc(g.str);
    return `"${s.length > 40 ? s.slice(0, 40) : s}"${!g.strFull || s.length > 40 ? '…' : ''}`;
  };
  const structOf = (g: GVal): GVal | null => (g.kind === 'struct' ? g : g.kind === 'ptr' && g.deref?.kind === 'struct' ? g.deref : null);
  // bytes the picture can draw where they live: a char array's own, or a
  // literal's (read-only memory, up to its \0 when the preview reached it)
  const hexBytes = (h: string) => h.match(/../g)?.map((x) => parseInt(x, 16)) ?? [];
  const memOf = (g: GVal): { bytes?: number[]; lit?: boolean } => {
    if (g.hex !== undefined) return { bytes: hexBytes(g.hex) };
    if (g.kind === 'ptr' && g.ro && g.str !== undefined) return { lit: true, bytes: [...g.str].map((ch) => ch.charCodeAt(0)).concat(g.strFull ? [0] : []) };
    return {};
  };
  const extraOf = (g: GVal): { str?: string; fields?: SnapField[]; bytes?: number[]; lit?: boolean } | undefined => {
    const st = structOf(g);
    if (st) return { fields: (st.fields ?? []).map((f) => ({ name: f.name, type: f.type, val: toV(f), ...(quote(f) ? { str: quote(f) } : {}), ...memOf(f) })) };
    const q = quote(g);
    const m = memOf(g);
    return q || m.bytes ? { ...(q ? { str: q } : {}), ...m } : undefined;
  };
  const setExtra = (c: number, g: GVal) => {
    const x = extraOf(g);
    if (x) extras.set(c, x);
    else extras.delete(c);
  };
  const payload = (g: GVal | null): Payload | undefined => {
    if (!g) return undefined;
    const st = structOf(g);
    if (st) {
      return {
        k: 'struct', type: st.type.replace(/^struct\s+/, 'struct '),
        ...(g.kind === 'ptr' ? { via: fmtVal(resolve(g.v!)) } : {}),
        fields: (st.fields ?? []).map((f) => ({ name: f.name, text: quote(f) ?? (f.kind === 'ptr' ? fmtVal(resolve(f.v!)) : text(f)) })),
      };
    }
    const q = quote(g);
    return q ? { k: 'str', text: q } : undefined;
  };

  const frameOf = (id: number) => stack.find((f) => f.id === id);
  const fnInfo = (fn: string) => model.byName.get(fn);
  let lastLine = 0;
  let lastFile: string | null = null;
  let exitCode: number | null = r.exit ?? null;

  const addFrame = (id: number, cname: string, file: string | null, stop: GStop) => {
    const data = stop.frames.find((f) => f.id === id);
    const fn = keyOf(cname, file);
    const info = fnInfo(fn);
    const cs = new Map<string, number>();
    for (const v of data?.vars ?? []) {
      const c = newCell({ name: v.name, owner: fn, frame: id }, v.type);
      cs.set(v.name, c);
      if (info?.params.some((p) => p.name === v.name)) defined.add(c);
    }
    const caller = stack[stack.length - 1] ?? null;
    stack.push({ id, fn, cname, file, cells: cs, line: data?.line ?? null });
    return { caller, data, fn };
  };

  mark.stage = 'stops';
  for (const [stopIndex, stop] of stops.entries()) {
    if ((stopIndex & 63) === 63) yield; // (a place to pause: between two stops)
    mark.at = stopIndex;
    const nextBound = stop.bound;
    for (const id of Object.keys(nextBound ?? {})) boundIds.add(id);
    for (const e of stop.events) {
      const top = stack[stack.length - 1] ?? null;
      if (e.k === 'out') {
        if (e.fd !== 1 && e.fd !== 2) continue;
        // stderr reaches the same terminal, unbuffered: in with the rest, marked
        if (e.fd === 2) errSpans.push([outText.length, outText.length + e.text.length]);
        outText += e.text;
        // a flush sends everything printf's buffer held: it's empty after
        if (e.fd === 1 && e.via === 'printf') {
          const was = buf as StdBuf | null;
          buf = stop.stdbuf !== undefined ? stop.stdbuf : was ? { ...was, text: '', n: 0 } : null;
        }
        emit({ k: 'out', line: e.line ? e.line - 1 : lastLine, file: fileOf(e.line ? e.file ?? lastFile : lastFile), frame: top?.id ?? null, fd: e.fd, text: e.text, via: e.via });
        continue;
      }
      if (e.k === 'call') {
        const file = e.file ?? stop.frames.find((f) => f.id === e.id)?.file ?? null;
        for (const [id, scope] of Object.entries(r.bindingScopes ?? {})) if (scope.scope === 'fn' && scope.fn === e.fn && (!scope.file || scope.file === file)) {
          currentBound = { ...currentBound, [id]: { bound: false } };
        }
        const { caller, data, fn } = addFrame(e.id, e.fn, file, stop);
        const data_ = data;
        buildRegions(stop);
        const f = frameOf(e.id)!;
        const params = fnInfo(fn)?.params ?? [];
        for (const v of data?.vars ?? []) {
          const c = f.cells.get(v.name)!;
          // a frame that began before the window: the trace didn't see which
          // locals were assigned, so it shows their memory as it is
          if (e.pre) defined.add(c);
          raw.set(c, JSON.stringify(v));
          vals.set(c, defined.has(c) ? toV(v) : { k: 'undef' });
          if (defined.has(c)) setExtra(c, v);
        }
        if (e.pre) continue; // already running: no call happens now
        emit({
          k: 'call', line: data?.line ? data.line - 1 : lastLine, file: fileOf(data?.line ? file : lastFile), frame: e.id, fn, caller: caller?.fn ?? null,
          args: params.map((p) => {
            const c = f.cells.get(p.name);
            const val = c !== undefined ? vals.get(c)! : { k: 'undef' as const };
            const pl = payload(data_?.vars.find((v) => v.name === p.name) ?? null);
            return { name: p.name, val, text: fmtVal(val), ...(pl ? { data: pl } : {}) };
          }),
        });
      } else if (e.k === 'ret') {
        const f = frameOf(e.id);
        if (!f) continue;
        const idx = stack.indexOf(f);
        stack.splice(idx, 1);
        for (const [id, scope] of Object.entries(r.bindingScopes ?? {})) if (scope.scope === 'fn' && scope.fn === f.cname && (!scope.file || scope.file === f.file)) {
          currentBound = { ...currentBound, [id]: { bound: false } };
        }
        const caller = stack[idx - 1] ?? null;
        let val = toV(e.value);
        if (f.fn === 'main' && val.k === 'void' && exitCode !== null) val = { k: 'int', v: exitCode };
        const data = payload(e.value);
        emit({ k: 'ret', line: f.line ? f.line - 1 : lastLine, file: fileOf(f.line ? f.file : lastFile), frame: e.id, fn: f.fn, caller: caller?.fn ?? null, val, ...(data ? { data } : {}) });
      } else if (e.k === 'alloc') {
        const c = newCell({ name: `#${e.id}`, owner: 'heap', frame: -2 }, `${e.size} bytes`);
        heapCell.set(e.id, c);
        heapSize.set(e.id, e.size);
        heapLine.set(e.id, e.line ? e.line - 1 : null);
        heapFile.set(e.id, fileOf(e.file));
        heapAddr.set(e.addr, { addr: e.addr, size: e.size, cell: c, freed: false, id: e.id });
        let slot = 0;
        while (usedSlots.has(slot)) slot++;
        usedSlots.add(slot);
        heapSlots.set(c, slot);
        vals.set(c, { k: 'raw', text: 'uninitialised' });
        if (e.pre) continue; // allocated before the window: its bytes come with the stop
        emit({ k: 'alloc', line: e.line ? e.line - 1 : lastLine, file: fileOf(e.line ? e.file : lastFile), frame: top?.id ?? null, cell: c, size: e.size });
      } else if (e.k === 'free') {
        const c = heapCell.get(e.id);
        if (c === undefined) continue;
        heapCell.delete(e.id);
        usedSlots.delete(heapSlots.get(c)!);
        for (const b of heapAddr.values()) if (b.id === e.id) b.freed = true;
        emit({ k: 'free', line: lastLine, file: fileOf(lastFile), frame: top?.id ?? null, cell: c });
      } else if (e.k === 'badfree') {
        warnings.push(`free() of a pointer that malloc never returned (0x${e.addr.toString(16)}), ${fileOf(e.file) ? `${e.file}:` : 'line '}${e.line ?? '?'}`);
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
      const lineText = prevLine ? linesOf(fs.file)[prevLine - 1] ?? '' : '';
      for (const v of f.vars) {
        const c = fs.cells.get(v.name);
        if (c === undefined) continue;
        const now = JSON.stringify(v);
        const changed = raw.get(c) !== now;
        if (!defined.has(c) && (changed || assigns(lineText, v.name))) defined.add(c);
        raw.set(c, now);
        if (!defined.has(c)) continue;
        if (changed || !extras.has(c)) setExtra(c, v);
        const nv = toV(v);
        if (JSON.stringify(nv) === JSON.stringify(vals.get(c))) continue;
        vals.set(c, nv);
        const region = regions.find((g) => g.cell === c);
        const w = fs.id === top?.id ? null : via(region);
        emit({ k: 'write', line: (prevLine ?? 1) - 1, file: fileOf(fs.file), frame: top?.id ?? null, cell: c, val: nv, via: w, text: `${v.name} = ${fmtVal(nv, v.type)}` });
      }
      fs.line = f.line;
    }
    for (const v of stop.statics) {
      const key = `${v.owner ?? ''}.${v.ownerFile ?? ''}.${v.name}`;
      let c = statics.get(key);
      if (c === undefined) {
        c = newCell({ name: v.name, owner: v.owner ? keyOf(v.owner, v.ownerFile) : '', frame: -1 }, v.type);
        statics.set(key, c);
        vals.set(c, toV(v));
        setExtra(c, v);
        raw.set(c, JSON.stringify(v));
        continue;
      }
      setExtra(c, v);
      const nv = toV(v);
      if (JSON.stringify(nv) === JSON.stringify(vals.get(c))) continue;
      vals.set(c, nv);
      const w = via(regions.find((g) => g.cell === c));
      emit({ k: 'write', line: lastLine, file: fileOf(lastFile), frame: top?.id ?? null, cell: c, val: nv, via: w, text: `${v.name} = ${text(v)}` });
    }
    // a block's 8-byte words that hold another live block's address: the
    // pointers inside the heap (a list's next), for who-holds-what
    const ptrsIn = (bytes: number[]): { to: number; off: number }[] => {
      const out: { to: number; off: number }[] = [];
      for (let off = 0; off + 8 <= bytes.length; off += 8) {
        let v = 0;
        for (let k = 7; k >= 0; k--) v = v * 256 + bytes[off + k];
        if (!v) continue;
        for (const h of heapAddr.values()) if (!h.freed && v >= h.addr && v < h.addr + Math.max(1, h.size)) out.push({ to: h.cell, off });
      }
      return out;
    };
    for (const b of stop.heap) {
      const c = heapCell.get(b.id);
      if (c === undefined) continue;
      const nv: V = { k: 'raw', text: preview(b.hex, b.size) };
      const bytes = hexBytes(b.hex);
      const ptrs = ptrsIn(bytes);
      extras.set(c, { ...extras.get(c), bytes, whole: bytes.length >= b.size, ...(ptrs.length ? { ptrs } : { ptrs: undefined }) });
      if (JSON.stringify(nv) === JSON.stringify(vals.get(c))) continue;
      const first = vals.get(c)?.k === 'raw' && (vals.get(c) as { text: string }).text === 'uninitialised';
      vals.set(c, nv);
      if (first && /^00( 00)*/.test(nv.text)) continue;
      const w = via(regions.find((g) => g.cell === c));
      emit({ k: 'write', line: lastLine, file: fileOf(lastFile), frame: top?.id ?? null, cell: c, val: nv, via: w, text: `#${b.id} = ${nv.text}` });
    }

    if (stop.stdbuf !== undefined) buf = stop.stdbuf;
    if (stop.inPos !== undefined) {
      // a window's first stop: whatever was read before it isn't a read now
      const was = inPos ?? (r.window?.from ? stop.inPos : 0);
      inPos = stop.inPos;
      if (inPos > was) emit({ k: 'in', line: lastLine, file: fileOf(lastFile), frame: top?.id ?? null, from: was, to: inPos, text: inText.slice(was, inPos) });
    }
    if (stop.line !== null && top) {
      lastLine = stop.line - 1;
      lastFile = stop.file ?? top.file;
      // The sample represents this completed gdb stop. Earlier call/write/
      // heap events still carry the preceding sample.
      if (nextBound !== undefined) currentBound = nextBound;
      emit({ k: 'step', line: lastLine, file: fileOf(lastFile), frame: top.id });
    } else if (stop.exited && evs.length) {
      // The inferior no longer has readable memory. Clear globals as well.
      currentBound = Object.create(null);
      snaps[snaps.length - 1] = snapshot();
    }
  }

  mark.stage = 'finish';
  mark.at = null;
  // Only a program that exited can leak: a truncated or crashed run just
  // stopped with blocks still in use.
  const exited = !r.truncated && !r.signal;
  const leaks = exited ? [...heapCell.entries()].map(([id, c]) => ({ cell: c, size: heapSize.get(id) ?? 0, line: heapLine.get(id) ?? null, file: heapFile.get(id) })) : [];
  let error: Trace['error'] = null;
  if (r.signal) {
    error = { msg: `${r.signal}: ${SIGNALS[r.signal] ?? 'the program was killed by a signal'}`, line: lastLine, file: fileOf(lastFile) };
    emit({ k: 'error', line: lastLine, file: fileOf(lastFile), frame: stack[stack.length - 1]?.id ?? null, msg: error.msg });
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
    ...(r.outMode ? { outText, outMode: r.outMode, ...(errSpans.length ? { errSpans } : {}) } : {}),
    ...(r.stdinText ? { inText } : {}),
    ...(r.window ? { window: { from: r.window.from ?? 0, to: r.window.to, total: r.stats?.total ?? null, more: !!r.truncated } } : {}),
    args: r.args,
    heapSlots,
    leaks,
    warnings,
  };
}
