// Test cases (docs/OBJECTIVES.md, nice to have 3): runs of the same program
// with their own stdin, arguments and -D flags, and (optionally) the output
// they should print. Each is traced under gdb like any run; judge() says
// pass, fail (the first byte that differs, both ways), crashed or cut short.
// A project keeps them in .blueprint42/run.json (saved with the Save dialog);
// a single file, per sample in this browser.

export interface TestCase {
  name: string;
  stdin: string;
  args: string[];
  defines: string[];
  expect?: string; // the output it should print (stdout); absent: only that it runs to an exit
}

export interface RunOutcome {
  stdout?: string; // what reached stdout (and stderr, the terminal shows both)
  exit?: number | null;
  signal?: string | null;
  truncated?: boolean;
  error?: string | null; // couldn't build or run (compile errors, gdb missing)
}

export interface Verdict {
  status: 'pass' | 'fail' | 'crash' | 'cut' | 'error' | 'ran';
  detail: string;
  at?: number; // fail: the first byte that differs
}

const show = (s: string | undefined) => (s === undefined ? 'nothing' : JSON.stringify(s).slice(1, -1).replace(/\\"/g, '"'));
const around = (s: string, i: number) => show(s.slice(Math.max(0, i - 8), i + 8));

export function firstDiff(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

export function judge(c: TestCase, r: RunOutcome): Verdict {
  if (r.error) return { status: 'error', detail: r.error };
  if (r.signal) return { status: 'crash', detail: `crashed: ${r.signal}` };
  if (r.truncated) return { status: 'cut', detail: 'cut short: the trace stopped before the end (a step or time limit), so the output isn\'t all there' };
  const out = r.stdout ?? '';
  if (c.expect === undefined) return { status: 'ran', detail: `exited with ${r.exit ?? '?'}, printed ${out.length} bytes (no expected output to compare)` };
  const i = firstDiff(c.expect, out);
  if (i < 0) return { status: 'pass', detail: `printed the ${out.length} bytes expected${r.exit ? `, exited with ${r.exit}` : ''}` };
  if (i >= out.length) return { status: 'fail', at: i, detail: `the output stops at byte ${i}; expected more: "${around(c.expect, i)}"` };
  if (i >= c.expect.length) return { status: 'fail', at: i, detail: `extra output from byte ${i}: "${around(out, i)}"` };
  return { status: 'fail', at: i, detail: `byte ${i} differs: expected "${around(c.expect, i)}", got "${around(out, i)}"` };
}

// cases from a file (run.json) or the browser: only what makes sense, bounded
export function sanitizeCases(v: unknown): TestCase[] {
  if (!Array.isArray(v)) return [];
  const DEF = /^[A-Za-z_]\w*(=.*)?$/;
  return v.slice(0, 50).flatMap((x): TestCase[] => {
    if (!x || typeof x !== 'object') return [];
    const o = x as Record<string, unknown>;
    const strs = (a: unknown) => (Array.isArray(a) ? a.filter((s): s is string => typeof s === 'string').slice(0, 32) : []);
    return [{
      name: typeof o.name === 'string' && o.name ? o.name.slice(0, 60) : 'case',
      stdin: typeof o.stdin === 'string' ? o.stdin.slice(0, 100_000) : '',
      args: strs(o.args),
      defines: strs(o.defines).filter((d) => DEF.test(d)),
      ...(typeof o.expect === 'string' ? { expect: o.expect.slice(0, 100_000) } : {}),
    }];
  });
}
