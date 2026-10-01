// Guided tours (docs/OBJECTIVES.md, nice to have 13): a sample can carry a
// list of stops, each a statement (its function and a piece of its line, not
// a line number, so it survives edits above it) and a sentence. A stop is
// the step where that statement is about to run (as a breakpoint pauses):
// playing the tour pauses there, frames that machine and shows the sentence.
// A stop the run never reaches is left out, and the tour says so.
import type { Trace } from './interp';
import type { Model } from './parse';

export interface TourStop {
  fn: string;
  at: string; // a piece of the statement's line, as written
  visit?: number; // which time it's reached (0: the first)
  text: string;
}

export interface TourStep { at: number; fn: string; line: number; text: string }

// each time `fn` reaches `line`: the first event of a run of events there in
// its frame (a call made on that line is the new frame's event, so the
// caller's is the frame under it; the interpreter has no step events, only
// writes, calls and returns)
function visits(t: Trace, fn: string, line: number): number[] {
  const out: number[] = [];
  let prev = false;
  t.evs.forEach((e, i) => {
    const stack = t.snaps[i].stack;
    const top = stack.at(-1);
    const own = e.k === 'call' ? top?.fn === fn : (t.snaps[i + 1].stack.find((f) => f.id === e.frame) ?? stack.find((f) => f.id === e.frame))?.fn === fn;
    const on = own && e.line === line;
    if (on && !prev) out.push(i);
    prev = on;
  });
  return out;
}

export function resolveTour(t: Trace, model: Model, src: string, stops: TourStop[]): { steps: TourStep[]; missed: TourStop[] } {
  const lines = src.split('\n');
  const steps: TourStep[] = [];
  const missed: TourStop[] = [];
  for (const s of stops) {
    const fn = model.byName.get(s.fn);
    let line = -1;
    if (fn) for (let i = fn.startLine; i <= fn.endLine && line < 0; i++) if (lines[i]?.includes(s.at)) line = i;
    const hit = line >= 0 ? visits(t, s.fn, line)[s.visit ?? 0] : undefined;
    if (hit === undefined) missed.push(s);
    else steps.push({ at: hit, fn: s.fn, line, text: s.text });
  }
  steps.sort((a, b) => a.at - b.at);
  return { steps, missed };
}
