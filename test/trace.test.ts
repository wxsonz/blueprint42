// Integration: really compiles with cc and steps under gdb (M3).
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb, expandStops } from '../src/gdb';
import { parse } from '../src/parse';
import { sample, setupParser } from './helpers';
import type { Sprite } from '../src/blueprint';
import { findViolations, surpriseCalls } from '../src/invariants';

beforeAll(setupParser);

async function trace(src: string, extra: { stdin?: string; defines?: string[]; files?: Record<string, string> } = {}) {
  const m = parse(src);
  const r = await handleTrace({ src, fns: m.fns.map((f) => f.name), maxSteps: 20000, ...extra });
  return { r, t: r.ok ? convertGdb(r, m, src) : null };
}

describe('trace server (cc + gdb)', () => {
  it('runs the pointer sample for real: a goes 3 → 4 through the pointer, exit 6', async () => {
    const { r, t } = await trace(sample('pointer').src);
    expect(r.ok).toBe(true);
    expect(t!.exit).toEqual({ k: 'int', v: 6 });
    const calls = t!.evs.filter((e) => e.k === 'call').map((e) => e.k === 'call' && e.fn);
    expect(calls).toEqual(['main', 'step', 'bump']);
    const a = [...t!.cells].find(([, c]) => c.owner === 'main' && c.name === 'a')![0];
    const write = t!.evs.find((e) => e.k === 'write' && e.cell === a && e.via !== null);
    expect(write && write.k === 'write' && write.val).toEqual({ k: 'int', v: 4 });
    const ret = t!.evs.find((e) => e.k === 'ret' && e.fn === 'step');
    expect(ret && ret.k === 'ret' && ret.val).toEqual({ k: 'int', v: 6 });
  }, 30000);

  it('M3 acceptance: the line reader with BUFFER_SIZE=4 on a 3-line input', async () => {
    const s = sample('reader');
    const { r, t } = await trace(s.src, { stdin: s.stdin, defines: s.defines, files: s.files });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    expect(r.stdout).toBe(s.stdin); // printed every line back
    expect(t!.exit).toEqual({ k: 'int', v: 3 });
    const allocs = t!.evs.filter((e) => e.k === 'alloc');
    const frees = t!.evs.filter((e) => e.k === 'free');
    expect(allocs.length).toBeGreaterThanOrEqual(4); // the buffer, its doubling, three lines
    expect(frees.length).toBe(allocs.length);
    expect(t!.leaks).toEqual([]);
    // the buffer doubles: a later block is twice the first one's size
    const sizes = allocs.map((e) => (e.k === 'alloc' ? e.size : 0));
    expect(sizes).toContain(sizes[0] * 2);
    // every line read_line returns is a heap block main frees
    const rets = t!.evs.filter((e) => e.k === 'ret' && e.fn === 'read_line');
    const lineBlocks = rets.map((e) => (e.k === 'ret' && e.val.k === 'ptr' ? e.val.to : null)).filter((x) => x !== null);
    expect(lineBlocks.length).toBe(3);
    for (const c of lineBlocks) expect(frees.some((e) => e.k === 'free' && e.cell === c)).toBe(true);
    // bufs is seen as the static chest owned by read_line
    expect([...t!.cells.values()].some((c) => c.frame === -1 && c.owner === 'read_line' && c.name === 'bufs')).toBe(true);
  }, 60000);

  it('M2 bindings: the reader’s pos follows len and strip capacity doubles', async () => {
    const s = sample('reader');
    const m = parse(s.src);
    const bindings: Sprite[] = [
      { id: 'strip', kind: 'strip', x: 0, y: 0, binding: { scope: 'fn', fn: 'lr_fill', expr: 'buf->data' }, lengthExpr: 'buf->cap', markers: [{ expr: 'buf->pos', label: 'pos' }, { expr: 'buf->len', label: 'len' }] },
      { id: 'pos', kind: 'marker', x: 0, y: 0, binding: { scope: 'fn', fn: 'lr_fill', expr: 'buf->pos' } },
    ];
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files, bindings });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, s.src);
    const observed = t.snaps.map((snap) => snap.bound?.strip).filter((v) => v?.bound);
    expect(observed.length).toBeGreaterThan(10);
    const positions = observed.map((v) => v!.markers?.find((mk) => mk.label === 'pos')?.index).filter((v): v is number => v !== undefined);
    expect(new Set(positions).size).toBeGreaterThan(1);
    for (const v of observed) {
      const pos = v!.markers?.find((mk) => mk.label === 'pos')?.index;
      const len = v!.markers?.find((mk) => mk.label === 'len')?.index;
      if (pos !== undefined && len !== undefined) expect(pos).toBeLessThanOrEqual(len);
      expect(v!.bytes?.length ?? 0).toBeLessThanOrEqual(256);
    }
    const capacities = [...new Set(observed.map((v) => v!.length).filter((v): v is number => v !== undefined && v > 0))];
    expect(capacities.some((cap) => capacities.includes(cap * 2))).toBe(true);
    expect(t.snaps.at(-1)?.bound?.strip).toEqual({ bound: false });
  }, 60000);

  it('M2 acceptance: the line reader’s factory table binds and every piece sees real values', async () => {
    const s = sample('reader');
    const m = parse(s.src);
    const fn = (f: string, expr: string) => ({ scope: 'fn' as const, fn: f, expr });
    // bufs chests → buf strip with pos/len/cap → drill → scanner → inserter → line chest
    const table: Sprite[] = [
      { id: 'bufs', kind: 'chest', x: 0, y: 0, label: 'bufs[fd]', binding: fn('read_line', 'bufs[fd].len') },
      { id: 'strip', kind: 'strip', x: 0, y: 0, binding: fn('lr_fill', 'buf->data'), lengthExpr: 'buf->cap',
        markers: [{ expr: 'buf->pos', label: 'pos' }, { expr: 'buf->len', label: 'len' }, { expr: 'buf->cap', label: 'cap' }] },
      { id: 'drill', kind: 'drill', x: 0, y: 0, label: 'read()', binding: fn('lr_append', 'n_read') },
      { id: 'scanner', kind: 'marker', x: 0, y: 0, label: 'scanner', binding: fn('lr_find_nl', 'from') },
      { id: 'inserter', kind: 'copy', x: 0, y: 0, label: 'inserter', binding: fn('lr_copy', 'n') },
      { id: 'line', kind: 'chest', x: 0, y: 0, label: 'line', binding: fn('read_line', 'line') },
    ];
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files, bindings: table });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, s.src);
    for (const sp of table) {
      const seen = t.snaps.map((snap) => snap.bound?.[sp.id]).filter((v) => v?.bound);
      expect(seen.length, `${sp.id} never observed a value`).toBeGreaterThan(0);
    }
    // the drill reports real read() sizes: never more than BUFFER_SIZE (4)
    const reads = t.snaps.map((snap) => snap.bound?.drill?.number).filter((v): v is number => v !== undefined);
    expect(Math.max(...reads)).toBeLessThanOrEqual(4);
    expect(reads.some((v) => v > 0)).toBe(true);
  }, 60000);

  // The strip the author would put on read_line's buffer, with the reader’s invariants.
  const readerStrip = (): Sprite => ({
    id: 'buf', kind: 'strip', x: 0, y: 0, binding: { scope: 'fn', fn: 'read_line', expr: 'buf->data' }, lengthExpr: 'buf->cap',
    markers: [{ expr: 'buf->pos', label: 'pos' }, { expr: 'buf->len', label: 'len' }, { expr: 'buf->cap', label: 'cap' }],
    // the author's own: data[len] and the following sizeof(size_t) - 1 bytes are zero
    invariants: ['pos <= len <= cap', 'on return: zero after len for 8'],
  });
  const runReader = async (src: string) => {
    const s = sample('reader');
    const m = parse(src);
    const r = await handleTrace({ src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files, bindings: [readerStrip()] });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    return convertGdb(r, m, src);
  };

  it('M4: the correct the line reader keeps its invariants (no false alarms)', async () => {
    const t = await runReader(sample('reader').src);
    expect(t.snaps.some((snap) => snap.bound?.buf?.bound)).toBe(true);
    const fa = findViolations(t, [readerStrip()]);
    expect(fa, JSON.stringify(fa.map((v) => ({ ...v, lineText: sample("reader").src.split("\n")[v.line ?? 0] }))) ).toEqual([]);
  }, 60000);

  it('M4 acceptance: an off-by-one in lr_consume is caught by pos <= len at the exact step', async () => {
    const good = sample('reader').src;
    const bad = good.replace('buf->pos = line_end;', 'buf->pos = line_end + 1;');
    expect(bad).not.toBe(good);
    const injected = bad.split('\n').findIndex((l) => l.includes('buf->pos = line_end + 1;'));
    const t = await runReader(bad);
    const v = findViolations(t, [readerStrip()]);
    const first = v.find((x) => x.invariant === 'pos <= len <= cap');
    expect(first, JSON.stringify(v)).toBeDefined();
    expect(first!.line).toBe(injected);
    expect(first!.detail).toMatch(/^pos \d+ > len \d+$/);
    // nothing was wrong before that step
    expect(v.every((x) => x.at >= first!.at)).toBe(true);
  }, 60000);

  it('M4: flags a call the static graph did not predict (through a function pointer)', async () => {
    const src = 'int\ttwice(int x)\n{\n\treturn (x * 2);\n}\n\nint\tapply(int (*f)(int), int x)\n{\n\treturn (f(x));\n}\n\nint\tmain(void)\n{\n\treturn (apply(twice, 3));\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: m.fns.map((f) => f.name) });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    expect(t.exit).toEqual({ k: 'int', v: 6 });
    const predicted = (a: string, b: string) => !!m.byName.get(a)?.calls.some((c) => c.callee === b);
    expect(surpriseCalls(t, predicted)).toEqual([expect.objectContaining({ caller: 'apply', callee: 'twice', line: 7 })]);
  }, 30000);

  it('reads a global even when a live local has the same name', async () => {
    const src = 'int\tvalue = 7;\n\nint\tmain(void)\n{\n\tint\tvalue;\n\n\tvalue = 3;\n\treturn (value);\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: ['main'], bindings: [
      { id: 'global', kind: 'chest', x: 0, y: 0, binding: { scope: 'global', expr: 'value' } },
      { id: 'local', kind: 'marker', x: 0, y: 0, binding: { scope: 'fn', fn: 'main', expr: 'value' } },
    ] });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    const both = t.snaps.find((snap) => snap.bound?.local?.number === 3);
    expect(both?.bound?.global?.number).toBe(7);
  }, 30000);

  it('reads a bounded array strip and leaves a null strip unavailable', async () => {
    const src = "char data[4] = {'a', 'b', 'c', 'd'};\nchar *missing = 0;\nint count = 4;\nint main(void)\n{\n\treturn (data[0]);\n}\n";
    const m = parse(src);
    const r = await handleTrace({ src, fns: ['main'], bindings: [
      { id: 'array', kind: 'strip', x: 0, y: 0, binding: { scope: 'global', expr: 'data' }, lengthExpr: 'count' },
      { id: 'null', kind: 'strip', x: 0, y: 0, binding: { scope: 'global', expr: 'missing' }, lengthExpr: 'count' },
    ] });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, src);
    expect(t.snaps.some((snap) => snap.bound?.array?.bytes?.join(',') === '97,98,99,100')).toBe(true);
    expect(t.snaps.some((snap) => snap.bound?.null?.bound === true)).toBe(false);
  }, 30000);

  it('binds the newest recursive frame and hides locals until assignment executes', async () => {
    const src = 'int\trec(int n)\n{\n\tint\tlocal;\n\n\tlocal = n;\n\tif (n > 0)\n\t\treturn (rec(n - 1) + local);\n\treturn (local);\n}\n\nint\tmain(void)\n{\n\treturn (rec(2));\n}\n';
    const m = parse(src);
    const r = await handleTrace({ src, fns: ['main', 'rec'], bindings: [
      { id: 'local', kind: 'marker', x: 0, y: 0, binding: { scope: 'fn', fn: 'rec', expr: 'local' } },
    ] });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const stops = expandStops(r.stops ?? []);
    const atAssignment = stops.filter((s) => s.frames.at(-1)?.fn === 'rec' && s.line === 5) ?? [];
    expect(atAssignment.length).toBeGreaterThanOrEqual(3);
    expect(atAssignment.every((s) => s.bound?.local?.bound === false)).toBe(true);
    const nested = stops.filter((s) => s.frames.filter((f) => f.fn === 'rec').length >= 2 && s.bound?.local?.bound);
    expect(nested.length).toBeGreaterThan(0);
    for (const stop of nested) {
      const frame = stop.frames.filter((f) => f.fn === 'rec').at(-1)!;
      expect(stop.bound?.local?.number).toBe(frame.vars.find((v) => v.name === 'n')?.v);
    }
    const t = convertGdb(r, m, src);
    for (let i = 0; i < t.evs.length; i++) {
      const event = t.evs[i];
      if ((event.k === 'call' || event.k === 'ret') && event.fn === 'rec')
        expect(t.snaps[i + 1].bound?.local?.bound).toBe(false);
    }
    expect(t.snaps.at(-1)?.bound?.local?.bound).toBe(false);
  }, 30000);

  it('reports compile errors with their line (the 42 flags are on)', async () => {
    const r = await handleTrace({ src: 'int\tmain(void)\n{\n\tint\tunused;\n\n\treturn (0);\n}\n', fns: ['main'] });
    expect(r.ok).toBe(false);
    expect(r.compile!.diagnostics.find((d) => d.severity === 'error')!.line).toBe(2);
  }, 30000);

  it('catches a crash at the line it happens', async () => {
    const { t } = await trace('int\tmain(void)\n{\n\tint\t*p;\n\n\tp = 0;\n\treturn (*p);\n}\n');
    expect(t!.error?.msg).toMatch(/SIGSEGV/);
    expect(t!.error?.line).toBe(5);
  }, 30000);

  it('reports leaks with the line that allocated them', async () => {
    const { t } = await trace('#include <stdlib.h>\n\nint\tmain(void)\n{\n\tchar\t*p;\n\n\tp = malloc(16);\n\tp[0] = 0;\n\treturn (p[0]);\n}\n');
    expect(t!.leaks).toHaveLength(1);
    expect(t!.leaks![0]).toMatchObject({ size: 16, line: 6 });
  }, 30000);
});
