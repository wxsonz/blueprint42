// Long work in slices: a generator that yields now and then runs until a
// slice's time is up, then the page gets its turn (a frame, the mouse), then
// it goes on. What a window of 20,000 gdb steps takes to become a trace is
// most of a second; done this way, the page never stops for it.

const SLICE_MS = 8;

// a turn for the page: the browser's own yield where it has one, else a task
// (a message, not a timer: timers wait at least 4 ms once nested)
const nextTask = (): Promise<void> => {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();
  return new Promise((res) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      res();
    };
    ch.port2.postMessage(null);
  });
};

// Run `steps` to its end, a slice at a time; its result.
export async function inSlices<T>(steps: Generator<void, T, void>, sliceMs = SLICE_MS): Promise<T> {
  let t0 = performance.now();
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
    if (performance.now() - t0 >= sliceMs) {
      await nextTask();
      t0 = performance.now();
    }
  }
}

// Run `steps` to its end now (for callers that want the result at once).
export function allAtOnce<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

// JSON in slices: a long window's answer is megabytes, and JSON.parse takes
// it in one go. The one big array in it (`big`, a window's stops) is cut at
// its own commas and parsed a piece at a time; the rest is parsed as it is.
// The same value as JSON.parse(text); text that isn't an object with that
// array at its top goes to JSON.parse whole.
export function* jsonSteps(text: string, big: string): Generator<void, unknown, void> {
  const at = (i: number) => text.charCodeAt(i);
  const space = (i: number) => {
    while (i < text.length && (at(i) === 32 || at(i) === 10 || at(i) === 13 || at(i) === 9)) i++;
    return i;
  };
  // past the string that starts at i (its opening quote)
  const string = (i: number) => {
    for (i++; i < text.length; i++) {
      const c = at(i);
      if (c === 92) i++; // a backslash: the next character is part of it
      else if (c === 34) return i + 1;
    }
    return text.length;
  };
  // past the value that starts at i
  const value = (i: number) => {
    const c = at(i);
    if (c === 34) return string(i);
    if (c !== 123 && c !== 91) {
      while (i < text.length && ![44, 125, 93, 32, 10, 13, 9].includes(at(i))) i++;
      return i;
    }
    let depth = 0;
    while (i < text.length) {
      const d = at(i);
      if (d === 34) {
        i = string(i);
        continue;
      }
      if (d === 123 || d === 91) depth++;
      else if (d === 125 || d === 93) {
        depth--;
        if (depth === 0) return i + 1;
      }
      i++;
    }
    return i;
  };
  let i = space(0);
  if (at(i) !== 123) return JSON.parse(text);
  const key = JSON.stringify(big);
  for (i = space(i + 1); i < text.length && at(i) === 34;) {
    const k0 = i;
    const k1 = string(i);
    i = space(k1);
    if (at(i) !== 58) break; // ':'
    i = space(i + 1);
    if (text.slice(k0, k1) === key && at(i) === 91) {
      // the big array: its items, a piece at a time
      const items: unknown[] = [];
      const open = i;
      let j = space(i + 1);
      let from = j;
      let n = 0;
      while (j < text.length && at(j) !== 93) {
        const end = value(j); // (past this item)
        j = space(end);
        if (at(j) === 44) j = space(j + 1); // ','
        if (++n === 256 || at(j) === 93) {
          for (const x of JSON.parse(`[${text.slice(from, end)}]`) as unknown[]) items.push(x);
          from = j;
          n = 0;
          yield;
        }
      }
      const rest = JSON.parse(`${text.slice(0, open)}[]${text.slice(j + 1)}`) as Record<string, unknown>;
      rest[big] = items;
      return rest;
    }
    i = space(value(i));
    if (at(i) !== 44) break;
    i = space(i + 1);
  }
  return JSON.parse(text);
}
