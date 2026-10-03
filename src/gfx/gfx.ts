// GFX: how much the skins' backgrounds do (the top bar's GFX button).
// - full: animated; drawn on the GPU when the skin has a GPU scene (WebGPU,
//   else WebGL2), else on the canvas as before;
// - simple: one still picture of it, painted once per size;
// - off: the skin's flat colour.
// Only backgrounds: the machines, belts and text are the same in every mode.
import { store } from '../dom';

export type GfxMode = 'full' | 'simple' | 'off';

const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function initial(): GfxMode {
  const v = store.get('gfx');
  if (v === 'full' || v === 'simple' || v === 'off') return v;
  // no motion wanted, or nothing to draw it with fast: a still picture
  const gpu = typeof navigator !== 'undefined' && ('gpu' in navigator || !!document.createElement('canvas').getContext('webgl2'));
  return reducedMotion || !gpu ? 'simple' : 'full';
}

let mode: GfxMode = initial();
const listeners = new Set<(m: GfxMode) => void>();

export function gfxMode(): GfxMode {
  return mode;
}

export function setGfx(m: GfxMode): void {
  mode = m;
  store.set('gfx', m);
  for (const f of listeners) f(m);
}

export function onGfx(f: (m: GfxMode) => void): void {
  listeners.add(f);
}

// The frame-rate cap (the GFX menu): the most frames a second the page draws
// (60, 120), or 0 for the screen's own rate. On a 240 Hz screen the grid is
// otherwise drawn up to 240 times a second; playback is timed by the clock,
// not by frames, so a cap shows the same moments, fewer of them.
export const FPS_CAPS = [60, 120, 0] as const;
export type FpsCap = (typeof FPS_CAPS)[number];
let cap: FpsCap = (() => {
  const v = Number(store.get('fpsCap'));
  return (FPS_CAPS as readonly number[]).includes(v) ? (v as FpsCap) : 0;
})();
export function fpsCap(): FpsCap {
  return cap;
}
export function setFpsCap(c: FpsCap): void {
  cap = c;
  store.set('fpsCap', String(c));
}
