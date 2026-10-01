// "When did this change?" (docs/OBJECTIVES.md, nice to have 1).
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { parse } from '../src/parse';
import { changesOf, explainValue } from '../src/history';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('when did this change', () => {
  it("finds every change to main's list, each made by a `list = …` statement", async () => {
    const s = sample('list');
    const m = parse(s.src);
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name) });
    expect(r.ok, r.error).toBe(true);
    const t = convertGdb(r, m, s.src);
    const lines = s.src.split('\n');
    const ch = changesOf(t, { fn: 'main', name: 'list' });
    // list = NULL, then three pushes
    expect(ch.map((c) => lines[c.line].trim())).toEqual(['list = NULL;', 'list = push(list, 3);', 'list = push(list, 5);', 'list = push(list, 7);']);
    expect(ch[0].after).toBe('NULL');
    // each change is really there: the value before differs from the value after
    for (const c of ch) expect(c.before).not.toBe(c.after);
    // a parameter that's never assigned only arrives with each call: no changes
    expect(changesOf(t, { fn: 'push', name: 'head' })).toEqual([]);
  }, 60000);

  it('explains a value: unset garbage, set by a line, or a pointer into a freed block', async () => {
    const s = sample('list');
    const m = parse(s.src);
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name) });
    const t = convertGdb(r, m, s.src);
    const lines = s.src.split('\n');
    // at main's start: never set, garbage
    const mainCall = t.evs.findIndex((e) => e.k === 'call' && e.fn === 'main');
    const start = explainValue(t, mainCall + 1, 'main', 'list')!;
    expect(start.what).toBe('unset');
    expect(start.text).toMatch(/garbage/);
    // after the first push: set, by that line
    const first = changesOf(t, { fn: 'main', name: 'list' })[1];
    const set = explainValue(t, first.at + 1, 'main', 'list')!;
    expect(set.what).toBe('set');
    expect(lines[set.line!].trim()).toBe('list = push(list, 3);');
    // in clear, right after free(list): clear's list points at a freed block
    const free = t.evs.findIndex((e) => e.k === 'free');
    const freed = explainValue(t, free + 1, 'clear', 'list')!;
    expect(freed.what).toBe('freed');
    expect(freed.at).toBe(free);
    expect(freed.text).toMatch(/freed at step \d+ \(line \d+, in clear\)/);
    expect(freed.text).toMatch(/glibc/);
    // after clear returns, there's no clear running
    const ret = t.evs.findIndex((e) => e.k === 'ret' && e.fn === 'clear');
    expect(explainValue(t, ret + 1, 'clear', 'list')!.what).toBe('gone');
  }, 60000);
});

