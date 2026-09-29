// A gdb session (server/trace.mjs, tracer.py serve mode): one live run of the
// program, looked at a window of steps at a time. The server keeps
// savepoints every 20,000 steps, so jumping anywhere it has been costs at
// most that many silent steps; the page keeps the last few windows it
// fetched. Everything here is also what the nerd stats show.
import { store } from './dom';
import type { GResult, GdbRequest, WindowStats } from './gdb';

export const WINDOW_DEFAULT = 20000;
const CACHE = 6; // windows kept in the page

export interface CachedWindow {
  from: number;
  to: number;
  result: GResult;
  bytes: number; // the response's JSON size
  ms: number; // round trip, as the page saw it
  stats: WindowStats | null;
  fetchedAt: number;
}

export interface SavepointInfo {
  at: number | null; // where the program is now
  total: number | null;
  savepoints: number[];
  every: number;
  kb: Record<string, number | null>; // each savepoint's real memory (PSS)
}

export const session = {
  id: null as string | null,
  key: '', // the request it was opened for: a new program opens a new session
  openedAt: 0,
  openMs: 0,
  windows: new Map<number, CachedWindow>(),
  bytesTotal: 0, // every window fetched this session, cached or not
  fetches: 0,
  info: null as SavepointInfo | null,
};

// Past this a window gets heavy for the page (every event keeps a snapshot):
// 50,000 steps of push_swap-1024 is already ~70,000 events.
export const WINDOW_MAX = 50000;

export function windowSize(): number {
  const n = Number(store.get('windowSteps'));
  return Number.isInteger(n) && n >= 1000 && n <= WINDOW_MAX ? n : WINDOW_DEFAULT;
}

// The window being fetched right now (a long one can take a minute or more:
// the banner counts the time so it never looks stuck).
export const loading = { from: -1, to: -1, since: 0, reached: -1 }; // reached: how far a long skip got so far
// the page redraws its banner when loading starts or moves on (set by main.ts)
export const onLoading = { fn: (): void => {} };

async function post<T>(route: string, body: unknown, signal?: AbortSignal): Promise<T | 'unavailable'> {
  let res: Response;
  try {
    res = await fetch(`/api/trace/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ftb': '1' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return 'unavailable';
  }
  if (res.status === 404 || res.status === 405) return 'unavailable';
  if (!res.ok) return { ok: false, error: `trace server: HTTP ${res.status}` } as T;
  return (await res.json()) as T;
}

export function closeSession(): void {
  if (session.id) void post('close', { id: session.id });
  session.id = null;
  session.key = '';
  session.windows.clear();
  session.bytesTotal = 0;
  session.fetches = 0;
  session.info = null;
}

// The window of steps [from, from + size] of the program `req` describes:
// from the page's cache, or the session (opened, or reopened, as needed).
export async function traceWindow(req: GdbRequest, from: number, signal?: AbortSignal): Promise<GResult | 'unavailable'> {
  const key = JSON.stringify(req);
  if (key !== session.key) closeSession();
  const hit = session.windows.get(from);
  if (hit) return hit.result;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session.id) {
      const t0 = performance.now();
      const o = await post<{ ok: boolean; id?: string; error?: string; compile?: GResult['compile'] }>('open', req, signal);
      if (o === 'unavailable') return 'unavailable';
      if (!o.ok || !o.id) return { ok: false, error: o.error, compile: o.compile };
      session.id = o.id;
      session.key = key;
      session.openedAt = Date.now();
      session.openMs = Math.round(performance.now() - t0);
    }
    const size = windowSize();
    const t0 = performance.now();
    Object.assign(loading, { from, to: from + size, since: Date.now(), reached: -1 });
    onLoading.fn();
    let r: (GResult & { bytes?: number; gone?: boolean }) | 'unavailable';
    try {
      for (;;) {
        r = await post<GResult & { bytes?: number; gone?: boolean }>('window', { id: session.id, from, to: from + size, maxSteps: size + 1, maxSeconds: 120 }, signal);
        // A far jump can take longer than one request's time: the tracer
        // stops partway with no steps recorded, leaving savepoints behind
        // it. Ask again: it goes on from the furthest one.
        if (r === 'unavailable' || !r.ok || r.stops?.length || !r.truncated || (r.window?.to ?? from) >= from) break;
        loading.reached = r.window!.to;
        onLoading.fn();
      }
    } finally {
      loading.since = 0;
    }
    if (r === 'unavailable') return 'unavailable';
    if (!r.ok && r.gone) {
      // the session closed (idle, or gdb went away): open a new one, once
      session.id = null;
      session.windows.clear();
      continue;
    }
    if (r.ok) {
      const w: CachedWindow = { from, to: r.window?.to ?? from, result: r, bytes: r.bytes ?? 0, ms: Math.round(performance.now() - t0), stats: r.stats ?? null, fetchedAt: Date.now() };
      session.windows.set(from, w);
      session.bytesTotal += w.bytes;
      session.fetches++;
      while (session.windows.size > CACHE) session.windows.delete(session.windows.keys().next().value!);
    }
    return r;
  }
  return { ok: false, error: 'the trace session could not be opened again' };
}

// The server's view: where the program is, its savepoints and their memory.
export async function refreshInfo(): Promise<SavepointInfo | null> {
  if (!session.id) return null;
  const r = await post<SavepointInfo & { ok: boolean }>('stats', { id: session.id });
  if (r === 'unavailable' || !r.ok) return null;
  session.info = r;
  return r;
}
