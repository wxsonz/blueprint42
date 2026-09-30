// A trace that checks itself (docs/OBJECTIVES.md, "easy to diagnose", step
// 7): every sample, under both engines where they run it, passes every check.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { run } from '../src/interp';
import { parse } from '../src/parse';
import { SAMPLES } from '../src/samples';
import { validateTrace } from '../src/validate';
import { setupParser } from './helpers';

beforeAll(setupParser);

describe('every trace checks out', () => {
  it('the interpreter', () => {
    const bad: string[] = [];
    let ran = 0;
    for (const s of SAMPLES) {
      const m = parse(s.src);
      const t = run(m);
      if (t.evs.length < 3) continue; // a program the interpreter refuses (it calls what it can't run)
      ran++;
      for (const p of validateTrace(t)) bad.push(`${s.key}: ${p.check}${p.at !== null ? ` @${p.at}` : ''}: ${p.detail}`);
    }
    expect(ran).toBeGreaterThan(3);
    expect(bad).toEqual([]);
  });

  it('gdb', async () => {
    const bad: string[] = [];
    for (const s of SAMPLES) {
      const m = parse(s.src);
      const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
      if (!r.ok) { bad.push(`${s.key}: the trace server failed: ${r.error ?? r.compile?.text}`); continue; }
      for (const p of validateTrace(convertGdb(r, m, s.src))) bad.push(`${s.key}: ${p.check}${p.at !== null ? ` @${p.at}` : ''}: ${p.detail}`);
    }
    expect(bad).toEqual([]);
  }, 180000);

  // and it would say so: each check catches the fault it names
  it('names what a broken trace gets wrong', () => {
    const s = SAMPLES.find((x) => x.key === 'fib' || x.key === 'recursion')!;
    const good = run(parse(s.src));
    expect(validateTrace(good)).toEqual([]);
    const copy = () => ({ ...good, evs: [...good.evs], snaps: good.snaps.map((sn) => ({ ...sn, stack: sn.stack.map((f) => ({ ...f, cells: [...f.cells] })) })), cells: new Map(good.cells) });
    const checks = (t: ReturnType<typeof copy>) => [...new Set(validateTrace(t).map((p) => p.check))];

    const short = copy();
    short.snaps.pop();
    expect(checks(short)).toContain('shape');

    const call = good.evs.findIndex((e) => e.k === 'call');
    const renamed = copy();
    const f = renamed.snaps[call + 1].stack.at(-1)!;
    renamed.snaps[call + 1].stack[renamed.snaps[call + 1].stack.length - 1] = { ...f, fn: 'somebody_else' };
    expect(checks(renamed)).toEqual(expect.arrayContaining(['frame ids', 'calls']));

    const lostCell = copy();
    const withCell = lostCell.snaps.findIndex((sn) => sn.stack.some((fr) => fr.cells.length));
    const c = lostCell.snaps[withCell].stack.find((fr) => fr.cells.length)!.cells[0];
    lostCell.cells.delete(c.id);
    expect(checks(lostCell)).toContain('cell ids');

    const dangling = copy();
    const fr = dangling.snaps[withCell].stack.find((x) => x.cells.length)!;
    fr.cells[0] = { ...fr.cells[0], val: { k: 'ptr', to: 987654, label: null } } as never;
    expect(checks(dangling)).toContain('pointers');

    const ret = good.evs.findIndex((e) => e.k === 'ret');
    const noPop = copy();
    noPop.snaps[ret + 1] = noPop.snaps[ret];
    expect(checks(noPop)).toContain('returns');
  });

  it("an engine's own failure names its stage", () => {
    // a converter bug, simulated: a stop gdb could never send
    const m = parse('int\tmain(void)\n{\n\treturn (0);\n}\n');
    let err: unknown = null;
    try {
      convertGdb({ ok: true, stops: [{ line: 3, frames: [{ fn: 'main', id: 1, locals: null }] }, null] } as never, m, '');
    } catch (e) {
      err = e;
    }
    expect(err, 'a malformed stop throws').toBeTruthy();
    expect((err as Error).name).toBe('EngineError');
    expect((err as Error).message).toMatch(/^gdb engine, (setup|stops \(at stop \d+\)|finish): /);
  });
});

