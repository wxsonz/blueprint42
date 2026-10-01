// Notes on the timeline (docs/OBJECTIVES.md, nice to have 9).
import { beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/interp';
import { parse } from '../src/parse';
import { noteAt, noteHolds, sanitizeNotes } from '../src/notes';
import { parseRun, serializeRun } from '../src/workspace';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('notes on the timeline', () => {
  it("keeps where its step was, and says when an edit moved the run", () => {
    const s = sample('swap');
    const t = run(parse(s.src));
    const at = t.evs.findIndex((e) => e.k === 'call' && e.fn === 'swap');
    const n = noteAt(t, at, 'swap is called here');
    // (a call event is the new call's, on the line that calls it)
    expect([n.fn, s.src.split('\n')[n.line]]).toEqual(['swap', expect.stringContaining('swap(')]);
    expect(noteHolds(t, n)).toBe(true);
    // the same program with a line above: the step is the same event, the line isn't
    const moved = run(parse(`\n${s.src}`));
    expect(noteHolds(moved, n)).toBe(false);
    expect(noteHolds(t, { ...n, at: t.evs.length + 5 })).toBe(null);
  });
  it('round-trips through run.json, and drops what isn\'t a note', () => {
    const notes = [{ at: 4, fn: 'main', line: 7, text: 'here' }, { at: 1, fn: null, line: 2, text: 'first' }];
    const back = parseRun(serializeRun({ stdin: '', args: [], defines: [], notes: sanitizeNotes(notes) }));
    expect(back.notes).toEqual([notes[1], notes[0]]);
    expect(sanitizeNotes([{ at: -1, line: 0, text: 'x' }, { at: 1, line: 0, text: '  ' }, 'nope', { at: 2, line: 3, text: 'ok' }])).toEqual([{ at: 2, fn: null, line: 3, text: 'ok' }]);
  });
});
