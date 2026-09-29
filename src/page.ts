// The page around the panels: the system clock some skins show, the app's
// own zoom, and the full-page background.
import { $, esc } from './dom';
import { gfxMode } from './gfx/gfx';
import { GfxLayer } from './gfx/layer';
import { sceneFor } from './gfx/scenes';
import type { GridView } from './render';
import type { Skin } from './skins/types';

// ---------------- system clock ----------------
// For skins that show one (Wii, Switch, PlayStation): time, am/pm, date.
function tickClock(): void {
  const d = new Date();
  const parts = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).split(' ');
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
  const html = `<b>${esc(parts[0])}</b>${parts[1] ? `<i>${esc(parts[1])}</i>` : ''}<s>${esc(date)}</s>`;
  document.querySelectorAll<HTMLElement>('.sysclock').forEach((el) => {
    if (el.innerHTML !== html) el.innerHTML = html;
  });
}
tickClock();
setInterval(tickClock, 15000);

// ---------------- app zoom ----------------
// Ctrl+wheel and Ctrl+= / − / 0 zoom the whole app, like the browser's own
// zoom, but here the level is known and shown. CSS zoom on <html>; the
// canvases measure their boxes, so they stay sharp.
const UI_ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
export const ui = { zoom: 1 };
export function setUiZoom(z: number, view: GridView, hideMenu: () => void): void {
  ui.zoom = Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
  const html = document.documentElement;
  html.style.zoom = ui.zoom === 1 ? '' : String(ui.zoom);
  html.style.setProperty('--ui-zoom', String(ui.zoom));
  $('ui-zoom-read').textContent = `${Math.round(ui.zoom * 100)}%`;
  try {
    localStorage.setItem('ftb.zoom', String(ui.zoom));
  } catch {}
  view.resize();
  hideMenu();
}
export function stepUiZoom(dir: 1 | -1, view: GridView, hideMenu: () => void): void {
  const next = dir > 0 ? UI_ZOOMS.find((z) => z > ui.zoom + 0.001) : [...UI_ZOOMS].reverse().find((z) => z < ui.zoom - 0.001);
  if (next !== undefined) setUiZoom(next, view, hideMenu);
}

// ---------------- the page's background ----------------
// Skins whose background is the whole page (PS3's XMB, PS4's band) paint it on
// a canvas behind every panel, or on the GPU (its own layer under that canvas,
// which is then left clear); the grid's canvas is left clear over it.
const pageBg = $<HTMLCanvasElement>('page-bg');
export const pageGfx = new GfxLayer(pageBg, 'gfx-page'); // started when a page skin's GPU scene first needs it
export function paintPage(now: number, S: { skin: Skin }, view: GridView): void {
  const on = !!S.skin.fullBleed;
  if (pageBg.hidden === on) pageBg.hidden = !on;
  if (!on) {
    pageGfx.hide();
    return;
  }
  // sized by the window, not in CSS pixels: the app's zoom (CSS zoom on the
  // page) would otherwise grow it, painting far more pixels when zoomed out
  const dpr = view.pixelScale;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const W = Math.round(w * dpr);
  const H = Math.round(h * dpr);
  if (pageBg.width !== W || pageBg.height !== H) (pageBg.width = W), (pageBg.height = H);
  const g = pageBg.getContext('2d')!;
  // GFX: full on the GPU where the skin has a scene
  const mode = gfxMode();
  const scene = mode === 'full' ? sceneFor(S.skin.id) : null;
  if (scene) void pageGfx.init();
  if (scene && pageGfx.ok && pageGfx.render(scene, { w, h, dpr, time: now / 1000, z: 1, cs: 40, camX: 0, camY: 0 })) {
    if (pageKey !== 'gpu') {
      pageKey = 'gpu';
      pageBg.getContext('2d')!.clearRect(0, 0, W, H);
    }
    pageStats.gpu = pageGfx.backend;
    pageStats.ms = pageGfx.lastMs;
    pageStats.frames++;
    return;
  }
  pageGfx.hide();
  pageStats.gpu = null;
  // GFX: simple paints one still (once per skin and size), off a flat colour
  const key = `${S.skin.id}|${W}x${H}|${mode}`;
  if (mode !== 'full' && pageKey === key) return;
  pageKey = key;
  const t0 = performance.now();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.save();
  if (mode === 'off') {
    g.fillStyle = S.skin.casing;
    g.fillRect(0, 0, w, h);
  } else S.skin.background({ g, z: 1, cs: 40, time: mode === 'simple' ? 0 : now / 1000, vw: w, vh: h }, 0, 0);
  g.restore();
  pageStats.ms = performance.now() - t0;
  pageStats.frames++;
}
// the page background's frames and the last one's cost (the GFX readout)
export const pageStats: { frames: number; ms: number; gpu: 'webgpu' | 'webgl2' | null } = { frames: 0, ms: 0, gpu: null };
let pageKey = '';
