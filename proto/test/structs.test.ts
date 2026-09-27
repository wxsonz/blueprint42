// Real data on belts and struct fields in frames.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { folded, frameRows, invCells } from '../src/layout';
import { parse } from '../src/parse';
import { returnCard } from '../src/render';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('struct fields', () => {
  it('knows t_gnl *buf is a struct with four fields, before anything runs', () => {
    const m = parse(sample('gnl').src);
    const fill = m.byName.get('gnl_fill_line')!;
    const buf = fill.params.find((p) => p.name === 'buf')!;
    expect(buf.fields?.map((f) => f.name)).toEqual(['data', 'len', 'cap', 'pos']);
    // unfolded by default, one row per field under buf; folding gives the rows back
    const rows = frameRows(fill);
    const at = rows.findIndex((r) => r.name === 'buf');
    expect(rows[at].fold).toBe('open');
    expect(rows.slice(at + 1, at + 5).map((r) => [r.name, r.depth])).toEqual([['data', 1], ['len', 1], ['cap', 1], ['pos', 1]]);
    const open = invCells(fill);
    folded.add('gnl_fill_line.buf');
    expect(frameRows(fill).length).toBe(rows.length - 4);
    expect(invCells(fill)).toBeLessThanOrEqual(open);
    folded.clear();
    // plain ints and char * stay single rows; a pointer to a pointer is not unfolded
    expect(m.byName.get('get_next_line')!.params.find((p) => p.name === 'fd')!.fields).toBeUndefined();
  });

  it('a run carries the struct: crates on belts, live fields in frames, strings as text', async () => {
    const s = sample('gnl');
    const m = parse(s.src);
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files, maxSteps: 20000 });
    expect(r.ok, r.error ?? r.compile?.text).toBe(true);
    const t = convertGdb(r, m, s.src);
    // gnl_consume(buf, …) sends the whole t_gnl down the belt, not just "→bufs[0]"
    const call = t.evs.find((e) => e.k === 'call' && e.fn === 'gnl_consume')!;
    const arg = call.k === 'call' ? call.args.find((a) => a.name === 'buf')!.data : undefined;
    expect(arg?.k).toBe('struct');
    if (arg?.k !== 'struct') return;
    expect(arg.via).toBe('→bufs[0]');
    expect(arg.fields.map((f) => f.name)).toEqual(['data', 'len', 'cap', 'pos']);
    expect(arg.fields[0].text).toMatch(/^"hello\\n/); // data is shown as the text it holds
    // get_next_line returns the line itself
    const ret = t.evs.find((e) => e.k === 'ret' && e.fn === 'get_next_line')!;
    expect(ret.k === 'ret' && ret.data).toEqual({ k: 'str', text: '"hello\\n"' });
    // in the frame, buf's fields change over time while buf itself doesn't
    const lens = new Set<string>();
    for (const snap of t.snaps) {
      const f = snap.stack.find((x) => x.fn === 'gnl_fill_line');
      const len = f?.cells.find((c) => c.name === 'buf')?.fields?.find((x) => x.name === 'len');
      if (len?.val.k === 'int') lens.add(String(len.val.v));
    }
    expect(lens.size).toBeGreaterThan(2);
    // focus mode's return card: gnl_consume came in with pos 0 and hands back pos 6
    const ri = t.evs.findIndex((e) => e.k === 'ret' && e.fn === 'gnl_consume');
    const card = returnCard(t, ri)!;
    expect(card.caller).toBe('get_next_line');
    const pos = card.rows.find((r) => r.depth === 1 && r.name === 'pos')!;
    expect([pos.in, pos.out, pos.changed]).toEqual(['0', '6', true]);
    expect(card.rows.find((r) => r.name === 'cap')!.changed).toBe(false);
    expect(card.rows.find((r) => r.name === 'line_end')!.out).toBeUndefined(); // a copy, not an output
    expect(card.ret).toEqual([{ name: 'returns', depth: 0, in: '', out: 'void' }]);
  }, 60000);
});
