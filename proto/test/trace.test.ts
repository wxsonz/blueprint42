// Integration: really compiles with cc and steps under gdb (M3).
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { parse } from '../src/parse';
import { sample, setupParser } from './helpers';

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
