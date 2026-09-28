// M5.5: inside a machine. Stations from the code, and what the trace says
// about them: the running line, which way each switch went, loop counts.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { parseBlueprint } from '../src/blueprint';
import { interiorAt, planOf } from '../src/interior';
import { Layout } from '../src/layout';
import { run } from '../src/interp';
import { parse } from '../src/parse';
import { readoutOf } from '../src/render';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('inside a machine (M5.5)', () => {
  it('turns every statement into a station, conditions into switches', () => {
    const m = parse(sample('gnl').src);
    const p = planOf(m.byName.get('gnl_consume')!);
    expect(p.stations.map((s) => [s.kind, s.depth, s.text])).toEqual([
      ['do', 0, 'buf->pos = line_end;'],
      ['if', 0, 'if (buf->pos == buf->len)'],
      ['do', 1, 'buf->pos = 0;'],
      ['do', 1, 'buf->len = 0;'],
      ['do', 1, 'i = 0;'],
      ['loop', 1, 'while (i < sizeof(size_t))'],
      ['do', 2, "buf->data[i++] = '\\0';"],
      ['end', 0, '}'],
    ]);
    // into the if's branch and back out, into the loop's body; round the if; the loop's way back
    expect(p.tracks.filter((t) => t.kind === 'then').length).toBe(3);
    expect(p.tracks.filter((t) => t.kind === 'bypass').length).toBe(1);
    expect(p.tracks.filter((t) => t.kind === 'back').length).toBe(1);
  });

  it('M5.5 acceptance: gnl_consume reads 6 == 8 → false, and its zeroing loop runs 8 times (gdb)', async () => {
    const s = sample('gnl');
    const m = parse(s.src);
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, s.src);
    const fn = m.byName.get('gnl_consume')!;
    const p = planOf(fn);
    const sw = p.stations.findIndex((x) => x.kind === 'if');
    const loop = p.stations.findIndex((x) => x.kind === 'loop');
    const calls = t.evs.map((e, i) => [e, i] as const).filter(([e]) => e.k === 'call' && e.fn === 'gnl_consume');
    const endOf = (frame: number) => t.evs.findIndex((e) => e.k === 'ret' && e.frame === frame);

    // first call: pos 6, len 8, the switch goes the false way and the loop never runs
    const f1 = calls[0][0].frame!;
    const st1 = interiorAt(t, p, f1, endOf(f1));
    const d1 = st1.decided.get(sw)!.d;
    expect(d1.result).toBe(false);
    expect(readoutOf(p.stations[sw], t, t.snaps[d1.snap], f1, fn.name)).toBe('6 == 8');
    expect(st1.decided.has(loop)).toBe(false);
    expect(st1.visited.has(sw + 1)).toBe(false);

    // the call that empties the buffer: true, then the loop zeroes 8 bytes
    const full = calls.map(([e]) => e.frame!).find((f) => interiorAt(t, p, f, endOf(f)).decided.get(sw)?.d.result === true)!;
    const st3 = interiorAt(t, p, full, endOf(full));
    expect(st3.decided.get(loop)!.count).toBe(8);
    expect(st3.decided.get(loop)!.d.result).toBe(false); // it has finished
    expect(readoutOf(p.stations[loop], t, t.snaps[st3.decided.get(loop)!.d.snap], full, fn.name)).toBe('8 < sizeof(size_t)');

    // mid-loop: the token is on the loop's body, the count so far
    const mid = t.evs.findIndex((e, i) => i > calls.find(([e]) => e.frame === full)![1] && e.k === 'step' && e.frame === full && e.line === p.stations[loop + 1].line);
    const st4 = interiorAt(t, p, full, mid);
    expect(st4.current).toBe(loop + 1);
    expect(st4.decided.get(loop)!.count).toBe(1);
  }, 60000);

  it('takes switch results from the interpreter’s eval events', () => {
    const src = 'int\tf(int n)\n{\n\tint\ti;\n\n\ti = 0;\n\twhile (i < n)\n\t\ti = i + 1;\n\tif (i > 2)\n\t\treturn (1);\n\treturn (0);\n}\n\nint\tmain(void)\n{\n\treturn (f(3));\n}\n';
    const m = parse(src);
    const t = run(m);
    expect(t.engine).toBe('interp');
    const fn = m.byName.get('f')!;
    const p = planOf(fn);
    const frame = t.evs.find((e) => e.k === 'call' && e.fn === 'f')!.frame!;
    const end = t.evs.findIndex((e) => e.k === 'ret' && e.frame === frame);
    const st = interiorAt(t, p, frame, end);
    const loop = p.stations.findIndex((x) => x.kind === 'loop');
    const sw = p.stations.findIndex((x) => x.kind === 'if');
    expect(st.decided.get(loop)!.count).toBe(3);
    expect(st.decided.get(sw)!.d.result).toBe(true);
    expect(readoutOf(p.stations[sw], t, t.snaps[st.decided.get(sw)!.d.snap], frame, fn.name)).toBe('3 > 2');
    // the return inside the if was the last station reached
    expect(p.stations[st.current!].kind).toBe('ret');
    expect(p.stations[st.current!].line).toBe(8);
  });

  it('still reads a blueprint from M5.5 that has opened machines (now ignored)', () => {
    const bp = parseBlueprint({ version: 1, nodes: {}, waypoints: {}, sprites: [], opened: ['gnl_consume'] });
    expect(bp.opened).toEqual(['gnl_consume']);
    const l = new Layout();
    const m = parse(sample('gnl').src);
    l.reset();
    l.sync(m);
    const before = JSON.stringify([...l.nodes.values()].map((n) => n.place));
    l.applyBlueprint(bp, m, false);
    expect(JSON.stringify([...l.nodes.values()].map((n) => n.place))).toBe(before);
  });
});
