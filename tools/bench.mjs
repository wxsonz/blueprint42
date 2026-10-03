#!/usr/bin/env node
// Is it fast? Plays a sample in a real browser window (on the terminal's
// virtual desktop) and reports frames a second with the diagnostics' own
// breakdown (paint passes, skin hooks, canvas calls). Two refs are measured
// alternately, so whatever else the machine is doing lands on both.
//
//   node tools/bench.mjs --skins ps3,minimal
//   node tools/bench.mjs --browser zen --a HEAD~1 --b WORK --skins ps3 --mode focus
//   options: --sample list  --mode fast|focus  --zoom 0.6  --seconds 3  --rounds 2
//            --a <ref> (only one version: omit --b)  --b <ref>  --json
//            --uncapped (no vsync / frame-rate limit, so fps is the frame's whole cost, not the refresh rate)
//            --save (with --uncapped: write src/skins/weight-data.ts, the skin picker's light/medium/heavy)
//            --skins all (every skin the picker lists)
//            --headless (no window: Zen's own headless, Chromium with the GPU flags; for
//              sessions with no terminal window; Chromium's compositor is then software)
//            --pre '<js>' (run in the page before playing, with `f` = window.__ftb and
//              `mod(path)` = the app's module: switch a part off to see what it costs;
//              what it leaves in window.__benchOut is printed)
//            --follow (the camera follows the run, as in the app: focus mode zooms to
//              each stage; off by default so the camera holds still)
//
// The window must be visible: a page on another desktop is paused by the
// browser, and the tool stops rather than report numbers that mean nothing.
import { serve } from './lib/serve.mjs';
import { launchChromium } from './lib/browser.mjs';
import { launchZen } from './lib/zen.mjs';
import { saveWeights } from './lib/weights.mjs';

const opt = { browser: 'chromium', a: 'WORK', b: '', skins: 'minimal', sample: 'list', mode: 'fast', zoom: '0.6', seconds: '3', rounds: '2', json: '', uncapped: '', save: '', headless: '', pre: '', follow: '' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i].replace(/^--/, '');
  if (!(k in opt)) { console.error(`unknown option --${k}`); process.exit(2); }
  opt[k] = k === 'json' || k === 'uncapped' || k === 'save' || k === 'headless' || k === 'follow' ? '1' : process.argv[++i];
}

// runs in the page
const PLAY = async ({ sample, skin, mode, zoom, seconds, pre, follow }) => {
  const mod = async (n) => import(performance.getEntriesByType('resource').map((e) => e.name).find((x) => new URL(x).pathname === n) ?? n);
  for (let i = 0; i < 200 && !window.__ftb?.S?.trace; i++) await new Promise((r) => setTimeout(r, 100));
  const f = window.__ftb;
  if (f.S.sample?.key !== sample) {
    (await import('/src/sample-ui.ts')).loadSample(sample);
    for (let i = 0; i < 150 && !(f.S.trace?.evs.length && f.S.sample?.key === sample); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 1200));
  }
  f.applySkin(f.SKINS.find((x) => x.id === skin));
  await new Promise((r) => setTimeout(r, 1200));
  if (pre) {
    await new Function('f', 'mod', `return (async () => { ${pre} })()`)(f, mod);
    await new Promise((r) => setTimeout(r, 600));
  }
  (await mod('/src/playback.ts')).setAnimMode(mode);
  const v = f.view;
  f.S.follow = !!follow; // --follow: the camera follows (and in focus mode zooms to) what runs, as the app's default
  v.home(f.S, true);
  v.cam.zoom = v.target.zoom = zoom;
  f.S.pos = 0; f.S.speed = 0.5; f.S.playing = true;
  await new Promise((r) => setTimeout(r, 400));
  if (document.hidden) return JSON.stringify({ hidden: true });
  f.diag?.(true);
  let n = 0, worst = 0, long = 0, last = performance.now();
  const t0 = last;
  await new Promise((res) => {
    const step = (now) => { n++; worst = Math.max(worst, now - last); if (now - last > 33) long++; last = now; if (now - t0 < seconds * 1000 && !document.hidden) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
    setTimeout(res, seconds * 1000 + 2000); // a paused page ends it too
  });
  const report = f.diag?.(false) ?? null;
  f.S.playing = false;
  (await mod('/src/playback.ts')).setAnimMode('fast');
  const secs = (performance.now() - t0) / 1000;
  // what drew the backgrounds: the grid's GPU layer and the page's (PS3, PS4)
  const pg = await mod('/src/page.ts');
  const layer = (L, on) => (on && L.ok ? `${L.backend}${L.gpuMs != null ? ` (gpu ${L.gpuMs.toFixed(2)} ms)` : L.gpuTimed ? '' : ' (gpu untimed)'}` : '-');
  const bg = f.S.skin.fullBleed ? `the page's: ${pg.pageStats.gpu ? layer(pg.pageGfx, true) : 'canvas'}` : `the grid's: ${f.view.bgKind === 'gpu' ? layer(f.view.gfx, true) : f.view.bgKind}`;
  return JSON.stringify({ hidden: document.hidden, fps: +(n / secs).toFixed(1), worstMs: Math.round(worst), long, bg, out: window.__benchOut, report });
};

if (opt.save && (!opt.uncapped || opt.browser !== 'chromium' || opt.b || opt.headless)) { console.error('--save needs --uncapped, Chromium, a window (no --headless) and one version (no --b)'); process.exit(2); }
const refs = [opt.a, ...(opt.b ? [opt.b] : [])];
const servers = [];
for (const r of refs) servers.push(await serve(r));
const browser = opt.browser === 'zen' ? await launchZen({ headless: !!opt.headless, uncapped: !!opt.uncapped }) : await launchChromium({ headed: !opt.headless, gpu: true, uncapped: !!opt.uncapped });
const goto = (u) => (opt.browser === 'zen' ? browser.goto(u) : browser.page.goto(u, { waitUntil: 'load' }));
const play = async (args) => JSON.parse(opt.browser === 'zen' ? await browser.evaluate(`(${PLAY})(${JSON.stringify(args)})`) : await browser.page.evaluate(PLAY, args));

const results = [];
let skinIds = opt.skins.split(',');
try {
  if (opt.skins === 'all') {
    await goto(servers[0].url);
    const ask = `(async () => { for (let i = 0; i < 200 && !window.__ftb?.SKINS; i++) await new Promise((r) => setTimeout(r, 100)); return JSON.stringify(window.__ftb.SKINS.filter((k) => !k.variantOf).map((k) => k.id)); })()`;
    skinIds = JSON.parse(opt.browser === 'zen' ? await browser.evaluate(ask) : await browser.page.evaluate(ask));
  }
  for (const skin of skinIds) {
    for (let round = 0; round < Number(opt.rounds); round++) {
      // alternate the order each round
      const order = round % 2 ? [...servers].reverse() : servers;
      for (const s of order) {
        await goto(s.url);
        const r = await play({ sample: opt.sample, skin, mode: opt.mode, zoom: Number(opt.zoom), seconds: Number(opt.seconds), pre: opt.pre, follow: !!opt.follow });
        if (r.hidden) throw new Error('the browser window is hidden (another virtual desktop?): frame rates would mean nothing. Look at the terminal\'s desktop and run it again.');
        results.push({ ref: s.ref, skin, ...r });
        if (!opt.json) console.log(`${skin.padEnd(14)} ${s.ref.padEnd(10)} ${String(r.fps).padStart(6)} fps  worst ${String(r.worstMs).padStart(3)} ms  ${String(r.long).padStart(3)} over 33 ms`);
      }
    }
  }
} finally {
  await browser.close();
  for (const s of servers) await s.close();
}
if (opt.save) console.log(`wrote ${saveWeights(results, { browser: 'chromium, uncapped', sample: opt.sample, mode: opt.mode, zoom: Number(opt.zoom), seconds: Number(opt.seconds), rounds: Number(opt.rounds) })}`);
if (opt.json) console.log(JSON.stringify(results, null, 2));
else {
  // the median per skin and ref, and where the last run's time went
  console.log('');
  for (const skin of skinIds) for (const s of servers) {
    const rs = results.filter((r) => r.skin === skin && r.ref === s.ref);
    const med = [...rs.map((r) => r.fps)].sort((a, b) => a - b)[rs.length >> 1];
    const rep = rs.at(-1)?.report;
    const top = (o) => Object.entries(o ?? {}).slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`${skin} @ ${s.ref}: median ${med} fps`);
    if (rs.at(-1)?.bg) console.log(`   backgrounds: ${rs.at(-1).bg}`);
    if (rs.at(-1)?.out !== undefined) console.log(`   --pre's window.__benchOut: ${JSON.stringify(rs.at(-1).out)}`);
    if (rep) console.log(`   passes (ms/frame): ${top(rep.passMs)}\n   canvas calls/frame: ${top(rep.canvasCalls)}\n   hooks: ${rep.hooks.slice(0, 4).map((h) => `${h.hook} ${h.ms} ms`).join(', ')}${rep.errors.length ? `\n   hook errors: ${rep.errors.length}` : ''}`);
  }
}
process.exit(0);
