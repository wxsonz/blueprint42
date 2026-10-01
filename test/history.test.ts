// "When did this change?" (docs/OBJECTIVES.md, nice to have 1).
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import { parse } from '../src/parse';
import { changesOf } from '../src/history';
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
});
