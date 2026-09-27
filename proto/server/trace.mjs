// The trace server (SPEC §3, M3): compile the sandbox buffer with the 42
// flags in a throwaway directory and step it under gdb (tracer.py).
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TRACER = fileURLToPath(new URL('./tracer.py', import.meta.url));
const SRC = 'sandbox.c';
const OUT_CAP = 64 * 1024;

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

// gcc diagnostics → { line, col, severity, msg } (lines 0-based, like the editor)
export function parseDiagnostics(text) {
  const out = [];
  for (const m of text.matchAll(/^sandbox\.c:(\d+):(\d+): (error|warning|note): (.*)$/gm)) {
    out.push({ line: Number(m[1]) - 1, col: Number(m[2]) - 1, severity: m[3], msg: m[4] });
  }
  return out;
}

const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*\.[ch]$/;
const DEFINE = /^[A-Za-z_]\w*(=[\w.+-]*)?$/;
const FN = /^[A-Za-z_]\w*$/;

export async function handleTrace(req) {
  const { src, files = {}, defines = [], stdin = '', fns = [], maxSteps = 20000, maxSeconds = 20 } = req ?? {};
  if (typeof src !== 'string' || src.length > 200_000) return { ok: false, error: 'bad request: src' };
  if (!Array.isArray(fns) || !fns.every((f) => typeof f === 'string' && FN.test(f))) return { ok: false, error: 'bad request: fns' };
  if (!Array.isArray(defines) || !defines.every((d) => typeof d === 'string' && DEFINE.test(d))) return { ok: false, error: 'bad request: defines' };
  for (const n of Object.keys(files)) if (!NAME.test(n) || n === SRC) return { ok: false, error: `bad request: file ${n}` };

  const dir = await mkdtemp(join(tmpdir(), 'ftb-'));
  try {
    await writeFile(join(dir, SRC), src);
    for (const [n, text] of Object.entries(files)) await writeFile(join(dir, n), String(text));
    await writeFile(join(dir, 'in.txt'), String(stdin));

    const flags = ['-Wall', '-Wextra', '-Werror', '-g', '-O0', ...defines.map((d) => `-D${d}`)];
    const cc = await run('cc', [...flags, SRC, '-o', 'prog'], { cwd: dir, timeout: 20000 });
    if (cc.code !== 0) {
      return { ok: false, compile: { flags, text: cc.err.slice(0, OUT_CAP), diagnostics: parseDiagnostics(cc.err) } };
    }

    const cfg = {
      fns, src_name: SRC,
      max_steps: Math.min(Math.max(1, Number(maxSteps) || 20000), 100000),
      max_seconds: Math.min(Math.max(1, Number(maxSeconds) || 20), 120),
      stdin: 'in.txt', stdout: 'out.txt', stderr: 'err.txt', out: 'trace.json',
    };
    await writeFile(join(dir, 'cfg.json'), JSON.stringify(cfg));
    const started = Date.now();
    const gdb = await run('gdb', ['-nx', '-batch', '-q', '-x', TRACER, './prog'], {
      cwd: dir,
      env: { ...process.env, FTB_CFG: 'cfg.json', DEBUGINFOD_URLS: '' },
      timeout: (cfg.max_seconds + 15) * 1000,
    });
    let trace;
    try {
      trace = JSON.parse(await readFile(join(dir, 'trace.json'), 'utf8'));
    } catch {
      return { ok: false, error: `gdb produced no trace${gdb.signal ? ` (killed: ${gdb.signal})` : ''}`, gdb: gdb.err.slice(-4000) };
    }
    const read = async (n) => (await readFile(join(dir, n), 'utf8').catch(() => '')).slice(0, OUT_CAP);
    return { ok: true, flags, ms: Date.now() - started, ...trace, stdout: await read('out.txt'), stderr: await read('err.txt') };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Connect middleware for the Vite dev/preview servers. Only same-origin
// requests with our header get through: a page on another site cannot set
// a custom header without a CORS preflight, which is never answered here.
export function traceMiddleware() {
  return async (req, res, next) => {
    if (req.url !== '/api/trace') return next();
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    const origin = req.headers.origin;
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(host);
    if (req.method !== 'POST' || req.headers['x-ftb'] !== '1' || !local || (origin && new URL(origin).hostname !== host.replace(/^\[|\]$/g, ''))) {
      res.statusCode = 403;
      return res.end('forbidden');
    }
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1_000_000) {
        res.statusCode = 413;
        return res.end('too large');
      }
    }
    let result;
    try {
      result = await handleTrace(JSON.parse(body));
    } catch (e) {
      result = { ok: false, error: String(e) };
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  };
}
