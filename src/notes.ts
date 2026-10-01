// Notes on the timeline (docs/OBJECTIVES.md, nice to have 9): a sentence
// pinned to a step ("the bug starts here"). A note keeps where its step was
// (function and line), so when an edit or new input shifts the run, a note
// whose step is now somewhere else says so instead of pointing at the wrong
// moment. A project keeps them in .blueprint42/run.json (written with the
// Save dialog); a single file, in this browser.
import type { Trace } from './interp';
import { where } from './history';

export interface Note {
  at: number; // the event
  fn: string | null; // where that event was when the note was made
  line: number;
  text: string;
}

export const noteAt = (t: Trace, at: number, text: string): Note => {
  const w = where(t, at);
  return { at, fn: w.fn, line: w.line, text };
};

// is the note's step still where it was? (null: this run is too short for it)
export function noteHolds(t: Trace, n: Note): boolean | null {
  if (n.at >= t.evs.length) return null;
  const w = where(t, n.at);
  return w.fn === n.fn && w.line === n.line;
}

export function sanitizeNotes(v: unknown): Note[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 200).flatMap((x): Note[] => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    const at = Number(o.at), line = Number(o.line);
    if (!Number.isInteger(at) || at < 0 || !Number.isInteger(line) || typeof o.text !== 'string' || !o.text.trim()) return [];
    return [{ at, fn: typeof o.fn === 'string' ? o.fn.slice(0, 200) : null, line, text: o.text.slice(0, 500) }];
  }).sort((a, b) => a.at - b.at);
}
