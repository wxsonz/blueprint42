#!/usr/bin/env node
// How does the app's cost grow with the size of the program? Generates
// projects of a given size in the OS temp dir (files of 5 Norm-sized
// functions; each calls the next one, and one in the next file behind an `if`
// the run never takes), opens each in the app (headless Chromium) and
// measures where the app does the work:
//   code   parse (cold, one edit), layout sync, one scene build (collapsed,
//          every module open), the first frameState and the next one
//   frame  while playing, follow off, the whole grid on screen: the frame's
//          JS (the animation frame callback), draw's, scene builds and
//          sweeps of the node list per frame (who makes them: --callers),
//          ms per paint pass
//   gdb    one run of N steps of a long program: record time, bytes,
//          JSON.parse, convertGdb, timelineOf, the heap it takes
//   window the same program played the way the app does (windows of
//          --window steps): its first window, playing on into the next one
//          (already fetched ahead), and back to the first; for each, how
//          long it took and the main thread's long tasks (over 50 ms)
//
//   node tools/scale.mjs                         the working tree, every part
//   node tools/scale.mjs --b HEAD --sizes 10,50 --parts frame
//   options: --a <ref> (WORK)  --b <ref>  --sizes 5,25,50,100  --per 5
//            --parts code,frame,gdb,window  --steps 2000,5000,10000,20000
//            --window 20000  --seconds 3  --callers  --json
//
// Headless: times are JavaScript, in the engine the app runs in; paint isn't
// the author's (tools/bench.mjs measures that in a real window). The gdb part
// needs cc and gdb, as the trace server does.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './lib/serve.mjs';
import { launchChromium } from './lib/browser.mjs';

const opt = { a: 'WORK', b: '', sizes: '5,25,50,100', per: '5', parts: 'code,frame,gdb,window', steps: '2000,5000,10000,20000', window: '20000', seconds: '3', callers: '', json: '' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  if (!(k in opt)) { console.error(`unknown option --${k}`); process.exit(2); }
  opt[k] = k === 'json' || k === 'callers' ? '1' : process.argv[++i];
}
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const parts = new Set(list(opt.parts));
const sizes = list(opt.sizes).map(Number);
const per = Number(opt.per);

// ---- the generated projects ----
function project(files) {
  const total = files * per;
  const name = (k) => `ft_f${k}`;
  const out = [{ path: 'ft.h', text: `#ifndef FT_H\n# define FT_H\n\n${Array.from({ length: total }, (_, k) => `int\t${name(k)}(int a, int b);`).join('\n')}\n\n#endif\n` }];
  for (let f = 0; f < files; f++) {
    const fns = [];
    for (let j = 0; j < per; j++) {
      const k = f * per + j;
      const next = k + 1 < total ? `\tif (a < ${total})\n\t\tacc += ${name(k + 1)}(a + 1, b);\n` : '';
      const far = k + per + 1 < total ? `\tif (a < 0)\n\t\tacc += ${name(k + per + 1)}(a, b);\n` : '';
      fns.push(`int\t${name(k)}(int a, int b)\n{\n\tint\ti;\n\tint\tacc;\n\n\ti = 0;\n\tacc = a;\n\twhile (i < b)\n\t{\n\t\tacc += i;\n\t\ti++;\n\t}\n${next}${far}\treturn (acc % 100);\n}\n`);
    }
    out.push({ path: `src/file${f}.c`, text: `#include "../ft.h"\n\n${fns.join('\n')}` });
  }
  out.push({ path: 'main.c', text: '#include "ft.h"\n\nint\tmain(void)\n{\n\treturn (ft_f0(0, 1));\n}\n' });
  return out;
}
const tmp = mkdtempSync(join(tmpdir(), 'b42-scale-'));
const dirs = new Map();
for (const files of sizes) {
  const dir = join(tmp, `proj-${files}x${per}`);
  for (const f of project(files)) {
    mkdirSync(join(dir, f.path, '..'), { recursive: true });
    writeFileSync(join(dir, f.path), f.text);
  }
  dirs.set(files, dir);
}

// A program that runs until the step cap stops it: heap, a struct, an array, calls.
const LONG = `#include <stdlib.h>
#include <string.h>

typedef struct s_buf
{
\tchar\t*data;
\tsize_t\tlen;
\tsize_t\tcap;
}\tt_buf;

static int\tpush(t_buf *b, char c)
{
\tchar\t*next;

\tif (b->len + 1 >= b->cap)
\t{
\t\tnext = malloc(b->cap * 2);
\t\tif (!next)
\t\t\treturn (0);
\t\tmemcpy(next, b->data, b->len);
\t\tfree(b->data);
\t\tb->data = next;
\t\tb->cap *= 2;
\t}
\tb->data[b->len] = c;
\tb->len++;
\treturn (1);
}

static int\tsum(int *t, int n)
{
\tint\ti;
\tint\ts;

\ti = 0;
\ts = 0;
\twhile (i < n)
\t{
\t\ts += t[i];
\t\ti++;
\t}
\treturn (s);
}

int\tmain(void)
{
\tt_buf\tb;
\tint\t\tt[16];
\tint\t\ti;
\tint\t\ttotal;

\tb.cap = 8;
\tb.len = 0;
\tb.data = malloc(b.cap);
\ti = 0;
\ttotal = 0;
\twhile (i < 1000000)
\t{
\t\tt[i % 16] = i;
\t\tif (b.len > 200)
\t\t\tb.len = 0;
\t\tpush(&b, 'a' + i % 26);
\t\ttotal += sum(t, 16);
\t\ti++;
\t}
\tfree(b.data);
\treturn (total % 256);
}
`;

// ---- in the page ----
// (each runs as its own function in the page: everything it uses is inside it)

const CODE = async ({ texts }) => {
  const mod = async (n) => import(performance.getEntriesByType('resource').map((e) => e.name).find((x) => new URL(x).pathname === n) ?? n);
  const P = await mod('/src/parse.ts');
  const { Layout } = await mod('/src/layout.ts');
  const R = await mod('/src/route.ts');
  const F = await mod('/src/frame.ts');
  const T = (f, reps = 3) => { f(); const t0 = performance.now(); for (let i = 0; i < reps; i++) f(); return (performance.now() - t0) / reps; };
  let n = 0;
  const cold = T(() => { n++; P.parseProject(texts.map((s) => ({ ...s, text: `${s.text}\n/* ${n} */\n` }))); });
  const m = P.parseProject(texts);
  const edited = texts.map((s, i) => (i === 1 ? { ...s, text: `${s.text}\n` } : s));
  let flip = false;
  const edit = T(() => { flip = !flip; P.parseProject(flip ? edited : texts); }, 6);
  const model = P.parseProject(texts);
  const sync = T(() => new Layout().sync(model));
  const l = new Layout();
  l.sync(model);
  // a scene built for real each time (a version that keeps its scene is told the layout changed)
  const build = () => { l.touch?.(); return R.buildScene(l, model, null); };
  const collapsed = T(build, 5);
  for (const file of [...l.modules.keys()]) l.setCollapsed(file, false, model);
  const open = T(build, 3);
  const sc = R.buildScene(l, model, null);
  const s = { layout: l, model, trace: null, pos: 0, selected: null, hovered: null, editorFn: null, sprites: [] };
  l.touch?.();
  let t0 = performance.now();
  F.frameState(s);
  const fsFirst = performance.now() - t0;
  t0 = performance.now();
  F.frameState(s);
  const fsAgain = performance.now() - t0;
  return { fns: model.fns.length, cold, edit, sync, collapsed, open, fsFirst, fsAgain, hosts: sc.hosts.size, belts: sc.belts.length };
};

const FRAME = async ({ dir, total, open, seconds, callers }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mod = async (n) => import(performance.getEntriesByType('resource').map((e) => e.name).find((x) => new URL(x).pathname === n) ?? n);
  for (let i = 0; i < 300 && !window.__ftb?.openFolder; i++) await sleep(100);
  const f = window.__ftb;
  if (f.S.project?.root !== dir) {
    f.S.playing = false;
    if (!(await f.openFolder(dir))) return { error: `could not open ${dir}` };
  }
  for (let i = 0; i < 300 && !(f.S.project?.root === dir && f.S.model?.fns.length >= total); i++) await sleep(100);
  for (let i = 0; i < 1800 && !(f.S.trace?.evs.length && f.S.project?.root === dir); i++) await sleep(100);
  if (!f.S.trace?.evs.length) return { error: 'no trace (cc and gdb?)' };
  if (open) {
    const { toggleModule } = await mod('/src/main.ts');
    for (const [file, m] of [...f.layout.modules]) if (m.collapsed) toggleModule(file);
    await sleep(300);
  }
  (await mod('/src/playback.ts')).setAnimMode('fast');
  const R = await mod('/src/route.ts');
  f.S.follow = false;
  f.view.fit(f.S, true);
  f.S.pos = 0; f.S.speed = 0.5; f.S.playing = true;
  await sleep(600);
  const raf = window.requestAnimationFrame.bind(window);
  const forFrames = (ms) => new Promise((res) => { const t0 = performance.now(); const step = (now) => (now - t0 < ms ? raf(step) : res()); raf(step); });

  // 1. counts (instrumented: not timed): scene builds, sweeps of the node list and who makes them
  const nodes = f.layout.nodes;
  const values = nodes.values;
  let sweeps = 0, stackBuilds = 0;
  const by = new Map();
  nodes.values = function () {
    sweeps++;
    // each caller's name, or (an arrow function) its file and line
    const st = (new Error().stack ?? '').split('\n').slice(2).map((l) => { const m = l.trim().match(/^at (?:new )?([\w$.<>]+) \(/) ?? l.match(/\/src\/([\w/.-]+?)(?:\?[^:]*)?:(\d+)/); return m ? (m[2] ? `${m[1]}:${m[2]}` : m[1]) : '?'; });
    if (/^(buildScene|computeScene)$/.test(st[0])) stackBuilds++;
    if (callers) { const k = st.slice(0, 4).join(' < '); by.set(k, (by.get(k) ?? 0) + 1); }
    return values.call(nodes);
  };
  const draw = f.view.draw;
  let draws = 0;
  f.view.draw = function (...a) { draws++; return draw.apply(this, a); };
  const builds0 = R.sceneStats?.builds ?? 0;
  f.diag(true);
  await forFrames(1500);
  const rep = f.diag(false);
  const builds = R.sceneStats ? R.sceneStats.builds - builds0 : stackBuilds;
  nodes.values = values;
  const countedDraws = Math.max(1, draws);

  // 2. times (nothing else patched): the whole frame callback, and draw
  const ft = [];
  let drawMs = 0;
  draws = 0;
  f.view.draw = function (...a) { const t = performance.now(); try { return draw.apply(this, a); } finally { drawMs += performance.now() - t; draws++; } };
  window.requestAnimationFrame = (cb) => raf((now) => { const t = performance.now(); try { cb(now); } finally { ft.push(performance.now() - t); } });
  await forFrames(seconds * 1000);
  window.requestAnimationFrame = raf;
  f.view.draw = draw;
  f.S.playing = false;
  ft.sort((a, b) => a - b);
  const top = (o, n) => Object.entries(o ?? {}).slice(0, n).map(([k, v]) => `${k} ${v}`).join(', ');
  return {
    fns: f.S.model.fns.length, modules: f.layout.modules.size, open,
    frames: ft.length, fps: +(ft.length / seconds).toFixed(1),
    frameAvg: ft.reduce((a, b) => a + b, 0) / Math.max(1, ft.length), frameP95: ft[Math.floor(ft.length * 0.95)] ?? 0, frameMax: ft.at(-1) ?? 0,
    drawAvg: drawMs / Math.max(1, draws),
    buildsPerFrame: builds / countedDraws, sweepsPerFrame: sweeps / countedDraws,
    passes: top(rep.passMs, 4),
    callers: [...by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${(v / countedDraws).toFixed(1)}/frame  ${k}`),
  };
};

const GDB = async ({ src, steps }) => {
  const mod = async (n) => import(performance.getEntriesByType('resource').map((e) => e.name).find((x) => new URL(x).pathname === n) ?? n);
  const P = await mod('/src/parse.ts');
  const G = await mod('/src/gdb.ts');
  const B = await mod('/src/beats.ts');
  const model = P.parse(src);
  const heap = () => { window.gc?.(); return performance.memory?.usedJSHeapSize ?? 0; };
  const out = [];
  for (const n of steps) {
    let t = performance.now();
    const res = await fetch('/api/trace', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ftb': '1' }, body: JSON.stringify({ src, fns: model.fns.map((x) => x.name), maxSteps: n, maxSeconds: 300 }) });
    const text = await res.text();
    const recordMs = performance.now() - t;
    t = performance.now();
    const r = JSON.parse(text);
    const jsonMs = performance.now() - t;
    if (!r.ok) return { error: r.error ?? JSON.stringify(r.compile) };
    const h0 = heap();
    t = performance.now();
    const trace = G.convertGdb(r, model, src);
    const convertMs = performance.now() - t;
    t = performance.now();
    const tl = B.timelineOf(trace, model);
    const timelineMs = performance.now() - t;
    const h1 = heap();
    out.push({ steps: n, events: trace.evs.length, beats: tl.beats.length, recordMs, mb: text.length / 1e6, jsonMs, convertMs, timelineMs, heapMb: (h1 - h0) / 1e6 });
  }
  return out;
};

const WINDOW = async ({ src, steps }) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mod = async (n) => import(performance.getEntriesByType('resource').map((e) => e.name).find((x) => new URL(x).pathname === n) ?? n);
  for (let i = 0; i < 300 && !window.__ftb?.editor; i++) await sleep(100);
  const f = window.__ftb;
  const PU = await mod('/src/project-ui.ts');
  const M = await mod('/src/main.ts');
  const SE = await mod('/src/session.ts');
  localStorage.setItem('ftb.windowSteps', String(steps));
  f.S.playing = false;
  if (f.S.project) PU.leaveProject();
  const long = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push({ at: e.startTime, ms: e.duration }); }).observe({ type: 'longtask' });
  // (how long the page spends turning an answer's JSON into objects)
  const parses = [];
  const json = Response.prototype.json;
  Response.prototype.json = async function () {
    const text = await this.text();
    const t = performance.now();
    try { return JSON.parse(text); } finally { parses.push({ at: t, ms: performance.now() - t, mb: text.length / 1e6 }); }
  };
  // one phase: start it, then watch every frame until it's done (and a
  // moment more): the longest gap between frames, the long tasks, and (with
  // `edge`) how long playback sat at the end of a window waiting for the next
  const phase = (name, start, done, secs, edge = null) => new Promise((res) => {
    console.log(`[scale] ${name}…`);
    const t0 = performance.now();
    let last = t0, gap = 0, t1 = 0, edgeAt = 0;
    f.diag(true); // (the profiler: its slowest frame, part by part)
    const step = (now) => {
      gap = Math.max(gap, now - last);
      last = now;
      if (edge && !edgeAt && edge()) edgeAt = now;
      if (!t1 && done()) t1 = now;
      if (t1 && now - t1 > 1500) {
        const ls = long.filter((x) => x.at >= t0);
        long.length = 0;
        const worst = f.diag(false).worstFrame ?? null;
        const ps = parses.filter((x) => x.at >= t0 && x.mb > 0.5);
        parses.length = 0;
        return res({ name, ms: t1 - t0, gap, long: ls.length, longest: Math.max(0, ...ls.map((x) => x.ms)), blocked: ls.reduce((a, x) => a + x.ms, 0), worst, json: ps, ...(edge ? { edgeMs: edgeAt ? t1 - edgeAt : 0 } : {}) });
      }
      if (now - t0 > secs * 1000) return res({ name, error: 'not done in time' });
      requestAnimationFrame(step);
    };
    void Promise.resolve(start()).then(() => requestAnimationFrame(step));
  });
  const out = [];
  // 1. the program typed in: its first window recorded, converted, shown
  // (its own: a trace left from before, a project's, doesn't count)
  const ours = () => !!f.S.trace?.window && !!f.S.model?.byName.has('push') && f.S.trace.evs.some((e) => e.k === 'call' && e.fn === 'push');
  out.push(await phase('first window', () => f.editor.dispatch({ changes: { from: 0, to: f.editor.state.doc.length, insert: src } }), ours, 300));
  const w = f.S.trace?.window;
  if (!w) return out;
  // 2. a jump to the end of the window (every row's past values up to there)
  for (let i = 0; i < 15000 && !SE.session.windows.has(w.to); i++) await sleep(20);
  await sleep(3000); // (whatever the page does with the next window once it's here)
  let drawn = 0;
  out.push(await phase('jump to its end', () => { drawn = f.view.drawn; f.S.pos = Math.max(0, f.S.trace.evs.length - 30); }, () => f.view.drawn > drawn + 2, 60));
  // 3. playing on from there into the next window (fetched ahead while this one showed)
  out.push(await phase('into the next', () => { f.S.speed = 30; f.S.playing = true; },
    () => f.S.trace.window?.from === w.to, 120, () => f.S.trace.window?.from === w.from && f.S.pos >= f.S.trace.evs.length - 1e-9));
  f.S.playing = false;
  // 4. back to the first window (in the page's cache)
  out.push(await phase('back a window', () => void M.loadWindow(0), () => f.S.trace.window?.from === 0, 120));
  SE.closeSession(); // (its gdb goes now, not when the server closes)
  Response.prototype.json = json;
  return out;
};

// ---- run ----
const refs = [opt.a, ...(opt.b ? [opt.b] : [])];
const servers = [];
for (const r of refs) servers.push(await serve(r));
const { page, close } = await launchChromium({ width: 1600, height: 1000, args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const results = [];
const f1 = (n) => (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0)).padStart(7);
const say = (s) => { if (!opt.json) console.log(s); };
try {
  page.on('pageerror', (e) => say(`  (page error: ${e.message})`));
  page.on('console', (m) => { if (m.text().startsWith('[scale]') && !opt.json) process.stderr.write(`  ${m.text().slice(8)}\n`); });
  for (const s of servers) {
    await page.goto(s.url, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__ftb?.S, null, { timeout: 60000 });
    if (parts.has('code')) {
      say(`\ncode @ ${s.ref}   (ms)\nfiles   fns | parse cold  one edit | layout sync | scene collapsed     open | frameState first  again | open: hosts belts`);
      for (const files of sizes) {
        const r = await page.evaluate(CODE, { texts: project(files) });
        results.push({ ref: s.ref, part: 'code', files, ...r });
        say(`${String(files).padStart(5)} ${String(r.fns).padStart(5)} | ${f1(r.cold)}   ${f1(r.edit)} |     ${f1(r.sync)} |         ${f1(r.collapsed)}  ${f1(r.open)} |          ${f1(r.fsFirst)} ${f1(r.fsAgain)} |      ${String(r.hosts).padStart(5)} ${String(r.belts).padStart(5)}`);
      }
    }
    if (parts.has('frame')) {
      say(`\nframe @ ${s.ref}   (playing, the whole grid on screen; ms of JS a frame)\nfiles   fns modules | frame avg    p95    max | draw avg | scene builds  node sweeps | passes (ms/frame)`);
      for (const files of sizes) for (const open of [false, true]) {
        const r = await page.evaluate(FRAME, { dir: dirs.get(files), total: files * per + 1, open, seconds: Number(opt.seconds), callers: !!opt.callers });
        results.push({ ref: s.ref, part: 'frame', files, ...r });
        if (r.error) { say(`${String(files).padStart(5)}  ${r.error}`); continue; }
        say(`${String(files).padStart(5)} ${String(r.fns).padStart(5)} ${(open ? 'open' : 'shut').padStart(7)} | ${f1(r.frameAvg)} ${f1(r.frameP95)} ${f1(r.frameMax)} |  ${f1(r.drawAvg)} |      ${f1(r.buildsPerFrame)}      ${f1(r.sweepsPerFrame)} | ${r.passes}`);
        if (opt.callers) for (const c of r.callers) say(`        ${c}`);
      }
    }
    if (parts.has('gdb')) {
      say(`\ngdb @ ${s.ref}   (one run of a long program, cut at N steps)\n steps  events | record s  steps/s     MB | JSON.parse  convertGdb  timelineOf (ms) | heap MB`);
      const rs = await page.evaluate(GDB, { src: LONG, steps: list(opt.steps).map(Number) });
      if (rs.error) say(`  ${rs.error}`);
      else for (const r of rs) {
        results.push({ ref: s.ref, part: 'gdb', ...r });
        say(`${String(r.steps).padStart(6)} ${String(r.events).padStart(7)} | ${f1(r.recordMs / 1000)} ${String(Math.round(r.steps / (r.recordMs / 1000))).padStart(8)} ${f1(r.mb)} |    ${f1(r.jsonMs)}     ${f1(r.convertMs)}     ${f1(r.timelineMs)}      | ${f1(r.heapMb)}`);
      }
    }
    if (parts.has('window')) {
      say(`\nwindow @ ${s.ref}   (windows of ${opt.window} steps; long tasks: the main thread busy over 50 ms)\nphase          |    took ms | longest frame gap | long tasks  longest ms  blocked ms | waited at the edge ms`);
      const rs = await page.evaluate(WINDOW, { src: LONG, steps: Number(opt.window) });
      for (const r of rs) {
        results.push({ ref: s.ref, part: 'window', ...r });
        if (r.error) { say(`${r.name.padEnd(14)} | ${r.error}`); continue; }
        say(`${r.name.padEnd(14)} | ${f1(r.ms).padStart(10)} | ${f1(r.gap).padStart(17)} | ${String(r.long).padStart(10)}  ${f1(r.longest).padStart(10)}  ${f1(r.blocked).padStart(10)} | ${r.edgeMs === undefined ? '' : f1(r.edgeMs)}`);
        if (r.worst?.ms) say(`${''.padEnd(14)}   slowest frame ${f1(r.worst.ms)} ms: ${Object.entries(r.worst.passes).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        for (const j of r.json ?? []) say(`${''.padEnd(14)}   JSON.parse of ${j.mb.toFixed(1)} MB: ${f1(j.ms)} ms`);
      }
    }
  }
} finally {
  // (a server can take its time closing: never longer than this)
  const done = (async () => {
    await close();
    for (const s of servers) await s.close();
  })();
  await Promise.race([done, new Promise((r) => setTimeout(r, 20000))]);
  rmSync(tmp, { recursive: true, force: true });
}
if (opt.json) console.log(JSON.stringify(results, null, 2));
process.exit(0);
