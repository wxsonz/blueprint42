// The replay file's JSON (src/pack.ts): shapes, Maps and sharing survive.
import { beforeAll, describe, expect, it } from 'vitest';
import { pack, unpack } from '../src/pack';
import { run } from '../src/interp';
import { parse } from '../src/parse';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('pack', () => {
  it('keeps Maps, Sets, shared objects, cycles, undefined in arrays and odd numbers', () => {
    const shared = { a: 1 };
    const cyc: Record<string, unknown> = { name: 'c' };
    cyc.self = cyc;
    const x = { m: new Map([[1, shared], [2, shared]]), s: new Set(['x']), arr: [shared, undefined, NaN, -Infinity], cyc };
    const y = unpack(JSON.parse(JSON.stringify(pack(x)))) as typeof x;
    expect(y.m.get(1)).toEqual({ a: 1 });
    expect(y.m.get(1)).toBe(y.m.get(2));
    expect(y.arr[0]).toBe(y.m.get(1));
    expect([...y.s]).toEqual(['x']);
    expect(y.arr[1]).toBe(undefined);
    expect(Number.isNaN(y.arr[2])).toBe(true);
    expect(y.arr[3]).toBe(-Infinity);
    expect(y.cyc.self).toBe(y.cyc);
  });
  it('a trace comes back equal, with what it shared still shared', () => {
    const t = run(parse(sample('fib').src));
    const json = JSON.stringify(pack(t));
    const back = unpack(JSON.parse(json)) as typeof t;
    expect(back.evs).toEqual(t.evs);
    expect(back.snaps).toEqual(t.snaps);
    expect([...back.cells]).toEqual([...t.cells]);
    // what the engine shared between two snapshots is shared again
    const sharedIn = (tr: typeof t) => tr.snaps.slice(1).filter((s, i) => s.stack[0] && s.stack[0] === tr.snaps[i].stack[0]).length;
    expect(sharedIn(back)).toBe(sharedIn(t));
  });
});

describe('the replay file', () => {
  it('nothing in the code or the output can end its script tag', async () => {
    const { withReplay, makeReplay } = await import('../src/replay');
    const t = run(parse(sample('swap').src));
    const saved = { src: 'int main(void) { /* </script><script>alert(1)</script> */ return (0); }', places: [], waypoints: [] };
    const html = withReplay('<html><body><p>player</p></body></html>', makeReplay({ title: 'x.c', made: 'now', sample: 'swap', saved, skin: 'minimal', pos: 3 }, t));
    expect(html.match(/<\/script>/g)).toHaveLength(1); // only the replay's own
    const json = html.slice(html.indexOf('>', html.indexOf('id="b42-replay"')) + 1, html.lastIndexOf('</script>'));
    const back = JSON.parse(json) as { saved: { src: string }; trace: Parameters<typeof unpack>[0] };
    expect(back.saved.src).toBe(saved.src);
    expect((unpack(back.trace) as typeof t).evs).toEqual(t.evs);
    expect(html.indexOf('b42-replay')).toBeLessThan(html.indexOf('</body>'));
  });
});
