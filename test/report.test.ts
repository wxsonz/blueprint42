// The end report (docs/OBJECTIVES.md, nice to have 2), against the traces.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { parse } from '../src/parse';
import { endReport } from '../src/report';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);
async function gdb(key: string) {
  const s = sample(key);
  const m = parse(s.src);
  const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
  expect(r.ok, r.error ?? r.compile?.text).toBe(true);
  return { t: convertGdb(r, m, s.src), lines: s.src.split('\n') };
}

describe('the end report', () => {
  it('a lost block: leaked at exit, lost when leaky returned, malloc\'d where it was', async () => {
    const { t } = await gdb('lost');
    const rep = endReport(t);
    expect(rep.ended).toBe('exit');
    expect(rep.leaks.length).toBe(t.leaks!.length);
    const lost = rep.leaks.find((l) => l.lostAt !== null)!;
    expect(lost, 'the lost block').toBeTruthy();
    const ev = t.evs[lost.lostAt!];
    expect(ev.k === 'ret' && ev.fn).toBe('leaky');
    expect(lost.lostWhy).toMatch(/leaky returned/);
    expect(lost.site).toMatch(/^leaky:\d+$/);
    const alloc = t.evs[lost.allocAt!];
    expect(alloc.k === 'alloc' && alloc.cell).toBe(lost.cell);
    expect(alloc.k === 'alloc' && alloc.size).toBe(lost.size);
    expect(rep.bytes).toBe(rep.leaks.reduce((a, l) => a + l.size, 0));
  }, 60000);

  it('a crash: the signal, and the line it died on', async () => {
    const { t, lines } = await gdb('crash');
    const rep = endReport(t);
    expect(rep.ended).toBe('crash');
    expect(rep.crash!.msg).toMatch(/SIGSEGV/);
    // the line it died on is the last line the trace stopped at
    const lastStep = [...t.evs].reverse().find((e) => e.k === 'step')!;
    expect(rep.crash!.line).toBe(lastStep.line);
    expect(lines[rep.crash!.line].trim().length).toBeGreaterThan(0);
    expect(rep.leaks).toEqual([]); // a crashed run hasn't exited: nothing leaked yet
  }, 60000);

  it('a leak: every block the trace says leaked, with its size', async () => {
    const { t } = await gdb('leak');
    const rep = endReport(t);
    expect(rep.leaks.map((l) => [l.cell, l.size])).toEqual(t.leaks!.map((l) => [l.cell, l.size]));
    expect(rep.leaks.length).toBeGreaterThan(0);
  }, 60000);
});
