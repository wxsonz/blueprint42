// The trace server (SPEC §3, M3): compile the sandbox buffer with the 42
// flags in a throwaway directory and step it under gdb (tracer.py).
// M5: or a whole project, sent as its current buffers (saved or not), built
// with its own Makefile when it has one. Nothing here touches the author's
// folder; see project.mjs for that.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import { access, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { META, listDir, openProject, pollProject, safeRel, saveFiles, wanted } from './project.mjs';
import { livePush, liveStream } from './live.mjs';
import { replayPlayer } from './replay.mjs';

const TRACER = fileURLToPath(new URL('./tracer.py', import.meta.url));
const SRC = 'sandbox.c';
const OUT_CAP = 64 * 1024;
const FLAGS = ['-Wall', '-Wextra', '-Werror', '-g', '-O0'];
const MAKEFILES = ['Makefile', 'makefile', 'GNUmakefile'];

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => p.kill('SIGKILL'), opts.timeout ?? 30000);
    p.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, out, err });
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, signal: null, out, err: String(e) });
    });
  });
}

// gcc diagnostics → { file, line, col, severity, msg } (lines 0-based, like
// the editor). `paths` (a project's files) maps whatever path the compiler
// printed, e.g. relative to a sub-make's folder, back to a project path.
export function parseDiagnostics(text, dir = null, paths = null) {
  const out = [];
  for (const m of text.matchAll(/^([^\s:][^:\n]*):(\d+):(\d+): (error|warning|note): (.*)$/gm)) {
    let file = m[1];
    if (!paths) {
      if (file !== SRC) continue;
      file = '';
    } else {
      if (dir && file.startsWith(dir + sep)) file = relative(dir, file);
      file = file.replace(/^\.\//, '');
      if (!paths.includes(file)) {
        const hits = paths.filter((p) => p.endsWith('/' + file.split('/').pop()));
        if (hits.length === 1) file = hits[0];
      }
    }
    out.push({ file, line: Number(m[2]) - 1, col: Number(m[3]) - 1, severity: m[4], msg: m[5] });
  }
  return out;
}

const exists = (p) => access(p).then(() => true, () => false);

// Build a project copy. With a Makefile: `make` with CC carrying -g -O0 (the
// Makefile keeps its own CFLAGS, -Werror included), then its NAME is the
// program, or a library the driver links against. Without: cc every .c with
// the 42 flags. `.blueprint42/main.c` is the author's driver, if sent.
async function buildProject(dir, paths, defines) {
  const defs = defines.map((d) => `-D${d}`);
  const incs = [...new Set(paths.filter((p) => p.endsWith('.h')).map((p) => dirname(p)))].map((d) => `-I${d}`);
  const driver = paths.includes(`${META}/main.c`) ? `${META}/main.c` : null;
  const make = MAKEFILES.find((m) => paths.includes(m));
  const fail = (flags, r) => {
    const text = `${r.err}\n${r.out}`.trim();
    return { ok: false, compile: { flags, text: text.slice(0, OUT_CAP), diagnostics: parseDiagnostics(text, dir, paths) } };
  };
  if (make) {
    const cc = `cc -g -O0${defs.length ? ' ' + defs.join(' ') : ''}`;
    const flags = ['make', `CC=${cc}`];
    const r = await run('make', ['-C', dir, `CC=${cc}`], { cwd: dir, timeout: 120000 });
    if (r.code !== 0) return fail(flags, r);
    await writeFile(join(dir, '.ftb-print.mk'), 'ftb-print-%:\n\t@echo \'$($*)\'\n');
    const name = (await run('make', ['-s', '--no-print-directory', '-f', make, '-f', '.ftb-print.mk', 'ftb-print-NAME'], { cwd: dir, timeout: 20000 })).out.trim();
    if (!name) return { ok: false, error: `the ${make} has no NAME, so there is no program to run` };
    if (!/\.a$/.test(name)) {
      if (!(await exists(join(dir, name)))) return { ok: false, error: `make finished but did not produce ${name}` };
      return { ok: true, prog: name, flags };
    }
    if (!driver) return { ok: false, error: `${name} is a library: add ${META}/main.c with a main() that calls it` };
    const args = [...FLAGS, ...defs, ...incs, driver, name, '-o', 'ftb_prog'];
    const d = await run('cc', args, { cwd: dir, timeout: 30000 });
    if (d.code !== 0) return fail(['cc', ...args], d);
    return { ok: true, prog: 'ftb_prog', flags: [...flags, '+', 'cc', ...FLAGS, ...defs] };
  }
  const srcs = paths.filter((p) => p.endsWith('.c') && !p.startsWith(`${META}/`));
  if (driver) srcs.push(driver);
  if (!srcs.length) return { ok: false, error: 'no .c files to build' };
  const args = [...FLAGS, ...defs, ...incs, ...srcs, '-o', 'ftb_prog'];
  const r = await run('cc', args, { cwd: dir, timeout: 60000 });
  if (r.code !== 0) return fail(['cc', ...FLAGS, ...defs], r);
  return { ok: true, prog: 'ftb_prog', flags: ['cc', ...FLAGS, ...defs] };
}

const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.[ch]$/;
const DEFINE = /^[A-Za-z_]\w*(=[\w.+-]*)?$/;
const FN = /^[A-Za-z_]\w*$/;
const EXPR = /^[A-Za-z_]\w*(?:(?:\.|->)[A-Za-z_]\w*|\[(?:\d+|[A-Za-z_]\w*)\])*$/;
const ARG = (a) => typeof a === 'string' && a.length <= 400 && !a.includes('\0');
const KINDS = new Set(['strip', 'marker', 'chest', 'drill', 'copy', 'stack', 'train']);
const safeExpr = (e) => typeof e === 'string' && e.length <= 160 && EXPR.test(e.trim());
function validBinding(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id || s.id.length > 100 || !KINDS.has(s.kind)) return false;
  if (s.binding !== undefined) {
    const b = s.binding;
    if (!b || !['fn', 'global'].includes(b.scope) || !safeExpr(b.expr) || (b.scope === 'fn' && (typeof b.fn !== 'string' || !FN.test(b.fn)))) return false;
    if (b.file !== undefined && !safeRel(b.file)) return false;
  }
  if (s.lengthExpr !== undefined && !safeExpr(s.lengthExpr)) return false;
  return s.markers === undefined || (Array.isArray(s.markers) && s.markers.length <= 16 && s.markers.every((m) => m && safeExpr(m.expr) && typeof m.label === 'string' && m.label.length <= 40));
}

// Validate a request and build its program in a fresh temp dir: the part a
// one-shot trace and a session share. Returns { ok: false, … } or the dir
// and the tracer's config.
async function prepare(req) {
  const { src, project, files = {}, defines = [], stdin = '', args = [], fns = [], bindings = [], maxSteps = 20000, maxSeconds = 20, terminal = true, window = null, overview = false } = req ?? {};
  if (project !== undefined) {
    const pf = project?.files;
    if (!pf || typeof pf !== 'object' || Array.isArray(pf)) return { ok: false, error: 'bad request: project' };
    const paths = Object.keys(pf);
    if (!paths.length || paths.length > 800 || !paths.every((p) => safeRel(p) && wanted(p) && typeof pf[p] === 'string')) return { ok: false, error: 'bad request: project files' };
    if (paths.reduce((a, p) => a + pf[p].length, 0) > 16 << 20) return { ok: false, error: 'bad request: project too large' };
  } else if (typeof src !== 'string' || src.length > 200_000) return { ok: false, error: 'bad request: src' };
  if (!Array.isArray(args) || args.length > 32 || !args.every(ARG)) return { ok: false, error: 'bad request: args' };
  if (!Array.isArray(fns) || !fns.every((f) => typeof f === 'string' && FN.test(f))) return { ok: false, error: 'bad request: fns' };
  if (!Array.isArray(defines) || !defines.every((d) => typeof d === 'string' && DEFINE.test(d))) return { ok: false, error: 'bad request: defines' };
  if (!Array.isArray(bindings) || bindings.length > 500 || !bindings.every(validBinding) || new Set(bindings.map((s) => s.id)).size !== bindings.length) return { ok: false, error: 'bad request: bindings' };
  for (const n of Object.keys(files)) if (!NAME.test(n) || n === SRC) return { ok: false, error: `bad request: file ${n}` };

  const dir = await mkdtemp(join(tmpdir(), 'ftb-'));
  try {
    let prog = 'prog';
    let flags;
    if (project) {
      const src = join(dir, 'src');
      for (const [p, text] of Object.entries(project.files)) {
        await mkdir(dirname(join(src, p)), { recursive: true });
        await writeFile(join(src, p), text);
      }
      const b = await buildProject(src, Object.keys(project.files), defines);
      if (!b.ok) return (await rm(dir, { recursive: true, force: true }), b);
      prog = b.prog;
      flags = b.flags;
    } else {
      await writeFile(join(dir, SRC), src);
      for (const [n, text] of Object.entries(files)) await writeFile(join(dir, n), String(text));
      flags = [...FLAGS, ...defines.map((d) => `-D${d}`)];
      const cc = await run('cc', [...flags, SRC, '-o', 'prog'], { cwd: dir, timeout: 20000 });
      if (cc.code !== 0) {
        await rm(dir, { recursive: true, force: true });
        return { ok: false, compile: { flags, text: cc.err.slice(0, OUT_CAP), diagnostics: parseDiagnostics(cc.err) } };
      }
    }
    await writeFile(join(dir, 'in.txt'), String(stdin));

    const cfg = {
      fns, bindings: bindings.filter((s) => s.binding), root: project ? join(dir, 'src') : dir, args,
      max_steps: Math.min(Math.max(1, Number(maxSteps) || 20000), 100000),
      max_seconds: Math.min(Math.max(1, Number(maxSeconds) || 20), 120),
      stdin: join(dir, 'in.txt'), stdout: join(dir, 'out.txt'), stderr: join(dir, 'err.txt'), out: join(dir, 'trace.json'),
      terminal: terminal !== false, // stdout a terminal (line-buffered) or a pipe (fully buffered)
      // steps [from, to] of the run (stepped silently up to from), or an overview: the whole run, nothing recorded
      window: window && Number.isInteger(window.from) && window.from >= 0 ? { from: window.from, to: Number.isInteger(window.to) ? window.to : null } : null,
      overview: overview === true,
    };
    const bindingScopes = Object.fromEntries(bindings.filter((s) => s.binding).map((s) => [s.id, { scope: s.binding.scope, fn: s.binding.fn, file: s.binding.file }]));
    return { ok: true, dir, cfg, prog, flags, args, bindingScopes };
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
}

export async function handleTrace(req) {
  const p = await prepare(req);
  if (!p.ok) return p;
  const { dir, cfg, prog, flags, args, bindingScopes } = p;
  try {
    await writeFile(join(dir, 'cfg.json'), JSON.stringify(cfg));
    const started = Date.now();
    // The program runs from its project's folder, so relative paths it opens resolve there.
    const gdb = await run('gdb', ['-nx', '-batch', '-q', '-x', TRACER, `./${prog}`], {
      cwd: cfg.root,
      env: { ...process.env, FTB_CFG: join(dir, 'cfg.json'), DEBUGINFOD_URLS: '' },
      timeout: (cfg.max_seconds + 15) * 1000,
    });
    let trace;
    try {
      trace = JSON.parse(await readFile(join(dir, 'trace.json'), 'utf8'));
    } catch {
      return { ok: false, error: `gdb produced no trace${gdb.signal ? ` (killed: ${gdb.signal})` : ''}`, gdb: gdb.err.slice(-4000) };
    }
    if (trace.error && (!trace.stops || trace.stops.length === 0)) return { ok: false, error: trace.error, gdb: gdb.err.slice(-4000) };
    const read = async (n) => (await readFile(join(dir, n), 'utf8').catch(() => '')).slice(0, OUT_CAP);
    return { ok: true, flags, ms: Date.now() - started, ...trace, bindingScopes, args, stdout: await read('out.txt'), stderr: await read('err.txt'), stdinText: String(req?.stdin ?? '').slice(0, OUT_CAP) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------------- sessions: one live run, windows of it on request ----------------
// The page opens a session per program; the tracer keeps gdb and the stopped
// program alive (with savepoints, see tracer.py's serve mode) and answers
// window requests. Commands and replies go through two named pipes in the
// session's temp dir. Idle sessions are closed; at most SESSION_MAX live.
const sessions = new Map();
const SESSION_IDLE_MS = 10 * 60 * 1000;
const SESSION_MAX = 4;

async function mkfifo(path) {
  const r = await run('mkfifo', ['-m', '600', path], { timeout: 5000 });
  if (r.code !== 0) throw new Error(`mkfifo: ${r.err}`);
}

// Write to a named pipe without ever blocking a worker thread on open: a
// pipe with no reader yet fails with ENXIO, so retry until the reader is
// there, the session dies, or the time runs out.
async function writeFifo(path, text, sess, ms = 10000) {
  const until = Date.now() + ms;
  for (;;) {
    let fh;
    try {
      fh = await open(path, fsc.O_WRONLY | fsc.O_NONBLOCK);
    } catch (e) {
      if (e.code !== 'ENXIO' || (sess && sess.dead) || Date.now() > until) return false;
      await new Promise((r) => setTimeout(r, 15));
      continue;
    }
    try {
      await fh.write(text);
      return true;
    } finally {
      await fh.close();
    }
  }
}

// A reply from the tracer, or '' if gdb went away (its exit unblocks the read).
async function reply(sess) {
  return (await readFile(sess.resp, 'utf8').catch(() => '')).trim();
}

function ask(sess, cmd) {
  const job = sess.queue.then(async () => {
    if (sess.dead) return '';
    if (!(await writeFifo(sess.cmd, JSON.stringify(cmd) + '\n', sess))) return '';
    return reply(sess);
  });
  sess.queue = job.catch(() => '');
  sess.last = Date.now();
  return job;
}

async function closeSession(id) {
  const sess = sessions.get(id);
  if (!sess) return;
  sessions.delete(id);
  if (!sess.dead) {
    await writeFifo(sess.cmd, JSON.stringify({ cmd: 'quit' }) + '\n', sess, 1000);
    setTimeout(() => sess.proc.kill('SIGKILL'), 2000).unref();
  }
  setTimeout(() => rm(sess.dir, { recursive: true, force: true }).catch(() => {}), 3000).unref();
}

setInterval(() => {
  for (const [id, sess] of sessions) if (Date.now() - sess.last > SESSION_IDLE_MS) void closeSession(id);
}, 60000).unref();
process.on('exit', () => {
  for (const sess of sessions.values()) sess.proc.kill('SIGKILL');
});

export async function openSession(req) {
  const p = await prepare(req);
  if (!p.ok) return p;
  const { dir, cfg, prog, flags, args, bindingScopes } = p;
  while (sessions.size >= SESSION_MAX) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].last - b[1].last)[0][0];
    await closeSession(oldest);
  }
  const sess = { id: randomUUID(), dir, cmd: join(dir, 'cmd.fifo'), resp: join(dir, 'resp.fifo'), queue: Promise.resolve(''), last: Date.now(), dead: false, flags, args, bindingScopes, n: 0 };
  await mkfifo(sess.cmd);
  await mkfifo(sess.resp);
  cfg.serve = { cmd: sess.cmd, resp: sess.resp };
  cfg.max_seconds = 120;
  await writeFile(join(dir, 'cfg.json'), JSON.stringify(cfg));
  sess.proc = spawn('gdb', ['-nx', '-batch', '-q', '-x', TRACER, `./${prog}`], {
    cwd: cfg.root,
    env: { ...process.env, FTB_CFG: join(dir, 'cfg.json'), DEBUGINFOD_URLS: '' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  sess.err = '';
  sess.proc.stderr.on('data', (d) => (sess.err = (sess.err + d).slice(-4000)));
  sess.proc.on('exit', () => {
    sess.dead = true;
    // unblock a read waiting for a reply that will never come
    void writeFifo(sess.resp, '', null, 200);
  });
  let ready;
  try {
    ready = JSON.parse((await reply(sess)) || '{}');
  } catch {
    ready = {};
  }
  if (!ready.ok) {
    sess.proc.kill('SIGKILL');
    await rm(dir, { recursive: true, force: true });
    return { ok: false, error: ready.error ?? 'gdb could not start the program', gdb: sess.err };
  }
  sessions.set(sess.id, sess);
  return { ok: true, id: sess.id, flags };
}

export async function sessionWindow(b) {
  const sess = sessions.get(b?.id);
  if (!sess) return { ok: false, error: 'no such session (it closed; open it again)', gone: true };
  const from = Math.max(0, Number(b.from) || 0);
  const to = Number.isInteger(b.to) ? b.to : null;
  const out = join(sess.dir, `w${sess.n++}.json`);
  const started = Date.now();
  const r = await ask(sess, { cmd: 'window', from, to, maxSteps: Math.min(Math.max(1, Number(b.maxSteps) || 20000), 100000), maxSeconds: Math.min(Math.max(1, Number(b.maxSeconds) || 20), 120), out });
  if (r !== 'ok') return { ok: false, error: r ? (JSON.parse(r).error ?? r) : 'gdb went away', gdb: sess.err, gone: sess.dead };
  const text = await readFile(out, 'utf8');
  await rm(out, { force: true });
  const trace = JSON.parse(text);
  if (trace.error && !trace.stops?.length) return { ok: false, error: trace.error };
  return { ok: true, ms: Date.now() - started, bytes: text.length, flags: sess.flags, args: sess.args, bindingScopes: sess.bindingScopes, ...trace };
}

export async function sessionStats(b) {
  const sess = sessions.get(b?.id);
  if (!sess) return { ok: false, gone: true };
  const r = await ask(sess, { cmd: 'stats' });
  return r ? { ok: true, ...JSON.parse(r) } : { ok: false, gone: sess.dead };
}

// Only same-origin requests with our header get through: a page on another
// site cannot set a custom header without a CORS preflight, which is never
// answered here. The Host check stops DNS rebinding.
function allowed(req) {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  const origin = req.headers.origin;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  return req.method === 'POST' && req.headers['x-ftb'] === '1' && local && (!origin || new URL(origin).hostname === host.replace(/^\[|\]$/g, ''));
}

// Routes: POST /api/trace, (M5) /api/fs/{initial,list,open,poll,save}, and
// (M6) /api/live/{push,stream} for edits from any editor (server/live.mjs).
// `initial` is the folder named on the command line (npm run dev -- <path>).
export function traceMiddleware(opts = {}) {
  const routes = {
    '/api/trace': (b) => handleTrace(b),
    '/api/trace/open': (b) => openSession(b),
    '/api/trace/window': (b) => sessionWindow(b),
    '/api/trace/stats': (b) => sessionStats(b),
    '/api/trace/close': async (b) => (await closeSession(b?.id), { ok: true }),
    '/api/fs/initial': async () => ({ ok: true, path: opts.initial ?? null }),
    '/api/fs/list': async (b) => ({ ok: true, ...(await listDir(b.dir)) }),
    '/api/fs/open': async (b) => ({ ok: true, ...(await openProject(b.dir)) }),
    '/api/fs/poll': async (b) => ({ ok: true, ...(await pollProject(b.root, b.known)) }),
    '/api/fs/save': async (b) => ({ ok: true, ...(await saveFiles(b.root, b.writes, !!b.force)) }),
    '/api/live/push': (b) => livePush(b),
    '/api/replay/player': () => replayPlayer(),
  };
  return async (req, res, next) => {
    const stream = req.url === '/api/live/stream';
    const route = stream ? liveStream : routes[req.url];
    if (!route) return next();
    if (!allowed(req)) {
      res.statusCode = 403;
      return res.end('forbidden');
    }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 24_000_000) {
        res.statusCode = 413;
        return res.end('too large');
      }
    }
    if (stream) {
      let b = {};
      try {
        b = JSON.parse(body || '{}');
      } catch { /* defaults */ }
      return void liveStream(b, req, res);
    }
    let result;
    try {
      result = await route(JSON.parse(body || '{}'));
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  };
}
