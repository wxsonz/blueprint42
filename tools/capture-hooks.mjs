#!/usr/bin/env node
// Record what the grid really passes to skin hooks, for the skin contract
// tests (test/skin-contract.test.ts): runs the app headless over samples,
// playback positions and zooms, keeps a few different calls per hook, and
// writes test/fixtures/hook-calls.json ({ z, args } per call: the zoom the
// rects were laid out at). Rerun it when a hook's info grows:
//   node tools/capture-hooks.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve, REPO } from './lib/serve.mjs';
import { launchChromium } from './lib/browser.mjs';

const SAMPLES = ['list', 'lost', 'structs', 'bytes', 'crash', 'strings', 'reader', 'sort'];
const PER_HOOK = 10;

const s = await serve('WORK');
const b = await launchChromium({ software: true });
try {
  await b.page.goto(s.url, { waitUntil: 'load' });
  await b.page.waitForFunction(() => !!window.__ftb?.S?.trace, null, { timeout: 30000 });
  await b.page.evaluate(() => window.__ftb.freeze(true));
  const calls = {};
  for (const sample of SAMPLES) {
    await b.page.evaluate(async (k) => {
      const m = await import('/src/sample-ui.ts');
      m.loadSample(k);
      for (let i = 0; i < 150 && !(window.__ftb.S.trace?.evs.length && window.__ftb.S.sample?.key === k); i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 1200));
    }, sample);
    for (const skinId of ['minimal', 'ps2']) {
    const got = await b.page.evaluate(([per, skinId]) => {
      const f = window.__ftb;
      // the infos are the engine's, not the skin's; two skins so optional hooks are reached
      const skin = f.SKINS.find((x) => x.id === skinId);
      const seen = {};
      const clean = (v, depth = 0) => {
        if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : typeof v === 'number' && !Number.isFinite(v) ? String(v) : v;
        if (depth > 8) return undefined;
        if ('g' in v && 'z' in v) return '$dc';
        if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1));
        const o = {};
        for (const [k, x] of Object.entries(v)) { const c = clean(x, depth + 1); if (c !== undefined) o[k] = c; }
        return o;
      };
      const proxy = new Proxy(skin, {
        get(t, p) {
          const v = t[p];
          if (typeof v !== 'function') return v;
          return function (...args) {
            if (args[0] && typeof args[0] === 'object' && 'g' in args[0]) {
              const list = (seen[p] ??= []);
              const one = JSON.stringify({ z: +args[0].z.toFixed(3), args: clean(args.slice(1)) });
              if (list.length < per * 4 && !list.includes(one)) list.push(one);
            }
            return v.apply(t, args);
          };
        },
      });
      const v = f.view;
      const n = f.S.trace.evs.length;
      for (const zoom of [0.35, 0.7, 1.2, 2]) for (let i = 0; i <= 12; i++) {
        f.S.pos = (i / 12) * n;
        v.home(f.S, true);
        v.target.zoom = zoom;
        Object.assign(v.cam, v.target);
        v.draw(f.S, proxy, 1000 + i * 40);
      }
      return seen;
    }, [PER_HOOK, skinId]);
    for (const [hook, list] of Object.entries(got)) (calls[hook] ??= []).push(...list);
    }
  }
  // keep an even spread: every nth, up to PER_HOOK per hook
  const out = {};
  for (const [hook, list] of Object.entries(calls)) {
    const uniq = [...new Set(list)];
    const step = Math.max(1, Math.floor(uniq.length / PER_HOOK));
    out[hook] = uniq.filter((_, i) => i % step === 0).slice(0, PER_HOOK).map((x) => JSON.parse(x));
  }
  const dir = join(REPO, 'test', 'fixtures');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'hook-calls.json'), `${JSON.stringify(out)}\n`);
  console.log(Object.entries(out).map(([k, v]) => `${k} ${v.length}`).join(', '));
} finally {
  await b.close();
  await s.close();
}

process.exit(0); // (the trace server can keep gdb sessions open)
