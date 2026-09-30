// What a frame shows, as data (docs/OBJECTIVES.md, "easy to diagnose",
// step 4): the step, the snapshot, which machine runs, which waits, what's in
// flight, and what the process box, printf's buffer, stdin, the modules and
// the walls say. No canvas and no camera, so a test can ask "at step 42, what
// does stdin show" (test/frame.test.ts); render.ts paints from it.
import { doorsOf, MOD_DOORS } from './layout';
import { beatNow, ptrTag, type BeatNow } from './beats';
import { termText, procLines, stdinShown } from './machine';
import { fmtVal, type Ev, type Snap, type SnapCell, type SnapFrame, type Trace } from './interp';
import type { Host } from './route';
import { isModuleKey, type Belt } from './route';
import { fileCap, fnCaps } from './norm';
import type { FnInfo } from './parse';
import type { DockInfo, HeapBarInfo, HeapCardInfo, ModuleInfo, ProcInfo, RunState, StdBufInfo, StdinInfo } from './skins/types';
import { lostBlocks, lostShort } from './ownership';
import { entKey, eventPair, frameAt, frameHosts, liveHostPairs, sceneAt, staged, switchAt, type ViewState } from './playback';

type Phase = NonNullable<ReturnType<typeof frameAt>>['ph'];

export interface FrameState {
  trace: Trace | null;
  fr: ReturnType<typeof frameAt> | null;
  snap: Snap | null;
  ev: Ev | null;
  t: number;
  ph: Phase | null;
  finished: boolean; // playback is at the run's end
  selKey: string;
  hovKey: string;
  scene: ReturnType<typeof sceneAt>;
  hostOf: Map<number, string>; // frame id → the machine it runs in
  st: SnapFrame[]; // the stack, oldest first
  framesOnHost: Map<string, SnapFrame[]>;
  topHost: string | null; // the machine running now
  errHost: string | null; // the machine that crashed (at the end of a crashed run)
  animPair: [string, string] | null; // a call or return in flight: from, to
  fading: { host: string; alpha: number } | null; // a recursive copy fading in or out
  animKey: string | null;
  liveKeys: Set<string>; // belts with a call on them
  liveHosts: Set<string>;
  focus: ViewState['selected'];
  focusFn: string | null;
  flash: { cell: number; a: number } | null; // a write landing now
  recent: number | null; // the cell the last write changed
  live: Set<number>; // cells that exist now (a pointer to anything else dangles)
  now_: BeatNow | null; // the statement running, and its phase
  scenePair: Set<string> | null; // in focus mode, the two machines not under the veil
}

export function frameState(s: ViewState): FrameState {
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

  const flash = ev && ev.k === 'write' && ph!.switched ? { cell: ev.cell, a: 1 - ph!.after } : null;
  const lastEv = trace && fr && !ev && fr.i > 0 ? trace.evs[fr.i - 1] : null;
  const recent = lastEv?.k === 'write' ? lastEv.cell : null;
  const live = new Set<number>();
  for (const f of st) for (const c of f.cells) live.add(c.id);
  for (const c of snap?.statics ?? []) live.add(c.id);
  const now_ = trace && fr ? beatNow(trace, s.model!, s.pos) : null;
  // a Focus scene veils everything but its two ends: machines under the
  // veil draw compact (their insides would barely show, and cost the most)
  const scenePair = ev && staged(ev) && animPair ? new Set(animPair) : null;

  return { trace, fr, snap, ev, t, ph, finished, selKey, hovKey, scene, hostOf, st, framesOnHost, topHost, errHost, animPair, fading, animKey, liveKeys, liveHosts, focus, focusFn, flash, recent, live, now_, scenePair };
}

// the file a machine (or a collapsed module) belongs to
export function fileOfHost(s: ViewState, f: FrameState, k: string): string | undefined {
  return f.scene.hosts.get(k)?.module ?? s.layout.nodes.get(`func:${f.scene.hosts.get(k)?.fn}`)?.file;
}

// whether a belt stays lit while something is focused (the rest dims)
export function relatedBelt(s: ViewState, f: FrameState, b: Belt): boolean {
  const { focus, focusFn } = f;
  return !focus ? true :
    focus.k === 'belt' ? b.key === focus.key :
    focus.k === 'proc' ? b.from === '' :
    focus.k === 'module' ? fileOfHost(s, f, b.fromHost) === focus.file || fileOfHost(s, f, b.toHost) === focus.file :
    focusFn !== null ? b.from === focusFn || b.to === focusFn : true;
}

export function stateOfHost(f: FrameState, h: Host): RunState {
  const frames = f.framesOnHost.get(h.key) ?? [];
  return f.errHost === h.key || (f.errHost === h.fn && h.copy === 1) ? 'error' : f.topHost === h.key ? 'running' : frames.length ? 'waiting' : 'idle';
}

// the process box: its state, exit, and what has really reached the terminal
export function procInfo(f: FrameState): ProcInfo {
  const { trace, st, finished, snap } = f;
  return {
    state: !trace || (!st.length && !finished) ? 'idle' : finished ? (trace.error ? 'crashed' : 'done') : 'running',
    exit: finished && trace?.exit ? fmtVal(trace.exit) : null,
    // what has really reached the terminal by now (gdb engine); before,
    // only the whole output once the program had finished
    out: trace?.outText !== undefined && snap?.out ? trace.outText.slice(0, snap.out.sent) || undefined : finished ? trace?.stdout : undefined,
    errSpans: trace?.errSpans,
    args: trace?.args,
    lines: Math.max(2, procLines(termText(trace))),
    selected: f.selKey === 'p',
    hovered: f.hovKey === 'p',
  };
}

// printf's buffer: what it holds that hasn't reached the terminal (only when
// the trace really read it: the gdb engine), and what a flush just let go
export function stdbufInfo(f: FrameState): StdBufInfo | null {
  const { trace, snap, fr } = f;
  const buf = snap?.out;
  if (!buf || !trace?.outMode) return null;
  const prev = fr && fr.si > 0 ? trace.snaps[fr.si - 1]?.out : undefined;
  const n = buf.buf?.n ?? 0;
  const was = prev?.buf?.n ?? 0;
  return {
    text: buf.buf?.text ?? '', n, cap: buf.buf?.cap ?? 4096, mode: trace.outMode,
    flushed: was > 0 && n < was && prev!.sent < buf.sent ? prev!.buf!.text : null,
  };
}

// stdin: the run's input, how much the program has taken, what a read takes now
export function stdinInfo(f: FrameState): StdinInfo | null {
  const { trace, snap, ev } = f;
  if (!trace || !stdinShown(trace)) return null;
  return { text: trace.inText!, pos: snap?.inPos ?? 0, taken: ev?.k === 'in' ? ev.text : null };
}

// a collapsed module (M5): its doors, which is live, what runs inside
export function moduleInfo(s: ViewState, f: FrameState, h: Host, capacity: boolean): Omit<ModuleInfo, 'inPorts' | 'outPorts'> {
  const module = h.module!;
  const inside = f.framesOnHost.get(h.key) ?? [];
  const liveFns = new Set(inside.map((x) => x.fn));
  const fns = s.layout.nodesOf(module).map((n) => n.fn);
  const doors = doorsOf(fns);
  const newest = inside[inside.length - 1];
  return {
    name: module, fns: fns.length,
    doors: doors.slice(0, MOD_DOORS).map((x) => ({ name: x.cname, live: liveFns.has(x.name), undeclared: x.declared === false })),
    more: Math.max(0, doors.length - MOD_DOORS),
    state: f.errHost === h.key ? 'error' : f.topHost === h.key ? 'running' : inside.length ? 'waiting' : 'idle',
    running: newest ? s.model?.byName.get(newest.fn)?.cname ?? newest.fn : null,
    depth: inside.length,
    pinned: !!s.layout.modules.get(module)?.pinned,
    selected: f.selKey === `m:${module}`, hovered: f.hovKey === `m:${module}`,
    ...(capacity && s.model ? { cap: fileCap(s.model, module) } : {}),
  };
}

// an expanded file's wall: its name, functions, and whether one runs inside
export function wallInfo(s: ViewState, f: FrameState, file: string, capacity: boolean) {
  const liveFiles = new Set(f.st.map((x) => s.layout.nodes.get(`func:${x.fn}`)?.file));
  const m = s.layout.modules.get(file);
  return {
    name: file, fns: s.layout.nodesOf(file).length, kind: 'module' as const, live: liveFiles.has(file), pinned: !!m?.pinned,
    ...(capacity && s.model ? { cap: fileCap(s.model, file) } : {}),
    selected: f.selKey === `m:${file}`, hovered: f.hovKey === `m:${file}`,
  };
}

// a trunk into or out of a collapsed module carries this many call sites
export const beltCount = (b: Belt): number => (isModuleKey(b.fromHost) || isModuleKey(b.toHost) ? b.lines.length : 0);

// Who called each frame and from where, who allocated each block: worked out
// once per trace.
const callMemo = new WeakMap<Trace, { calls: Map<number, number>; errs: Map<number, Trace['evs'][number]>; allocs: Map<number, { line: number; fn: string | null }>; site: Map<number, number>; nth: Map<number, [number, number]> }>();
export function callsOf(trace: Trace) {
  let m = callMemo.get(trace);
  if (!m) {
    m = { calls: new Map(), errs: new Map(), allocs: new Map(), site: new Map(), nth: new Map() };
    const lastLine = new Map<number, number>(); // frame -> the line it last ran
    const byFn = new Map<string, number[]>();
    trace.evs.forEach((e, i) => {
      if (e.frame === null) return;
      if (e.k === 'call') {
        // the caller's line: the interpreter's call event carries it; under gdb, the caller's last stop
        const caller = trace.snaps[i]?.stack.at(-1)?.id;
        const at = trace.engine === 'interp' ? e.line : caller !== undefined ? lastLine.get(caller) : undefined;
        if (at !== undefined) m!.site.set(e.frame, at + 1);
        (byFn.get(e.fn) ?? byFn.set(e.fn, []).get(e.fn)!).push(e.frame);
      } else lastLine.set(e.frame, e.line);
      if (e.k === 'call') m!.calls.set(e.frame, i);
      else if (e.k === 'error') m!.errs.set(e.frame, e);
      else if (e.k === 'alloc') {
        const ci = m!.calls.get(e.frame);
        const call = ci !== undefined ? trace.evs[ci] : null;
        m!.allocs.set(e.cell, { line: e.line + 1, fn: call?.k === 'call' ? call.fn : null });
      }
    });
    for (const frames of byFn.values()) frames.forEach((f, k) => m!.nth.set(f, [k + 1, frames.length]));
    callMemo.set(trace, m);
  }
  return m;
}


// a pointer's identity: a variable, or a field seen through a pointer (the
// same field read through two pointers to one struct is one pointer)
export function pointerId(c: SnapCell, fl?: { name: string }): string {
  return fl ? `${c.val.k === 'ptr' ? `@${c.val.to}` : c.id}.${fl.name}` : String(c.id);
}

// ---- the heap bar: every live block, what it is, who holds it ----
export interface HeapBlock { c: SnapCell; state: HeapCardInfo['state']; t: number }
export interface Watched { key: string; fn: string; name: string; c: SnapCell | null; where: string; gone: boolean }
export interface HeapModel {
  blocks: Map<number, HeapBlock>;
  bySlot: HeapBlock[]; // in the order they were allocated into (their slots)
  refs: Map<number, { name: string; top: boolean }[]>; // who holds each block's address
  fieldsOf: Map<number, { name: string; value: string }[]>; // a struct's fields, read through a typed pointer
  lost: Map<number, ReturnType<typeof lostBlocks>[number]>; // nothing points at it any more
  watched: Watched[]; // structs the author asked to see on the bar
  allocs: ReturnType<typeof callsOf>['allocs'];
}

// leakT: how far a leak's fall at the run's end has got (0 to 1; time is the view's)
export function heapModel(f: FrameState, watches: Iterable<string>, leakT: number): HeapModel | null {
  const { trace, fr, snap, ev, t, finished, st } = f;
  if (!trace) return null;
  const allocs = callsOf(trace).allocs;
  const blocks = new Map<number, HeapBlock>();
  for (const c of snap?.heap ?? []) blocks.set(c.id, { c, state: 'live', t: 1 });
  if (ev?.k === 'alloc' && blocks.has(ev.cell) && t >= switchAt(ev)) blocks.get(ev.cell)!.state = 'new', blocks.get(ev.cell)!.t = Math.min(1, (t - switchAt(ev)) / (1 - switchAt(ev)) * 1.6);
  if (ev?.k === 'free' && t < switchAt(ev)) {
    const c = trace.snaps[fr!.i].heap.find((x) => x.id === ev.cell);
    if (c) blocks.set(c.id, { c, state: 'freeing', t: t / switchAt(ev) });
  }
  const leaked = new Set(finished ? (trace.leaks ?? []).map((l) => l.cell) : []);
  // lost before exit: nothing points at it since some event at or before now
  const happened = (i: number) => finished || (!!fr && (i < fr.i || (i === fr.i && fr.t >= switchAt(trace.evs[i]))));
  const lost = new Map(lostBlocks(trace).filter((l) => happened(l.at)).map((l) => [l.cell, l]));
  // a leak falls off at exit, then stays where it was, in red
  for (const b of blocks.values()) if (leaked.has(b.c.id)) (b.state = 'leak'), (b.t = leakT);
  for (const b of blocks.values()) if (b.state === 'live' && lost.has(b.c.id)) b.state = 'lost';
  // watched structs: where each lives right now (the running copy's frame
  // when it recurses), or that its frame is gone
  const watched = [...watches].map((key) => {
    const [fn, name] = key.split('|');
    const fr0 = [...st].reverse().find((x) => x.fn === fn);
    const c = fr0?.cells.find((x) => x.name === name);
    const ever = callsOf(trace).calls.size > 0 && trace.evs.some((e) => e.k === 'call' && e.fn === fn);
    const where = c ? `watching ${fn}.${name} (on ${fn}'s stack)` : ever ? `watching ${fn}.${name}` : `watching ${fn}.${name} (${fn} not called yet)`;
    return { key, fn, name, c: c ?? null, where, gone: !c && ever };
  });
  if (!blocks.size && !allocs.size && !watched.length && !(trace.window && trace.window.from > 0)) return null;
  // who holds each block's address: pointers in frames and statics (and the
  // fields they show), named by where they live
  const topId = st[st.length - 1]?.id ?? null;
  const refs = new Map<number, { name: string; top: boolean }[]>();
  const refIds = new Set<string>();
  const add = (to: number, name: string, top: boolean, id: string) => {
    if (refIds.has(id)) return; // the same pointer seen through a second name
    refIds.add(id);
    (refs.get(to) ?? refs.set(to, []).get(to)!).push({ name, top });
  };
  const watchIds = new Set(watched.flatMap((w) => (w.c ? [w.c.id] : [])));
  for (const fr1 of st) for (const c of fr1.cells) {
    if (c.val.k === 'ptr' && c.val.to !== null && (blocks.has(c.val.to) || watchIds.has(c.val.to))) add(c.val.to, `${c.name} (${fr1.fn})`, fr1.id === topId, pointerId(c));
    for (const fl of c.fields ?? []) if (fl.val.k === 'ptr' && fl.val.to !== null && blocks.has(fl.val.to)) add(fl.val.to, `${c.name}${c.val.k === 'ptr' ? '->' : '.'}${fl.name} (${fr1.fn})`, fr1.id === topId, pointerId(c, fl));
  }
  for (const c of snap?.statics ?? []) if (c.val.k === 'ptr' && c.val.to !== null && blocks.has(c.val.to)) add(c.val.to, `${c.name} (static)`, false, pointerId(c));
  for (const c of snap?.heap ?? []) for (const p of c.ptrs ?? []) if (blocks.has(p.to)) add(p.to, `${c.name}+${p.off}`, false, `h${c.id}.${p.off}`);
  // a block a typed pointer holds (at its start) shows the fields gdb read
  // through that pointer: the struct as it is in the block
  const fieldsOf = new Map<number, { name: string; value: string }[]>();
  for (const fr1 of st) for (const c of fr1.cells) {
    if (c.val.k !== 'ptr' || c.val.to === null || c.val.label || !c.fields?.length || !blocks.has(c.val.to) || fieldsOf.has(c.val.to)) continue;
    fieldsOf.set(c.val.to, c.fields.map((fl) => ({ name: fl.name, value: fl.str ?? (fl.val.k === 'ptr' && fl.val.to !== null && !fl.val.label ? `→${trace.cells.get(fl.val.to)?.name ?? ''}` : fmtVal(fl.val, fl.type)) })));
  }
  const bySlot = [...blocks.values()].sort((a, b) => (trace.heapSlots?.get(a.c.id) ?? 0) - (trace.heapSlots?.get(b.c.id) ?? 0));
  return { blocks, bySlot, refs, fieldsOf, lost, watched, allocs };
}

// where a block was malloc'd: the function and line (or before a window's first step)
export function allocSite(m: HeapModel, trace: Trace, id: number): string {
  const a = m.allocs.get(id);
  if (a) return `${a.fn ?? '?'}:${a.line}`;
  return trace.window && trace.window.from > 0 ? `before step ${trace.window.from}` : '';
}

export function heapCardInfo(m: HeapModel, b: HeapBlock, trace: Trace, recent: number | null): HeapCardInfo {
  return {
    name: b.c.name, size: Number((b.c.type.match(/\d+/) ?? ['0'])[0]), site: allocSite(m, trace, b.c.id),
    preview: b.c.val.k === 'raw' ? b.c.val.text : '', bytes: b.c.bytes ?? [],
    refs: m.refs.get(b.c.id) ?? [], state: b.state, recent: b.c.id === recent, t: b.t,
    ...(m.lost.has(b.c.id) && !m.refs.get(b.c.id)?.length ? { note: lostShort(m.lost.get(b.c.id)!) } : {}),
    ...(m.fieldsOf.has(b.c.id) ? { fields: m.fieldsOf.get(b.c.id) } : {}),
  };
}

export function watchCardInfo(m: HeapModel, w: Watched, trace: Trace, recent: number | null): HeapCardInfo {
  const c = w.c;
  return {
    name: w.name, size: 0, site: '', preview: '', bytes: [],
    fields: c?.fields?.map((fl) => ({ name: fl.name, value: fl.str ?? (fl.val.k === 'ptr' && fl.val.to !== null && !fl.val.label ? `→${trace.cells.get(fl.val.to)?.name ?? ''}` : fmtVal(fl.val, fl.type)) })) ?? [],
    refs: c ? m.refs.get(c.id) ?? [] : [], state: 'live', recent: c?.id === recent, t: 1,
    watch: { where: w.where, gone: w.gone },
  };
}

// the bar's head: how many blocks and bytes are live, how many leaked, what's not shown
export function heapBarInfo(m: HeapModel, trace: Trace, fr: FrameState['fr'], more: number, folded: boolean): HeapBarInfo {
  const shown = [...m.blocks.values()].filter((b) => b.state !== 'freeing');
  return {
    count: shown.length,
    bytes: shown.reduce((a, b) => a + Number((b.c.type.match(/\d+/) ?? ['0'])[0]), 0),
    more, folded, leaks: [...m.blocks.values()].filter((b) => b.state === 'leak').length,
    empty: trace.window && trace.window.from > 0 ? 'now' : !m.allocs.size ? 'none' : trace.evs.findIndex((e) => e.k === 'alloc') < (fr?.i ?? 0) ? 'now' : 'yet',
  };
}

// ---- a machine's IN dock: where a call arrives ----
// the function a waiting machine waits on (the frame above its own)
export function waitingOnOf(trace: Trace | null, pos: number, frame: SnapFrame | null, state: RunState): string | null {
  if (state !== 'waiting' || !frame || !trace) return null;
  const st = frameAt(trace, pos).snap.stack;
  return st[st.findIndex((x) => x.id === frame.id) + 1]?.fn ?? null;
}

// the arguments as they arrived with the call on show (the running or waiting
// frame, else the one that last returned), where it came from, how it ended
export function dockInfo(
  trace: Trace | null, h: Host, fn: FnInfo, frame: SnapFrame | null, returned: SnapFrame | null, state: RunState,
  waitingOn: string | null, stacked: number, stale: boolean, editing: boolean, capacity: boolean,
): Omit<DockInfo, 'inPorts'> {
  const on = frame ?? returned;
  const ci = on && trace ? callsOf(trace).calls.get(on.id) : undefined;
  const call = ci !== undefined ? trace!.evs[ci] : null;
  const err = frame && trace ? callsOf(trace).errs.get(frame.id) ?? null : null;
  const before = on && !call && trace?.window && trace.window.from > 0 ? trace.window.from : null;
  return {
    name: h.fn, state, waitingOn, frames: stacked, stale, copy: h.copy, editing, before,
    args: call?.k === 'call' ? call.args.map((a) => ({ name: a.name, text: fmtVal(a.val), ...ptrTag(a.val, trace!, on) })) : null,
    last: !frame && !!call,
    crash: state === 'error' && err?.k === 'error' ? { line: err.line + 1, msg: err.msg } : null,
    ...(capacity ? { cap: fnCaps(fn).params } : {}),
    ...(call?.k === 'call' && on ? { from: { fn: call.caller ?? 'the process', line: call.caller ? callsOf(trace!).site.get(on.id) ?? null : null, nth: callsOf(trace!).nth.get(on.id) ?? [1, 1] } } : {}),
  };
}
