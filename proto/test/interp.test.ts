import { beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/interp';
import { parse } from '../src/parse';
import { model, setupParser } from './helpers';

beforeAll(setupParser);

const exitOf = (src: string) => {
  const t = run(parse(src));
  return t.exit?.k === 'int' ? t.exit.v : t.exit;
};

describe('interpreter', () => {
  it('runs the pointer sample: a goes 3 → 4 through the pointer, exit 6', () => {
    const t = run(model('pointer'));
    expect(t.error).toBeNull();
    expect(t.exit).toEqual({ k: 'int', v: 6 });
    const viaWrite = t.evs.find((e) => e.k === 'write' && e.via !== null);
    expect(viaWrite).toBeDefined();
    const a = [...t.cells].find(([, c]) => c.owner === 'main' && c.name === 'a')![0];
    expect(viaWrite!.k === 'write' && viaWrite!.cell).toBe(a);
  });

  it('runs swap, counter and recursion', () => {
    expect(run(model('swap')).exit).toEqual({ k: 'int', v: 2 }); // x=5, y=3 after the swap
    expect(run(model('counter')).exit).toEqual({ k: 'int', v: 3 });
    const fact = run(model('recursion'));
    expect(fact.exit).toEqual({ k: 'int', v: 24 });
    expect(Math.max(...fact.snaps.map((s) => s.stack.length))).toBe(5); // main + fact ×4
  });

  it('keeps one snapshot before every event and one after the last', () => {
    const t = run(model('pointer'));
    expect(t.snaps.length).toBe(t.evs.length + 1);
    expect(t.snaps[0].stack.length).toBe(0);
    const firstCall = t.evs[0];
    expect(firstCall.k).toBe('call');
    expect(t.snaps[1].stack.length).toBe(1);
  });

  it('stops honestly on uninitialised reads and forbidden constructs', () => {
    const uninit = run(parse('int\tmain(void)\n{\n\tint\tx;\n\n\treturn (x);\n}\n'));
    expect(uninit.error?.msg).toMatch(/read before it was ever set/);
    const forLoop = run(parse('int\tmain(void)\n{\n\tint\ti;\n\n\tfor (i = 0; i < 3; i++)\n\t\t;\n\treturn (i);\n}\n'));
    expect(forLoop.error?.msg).toMatch(/Norminette forbids for/);
  });

  it('refuses external calls instead of inventing values', () => {
    const t = run(model('gnl'));
    expect(t.error?.msg).toMatch(/no main\(\)|external|isn't defined/);
  });

  it('does integer arithmetic like C', () => {
    expect(exitOf('int\tmain(void)\n{\n\treturn (-7 / 2);\n}\n')).toBe(-3);
    expect(exitOf('int\tmain(void)\n{\n\treturn (-7 % 3);\n}\n')).toBe(-1);
  });
});
