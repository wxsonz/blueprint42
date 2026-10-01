// Guided tours (docs/OBJECTIVES.md, nice to have 13): the swap sample's tour
// of its pointers, each sentence checked against the run.
import { beforeAll, describe, expect, it } from 'vitest';
import { run, type Trace } from '../src/interp';
import { parse } from '../src/parse';
import { resolveTour } from '../src/tour';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

const frame = (t: Trace, at: number, fn: string) => [...t.snaps[at].stack].reverse().find((f) => f.fn === fn)!;
const cell = (t: Trace, at: number, fn: string, name: string) => frame(t, at, fn).cells.find((c) => c.name === name)!;
const int = (t: Trace, at: number, fn: string, name: string) => { const v = cell(t, at, fn, name).val; return v.k === 'int' ? v.v : v.k; };

describe('the swap tour', () => {
  it('reaches every stop, in order, each about to run its statement', () => {
    const s = sample('swap');
    const m = parse(s.src);
    const t = run(m);
    const { steps, missed } = resolveTour(t, m, s.src, s.tour!);
    expect(missed).toEqual([]);
    expect(steps.map((x) => x.text)).toEqual(s.tour!.map((x) => x.text));
    const lines = s.src.split('\n');
    steps.forEach((x, k) => expect(lines[t.evs[x.at].line]).toContain(s.tour![k].at));
    const [first, call, read, write, back, end] = steps.map((x) => x.at);
    // 1: nothing stored in x and y yet
    expect([int(t, first, 'main', 'x'), int(t, first, 'main', 'y')]).toEqual(['undef', 'undef']);
    // 2: about to call: swap isn't running yet
    expect(t.snaps[call].stack.some((f) => f.fn === 'swap')).toBe(false);
    // 3: a and b hold the addresses of main's x and y
    const a = cell(t, read, 'swap', 'a').val, b = cell(t, read, 'swap', 'b').val;
    expect([a.k === 'ptr' && a.to, b.k === 'ptr' && b.to]).toEqual([cell(t, read, 'main', 'x').id, cell(t, read, 'main', 'y').id]);
    expect(int(t, read, 'main', 'x')).toBe(3);
    // 4: tmp holds the 3; x still 3 and y 5 before the write
    expect([int(t, write, 'swap', 'tmp'), int(t, write, 'main', 'x'), int(t, write, 'main', 'y')]).toEqual([3, 3, 5]);
    // 5: x got the 5; a and b still the same addresses
    expect(int(t, back, 'main', 'x')).toBe(5);
    expect([cell(t, back, 'swap', 'a').val, cell(t, back, 'swap', 'b').val]).toEqual([a, b]);
    // 6: back in main: 5 and 3, swap's frame gone
    expect([int(t, end, 'main', 'x'), int(t, end, 'main', 'y')]).toEqual([5, 3]);
    expect(t.snaps[end].stack.some((f) => f.fn === 'swap')).toBe(false);
  });
  it('a stop the run never reaches is left out, and said', () => {
    const s = sample('swap');
    const m = parse(s.src);
    const r = resolveTour(run(m), m, s.src, [...s.tour!, { fn: 'main', at: 'never here', text: 'x' }]);
    expect(r.missed.map((x) => x.at)).toEqual(['never here']);
  });
});
