// Measures blueprint42 on the stress projects (stress/gen.mjs).
//
//   npm run dev                                   # in one terminal
//   node stress/gen.mjs 256 1024 --out /tmp/b42   # the projects (or pick them
//                                                 # from the page's Tests menu)
//   node stress/bench.mjs /tmp/b42/*/             # this
//
// Options: --url http://localhost:5173  --chromium /usr/bin/chromium
//          --no-page (tracer only)  --seconds 4 (playback measured per case)
//
// For each project folder it reports:
//   tracer  the trace server alone, at its own maximum (100k steps, 120 s):
//           time, stops, whether it ran out of steps or time, JSON size
//   page    the app as a student uses it (Open Folder, the page's limits):
//           trace time, events, truncated or not, then frames per second
//           while playing with everything fitted on screen, and JS heap
// Needs playwright-core (npm i -D playwright-core) and a Chromium. Headless
// Chromium draws without the GPU, so fps here is a floor, not a ceiling.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';

const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv.splice(i, 2)[1] : d;
};
const flag = (k) => {
  const i = argv.indexOf(k);
  return i >= 0 ? (argv.splice(i, 1), true) : false;
};
const URL_ = opt('--url', 'http://localhost:5173');
const CHROMIUM = opt('--chromium', '/usr/bin/chromium');
const SECONDS = Number(opt('--seconds', '4'));
const NO_PAGE = flag('--no-page');
const dirs = argv;
if (!dirs.length) {
  console.error('usage: node stress/bench.mjs <project folder>...');
  process.exit(2);
}

async function projectFiles(dir) {
  const files = {};
  for (const name of await readdir(dir)) {
    if (!/\.(c|h)$|^Makefile$/.test(name)) continue;
    if ((await stat(join(dir, name))).isFile()) files[name] = await readFile(join(dir, name), 'utf8');
  }
  return files;
}

// Function names from Norm-shaped definitions: a tab before the name.
function fnNames(files) {
  const names = new Set();
  for (const [name, text] of Object.entries(files)) {
    if (!name.endsWith('.c')) continue;
    for (const m of text.matchAll(/^[a-z_][\w ]*\t\**([A-Za-z_]\w*)\(/gm)) names.add(m[1]);
  }
  return [...names];
}

async function tracer(dir) {
  const files = await projectFiles(dir);
  const t0 = Date.now();
  const res = await fetch(`${URL_}/api/trace`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ftb': '1' },
    body: JSON.stringify({ project: { files }, fns: fnNames(files), maxSteps: 100000, maxSeconds: 120 }),
  });
  const text = await res.text();
  const ms = Date.now() - t0;
  let r;
  try {
    r = JSON.parse(text);
  } catch {
    return { ms, error: text.slice(0, 80) };
  }
  if (!r.ok) return { ms, error: (r.error ?? r.compile?.text ?? 'failed').slice(0, 80) };
  return { ms, stops: r.stops?.length ?? 0, truncated: !!r.truncated, mb: +(text.length / 1e6).toFixed(1) };
}

async function page(browser, dir) {
  const p = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  try {
    await p.goto(URL_, { waitUntil: 'load' });
    await p.waitForFunction(() => !!window.__ftb, null, { timeout: 20000 });
    const t0 = Date.now();
    await p.evaluate((d) => window.__ftb.openFolder(d), dir);
    await p.waitForFunction(() => ['done', 'error', 'unavailable'].includes(window.__ftb.S.gdb.status), null, { timeout: 180000, polling: 250 });
    const traceMs = Date.now() - t0;
    const info = await p.evaluate(() => {
      const { S } = window.__ftb;
      return { status: S.gdb.status, fns: S.model?.fns.length ?? 0, evs: S.trace?.evs.length ?? 0, truncated: !!S.trace?.truncated };
    });
    // everything on screen, then play: the worst case for drawing
    await p.evaluate(() => document.querySelector('[data-act="fit"], #btn-fit, button[title^="Fit"]')?.click());
    await p.evaluate(() => {
      const { S } = window.__ftb;
      S.pos = 0;
      S.playing = true;
    });
    const fps = await p.evaluate((secs) => new Promise((done) => {
      let frames = 0;
      let worst = 0;
      let last = performance.now();
      const start = last;
      const tick = (t) => {
        frames++;
        worst = Math.max(worst, t - last);
        last = t;
        if (t - start < secs * 1000) requestAnimationFrame(tick);
        else done({ fps: +(frames / ((t - start) / 1000)).toFixed(1), worstMs: Math.round(worst) });
      };
      requestAnimationFrame(tick);
    }), SECONDS);
    const heapMb = await p.evaluate(() => (performance.memory ? +(performance.memory.usedJSHeapSize / 1e6).toFixed(0) : null));
    return { traceMs, ...info, ...fps, heapMb, errors: errors.length };
  } catch (e) {
    return { error: String(e.message).split('\n')[0].slice(0, 80), errors: errors.length };
  } finally {
    await p.close();
  }
}

const rows = [];
let browser = null;
if (!NO_PAGE) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error('page measurements need playwright-core: npm i -D playwright-core (or pass --no-page)');
    process.exit(2);
  }
  browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
}
for (const dir of dirs) {
  const name = basename(dir.replace(/\/$/, ''));
  const t = await tracer(dir);
  const pg = browser ? await page(browser, dir) : null;
  const row = { name, tracer: t, page: pg };
  rows.push(row);
  console.log(JSON.stringify(row));
}
await browser?.close();

// a table to read
const cell = (v) => (v === undefined || v === null ? '—' : String(v));
console.log('\n| case | tracer ms | stops | out of budget | JSON MB | page trace ms | fns | events | truncated | fps | worst frame ms | heap MB |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const { name, tracer: t, page: p } of rows) {
  console.log(`| ${name} | ${t.error ? `error: ${t.error}` : cell(t.ms)} | ${cell(t.stops)} | ${cell(t.truncated)} | ${cell(t.mb)} | ${p?.error ? `error: ${p.error}` : cell(p?.traceMs)} | ${cell(p?.fns)} | ${cell(p?.evs)} | ${cell(p?.truncated)} | ${cell(p?.fps)} | ${cell(p?.worstMs)} | ${cell(p?.heapMb)} |`);
}
