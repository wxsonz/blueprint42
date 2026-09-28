// Beats: every statement run, in every machine, from real traces.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { beatDuration, beatLen, beatNow, computeText, readsOf, timelineOf, writesOf } from '../src/beats';
import { convertGdb } from '../src/gdb';
import { planOf } from '../src/interior';
import { run, type Trace } from '../src/interp';
import { callPortY, geomOf, machineSize } from '../src/machine';
import { parse, type Model } from '../src/parse';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

let cached: { t: Trace; m: Model } | null = null;
async function readerTrace() {
  if (cached) return cached;
  const s = sample('reader');
  const m = parse(s.src);
  const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
  expect(r.ok, r.error ?? r.compile?.text).toBe(true);
  cached = { t: convertGdb(r, m, s.src), m };
  return cached;
}
const text = (m: Model, b: { fn: string; station: number }) => planOf(m.byName.get(b.fn)!).stations[b.station].text;

describe('beats: every statement, in place (gdb, the line reader)', () => {
  it('lr_consume, first call: pos = line_end reads 6, then 6 == 8 → false', async () => {
    const { t, m } = await readerTrace();
    const fn = m.byName.get('lr_consume')!;
    const tl = timelineOf(t, m);
    const frame = t.evs.find((e) => e.k === 'call' && e.fn === 'lr_consume')!.frame!;
    const mine = tl.beats.filter((b) => b.frame === frame);
    expect(mine.map((b) => text(m, b))).toEqual(['buf->pos = line_end;', 'if (buf->pos == buf->len)', '}']);
    const [assign, sw] = mine;
    expect(readsOf(assign, fn, t)).toEqual([{ key: 'c:line_end', text: '6' }]);
    expect(computeText(assign, fn, t)).toBe('buf->pos = 6');
    expect(writesOf(assign, fn, t)).toEqual([{ key: 'f:buf.pos', text: '6' }]);
    expect(sw.kind).toBe('switch');
    expect(readsOf(sw, fn, t)).toEqual([{ key: 'f:buf.pos', text: '6' }, { key: 'f:buf.len', text: '8' }]);
    expect(computeText(sw, fn, t)).toBe('6 == 8');
    expect(sw.result).toBe(false);
  }, 60000);

  it('the call that empties the buffer writes each .data byte in turn, ×23 (all it held)', async () => {
    const { t, m } = await readerTrace();
    const fn = m.byName.get('lr_consume')!;
    const tl = timelineOf(t, m);
    const frame = tl.beats.find((b) => b.fn === 'lr_consume' && b.kind === 'switch' && b.result === true)!.frame;
    const body = tl.beats.filter((b) => b.frame === frame && text(m, b).startsWith('buf->data[i++]'));
    expect(body).toHaveLength(23); // hello\n + world of lines\n + !\n
    body.forEach((b, k) => {
      const w = writesOf(b, fn, t);
      expect(w.find((x) => x.key === 'f:buf.data')).toMatchObject({ index: k, text: "'\\0'" });
      expect(w.find((x) => x.key === 'c:i')).toMatchObject({ text: String(k + 1) });
      expect(readsOf(b, fn, t)).toEqual([{ key: 'c:i', text: String(k) }]);
      expect(computeText(b, fn, t)).toBe("buf->data[i++] = '\\0'"); // i++ stays as written
    });
    const loops = tl.beats.filter((b) => b.frame === frame && planOf(fn).stations[b.station].kind === 'loop');
    expect(loops.map((b) => b.result)).toEqual([...Array(23).fill(true), false]);
  }, 60000);

  it('covers every machine; calls and returns stay belt events; pace follows the mode', async () => {
    const { t, m } = await readerTrace();
    const tl = timelineOf(t, m);
    expect(new Set(tl.beats.map((b) => b.fn))).toEqual(new Set(m.fns.map((f) => f.name).filter((n) => tl.beats.some((b) => b.fn === n))));
    expect(tl.beats.some((b) => b.fn === 'main')).toBe(true);
    t.evs.forEach((e, i) => {
      if (e.k === 'call') expect(tl.beatAt[i]).toBe(-1);
      // a return belongs to a beat only as the write of the statement that called
      if (e.k === 'ret' && tl.beatAt[i] >= 0) expect(tl.beats[tl.beatAt[i]].lastRet).toBe(i);
    });
    for (const [k, b] of tl.beats.entries()) {
      let last = 0;
      let fast = 0;
      for (let i = b.from; i <= b.to; i++) {
        if (tl.beatAt[i] !== k) continue;
        expect(tl.p0[i]).toBeGreaterThanOrEqual(last - 1e-6);
        last = tl.p1[i];
        fast += t.evs[i].k === 'ret' ? (tl.p1[i] - tl.p0[i]) * beatLen(b, 'fast') : beatDuration(t, m, i, 'fast')!;
      }
      expect(last).toBeCloseTo(1, 5);
      expect(fast).toBeCloseTo(beatLen(b, 'fast'), 2);
      expect(beatLen(b, 'focus')).toBeGreaterThan(beatLen(b, 'fast') * 2);
    }
    // a statement that calls: its reads come first, its write after the call returns
    const withCall = tl.beats.find((b) => b.fn === 'read_line' && b.calls && writesOf(b, m.byName.get(b.fn)!, t).length > 0)!;
    const ownAfter = [...Array(withCall.to - withCall.from + 1).keys()].map((q) => withCall.from + q).filter((i) => tl.beatAt[i] === tl.beats.indexOf(withCall));
    expect(t.evs.slice(withCall.from, withCall.to + 1).some((e) => e.k === 'call')).toBe(true);
    expect(tl.p1[ownAfter[0]]).toBeLessThan(1);
    // the if around lr_fill: its changes land with the return, after the call
    const fill = tl.beats.find((b) => b.fn === 'read_line' && text(m, b).includes('lr_fill'))!;
    expect(t.evs[fill.lastRet].k).toBe('ret');
    expect(tl.beatAt[fill.lastRet]).toBe(tl.beats.indexOf(fill));
    expect(tl.p0[fill.lastRet]).toBeGreaterThan(0.5);
    // mid-read of the if: the phase says so
    const sw = tl.beats.find((b) => b.fn === 'lr_consume' && b.kind === 'switch')!;
    expect(beatNow(t, m, sw.from + 0.1)?.phase).toBe('read');
  }, 60000);
});

describe('machines are their insides', () => {
  it('sizes a machine from its code, and calls leave at their statement', () => {
    const m = parse(sample('reader').src);
    const consume = m.byName.get('lr_consume')!;
    const readFn = m.byName.get('read_line')!;
    const g = geomOf(consume);
    expect(g.memory.keys).toEqual(['f:buf.data']); // the only char * it can reach
    expect(machineSize(consume).w).toBeGreaterThan(10);
    expect(machineSize(readFn).h).toBeGreaterThan(machineSize(consume).h);
    // read_line calls lr_fill from one statement: the belt leaves at that row
    const site = readFn.calls.find((c) => c.callee === 'lr_fill')!;
    const y = callPortY(readFn, site.line)!;
    const plan = planOf(readFn);
    expect(plan.stations[plan.byLine.get(site.line)!].text).toContain('lr_fill');
    expect(y).toBeGreaterThan(geomOf(readFn).stations.y);
  });

  it('beats on the interpreter too: evals give switch results, writes come from events', () => {
    const src = 'int\tf(int n)\n{\n\tint\ti;\n\n\ti = 0;\n\twhile (i < n)\n\t\ti = i + 1;\n\treturn (i);\n}\n\nint\tmain(void)\n{\n\treturn (f(2));\n}\n';
    const m = parse(src);
    const t = run(m);
    const fn = m.byName.get('f')!;
    const tl = timelineOf(t, m);
    const mine = tl.beats.filter((b) => b.fn === 'f');
    expect(mine.map((b) => text(m, b))).toEqual(['i = 0;', 'while (i < n)', 'i = i + 1;', 'while (i < n)', 'i = i + 1;', 'while (i < n)']);
    expect(mine.filter((b) => b.kind === 'switch').map((b) => b.result)).toEqual([true, true, false]);
    const inc = mine[2];
    expect(readsOf(inc, fn, t)).toEqual([{ key: 'c:i', text: '0' }]);
    expect(computeText(inc, fn, t)).toBe('i = 0 + 1');
    expect(writesOf(inc, fn, t)).toEqual([{ key: 'c:i', text: '1' }]);
  });
});
