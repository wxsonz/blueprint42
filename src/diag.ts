// Diagnostics: what went wrong while drawing, kept for the diagnostics
// panel and `__ftb.diag()` (docs/OBJECTIVES.md, "easy to diagnose"). Each
// distinct failure is one entry with a count, so a hook that throws every
// frame is one line, not thousands.

export interface HookError {
  skin: string;
  hook: string;
  message: string;
  args: string; // a short summary of what the hook was given
  stack: string;
  count: number;
  first: number; // ms, performance.now()
  last: number;
}

const MAX = 100;
export const hookErrors = new Map<string, HookError>();
const listeners = new Set<(e: HookError) => void>();

export function onHookError(f: (e: HookError) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function reportHookError(skin: string, hook: string, err: unknown, args: unknown[]): HookError {
  const message = err instanceof Error ? err.message : String(err);
  const key = `${skin}|${hook}|${message}`;
  const now = typeof performance === 'undefined' ? 0 : performance.now();
  let e = hookErrors.get(key);
  if (e) (e.count++, (e.last = now));
  else {
    if (hookErrors.size >= MAX) hookErrors.delete(hookErrors.keys().next().value!);
    e = { skin, hook, message, args: summarize(args), stack: err instanceof Error ? err.stack ?? '' : '', count: 1, first: now, last: now };
    hookErrors.set(key, e);
    console.error(`[blueprint42] skin ${skin}: ${hook}() threw: ${message}\n  given: ${e.args}`, err);
  }
  for (const f of listeners) f(e);
  return e;
}

// what a hook was given, short enough for one line (the drawing context left out)
export function summarize(args: unknown[]): string {
  const one = (v: unknown, depth: number): string => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'number') return Number.isFinite(v) ? String(+v.toFixed(2)) : String(v);
    if (typeof v === 'string') return JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v);
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'function') return 'fn';
    if (Array.isArray(v)) return depth > 1 ? `[${v.length}]` : `[${v.slice(0, 4).map((x) => one(x, depth + 1)).join(', ')}${v.length > 4 ? `, …${v.length}` : ''}]`;
    if (typeof v === 'object') {
      if ('g' in (v as object) && 'z' in (v as object)) return 'dc';
      if (depth > 1) return '{…}';
      const ks = Object.keys(v as object);
      return `{${ks.slice(0, 8).map((k) => `${k}: ${one((v as Record<string, unknown>)[k], depth + 1)}`).join(', ')}${ks.length > 8 ? ', …' : ''}}`;
    }
    return typeof v;
  };
  return args.map((a) => one(a, 0)).join(', ');
}
