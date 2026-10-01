// M5: an open project in the page — its files (as the editor has them and as
// they are on disk), run settings, and the calls to the local file server.
// No DOM here; main.ts draws it. Nothing is ever written to disk from here
// except by save(), which main.ts calls only after the author confirmed.
import { sanitizeCases, type TestCase } from './cases';
import { sanitizeNotes, type Note } from './notes';
import type { EditorState } from '@codemirror/state';
import { parseProject, type Model } from './parse';

export const META = '.blueprint42'; // the tool's folder in a project (read from .ft_blueprint/ before the rename)
export const RUN_JSON = `${META}/run.json`;
export const BP_JSON = `${META}/blueprint.json`;
export const DRIVER = `${META}/main.c`;

export interface PFile {
  path: string;
  text: string; // what the editor has
  disk: string | null; // what the file has on disk (null: not on disk yet)
  mtime: number | null; // disk version the page loaded; a save must match it
  state: EditorState | null; // editor state while it's not the active file
  conflict?: { text: string | null; mtime: number | null }; // changed on disk while edited here
}

export interface RunCfg {
  stdin: string;
  args: string[];
  defines: string[];
  cases?: TestCase[]; // test cases (src/cases.ts), saved with the rest
  notes?: Note[]; // notes on the timeline (src/notes.ts), for this run
}

export interface Project {
  root: string | null; // null: a bundled sample project (read-only)
  name: string;
  key: string; // for per-project browser storage
  files: Map<string, PFile>;
  active: string;
  tabs: string[];
  run: RunCfg;
  readOnly: boolean;
  truncated: boolean;
  driverIgnored: boolean; // .blueprint42/main.c set aside: the project has its own main
}

export const isSource = (p: string) => /\.[ch]$/.test(p);
export const isDirty = (f: PFile) => f.text !== f.disk;
const DEF = /^[A-Za-z_]\w*(=[\w.+-]*)?$/;

// ---------------- the local file server ----------------

export async function fsCall<T>(route: 'initial' | 'list' | 'open' | 'poll' | 'save', body: unknown): Promise<T | 'unavailable'> {
  let res: Response;
  try {
    res = await fetch(`/api/fs/${route}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ftb': '1' }, body: JSON.stringify(body) });
  } catch {
    return 'unavailable';
  }
  if (res.status === 404 || res.status === 405) return 'unavailable';
  if (!res.ok) throw new Error(`file server: HTTP ${res.status}`);
  const r = (await res.json()) as T & { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error ?? 'file server error');
  return r;
}

export interface Listing { dir: string; parent: string | null; dirs: string[]; project: boolean; home: string }
export interface Opened { root: string; name: string; files: { path: string; text: string; mtime: number }[]; truncated: boolean }

export function fromFiles(root: string | null, name: string, files: { path: string; text: string; mtime: number | null }[], truncated = false): Project {
  const map = new Map<string, PFile>();
  for (const f of files) map.set(f.path, { path: f.path, text: f.text, disk: f.text, mtime: f.mtime, state: null });
  const run = parseRun(map.get(RUN_JSON)?.text);
  const p: Project = { root, name, key: root ?? `sample:${name}`, files: map, active: '', tabs: [], run, readOnly: root === null, truncated, driverIgnored: false };
  return p;
}

// ---------------- the model ----------------

// The driver main in .blueprint42/ stands in for a program the project
// doesn't have (a library like libft or gnl). If the project has its own
// main, the driver is set aside rather than linked twice.
export function projectModel(p: Project): Model {
  const all = [...p.files.values()].filter((f) => isSource(f.path) && (!f.path.startsWith(`${META}/`) || f.path === DRIVER)).map((f) => ({ path: f.path, text: f.text }));
  let m = parseProject(all);
  p.driverIgnored = false;
  if (p.files.has(DRIVER) && m.fns.filter((f) => f.cname === 'main').length > 1) {
    m = parseProject(all.filter((f) => f.path !== DRIVER));
    p.driverIgnored = true;
  }
  return m;
}

// What the trace server builds: sources, headers and Makefiles as edited.
export function buildFiles(p: Project): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of p.files.values()) {
    if (f.path.startsWith(`${META}/`) && (f.path !== DRIVER || p.driverIgnored)) continue;
    out[f.path] = f.text;
  }
  return out;
}

// ---------------- run settings (.blueprint42/run.json) ----------------

export function parseRun(text: string | undefined): RunCfg {
  const run: RunCfg = { stdin: '', args: [], defines: [] };
  if (!text) return run;
  try {
    const j = JSON.parse(text) as Partial<RunCfg>;
    if (typeof j.stdin === 'string') run.stdin = j.stdin.slice(0, 100_000);
    if (Array.isArray(j.args)) run.args = j.args.filter((a): a is string => typeof a === 'string').slice(0, 32);
    if (Array.isArray(j.defines)) run.defines = j.defines.filter((d): d is string => typeof d === 'string' && DEF.test(d)).slice(0, 32);
    const cases = sanitizeCases(j.cases);
    if (cases.length) run.cases = cases;
    const notes = sanitizeNotes(j.notes);
    if (notes.length) run.notes = notes;
  } catch {
    /* a broken run.json keeps the defaults; the file itself stays as it is */
  }
  return run;
}

export const serializeRun = (run: RunCfg) => JSON.stringify(run, null, 2) + '\n';
export const runEmpty = (run: RunCfg) => !run.stdin && !run.args.length && !run.defines.length && !run.cases?.length && !run.notes?.length;

// "a 'b c' d" → ["a", "b c", "d"]: arguments the way a shell splits them.
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  for (const m of s.matchAll(re)) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2] ?? m[3]);
  return out;
}
export const joinArgs = (args: string[]) => args.map((a) => (/^[\w./=:,+-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`)).join(' ');

// ---------------- saving ----------------

export interface SaveResult {
  saved: { path: string; mtime: number }[];
  conflicts: { path: string; mtime: number | null; text: string | null }[];
}

export async function save(p: Project, paths: string[], force = false): Promise<SaveResult | 'unavailable'> {
  const writes = paths.map((path) => {
    const f = p.files.get(path)!;
    return { path, text: f.text, base: f.mtime };
  });
  const r = await fsCall<SaveResult>('save', { root: p.root, writes, force });
  if (r === 'unavailable') return r;
  for (const s of r.saved) {
    const f = p.files.get(s.path);
    if (!f) continue;
    f.disk = f.text;
    f.mtime = s.mtime;
    delete f.conflict;
  }
  return r;
}

// Line diff for the save dialog: counts plus a short unified view.
export function lineDiff(before: string, after: string, context = 2, maxLines = 60): { added: number; removed: number; text: string } {
  const a = before.split('\n');
  const b = after.split('\n');
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  // LCS on the changed middle (bounded; big rewrites fall back to remove-all/add-all)
  const ops: [' ' | '-' | '+', string][] = [];
  if (A.length * B.length <= 250_000) {
    const L = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) (ops.push([' ', A[i]]), i++, j++);
      else if (j < B.length && (i === A.length || L[i][j + 1] >= L[i + 1][j])) (ops.push(['+', B[j]]), j++);
      else (ops.push(['-', A[i]]), i++);
    }
  } else {
    for (const l of A) ops.push(['-', l]);
    for (const l of B) ops.push(['+', l]);
  }
  const added = ops.filter((o) => o[0] === '+').length;
  const removed = ops.filter((o) => o[0] === '-').length;
  const lines: string[] = [];
  const head = a.slice(Math.max(0, pre - context), pre).map((l) => `  ${l}`);
  lines.push(`@@ line ${Math.max(1, pre - context + 1)} @@`, ...head);
  let quiet = 0;
  for (const [k, l] of ops) {
    if (k === ' ') {
      if (++quiet > context * 2) continue;
    } else quiet = 0;
    lines.push(`${k} ${l}`);
  }
  lines.push(...a.slice(a.length - suf, a.length - suf + context).map((l) => `  ${l}`));
  const text = lines.length > maxLines ? [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more lines`].join('\n') : lines.join('\n');
  return { added, removed, text };
}

// Small stable hash, to tell whether a backup was made on top of the disk text we have now.
export function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}:${(h >>> 0).toString(36)}`;
}
