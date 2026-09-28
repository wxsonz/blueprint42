// Enter the machine: one function's insides, animated statement by statement.
// Each time a statement runs is a beat: the values it reads fly from storage
// to its station, the station shows the expression with those values, any
// call goes out and comes back, and what actually changed flies back into
// storage. Everything comes from the trace (principle 4): reads are the
// names the statement uses, valued from the snapshot at the stop; writes are
// the differences between that snapshot and the one after the statement.
// This file has no drawing; render.ts turns a RoomScene into pictures.
import { interiorAt, type Leaf, type Plan, type Station } from './interior';
import type { Ev, Snap, SnapFrame, Trace } from './interp';
import { frameRows } from './layout';
import type { FnInfo } from './parse';
import type { ValueKind } from './skins/types';
import { fieldValue, staticCellId, valueOf } from './values';

export const SKIP = 0.004; // seconds at 1× for an event outside the room

export interface Beat {
  kind: 'entry' | 'stmt' | 'switch' | 'exit';
  frame: number;
  station: number | null;
  from: number; // event indices, inclusive
  to: number;
  before: number; // snapshot with the values the statement reads
  after: number; // snapshot once it's done
  calls: { call: number; ret: number | null; fn: string }[]; // direct calls it makes
  len: number; // seconds at 1×
  result?: boolean; // a switch: which way it went
  bounds: { read: number; compute: number; out: number; in: number }; // phase ends, in progress units (write runs to 1)
}

export interface Timeline {
  beats: Beat[];
  beatAt: Int32Array; // event → beat (-1: outside the room)
  dur: Float64Array; // event → seconds at 1×
  p0: Float32Array; // event → progress in its beat at its start
  p1: Float32Array;
  role: Uint8Array; // event → 0 outside, 1 the frame's own, 2 a call it makes, 3 that call's return, 4 inside that call
}

// ---------------- storage ----------------

export interface Slot {
  key: string; // c:name, f:parent.field, s:name
  name: string;
  depth: 0 | 1;
  param: boolean;
  kind: 'cell' | 'field' | 'static' | 'more';
}

export interface SlotValue {
  text: string;
  kind: ValueKind;
  bytes: number[] | null; // a char * with sampled memory: its bytes
  marks: { label: string; index: number }[]; // sibling index fields (pos, len…) on that memory
}

const INDEX_NAMES = new Set(['pos', 'len', 'cap', 'size', 'start', 'end', 'idx', 'index', 'head', 'tail', 'count', 'i', 'j', 'n']);

const slotCache = new WeakMap<FnInfo, Slot[]>();
export function slotsOf(fn: FnInfo): Slot[] {
  const hit = slotCache.get(fn);
  if (hit) return hit;
  const out: Slot[] = frameRows(fn).map((r) =>
    r.more ? { key: `m:${r.parent}`, name: r.name, depth: 1, param: r.param, kind: 'more' }
    : r.depth === 1 ? { key: `f:${r.parent}.${r.name}`, name: r.name, depth: 1, param: r.param, kind: 'field' }
    : { key: `c:${r.name}`, name: r.name, depth: 0, param: r.param, kind: 'cell' });
  for (const v of fn.statics) out.push({ key: `s:${v.name}`, name: v.name, depth: 0, param: false, kind: 'static' });
  slotCache.set(fn, out);
  return out;
}

function heapBytes(snap: Snap, to: number | null, type: string): number[] | null {
  if (to === null || !type.includes('char')) return null;
  return snap.heap.find((c) => c.id === to)?.bytes ?? null;
}

export function slotValue(slot: Slot, fnName: string, frame: SnapFrame | null, snap: Snap, trace: Trace): SlotValue {
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
    const v = valueOf(c, frame, trace, null);
    return { ...v, bytes: c.val.k === 'ptr' ? heapBytes(snap, c.val.to, c.type) : null, marks: [] };
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

export function readsOf(b: Beat, fn: FnInfo, plan: Plan, trace: Trace): Read[] {
  if (b.station === null) return [];
  const slots = slotsOf(fn);
  const snap = trace.snaps[b.before];
  const frame = frameIn(snap, b.frame);
  const out: Read[] = [];
  for (const leaf of leavesOfStation(plan.stations[b.station]).leaves) {
    const key = slotKeyOf(leaf, slots);
    if (!key || out.some((r) => r.key === key)) continue;
    const v = slotValue(slots.find((s) => s.key === key)!, fn.name, frame, snap, trace);
    if (v.kind !== 'none') out.push({ key, text: v.text });
  }
  return out;
}

// The expression with the values it read: `buf->pos == buf->len` → `6 == 8`.
export function computeText(b: Beat, fn: FnInfo, plan: Plan, trace: Trace): string {
  if (b.station === null) return '';
  const { leaves, src } = leavesOfStation(plan.stations[b.station]);
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
  const f1 = frameIn(s1, b.frame);
  const out: Write[] = [];
  if (f1 || b.kind === 'exit') {
    for (const slot of slots) {
      if (slot.kind === 'more') continue;
      const v0 = slotValue(slot, fn.name, f0, s0, trace);
      const v1 = slotValue(slot, fn.name, f1 ?? f0, s1, trace);
      if (v0.bytes && v1.bytes) {
        for (let k = 0; k < Math.max(v0.bytes.length, v1.bytes.length); k++) {
          if (v0.bytes[k] !== v1.bytes[k] && v1.bytes[k] !== undefined) out.push({ key: slot.key, index: k, text: byteText(v1.bytes[k]) });
        }
        continue;
      }
      if (v1.kind !== 'none' && v0.text !== v1.text) out.push({ key: slot.key, text: v1.text });
    }
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

const tlCache = new WeakMap<Trace, Map<string, { plan: Plan; tl: Timeline }>>();

export function roomTimeline(trace: Trace, fn: FnInfo, plan: Plan): Timeline {
  let m = tlCache.get(trace);
  if (!m) tlCache.set(trace, (m = new Map()));
  const hit = m.get(fn.name);
  if (hit && hit.plan === plan) return hit.tl;
  const tl = buildTimeline(trace, fn, plan);
  m.set(fn.name, { plan, tl });
  return tl;
}

function buildTimeline(trace: Trace, fn: FnInfo, plan: Plan): Timeline {
  const evs: Ev[] = trace.evs;
  const n = evs.length;
  const gdb = trace.engine === 'gdb';
  const beats: Beat[] = [];
  const beatAt = new Int32Array(n).fill(-1);
  const role = new Uint8Array(n); // 0 outside, 1 own, 2 call out, 3 call in, 4 waiting
  const frames = new Set<number>();
  const open = new Map<number, number>();
  const bounds = { read: 0.35, compute: 0.55, out: 0.55, in: 0.55 };
  const add = (b: Omit<Beat, 'len' | 'bounds' | 'calls'>) => beats.push({ ...b, calls: [], len: 1, bounds: { ...bounds } }) - 1;
  const close = (F: number, to: number) => {
    const k = open.get(F);
    if (k === undefined) return;
    beats[k].to = Math.max(beats[k].from, to);
    // gdb records a stop's changes over several events (memory last); the
    // next stop's step marks the state as complete
    beats[k].after = gdb && evs[beats[k].to + 1]?.k === 'step' ? beats[k].to + 2 : beats[k].to + 1;
    open.delete(F);
  };

  for (let i = 0; i < n; i++) {
    const e = evs[i];
    if (e.k === 'call' && e.fn === fn.name && e.frame !== null) {
      frames.add(e.frame);
      const k = add({ kind: 'entry', frame: e.frame, station: null, from: i, to: i, before: i, after: i + 1 });
      open.set(e.frame, k);
      beatAt[i] = k;
      role[i] = 1;
      continue;
    }
    if (e.frame !== null && frames.has(e.frame)) {
      const F = e.frame;
      if (e.k === 'ret') {
        close(F, i - 1);
        // the return statement, when the engine reports its line (the interpreter does)
        const rs = plan.byLine.get(e.line);
        const station = rs !== undefined && plan.stations[rs].kind === 'ret' ? rs : null;
        const k = add({ kind: 'exit', frame: F, station, from: i, to: i, before: i, after: i + 1 });
        beatAt[i] = k;
        role[i] = 1;
        frames.delete(F);
        continue;
      }
      const st = plan.byLine.get(e.line);
      const k0 = open.get(F);
      const cur = k0 !== undefined ? beats[k0] : null;
      const fresh = st !== undefined && (!cur || cur.kind === 'entry' || cur.station !== st) && (gdb ? e.k === 'step' : true);
      if (fresh) {
        close(F, i - 1);
        const station = plan.stations[st!];
        const k = add({ kind: station.kind === 'if' || station.kind === 'loop' ? 'switch' : 'stmt', frame: F, station: st!, from: i, to: i, before: gdb ? i + 1 : i, after: i + 1 });
        open.set(F, k);
        beatAt[i] = k;
        role[i] = 1;
      } else if (cur) {
        beatAt[i] = k0!;
        role[i] = 1;
      }
      if (!gdb && e.k === 'eval' && open.has(F)) beats[open.get(F)!].result = e.result;
      continue;
    }
    // another frame: a callee of the deepest open beat (or of nothing)
    const stack = trace.snaps[i].stack;
    let F: number | null = null;
    let at = -1;
    for (let j = stack.length - 1; j >= 0; j--) if (open.has(stack[j].id)) ((F = stack[j].id), (at = j), (j = -1));
    if (F === null) continue;
    const k = open.get(F)!;
    beatAt[i] = k;
    if (e.k === 'call' && at === stack.length - 1) {
      beats[k].calls.push({ call: i, ret: null, fn: e.fn });
      role[i] = 2;
    } else if (e.k === 'ret' && stack[at + 1]?.id === e.frame) {
      const c = beats[k].calls.find((x) => x.ret === null && x.fn === e.fn);
      if (c) c.ret = i;
      role[i] = 3;
    } else role[i] = 4;
  }
  for (const F of [...open.keys()]) close(F, n - 1);

  // results of gdb switches: the way the frame went next
  if (gdb) {
    for (const b of beats) {
      if (b.kind !== 'switch' || b.station === null) continue;
      const d = interiorAt(trace, plan, b.frame, b.to + 1).decided.get(b.station);
      if (d && d.d.at === b.to + 1) b.result = d.d.result;
    }
  }

  // pacing: each beat's events share its length; skipped events stay tiny
  const dur = new Float64Array(n).fill(SKIP);
  const p0 = new Float32Array(n);
  const p1 = new Float32Array(n);
  const byBeat = new Map<number, number[]>();
  for (let i = 0; i < n; i++) if (beatAt[i] >= 0) (byBeat.get(beatAt[i]) ?? byBeat.set(beatAt[i], []).get(beatAt[i])!).push(i);
  beats.forEach((b, k) => {
    const list = byBeat.get(k) ?? [];
    const reads = readsOf(b, fn, plan, trace).length;
    const writes = Math.min(8, writesOf(b, fn, trace).length);
    const calls = b.calls.length > 0;
    if (b.kind === 'entry') b.len = clampN(1 + 0.2 * fn.params.length, 1, 2.2);
    else if (b.kind === 'exit') b.len = 1.2;
    else b.len = clampN(1 + 0.15 * reads + 0.15 * writes + (calls ? 0.6 : 0), 1, 2.6);
    b.bounds = calls ? { read: 0.28, compute: 0.42, out: 0.54, in: 0.7 } : { read: 0.35, compute: 0.55, out: 0.55, in: 0.55 };
    const target = (i: number, first: boolean) =>
      b.kind === 'entry' || b.kind === 'exit' ? 1 : first ? b.bounds.out : role[i] === 2 || role[i] === 4 ? b.bounds.out : role[i] === 3 ? b.bounds.in : 1;
    let cur = 0;
    let lastReal = -1;
    for (let q = 0; q < list.length; ) {
      const t = Math.max(cur, target(list[q], q === 0));
      const skip = q > 0 && (role[list[q]] === 2 || role[list[q]] === 4);
      if (skip) {
        p0[list[q]] = p1[list[q]] = cur;
        q++;
        continue;
      }
      // consecutive events heading for the same phase end share the way there
      let r = q + 1;
      while (r < list.length && target(list[r], false) === t && role[list[r]] !== 2 && role[list[r]] !== 4) r++;
      const step = (t - cur) / (r - q);
      for (let s = q; s < r; s++) {
        p0[list[s]] = cur + step * (s - q);
        p1[list[s]] = cur + step * (s - q + 1);
        lastReal = list[s];
      }
      cur = t;
      q = r;
    }
    if (lastReal >= 0 && cur < 1) p1[lastReal] = 1;
    for (const i of list) dur[i] = p1[i] > p0[i] ? (p1[i] - p0[i]) * b.len : SKIP;
  });
  return { beats, beatAt, dur, p0, p1, role };
}

const clampN = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------- the scene at a playback position ----------------

export type Phase = 'read' | 'compute' | 'out' | 'wait' | 'in' | 'write' | 'idle';

export interface RoomScene {
  beat: Beat | null; // null: nothing here yet (never called before this point)
  idle: boolean; // between beats: the room shows where it last was
  live: boolean; // the frame shown is still running
  p: number;
  phase: Phase;
  frame: SnapFrame | null;
  snap: Snap; // values shown in storage
  reads: Read[];
  writes: Write[];
  landed: number; // 0..1: how far the writes have got (values switch to the new ones at 1)
  compute: string;
  waitingOn: string | null;
  interiorAt: number; // event index for the stations' state
}

export function roomScene(trace: Trace, fn: FnInfo, plan: Plan, pos: number): RoomScene {
  const tl = roomTimeline(trace, fn, plan);
  const n = trace.evs.length;
  const i = Math.min(Math.floor(pos), n - 1);
  const t = Math.max(0, pos - Math.floor(pos));
  let k = i >= 0 && pos < n ? tl.beatAt[i] : -1;
  let idle = false;
  if (k < 0) {
    // between beats: the last one that started
    idle = true;
    for (let q = tl.beats.length - 1; q >= 0; q--) if (tl.beats[q].from <= i) ((k = q), (q = -1));
  }
  const empty = (): RoomScene => ({ beat: null, idle: true, live: false, p: 0, phase: 'idle', frame: null, snap: trace.snaps[0], reads: [], writes: [], landed: 0, compute: '', waitingOn: null, interiorAt: i });
  if (k < 0) return empty();
  const b = tl.beats[k];
  const p = idle ? 1 : tl.p0[i] + (tl.p1[i] - tl.p0[i]) * t;
  const B = b.bounds;
  const hasCalls = b.calls.length > 0;
  const r = idle ? 0 : tl.role[i];
  const phase: Phase = idle ? 'idle'
    : b.kind === 'entry' || b.kind === 'exit' ? (p < 0.6 ? 'read' : 'write')
    : r === 2 || r === 4 ? 'wait' : r === 3 ? 'in'
    : p < B.read ? 'read' : p < B.compute ? 'compute' : hasCalls && p < B.out ? 'out' : 'write';
  const writes = writesOf(b, fn, trace);
  const writeFrom = b.kind === 'entry' || b.kind === 'exit' ? 0.25 : hasCalls ? B.in : B.compute;
  const landed = idle ? 1 : clampN((p - writeFrom) / Math.max(0.05, 1 - writeFrom), 0, 1);
  const snap = trace.snaps[Math.min(landed >= 1 ? b.after : b.before, trace.snaps.length - 1)];
  const frame = frameIn(snap, b.frame) ?? frameIn(trace.snaps[b.before], b.frame);
  const liveNow = (b.kind === 'entry' && !idle) || frameAt(trace, pos).stack.some((f) => f.id === b.frame);
  const pending = b.calls.find((c) => c.call <= i && (c.ret === null || c.ret > i));
  return {
    beat: b, idle, live: liveNow, p, phase, frame, snap,
    reads: readsOf(b, fn, plan, trace), writes, landed,
    compute: computeText(b, fn, plan, trace),
    waitingOn: !idle && phase === 'wait' && pending ? pending.fn : null,
    interiorAt: idle ? i : b.kind === 'switch' && landed >= 1 ? b.to + 1 : b.from,
  };
}

function frameAt(trace: Trace, pos: number): Snap {
  const i = Math.max(0, Math.min(Math.floor(pos), trace.snaps.length - 1));
  return trace.snaps[i];
}

// Beat boundaries for stepping ←/→ inside the room.
export function beatStarts(trace: Trace, fn: FnInfo, plan: Plan): number[] {
  return roomTimeline(trace, fn, plan).beats.map((b) => b.from);
}
