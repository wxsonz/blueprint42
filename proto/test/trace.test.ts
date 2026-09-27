// Integration: really compiles with cc and steps under gdb (M3).
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { parse } from '../src/parse';
import { sample, setupParser } from './helpers';
import type { Sprite } from '../src/blueprint';

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

  it('M3 acceptance: gnl_v3 with BUFFER_SIZE=4 on a 3-line input', async () => {
    const s = sample('gnl');
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
    // every line get_next_line returns is a heap block main frees
    const rets = t!.evs.filter((e) => e.k === 'ret' && e.fn === 'get_next_line');
    const lineBlocks = rets.map((e) => (e.k === 'ret' && e.val.k === 'ptr' ? e.val.to : null)).filter((x) => x !== null);
    expect(lineBlocks.length).toBe(3);
    for (const c of lineBlocks) expect(frees.some((e) => e.k === 'free' && e.cell === c)).toBe(true);
    // bufs is seen as the static chest owned by get_next_line
    expect([...t!.cells.values()].some((c) => c.frame === -1 && c.owner === 'get_next_line' && c.name === 'bufs')).toBe(true);
  }, 60000);

  it('M2 bindings: GNL pos follows len and strip capacity doubles', async () => {
    const s = sample('gnl');
    const m = parse(s.src);
    const bindings: Sprite[] = [
      { id: 'strip', kind: 'strip', x: 0, y: 0, binding: { scope: 'fn', fn: 'gnl_fill_line', expr: 'buf->data' }, lengthExpr: 'buf->cap', markers: [{ expr: 'buf->pos', label: 'pos' }, { expr: 'buf->len', label: 'len' }] },
      { id: 'pos', kind: 'marker', x: 0, y: 0, binding: { scope: 'fn', fn: 'gnl_fill_line', expr: 'buf->pos' } },
    ];
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files, bindings });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, s.src);
    const observed = t.snaps.map((snap) => snap.bound?.strip).filter((v) => v?.bound);
    expect(observed.length).toBeGreaterThan(10);
    const positions = observed.map((v) => v!.markers?.find((m) => m.label === 'pos')?.index).filter((v): v is number => v !== undefined);
    expect(new Set(positions).size).toBeGreaterThan(1);
    for (const v of observed) {
      const pos = v!.markers?.find((m) => m.label === 'pos')?.index;
      const len = v!.markers?.find((m) => m.label === 'len')?.index;
      if (pos !== undefined && len !== undefined) expect(pos).toBeLessThanOrEqual(len);
      expect(v!.bytes?.length ?? 0).toBeLessThanOrEqual(256);
    }
    const capacities = [...new Set(observed.map((v) => v!.length).filter((v): v is number => v !== undefined && v > 0))];
    expect(capacities.some((cap) => capacities.includes(cap * 2))).toBe(true);
    expect(t.snaps.at(-1)?.bound?.strip).toEqual({ bound: false });
  }, 60000);

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
    const atAssignment = r.stops?.filter((s) => s.frames.at(-1)?.fn === 'rec' && s.line === 5) ?? [];
    expect(atAssignment.length).toBeGreaterThanOrEqual(3);
    expect(atAssignment.every((s) => s.bound?.local?.bound === false)).toBe(true);
    const nested = r.stops?.filter((s) => s.frames.filter((f) => f.fn === 'rec').length >= 2 && s.bound?.local?.bound) ?? [];
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
