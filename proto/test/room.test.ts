// Enter the machine: beats, reads, writes and pacing from real traces.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { planOf } from '../src/interior';
import { run, type Trace } from '../src/interp';
import { parse, type Model } from '../src/parse';
import { computeText, readsOf, roomScene, roomTimeline, SKIP, writesOf } from '../src/room';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

let gnl: { t: Trace; m: Model } | null = null;
async function gnlTrace() {
  if (gnl) return gnl;
  const s = sample('gnl');
  const m = parse(s.src);
  const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
  expect(r.ok, r.error ?? r.compile?.text).toBe(true);
  gnl = { t: convertGdb(r, m, s.src), m };
  return gnl;
}

describe('enter the machine (room)', () => {
  it('gnl_consume, first call: args in, pos = line_end, 6 == 8 → false, out (gdb)', async () => {
    const { t, m } = await gnlTrace();
    const fn = m.byName.get('gnl_consume')!;
    const plan = planOf(fn);
    const tl = roomTimeline(t, fn, plan);
    const first = tl.beats.find((b) => b.kind === 'entry')!;
    const call = tl.beats.filter((b) => b.frame === first.frame);
    expect(call.map((b) => (b.station === null ? b.kind : plan.stations[b.station].text))).toEqual([
      'entry', 'buf->pos = line_end;', 'if (buf->pos == buf->len)', '}', 'exit',
    ]);
    const assign = call[1];
    expect(readsOf(assign, fn, plan, t)).toEqual([{ key: 'c:line_end', text: '6' }]);
    expect(computeText(assign, fn, plan, t)).toBe('buf->pos = 6');
    expect(writesOf(assign, fn, t)).toEqual([{ key: 'f:buf.pos', text: '6' }]);
    const sw = call[2];
    expect(sw.kind).toBe('switch');
    expect(readsOf(sw, fn, plan, t)).toEqual([{ key: 'f:buf.pos', text: '6' }, { key: 'f:buf.len', text: '8' }]);
    expect(computeText(sw, fn, plan, t)).toBe('6 == 8');
    expect(sw.result).toBe(false);
    expect(writesOf(sw, fn, t)).toEqual([]);
  }, 60000);

  it('the call that empties the buffer writes each .data byte in turn, ×8 (gdb)', async () => {
    const { t, m } = await gnlTrace();
    const fn = m.byName.get('gnl_consume')!;
    const plan = planOf(fn);
    const tl = roomTimeline(t, fn, plan);
    const frame = tl.beats.find((b) => b.kind === 'switch' && b.result === true)!.frame;
    const body = tl.beats.filter((b) => b.frame === frame && b.station !== null && plan.stations[b.station].text.startsWith('buf->data[i++]'));
    expect(body).toHaveLength(8);
    body.forEach((b, k) => {
      const w = writesOf(b, fn, t);
      expect(w.find((x) => x.key === 'f:buf.data')).toMatchObject({ index: k, text: "'\\0'" });
      expect(w.find((x) => x.key === 'c:i')).toMatchObject({ text: String(k + 1) });
      expect(readsOf(b, fn, plan, t)).toEqual([{ key: 'c:i', text: String(k) }]);
    });
    const loops = tl.beats.filter((b) => b.frame === frame && b.station !== null && plan.stations[b.station].kind === 'loop');
    expect(loops.map((b) => b.result)).toEqual([true, true, true, true, true, true, true, true, false]);
  }, 60000);

  it('paces the room: outside skips, each beat takes its length (gdb)', async () => {
    const { t, m } = await gnlTrace();
    const fn = m.byName.get('gnl_consume')!;
    const plan = planOf(fn);
    const tl = roomTimeline(t, fn, plan);
    // before the first call nothing is in the room
    const first = tl.beats[0].from;
    for (let i = 0; i < first; i++) expect(tl.dur[i]).toBe(SKIP);
    for (const [k, b] of tl.beats.entries()) {
      let sum = 0;
      let last = 0;
      for (let i = b.from; i <= b.to; i++) {
        if (tl.beatAt[i] !== k) continue;
        expect(tl.p0[i]).toBeGreaterThanOrEqual(last - 1e-6);
        last = tl.p1[i];
        if (tl.dur[i] !== SKIP) sum += tl.dur[i];
      }
      expect(last).toBeCloseTo(1, 5);
      expect(sum).toBeCloseTo(b.len, 3);
    }
    // the scene mid-way through the if: reading .pos and .len
    const sw = tl.beats.find((b) => b.kind === 'switch')!;
    const sc = roomScene(t, fn, plan, sw.from + 0.1);
    expect(sc.phase).toBe('read');
    expect(sc.reads.map((r) => r.key)).toEqual(['f:buf.pos', 'f:buf.len']);
  }, 60000);

  it('a statement that calls out waits for it and brings the result back (gdb)', async () => {
    const { t, m } = await gnlTrace();
    const fn = m.byName.get('get_next_line')!;
    const plan = planOf(fn);
    const tl = roomTimeline(t, fn, plan);
    const withCall = tl.beats.find((b) => b.calls.some((c) => c.fn === 'gnl_fill_line' && c.ret !== null))!;
    expect(withCall).toBeTruthy();
    const c = withCall.calls[0];
    // inside the callee the room waits, then the return comes in
    expect(roomScene(t, fn, plan, c.call + 1.5).phase).toBe('wait');
    expect(roomScene(t, fn, plan, c.call + 1.5).waitingOn).toBe('gnl_fill_line');
    expect(roomScene(t, fn, plan, c.ret! + 0.5).phase).toBe('in');
    expect(tl.dur[c.call + 1]).toBe(SKIP);
  }, 60000);

  it('works on the interpreter too: evals give switch results, writes come from events', () => {
    const src = 'int\tf(int n)\n{\n\tint\ti;\n\n\ti = 0;\n\twhile (i < n)\n\t\ti = i + 1;\n\treturn (i);\n}\n\nint\tmain(void)\n{\n\treturn (f(2));\n}\n';
    const m = parse(src);
    const t = run(m);
    const fn = m.byName.get('f')!;
    const plan = planOf(fn);
    const tl = roomTimeline(t, fn, plan);
    const kinds = tl.beats.map((b) => (b.station === null ? b.kind : plan.stations[b.station].text));
    // the return has no event of its own here: the exit carries it
    expect(kinds).toEqual(['entry', 'i = 0;', 'while (i < n)', 'i = i + 1;', 'while (i < n)', 'i = i + 1;', 'while (i < n)', 'return (i);']);
    expect(tl.beats.at(-1)!.kind).toBe('exit');
    expect(readsOf(tl.beats.at(-1)!, fn, plan, t)).toEqual([{ key: 'c:i', text: '2' }]);
    const loops = tl.beats.filter((b) => b.kind === 'switch');
    expect(loops.map((b) => b.result)).toEqual([true, true, false]);
    const inc = tl.beats[3];
    expect(readsOf(inc, fn, plan, t)).toEqual([{ key: 'c:i', text: '0' }]);
    expect(computeText(inc, fn, plan, t)).toBe('i = 0 + 1');
    expect(writesOf(inc, fn, t)).toEqual([{ key: 'c:i', text: '1' }]);
  });
});
