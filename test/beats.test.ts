// Beats: every statement run, in every machine, from real traces.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { beatDuration, beatLen, beatNow, computeText, readsOf, slotValue, timelineOf, writesOf } from '../src/beats';
import { convertGdb } from '../src/gdb';
import { interiorAt, planOf } from '../src/interior';
import { lostBlocks } from '../src/ownership';
import { run, type Trace } from '../src/interp';
import { callPortY, geomOf, machineSize, slotsOf } from '../src/machine';
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

  it('*p reads the memory at p\'s address (its value and its cell), and *p = … only reads p', () => {
    const src = 'void\tbump(int *n)\n{\n\t*n = *n + 1;\n}\n\nint\tmain(void)\n{\n\tint\ta;\n\n\ta = 3;\n\tbump(&a);\n\treturn (a);\n}\n';
    const m = parse(src);
    const t = run(m);
    const fn = m.byName.get('bump')!;
    const b = timelineOf(t, m).beats.find((x) => x.fn === 'bump' && text(m, x).startsWith('*n'))!;
    const snap = t.snaps[b.before];
    const a = snap.stack.find((f) => f.fn === 'main')!.cells.find((c) => c.name === 'a')!;
    const reads = readsOf(b, fn, t);
    // the target's `n` (where to write) and the value at that address, from a's cell
    expect(reads).toContainEqual({ key: 'd:n', text: '3', cell: a.id });
    expect(computeText(b, fn, t)).toBe('*n = 3 + 1');
  });

  it('a[i] reads the element (from the array\'s row) and i; a[i] = … reads only i (gdb)', async () => {
    const src = 'int\tmain(void)\n{\n\tint\ttab[3];\n\tint\ti;\n\tint\tx;\n\n\ttab[0] = 7;\n\ttab[1] = 8;\n\ttab[2] = 9;\n\ti = 1;\n\tx = tab[i] + 1;\n\treturn (x);\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: m.fns.map((f) => f.name) });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    const fn = m.byName.get('main')!;
    const beats = timelineOf(t, m).beats.filter((x) => x.fn === 'main');
    const use = beats.find((x) => text(m, x).startsWith('x = tab[i]'))!;
    expect(readsOf(use, fn, t)).toEqual([{ key: 'c:tab[i]', text: '8' }, { key: 'c:i', text: '1' }]);
    expect(computeText(use, fn, t)).toBe('x = 8 + 1');
    const set = beats.find((x) => text(m, x).startsWith('tab[1] = 8'))!;
    expect(readsOf(set, fn, t)).toEqual([]);
  }, 60000);

  it('memory is drawn where it lives: a stack array\'s own bytes, a literal, a pointer into the stack, a static (gdb)', async () => {
    const src = 'static char\tg_tag[8] = "keep";\n\nint\tfill(char *dst, const char *src)\n{\n\tint\ti;\n\n\ti = 0;\n\twhile (src[i])\n\t{\n\t\tdst[i] = src[i];\n\t\ti++;\n\t}\n\tdst[i] = \'\\0\';\n\treturn (i);\n}\n\nint\tmain(void)\n{\n\tchar\t\tbuf[16];\n\tconst char\t*msg;\n\tint\t\t\tn;\n\n\tmsg = "hi there";\n\tn = fill(buf, msg);\n\tg_tag[0] = g_tag[1];\n\treturn (n);\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: m.fns.map((f) => f.name) });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    const main = m.byName.get('main')!;
    const fill = m.byName.get('fill')!;
    const g = geomOf(main);
    // buf's strip is in LOCALS (its own bytes), msg's in REACHED (what it points at)
    expect(g.memory.keys).toEqual(['c:buf', 'c:msg']);
    const locals = g.store.pools.find((p) => p.pool === 'local')!;
    expect(g.memory.ys[0]).toBeGreaterThan(locals.y);
    expect(g.memory.ys[0]).toBeLessThan(locals.y + locals.h);
    const at = (fn: typeof main, key: string, i: number) => {
      const snap = t.snaps[i];
      const frame = snap.stack.filter((f) => f.fn === fn.name).at(-1) ?? null;
      return slotValue(slotsOf(fn).find((s) => s.key === key)!, fn.name, frame, snap, t);
    };
    const end = t.evs.findIndex((e) => e.k === 'ret' && e.fn === 'fill') + 1;
    const buf = at(main, 'c:buf', end);
    expect(buf.own).toBe(true);
    expect(String.fromCharCode(...buf.bytes!.slice(0, 9))).toBe('hi there\0');
    const msg = at(main, 'c:msg', end);
    expect(msg.tag).toBe('literal (read-only)');
    expect(msg.bytes).toEqual([...'hi there'].map((c) => c.charCodeAt(0)).concat([0]));
    // inside fill, dst reaches main's buf: the bytes as they are, where they are
    const inFill = t.evs.findIndex((e) => e.k === 'ret' && e.fn === 'fill');
    const dst = at(fill, 'c:dst', inFill);
    expect(dst.tag).toBe('buf[0]');
    expect(String.fromCharCode(...dst.bytes!.slice(0, 8))).toBe('hi there');
    const tag = slotValue({ key: 's:g_tag', name: 'g_tag', depth: 0, param: false, kind: 'static', type: 'char [8]', pool: 'kept' }, '', null, t.snaps[t.snaps.length - 1], t);
    expect(tag.own).toBe(true);
  }, 60000);

  it('stdin is used up by read(0, …), and stderr reaches the terminal marked as its own (gdb)', async () => {
    const src = '#include <unistd.h>\n\nint\tmain(void)\n{\n\tchar\tbuf[4];\n\tint\t\tn;\n\n\tn = read(0, buf, 4);\n\twrite(1, buf, n);\n\twrite(2, "oops\\n", 5);\n\tn = read(0, buf, 4);\n\treturn (n);\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: m.fns.map((f) => f.name), stdin: 'hello\n' });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    expect(t.inText).toBe('hello\n');
    const ins = t.evs.filter((e) => e.k === 'in');
    expect(ins.map((e) => e.k === 'in' && e.text)).toEqual(['hell', 'o\n']);
    expect(t.snaps.at(-1)!.inPos).toBe(6);
    expect(t.outText).toBe('helloops\n');
    expect(t.errSpans).toEqual([[4, 9]]);
    expect(t.stdout).toBe('hell');
  }, 60000);

  it('a block is lost when its last pointer goes: a function returns without freeing it or handing it on (gdb)', async () => {
    const src = '#include <stdlib.h>\n\nvoid\tleaky(void)\n{\n\tint\t*p;\n\n\tp = malloc(sizeof(int));\n\t*p = 1;\n}\n\nint\t*kept(void)\n{\n\tint\t*q;\n\n\tq = malloc(sizeof(int));\n\treturn (q);\n}\n\nint\tmain(void)\n{\n\tint\t*k;\n\n\tleaky();\n\tk = kept();\n\tfree(k);\n\treturn (0);\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: m.fns.map((f) => f.name) });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    const lost = lostBlocks(t);
    // leaky's block: lost when leaky returns; kept's is handed on (returned, stored in k), then freed
    expect(lost.map((l) => [t.cells.get(l.cell)?.name, l.why, l.fn])).toEqual([['#1', 'ret', 'leaky']]);
  }, 60000);

  it('a[j + 1], p->next->v and **pp read from where the memory is (gdb)', async () => {
    const src = 'typedef struct s_n\n{\n\tint\t\t\tv;\n\tstruct s_n\t*next;\n}\tt_n;\n\nint\tmain(void)\n{\n\tint\ttab[3];\n\tint\tj;\n\tt_n\ta;\n\tt_n\tb;\n\tt_n\t*p;\n\tint\t*ip;\n\tint\t**pp;\n\tint\tx;\n\n\ttab[0] = 7;\n\ttab[1] = 8;\n\ttab[2] = 9;\n\tj = 1;\n\tx = tab[j + 1];\n\tb.v = 42;\n\tb.next = 0;\n\ta.v = 1;\n\ta.next = &b;\n\tp = &a;\n\tx = p->next->v;\n\tip = &x;\n\tpp = &ip;\n\tx = **pp + 1;\n\treturn (x);\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: m.fns.map((f) => f.name) });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    const fn = m.byName.get('main')!;
    const beats = timelineOf(t, m).beats.filter((x) => x.fn === 'main');
    const at = (s: string) => beats.find((x) => text(m, x).startsWith(s))!;
    expect(computeText(at('x = tab[j + 1]'), fn, t)).toBe('x = 9');
    expect(computeText(at('x = p->next->v'), fn, t)).toBe('x = 42');
    const chain = readsOf(at('x = p->next->v'), fn, t);
    const b = t.snaps[at('x = p->next->v').before].stack[0].cells.find((c) => c.name === 'b')!;
    expect(chain).toEqual([{ key: 'd:p.next.v', text: '42', cell: b.id }]);
    expect(computeText(at('x = **pp + 1'), fn, t)).toBe('x = 42 + 1'); // pp → ip → x, which the line before set to 42
  }, 60000);

  it('loop rounds as a whole: in, in, in, out, and the if inside it round by round', () => {
    const src = 'int\tf(int n)\n{\n\tint\ti;\n\tint\ts;\n\n\ti = 0;\n\ts = 0;\n\twhile (i < n)\n\t{\n\t\tif (i % 2 == 0)\n\t\t\ts = s + i;\n\t\ti = i + 1;\n\t}\n\treturn (s);\n}\n\nint\tmain(void)\n{\n\treturn (f(3));\n}\n';
    const m = parse(src);
    const t = run(m);
    const fn = m.byName.get('f')!;
    const plan = planOf(fn);
    const frame = t.evs.find((e) => e.k === 'call' && e.fn === 'f')!.frame!;
    const loop = plan.stations.findIndex((x) => x.kind === 'loop');
    const iff = plan.stations.findIndex((x) => x.kind === 'if');
    const end = interiorAt(t, plan, frame, t.evs.length - 1);
    expect(end.rounds.get(loop)).toEqual({ marks: [true, true, true, false], older: 0 });
    expect(end.rounds.get(iff)).toEqual({ marks: [true, false, true, null], older: 0 });
  });
});
