// Beats: every time a statement runs, in any function. The machine that runs
// it animates it in place: the values it reads fly from storage to its
// station, the station shows the expression with those values, and what
// actually changed flies back. Calls and returns are not beats: they keep
// their belt animations between machines.
//
// Everything comes from the trace (principle 4): reads are the names a
// statement uses, valued from the snapshot at its stop; writes are the
// differences between that snapshot and the one once the statement is done.
import { interiorAt, planOf, type Leaf, type Plan, type Station } from './interior';
import type { Ev, Snap, SnapFrame, Trace } from './interp';
import { slotsOf, type Slot } from './machine';
import type { FnInfo, Model } from './parse';
import type { ValueKind } from './skins/types';
import { fieldValue, staticCellId, valueOf } from './values';

export interface Beat {
  kind: 'stmt' | 'switch';
  fn: string;
  frame: number;
  station: number;
  from: number; // event indices, inclusive (other frames' events may sit in between)
  to: number;
  before: number; // snapshot with the values the statement reads
  after: number; // snapshot once it's done
  calls: boolean; // it calls something (its write comes after the call returns)
  lastRet: number; // the return of its last call (-1: none): carries the write when nothing else does
  result?: boolean; // a switch: which way it went
  weight: number; // reads + writes, for pacing
}

export interface Timeline {
  beats: Beat[];
  beatAt: Int32Array; // event → beat (-1: a call, a return, or nothing)
  p0: Float32Array; // event → progress in its beat at its start
  p1: Float32Array;
}

// Seconds for a beat at 1×: quick in Fast, readable in Focus.
export function beatLen(b: Beat, mode: 'fast' | 'focus'): number {
  const w = Math.min(8, b.weight) + (b.calls ? 2 : 0);
  return mode === 'focus' ? Math.min(2.4, 0.9 + 0.13 * w) : Math.min(0.7, 0.3 + 0.04 * w);
}

// Phase ends in a beat's progress: read, then compute; write runs to 1.
export const READ_END = 0.35;
export const COMPUTE_END = 0.55;

// ---------------- storage values ----------------

export interface SlotValue {
  text: string;
  kind: ValueKind;
  bytes: number[] | null; // a char * with sampled memory: its bytes
  marks: { label: string; index: number }[]; // sibling index fields (pos, len…) on that memory
}

const INDEX_NAMES = new Set(['pos', 'len', 'cap', 'size', 'start', 'end', 'idx', 'index', 'head', 'tail', 'count', 'i', 'j', 'n']);

function heapBytes(snap: Snap, to: number | null, type: string): number[] | null {
  if (to === null || !type.includes('char')) return null;
  return snap.heap.find((c) => c.id === to)?.bytes ?? null;
}

export function slotValue(slot: Slot, fnName: string, frame: SnapFrame | null, snap: Snap, trace: Trace, live: Set<number> | null = null): SlotValue {
  const none: SlotValue = { text: '', kind: 'none', bytes: null, marks: [] };
  if (slot.kind === 'more') return none;
  if (slot.kind === 'static') {
    const id = staticCellId(trace, fnName, slot.name);
    const c = id !== null ? snap.statics.find((x) => x.id === id) : undefined;
    return c ? { ...valueOf(c, null, trace, null), bytes: null, marks: [] } : none;
  }
  if (slot.kind === 'cell') {
    const c = frame?.cells.find((x) => x.name === slot.name);
    if (!c) return none;
    return { ...valueOf(c, frame, trace, live), bytes: c.val.k === 'ptr' ? heapBytes(snap, c.val.to, c.type) : null, marks: [] };
  }
  const [parent, field] = slot.key.slice(2).split('.');
  const pc = frame?.cells.find((x) => x.name === parent);
  const f = pc?.fields?.find((x) => x.name === field);
  if (!f) return none;
  const bytes = f.val.k === 'ptr' ? heapBytes(snap, f.val.to, f.type) : null;
  const marks = bytes
    ? (pc!.fields ?? []).filter((x) => x !== f && x.val.k === 'int' && INDEX_NAMES.has(x.name) && x.val.v >= 0 && x.val.v <= bytes.length).map((x) => ({ label: x.name, index: (x.val as { v: number }).v }))
    : [];
  return { ...fieldValue(f, trace), bytes, marks };
}

// What a slot held before, oldest first: each change the running frame saw,
// up to snapshot `upto`, without the value it holds now. Scanned once per
// frame and slot, extended as playback moves on.
const histCache = new WeakMap<Trace, Map<string, { scanned: number; changes: { si: number; text: string }[] }>>();
export function slotHistory(slot: Slot, fnName: string, frameId: number, trace: Trace, upto: number, n = 3): string[] {
  if (slot.kind === 'more') return [];
  let byKey = histCache.get(trace);
  if (!byKey) histCache.set(trace, (byKey = new Map()));
  const k = `${frameId}|${slot.key}`;
  let h = byKey.get(k);
  if (!h) byKey.set(k, (h = { scanned: -1, changes: [] }));
  for (let si = h.scanned + 1; si <= upto && si < trace.snaps.length; si++) {
    const snap = trace.snaps[si];
    const f = snap.stack.find((x) => x.id === frameId);
    if (!f) continue;
    const text = slotValue(slot, fnName, f, snap, trace).text || '?';
    if (h.changes.at(-1)?.text !== text) h.changes.push({ si, text });
    h.scanned = si;
  }
  const seen = h.changes.filter((c) => c.si <= upto);
  return seen.slice(Math.max(0, seen.length - 1 - n), -1).map((c) => c.text);
}

// The slot a read names: `x` (a local, param or static) or `a->b`.
function slotKeyOf(leaf: Leaf, slots: Slot[]): string | null {
  const key = leaf.path.length === 2 ? `f:${leaf.path[0]}.${leaf.path[1]}` : `c:${leaf.path[0]}`;
  if (slots.some((s) => s.key === key)) return key;
  if (leaf.path.length === 1 && slots.some((s) => s.key === `s:${leaf.path[0]}`)) return `s:${leaf.path[0]}`;
  return null;
}

// ---------------- reads and writes of a beat ----------------

export interface Read { key: string; text: string }
export interface Write { key: string; text: string; index?: number } // index: a byte in that slot's memory

const frameIn = (snap: Snap, id: number) => snap.stack.find((f) => f.id === id) ?? null;

function leavesOfStation(st: Station): { leaves: Leaf[]; src: string } {
  if (st.kind === 'if' || st.kind === 'loop') return { leaves: st.leaves ?? [], src: st.cond ?? '' };
  return { leaves: st.reads ?? [], src: st.src ?? '' };
}

export function readsOf(b: Beat, fn: FnInfo, trace: Trace): Read[] {
  const slots = slotsOf(fn);
  const snap = trace.snaps[b.before];
  const frame = frameIn(snap, b.frame);
  const out: Read[] = [];
  for (const leaf of leavesOfStation(planOf(fn).stations[b.station]).leaves) {
    const key = slotKeyOf(leaf, slots);
    if (!key || out.some((r) => r.key === key)) continue;
    const v = slotValue(slots.find((s) => s.key === key)!, fn.name, frame, snap, trace);
    if (v.kind !== 'none') out.push({ key, text: v.text });
  }
  return out;
}

// The expression with the values it read: `buf->pos == buf->len` → `6 == 8`.
export function computeText(b: Beat, fn: FnInfo, trace: Trace): string {
  const { leaves, src } = leavesOfStation(planOf(fn).stations[b.station]);
  const slots = slotsOf(fn);
  const snap = trace.snaps[b.before];
  const frame = frameIn(snap, b.frame);
  let out = src;
  for (const leaf of [...leaves].sort((x, y) => y.from - x.from)) {
    if (leaf.keep) continue;
    const key = slotKeyOf(leaf, slots);
    if (!key) continue;
    const v = slotValue(slots.find((s) => s.key === key)!, fn.name, frame, snap, trace);
    if (v.kind !== 'none') out = out.slice(0, leaf.from) + v.text + out.slice(leaf.to);
  }
  return out.replace(/\s+/g, ' ').replace(/;\s*$/, '').trim();
}

const writeCache = new WeakMap<Beat, Write[]>();
export function writesOf(b: Beat, fn: FnInfo, trace: Trace): Write[] {
  const hit = writeCache.get(b);
  if (hit) return hit;
  const slots = slotsOf(fn);
  const s0 = trace.snaps[b.before];
  const s1 = trace.snaps[Math.min(b.after, trace.snaps.length - 1)];
  const f0 = frameIn(s0, b.frame);
  const f1 = frameIn(s1, b.frame) ?? f0;
  const out: Write[] = [];
  for (const slot of slots) {
    if (slot.kind === 'more') continue;
    const v0 = slotValue(slot, fn.name, f0, s0, trace);
    const v1 = slotValue(slot, fn.name, f1, s1, trace);
    if (v0.bytes && v1.bytes) {
      for (let k = 0; k < Math.max(v0.bytes.length, v1.bytes.length); k++) {
        if (v0.bytes[k] !== v1.bytes[k] && v1.bytes[k] !== undefined) out.push({ key: slot.key, index: k, text: byteText(v1.bytes[k]) });
      }
      continue;
    }
    if (v1.kind !== 'none' && v0.text !== v1.text) out.push({ key: slot.key, text: v1.text });
  }
  writeCache.set(b, out);
  return out;
}

export function byteText(b: number): string {
  if (b === 0) return "'\\0'";
  if (b === 10) return "'\\n'";
  if (b === 9) return "'\\t'";
  return b >= 32 && b < 127 ? `'${String.fromCharCode(b)}'` : `0x${b.toString(16).padStart(2, '0')}`;
}

// ---------------- the timeline ----------------

const tlCache = new WeakMap<Trace, { model: Model; tl: Timeline }>();

export function timelineOf(trace: Trace, model: Model): Timeline {
  const hit = tlCache.get(trace);
  if (hit && hit.model === model) return hit.tl;
  const tl = build(trace, model);
  tlCache.set(trace, { model, tl });
  return tl;
}

function build(trace: Trace, model: Model): Timeline {
  const evs: Ev[] = trace.evs;
  const n = evs.length;
  const gdb = trace.engine === 'gdb';
  const beats: Beat[] = [];
  const beatAt = new Int32Array(n).fill(-1);
  const p0 = new Float32Array(n);
  const p1 = new Float32Array(n);
  const fnOf = new Map<number, string>(); // frame → function
  const open = new Map<number, number>(); // frame → its open beat
  const close = (F: number, to: number) => {
    const k = open.get(F);
    if (k === undefined) return;
    const b = beats[k];
    b.to = Math.max(b.from, to);
    // gdb reports a stop's changes over several events (memory last); the
    // next stop's step marks the state as complete
    b.after = gdb && evs[b.to + 1]?.k === 'step' ? b.to + 2 : b.to + 1;
    open.delete(F);
  };
  for (let i = 0; i < n; i++) {
    const e = evs[i];
    if (e.frame === null) continue;
    if (e.k === 'call') {
      fnOf.set(e.frame, e.fn);
      // the caller's statement is waiting on this call
      const caller = trace.snaps[i].stack.at(-1)?.id;
      if (caller !== undefined && open.has(caller)) beats[open.get(caller)!].calls = true;
      continue;
    }
    if (e.k === 'ret') {
      close(e.frame, i - 1);
      // the caller's statement gets its result now
      const st = trace.snaps[i].stack;
      const at = st.findIndex((f) => f.id === e.frame);
      const caller = at > 0 ? st[at - 1].id : undefined;
      if (caller !== undefined && open.has(caller)) beats[open.get(caller)!].lastRet = i;
      continue;
    }
    let name = fnOf.get(e.frame);
    if (!name) {
      name = trace.snaps[i + 1]?.stack.find((f) => f.id === e.frame)?.fn ?? trace.snaps[i].stack.find((f) => f.id === e.frame)?.fn;
      if (name) fnOf.set(e.frame, name);
    }
    const fn = name ? model.byName.get(name) : undefined;
    if (!fn || fn.broken) continue;
    const plan = planOf(fn);
    const st = plan.byLine.get(e.line);
    const k0 = open.get(e.frame);
    const cur = k0 !== undefined ? beats[k0] : null;
    const fresh = st !== undefined && (!cur || cur.station !== st) && (gdb ? e.k === 'step' : true);
    if (fresh) {
      close(e.frame, i - 1);
      const station = plan.stations[st!];
      beats.push({ kind: station.kind === 'if' || station.kind === 'loop' ? 'switch' : 'stmt', fn: fn.name, frame: e.frame, station: st!, from: i, to: i, before: gdb ? i + 1 : i, after: i + 1, calls: false, lastRet: -1, weight: 0 });
      open.set(e.frame, beats.length - 1);
      beatAt[i] = beats.length - 1;
    } else if (cur) beatAt[i] = k0!;
    if (!gdb && e.k === 'eval' && open.has(e.frame)) beats[open.get(e.frame)!].result = e.result;
  }
  for (const F of [...open.keys()]) close(F, n - 1);

  // gdb switches: the way the frame went next
  if (gdb) {
    for (const b of beats) {
      if (b.kind !== 'switch') continue;
      const d = interiorAt(trace, planOf(model.byName.get(b.fn)!), b.frame, b.to + 1).decided.get(b.station);
      if (d && d.d.at === b.to + 1) b.result = d.d.result;
    }
  }

  // progress: the first event reads and computes (and waits on a call);
  // the rest of the beat's own events write
  const own = new Map<number, number[]>();
  for (let i = 0; i < n; i++) if (beatAt[i] >= 0) (own.get(beatAt[i]) ?? own.set(beatAt[i], []).get(beatAt[i])!).push(i);
  beats.forEach((b, k) => {
    const fn = model.byName.get(b.fn)!;
    b.weight = readsOf(b, fn, trace).length + Math.min(8, writesOf(b, fn, trace).length);
    const list = own.get(k) ?? [];
    // what a call changed lands as its result comes back, not before the call
    if (b.lastRet > list[list.length - 1]) {
      list.push(b.lastRet);
      beatAt[b.lastRet] = k;
    }
    if (list.length === 1) return void ((p0[list[0]] = 0), (p1[list[0]] = 1));
    p0[list[0]] = 0;
    p1[list[0]] = COMPUTE_END;
    const rest = list.length - 1;
    list.slice(1).forEach((i, q) => {
      p0[i] = COMPUTE_END + ((1 - COMPUTE_END) * q) / rest;
      p1[i] = COMPUTE_END + ((1 - COMPUTE_END) * (q + 1)) / rest;
    });
  });
  return { beats, beatAt, p0, p1 };
}

// ---------------- where playback is ----------------

export type Phase = 'read' | 'compute' | 'write';

export interface BeatNow {
  beat: Beat;
  p: number; // 0..1 through the beat
  phase: Phase;
  landed: number; // 0..1: how far the writes have got
}

export function beatNow(trace: Trace, model: Model, pos: number): BeatNow | null {
  const tl = timelineOf(trace, model);
  const i = Math.floor(pos);
  if (i < 0 || i >= trace.evs.length) return null;
  const k = tl.beatAt[i];
  if (k < 0) return null;
  const t = pos - i;
  const p = tl.p0[i] + (tl.p1[i] - tl.p0[i]) * t;
  const phase: Phase = p < READ_END ? 'read' : p < COMPUTE_END ? 'compute' : 'write';
  return { beat: tl.beats[k], p, phase, landed: Math.max(0, Math.min(1, (p - COMPUTE_END) / (1 - COMPUTE_END))) };
}

// Seconds at 1× for event i: a beat's share, or the event kind's own time.
export function beatDuration(trace: Trace, model: Model, i: number, mode: 'fast' | 'focus'): number | null {
  const tl = timelineOf(trace, model);
  const k = tl.beatAt[i];
  // a return keeps its belt timing even when it carries a statement's write
  if (k < 0 || trace.evs[i].k === 'ret') return null;
  return Math.max(0.002, (tl.p1[i] - tl.p0[i]) * beatLen(tl.beats[k], mode));
}

// Where each beat starts, for stepping one statement at a time.
export function beatStarts(trace: Trace, model: Model): number[] {
  return timelineOf(trace, model).beats.map((b) => b.from);
}

export type { Plan };
