#!/usr/bin/env node
// Do two versions draw the same picture? Draws fixed grid frames (samples ×
// playback positions × zooms, per skin, per screen scale) from two versions
// of the app and compares them pixel by pixel, composited over a fixed page
// colour. A refactor that should change nothing must report 0 differing.
//
//   node tools/pixcmp.mjs                      HEAD vs the working tree, every skin
//   node tools/pixcmp.mjs --a main~3 --b HEAD --skins ps3,minimal --scales 1,1.25
//   options: --samples list,lost  --zooms 0.5,1,1.6  --positions 0.1,0.35,0.6,0.9,1
//            --threshold 2 (per channel, out of 255)  --out <dir> (PNGs of what differs)
//            --folders /abs/project,…  (projects too, opened like Open Folder; --open: every module open)
//
// Headless Chromium, no window. Frames are deterministic: the grid reads the
// time it's given, and each frame is drawn with the camera settled.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './lib/serve.mjs';
import { launchChromium } from './lib/browser.mjs';

const opt = { a: 'HEAD', b: 'WORK', skins: '', samples: 'list,lost,structs', folders: '', open: '', zooms: '0.5,1,1.6', positions: '0.1,0.35,0.6,0.9,1', scales: '1', threshold: '2', out: '' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  if (!(k in opt)) { console.error(`unknown option --${k}`); process.exit(2); }
  opt[k] = k === 'open' ? '1' : process.argv[++i];
}
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const nums = (s) => list(s).map(Number);
const out = opt.out || join(tmpdir(), `b42-pixcmp-${Date.now()}`);
const threshold = Number(opt.threshold);

// runs in the page: draw one frame and return the grid canvas's pixels' hash
const DRAW = async ({ skin, pos, zoom }) => {
  const f = window.__ftb;
  if (f.S.skin.id !== skin) {
    f.applySkin(f.SKINS.find((s) => s.id === skin));
    await new Promise((r) => setTimeout(r, 600));
  }
  const v = f.view;
  f.S.playing = false;
  f.S.follow = false;
  f.S.pos = pos * f.S.trace.evs.length;
  v.home(f.S, true); // the same place in both versions, whatever the app did before
  v.target.zoom = zoom;
  Object.assign(v.cam, v.target);
  v.last = 5000;
  v.draw(f.S, f.S.skin, 5000);
  const c = v.canvas;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let h = 2166136261;
  for (let i = 0; i < d.length; i += 3) h = Math.imul(h ^ d[i], 16777619);
  return { hash: `${c.width}x${c.height}:${h >>> 0}` };
};
const PNG = () => window.__ftb.view.canvas.toDataURL('image/png');
// in B's page: compare its current frame with A's PNG, over a fixed colour
const DIFF = async ({ png, threshold: limit }) => {
  const c = window.__ftb.view.canvas;
  // both sides through the same PNG round trip (it's lossy for see-through
  // pixels, so a PNG against a live canvas would differ where nothing did)
  const dec = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
  const img = await dec(png);
  const minePng = c.toDataURL('image/png');
  const mine = await dec(minePng);
  const w = c.width, h = c.height;
  const mk = () => Object.assign(document.createElement('canvas'), { width: w, height: h });
  const over = (src) => { const k = mk(); const g = k.getContext('2d'); g.fillStyle = '#143c6e'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0); return g.getImageData(0, 0, w, h).data; };
  if (img.width !== w || img.height !== h) return { size: `${img.width}x${img.height} vs ${w}x${h}` };
  const a = over(img), b = over(mine);
  const map = mk(); const mg = map.getContext('2d'); const md = mg.createImageData(w, h);
  let max = 0, n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > max) max = d;
    if (d > limit) {
      n++;
      const p = i / 4, x = p % w, y = (p / w) | 0;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    md.data.set([255, 0, 0, d > limit ? 255 : d ? 90 : 0], i);
  }
  mg.putImageData(md, 0, 0);
  return { max, n, box: n ? [x0, y0, x1, y1] : null, map: map.toDataURL('image/png'), png: minePng };
};

// One run of each program for both versions: the trace server's answers to A
// are replayed to B. A program can differ run to run (glibc writes a random
// key into a freed tcache chunk, and a sample may read it back), and that
// isn't a picture changing.
const runs = new Map();
async function replayTraces(page) {
  await page.route('**/api/trace**', async (route) => {
    const req = route.request();
    const key = `${req.method()} ${new URL(req.url()).pathname} ${req.postData() ?? ''}`;
    const hit = runs.get(key);
    if (hit) return route.fulfill(hit); // the first to ask records it
    const res = await route.fetch();
    const got = { status: res.status(), headers: res.headers(), body: await res.body() };
    if (!runs.has(key)) runs.set(key, got);
    return route.fulfill(got);
  });
}

async function open(url, scale) {
  const b = await launchChromium({ scale, software: true });
  await replayTraces(b.page);
  await b.page.goto(url, { waitUntil: 'load' });
  await b.page.waitForFunction(() => !!window.__ftb?.S?.trace, null, { timeout: 30000 }).catch(() => {});
  await b.page.evaluate(() => window.__ftb.freeze?.(true)); // only our frames draw (an older version without it: its loop runs on)
  return b;
}
const load = (page, sample) => sample.startsWith('/') ? page.evaluate(async ({ dir, openAll }) => {
  // a project folder, opened the way Open Folder does (and every module opened, with --open)
  const f = window.__ftb;
  await f.openFolder(dir);
  for (let i = 0; i < 1200 && !(f.S.project?.root === dir && f.S.trace?.evs.length); i++) await new Promise((r) => setTimeout(r, 100));
  if (openAll) {
    const { toggleModule } = await import('/src/main.ts');
    for (const [file, m] of [...f.layout.modules]) if (m.collapsed) toggleModule(file);
  }
  await new Promise((r) => setTimeout(r, 1200));
}, { dir: sample, openAll: !!opt.open }) : page.evaluate(async (s) => {
  const m = await import('/src/sample-ui.ts');
  m.loadSample(s);
  for (let i = 0; i < 150 && !(window.__ftb.S.trace?.evs.length && window.__ftb.S.sample?.key === s); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 1200)); // the trace settles (gdb samples run on the server)
}, sample);
const label = (s) => (s.startsWith('/') ? s.slice(s.lastIndexOf('/') + 1) : s);

const A = await serve(opt.a);
const B = await serve(opt.b);
let differing = 0, total = 0;
try {
  const probe = await open(B.url, 1);
  const skins = opt.skins ? list(opt.skins) : await probe.page.evaluate(() => window.__ftb.SKINS.map((s) => s.id));
  await probe.close();
  for (const scale of nums(opt.scales)) {
    const [pa, pb] = [await open(A.url, scale), await open(B.url, scale)];
    for (const sample of [...list(opt.samples), ...list(opt.folders)]) {
      await load(pa.page, sample);
      await load(pb.page, sample);
      for (const skin of skins) {
        let same = 0, worst = 0, bad = [];
        for (const zoom of nums(opt.zooms)) for (const pos of nums(opt.positions)) {
          const fr = { skin, pos, zoom };
          const [ha, hb] = [await pa.page.evaluate(DRAW, fr), await pb.page.evaluate(DRAW, fr)];
          total++;
          if (ha.hash === hb.hash) { same++; continue; }
          const aPng = await pa.page.evaluate(PNG);
          const d = await pb.page.evaluate(DIFF, { png: aPng, threshold });
          if (d.size) { bad.push(`${label(sample)} z${zoom} p${pos}: size ${d.size}`); continue; }
          worst = Math.max(worst, d.max);
          if (d.n === 0) { same++; continue; } // within the threshold
          const tag = `${skin}-${label(sample)}-s${scale}-z${zoom}-p${pos}`;
          mkdirSync(out, { recursive: true });
          const png = (u) => Buffer.from(u.split(',')[1], 'base64');
          writeFileSync(join(out, `${tag}-a.png`), png(aPng)); // the pair that was compared
          writeFileSync(join(out, `${tag}-b.png`), png(d.png));
          writeFileSync(join(out, `${tag}-diff.png`), png(d.map));
          bad.push(`${label(sample)} z${zoom} p${pos}: ${d.n} px over ${threshold}, max ${d.max}, box ${d.box.join(',')}`);
        }
        differing += bad.length;
        const n = nums(opt.zooms).length * nums(opt.positions).length;
        console.log(`${bad.length ? 'DIFF' : 'same'}  ${skin.padEnd(15)} ${label(sample).padEnd(8)} @${scale}  ${same}/${n} identical${worst ? ` (worst ${worst}/255)` : ''}`);
        for (const l of bad) console.log(`        ${l}`);
      }
    }
    await pa.close();
    await pb.close();
  }
} finally {
  await A.close();
  await B.close();
}
console.log(`\n${opt.a} vs ${opt.b}: ${total} frames, ${differing} differing${differing ? ` (pictures in ${out})` : ''}`);
process.exit(differing ? 1 : 0);
