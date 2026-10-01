#!/usr/bin/env node
// Does a replay file play the same frames as the app? (docs/OBJECTIVES.md,
// nice to have 10.) For each sample: load it in the app, export its replay
// (the player built by the trace server, with this run in it), open that file
// from disk (file://, no server), and draw the same grid frames in both
// (skins × playback positions × zooms), compared pixel by pixel.
//
//   node tools/replaycmp.mjs
//   options: --samples list,reader,swap  --skins minimal,ps3  --zooms 0.6,1.2
//            --positions 0.15,0.5,0.85,1  --threshold 2  --out <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from './lib/serve.mjs';
import { launchChromium } from './lib/browser.mjs';

const opt = { samples: 'list,reader,swap', skins: 'minimal,barebone,ps3', zooms: '0.6,1.2', positions: '0.15,0.5,0.85,1', threshold: '2', out: '' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  if (!(k in opt)) { console.error(`unknown option --${k}`); process.exit(2); }
  opt[k] = process.argv[++i];
}
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const out = opt.out || join(tmpdir(), `b42-replaycmp-${Date.now()}`);
mkdirSync(out, { recursive: true });

// one frame, drawn with the camera settled and the clock given (as pixcmp)
const DRAW = async ({ skin, pos, zoom }) => {
  const f = window.__ftb;
  if (f.S.skin.id !== skin) {
    await f.applySkin(f.SKINS.find((s) => s.id === skin));
    await new Promise((r) => setTimeout(r, 600));
  }
  const v = f.view;
  f.S.playing = false;
  f.S.follow = false;
  f.S.pos = pos * f.S.trace.evs.length;
  v.home(f.S, true);
  v.target.zoom = zoom;
  Object.assign(v.cam, v.target);
  v.last = 5000;
  v.draw(f.S, f.S.skin, 5000);
  return v.canvas.toDataURL('image/png');
};
// in the replay page: its frame against the app's PNG, over a fixed colour
const DIFF = async ({ png, limit }) => {
  const c = window.__ftb.view.canvas;
  const dec = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
  const [a, b] = [await dec(png), await dec(c.toDataURL('image/png'))];
  if (a.width !== b.width || a.height !== b.height) return { size: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  const w = a.width, h = a.height;
  const px = (img) => { const k = Object.assign(document.createElement('canvas'), { width: w, height: h }); const g = k.getContext('2d'); g.fillStyle = '#143c6e'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const da = px(a), db = px(b);
  let n = 0, max = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    max = Math.max(max, d);
    if (d > limit) n++;
  }
  return { n, max };
};

const app = await serve('WORK');
const b = await launchChromium({ width: 1500, height: 950, software: true });
let total = 0, differing = 0;
try {
  for (const sample of list(opt.samples)) {
    const page = b.page;
    await page.goto(app.url, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.__ftb?.S?.trace, null, { timeout: 30000 });
    await page.evaluate(async (s) => {
      (await import('/src/sample-ui.ts')).loadSample(s, true);
      for (let i = 0; i < 150 && !(window.__ftb.S.trace?.evs.length && window.__ftb.S.sample?.key === s); i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 1200));
      window.__ftb.freeze(true);
    }, sample);
    // the replay, as the Export button makes it
    const html = await page.evaluate(async () => {
      const res = await fetch('/api/replay/player', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ftb': '1' }, body: '{}' });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error);
      const R = await import('/src/replay.ts');
      const U = await import('/src/sample-ui.ts');
      const S = window.__ftb.S;
      return R.withReplay(j.html, R.makeReplay({ title: S.sample.file, made: new Date().toISOString(), sample: S.sample.key, saved: U.currentSaved(), skin: S.skin.id, pos: S.pos }, S.trace));
    });
    const file = join(out, `${sample}-replay.html`);
    writeFileSync(file, html);
    const frames = [];
    for (const skin of list(opt.skins)) for (const zoom of list(opt.zooms).map(Number)) for (const pos of list(opt.positions).map(Number)) frames.push({ skin, pos, zoom, png: await page.evaluate(DRAW, { skin, pos, zoom }) });
    const rp = await b.browser.newPage({ viewport: { width: 1500, height: 950 } });
    const errs = [];
    rp.on('pageerror', (e) => errs.push(e.message));
    rp.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):|fonts\.(googleapis|gstatic)\.com/.test(u)) errs.push(`asked the network: ${u}`); });
    await rp.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await rp.waitForFunction(() => !!window.__ftb?.S?.trace, null, { timeout: 30000 });
    await rp.evaluate(() => window.__ftb.freeze(true));
    await rp.waitForTimeout(800);
    let bad = 0;
    for (const fr of frames) {
      await rp.evaluate(DRAW, fr);
      const d = await rp.evaluate(DIFF, { png: fr.png, limit: Number(opt.threshold) });
      total++;
      if (d.size || d.n) {
        bad++, differing++;
        console.log(`  ${sample} ${fr.skin} z${fr.zoom} p${fr.pos}: ${d.size ?? `${d.n} px differ (max ${d.max})`}`);
      }
    }
    console.log(`${sample}: ${frames.length - bad}/${frames.length} frames the same; ${(html.length / 1e6).toFixed(1)} MB${errs.length ? `; ${errs.join('; ')}` : ''}`);
    if (errs.length) differing++;
    await rp.close();
  }
} finally {
  await b.close();
  await app.close();
}
console.log(`${total - differing}/${total} the same (files in ${out})`);
process.exit(differing ? 1 : 0);
