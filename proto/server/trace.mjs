// The trace server (SPEC §3, M3): compile the sandbox buffer with the 42
// flags in a throwaway directory and step it under gdb (tracer.py).
// M5: or a whole project, sent as its current buffers (saved or not), built
// with its own Makefile when it has one. Nothing here touches the author's
// folder; see project.mjs for that.
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { META, listDir, openProject, pollProject, safeRel, saveFiles, wanted } from './project.mjs';

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
// the 42 flags. `.ft_blueprint/main.c` is the author's driver, if sent.
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

export async function handleTrace(req) {
  const { src, project, files = {}, defines = [], stdin = '', args = [], fns = [], bindings = [], maxSteps = 20000, maxSeconds = 20 } = req ?? {};
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
      if (!b.ok) return b;
      prog = b.prog;
      flags = b.flags;
    } else {
      await writeFile(join(dir, SRC), src);
      for (const [n, text] of Object.entries(files)) await writeFile(join(dir, n), String(text));
      flags = [...FLAGS, ...defines.map((d) => `-D${d}`)];
      const cc = await run('cc', [...flags, SRC, '-o', 'prog'], { cwd: dir, timeout: 20000 });
      if (cc.code !== 0) {
        return { ok: false, compile: { flags, text: cc.err.slice(0, OUT_CAP), diagnostics: parseDiagnostics(cc.err) } };
      }
    }
    await writeFile(join(dir, 'in.txt'), String(stdin));

    const cfg = {
      fns, bindings: bindings.filter((s) => s.binding), root: project ? join(dir, 'src') : dir, args,
      max_steps: Math.min(Math.max(1, Number(maxSteps) || 20000), 100000),
      max_seconds: Math.min(Math.max(1, Number(maxSeconds) || 20), 120),
      stdin: join(dir, 'in.txt'), stdout: join(dir, 'out.txt'), stderr: join(dir, 'err.txt'), out: join(dir, 'trace.json'),
    };
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
    const bindingScopes = Object.fromEntries(bindings.filter((s) => s.binding).map((s) => [s.id, { scope: s.binding.scope, fn: s.binding.fn, file: s.binding.file }]));
    return { ok: true, flags, ms: Date.now() - started, ...trace, bindingScopes, stdout: await read('out.txt'), stderr: await read('err.txt') };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

// Routes: POST /api/trace, and (M5) /api/fs/{initial,list,open,poll,save}.
// `initial` is the folder named on the command line (npm run dev -- <path>).
export function traceMiddleware(opts = {}) {
  const routes = {
    '/api/trace': (b) => handleTrace(b),
    '/api/fs/initial': async () => ({ ok: true, path: opts.initial ?? null }),
    '/api/fs/list': async (b) => ({ ok: true, ...(await listDir(b.dir)) }),
    '/api/fs/open': async (b) => ({ ok: true, ...(await openProject(b.dir)) }),
    '/api/fs/poll': async (b) => ({ ok: true, ...(await pollProject(b.root, b.known)) }),
    '/api/fs/save': async (b) => ({ ok: true, ...(await saveFiles(b.root, b.writes, !!b.force)) }),
  };
  return async (req, res, next) => {
    const route = routes[req.url];
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
