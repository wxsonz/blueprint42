// Diagnostics: what went wrong while drawing, kept for the diagnostics
// panel and `__ftb.diag()` (docs/OBJECTIVES.md, "easy to diagnose"). Each
// distinct failure is one entry with a count, so a hook that throws every
// frame is one line, not thousands.

// the latest named state changes (src/state.ts hands them over: this file
// can't import it), attached to errors so a report says what led up to it
let recentActions: () => unknown[] = () => [];
export function setRecentActions(f: () => unknown[]): void {
  recentActions = f;
}

export interface HookError {
  skin: string;
  hook: string;
  message: string;
  args: string; // a short summary of what the hook was given
  stack: string;
  count: number;
  first: number; // ms, performance.now()
  last: number;
  actions: unknown[]; // the state changes before it first happened
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
    e = { skin, hook, message, args: summarize(args), stack: err instanceof Error ? err.stack ?? '' : '', count: 1, first: now, last: now, actions: recentActions() };
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

// ---- the frame profiler: off unless the diagnostics panel (or a tool) turns
// it on, so an ordinary frame pays one flag check per pass ----
export const prof = {
  on: false,
  frames: 0,
  since: 0, // ms, when counting began
  pass: new Map<string, number>(), // ms in each paint pass
  hook: new Map<string, { n: number; ms: number }>(), // "skin.hook": calls and ms
  ops: new Map<string, number>(), // canvas calls by kind, on the grid's context
};
// the text memos (src/skins/util.ts): counted always, they're a few increments a frame
export const memo = { fitHit: 0, fitMiss: 0, widthHit: 0, widthMiss: 0 };

export function profReset(): void {
  prof.frames = 0;
  prof.since = typeof performance === 'undefined' ? 0 : performance.now();
  prof.pass.clear();
  prof.hook.clear();
  prof.ops.clear();
  for (const k of Object.keys(memo) as (keyof typeof memo)[]) memo[k] = 0;
}

export function profPass(name: string, f: () => void): void {
  if (!prof.on) return f();
  const t = performance.now();
  try {
    f();
  } finally {
    prof.pass.set(name, (prof.pass.get(name) ?? 0) + performance.now() - t);
  }
}

export function profHook(key: string, ms: number): void {
  const e = prof.hook.get(key);
  if (e) (e.n++, (e.ms += ms));
  else prof.hook.set(key, { n: 1, ms });
}

// canvas calls by kind on one context, while the profiler is on (patched on,
// and off again: no cost when nobody is looking)
const COUNTED = ['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'measureText', 'drawImage', 'createLinearGradient', 'createRadialGradient', 'createPattern', 'getImageData', 'putImageData', 'clip', 'save', 'restore', 'setLineDash'] as const;
let counted: { g: CanvasRenderingContext2D; orig: Record<string, unknown> } | null = null;
export function countCalls(g: CanvasRenderingContext2D | null): void {
  if (counted) {
    for (const [k, v] of Object.entries(counted.orig)) (counted.g as unknown as Record<string, unknown>)[k] = v;
    counted = null;
  }
  if (!g) return;
  const orig: Record<string, unknown> = {};
  const G = g as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const k of COUNTED) {
    const f = G[k];
    if (typeof f !== 'function') continue;
    orig[k] = f; // what's there now (the guard's save/restore counters, or the context's own)
    G[k] = function (this: unknown, ...a: unknown[]) {
      const kind = k === 'fill' || k === 'stroke' || k === 'drawImage' || k === 'fillText' ? (g.shadowBlur > 0 ? `${k} (shadowed)` : typeof g.fillStyle === 'object' && (k === 'fill' || k === 'fillText') ? `${k} (gradient/pattern)` : k) : k;
      prof.ops.set(kind, (prof.ops.get(kind) ?? 0) + 1);
      return f.apply(this, a);
    };
  }
  counted = { g, orig };
}

// Checks a trace fails (src/validate.ts): where the data is wrong, before it's drawn.
export interface CheckFailure { check: string; detail: string; at: number | null; actions?: unknown[] }
export const checkFailures: CheckFailure[] = [];
export function reportCheck(f: CheckFailure): void {
  if (checkFailures.length >= 200) checkFailures.shift();
  checkFailures.push({ ...f, actions: recentActions() });
  console.warn(`[blueprint42] trace check "${f.check}" failed${f.at !== null ? ` at event ${f.at}` : ''}: ${f.detail}`);
}

// Everything above, per frame, for the panel and __ftb.diag().
export function diagReport(extra: Record<string, unknown> = {}) {
  const n = Math.max(1, prof.frames);
  const secs = Math.max(1e-3, ((typeof performance === 'undefined' ? 0 : performance.now()) - prof.since) / 1000);
  const perFrame = (m: Map<string, number>) => Object.fromEntries([...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / n).toFixed(3)]));
  const rate = (h: number, m: number) => (h + m ? `${Math.round((100 * h) / (h + m))}% of ${h + m}` : '—');
  return {
    profiling: prof.on,
    frames: prof.frames,
    fps: +(prof.frames / secs).toFixed(1),
    passMs: perFrame(prof.pass),
    hooks: [...prof.hook].sort((a, b) => b[1].ms - a[1].ms).slice(0, 15).map(([k, v]) => ({ hook: k, perFrame: +(v.n / n).toFixed(1), ms: +(v.ms / n).toFixed(3) })),
    canvasCalls: perFrame(prof.ops),
    memo: { fitText: rate(memo.fitHit, memo.fitMiss), widths: rate(memo.widthHit, memo.widthMiss) },
    errors: [...hookErrors.values()].map((e) => ({ where: `${e.skin}.${e.hook}`, message: e.message, count: e.count, given: e.args })),
    checks: checkFailures.slice(-20),
    actions: recentActions(),
    ...extra,
  };
}
