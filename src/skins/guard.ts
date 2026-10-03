// A skin can't stop the frame: every drawing hook (its first argument a
// drawing context) runs inside a try. A throw is reported once
// (src/diag.ts), the canvas is put back as the hook found it (the saves it
// left open restored, which drops any clip it set, then the style it had),
// and in dev builds the thing it was drawing gets a marked box so the gap is
// visible; the rest of the frame draws on. Nothing is added when the hook
// succeeds: several skins leave style behind that later drawing relies on,
// so a save/restore around each would change their pictures. A Proxy, not a
// copy: a skin's getters (PS3's veil, which follows the theme colour) stay
// live.
import { prof, profHook, reportHookError } from '../diag';
import type { Dc, Skin } from './types';

const guarded = new WeakMap<Skin, Skin>();

// how many saves are open on each context (counted, so a failed hook's can be closed)
const depths = new WeakMap<CanvasRenderingContext2D, { n: number }>();
function depthOf(g: CanvasRenderingContext2D): { n: number } {
  let d = depths.get(g);
  if (!d) {
    const box = (d = { n: 0 });
    const save = g.save, restore = g.restore;
    g.save = function () { box.n++; save.call(this); };
    g.restore = function () { if (box.n > 0) box.n--; restore.call(this); };
    depths.set(g, d);
  }
  return d;
}
const STYLE = ['globalAlpha', 'globalCompositeOperation', 'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit', 'lineDashOffset', 'font', 'textAlign', 'textBaseline', 'direction', 'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'filter', 'imageSmoothingEnabled'] as const;
type Snap = { depth: number; t: DOMMatrix; dash: number[]; style: unknown[] };
// taken before every hook (about 30 a frame), so a plain loop into an array:
// building an object of the style cost a third of an empty frame's JS
function snap(g: CanvasRenderingContext2D, d: { n: number }): Snap {
  const c = g as unknown as Record<string, unknown>;
  const style = new Array<unknown>(STYLE.length);
  for (let i = 0; i < STYLE.length; i++) style[i] = c[STYLE[i]];
  return { depth: d.n, t: g.getTransform(), dash: g.getLineDash(), style };
}
function putBack(g: CanvasRenderingContext2D, d: { n: number }, s: Snap): void {
  // lint-canvas: balanced elsewhere (it closes the saves a failed hook left open)
  while (d.n > s.depth) g.restore();
  for (let i = 0; i < STYLE.length; i++) (g as unknown as Record<string, unknown>)[STYLE[i]] = s.style[i];
  g.setTransform(s.t);
  g.setLineDash(s.dash);
  g.beginPath();
}
const isDc = (v: unknown): v is Dc => !!v && typeof v === 'object' && 'g' in v && typeof (v as Dc).g?.save === 'function';
const isRect = (v: unknown): v is { x: number; y: number; w: number; h: number } =>
  !!v && typeof v === 'object' && ['x', 'y', 'w', 'h'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number');

export function guardSkin(skin: Skin, markErrors = !!import.meta.env?.DEV): Skin {
  const hit = guarded.get(skin);
  if (hit) return hit;
  const wrapped = new Map<PropertyKey, unknown>();
  const proxy = new Proxy(skin, {
    get(target, prop, recv) {
      const v = Reflect.get(target, prop, recv);
      if (typeof v !== 'function' || prop === 'constructor') return v;
      let w = wrapped.get(prop);
      if (!w || (w as { raw?: unknown }).raw !== v) {
        const hook = String(prop);
        w = Object.assign(function (this: unknown, ...args: unknown[]) {
          const dc = args[0];
          if (!isDc(dc)) return (v as (...a: unknown[]) => unknown).apply(this === proxy ? target : this, args);
          const d = depthOf(dc.g);
          const before = snap(dc.g, d);
          const t0 = prof.on ? performance.now() : 0;
          try {
            return (v as (...a: unknown[]) => unknown).apply(this === proxy ? target : this, args);
          } catch (err) {
            putBack(dc.g, d, before);
            reportHookError(skin.id, hook, err, args.slice(1));
            if (markErrors) mark(dc, args.find(isRect));
            return undefined;
          } finally {
            if (prof.on) profHook(`${skin.id}.${hook}`, performance.now() - t0);
          }
        }, { raw: v });
        wrapped.set(prop, w);
      }
      return w;
    },
  });
  guarded.set(skin, proxy);
  guarded.set(proxy, proxy);
  return proxy;
}

// dev: where a hook failed, a hatched box (diagnostic, not a skin's look)
function mark(dc: Dc, r: { x: number; y: number; w: number; h: number } | undefined): void {
  if (!r || !(r.w > 0 && r.h > 0)) return;
  const g = dc.g;
  g.save();
  try {
    g.setLineDash([4, 3]);
    g.lineWidth = 1.5;
    g.strokeStyle = '#ff2d55';
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    g.beginPath();
    g.moveTo(r.x, r.y);
    g.lineTo(r.x + r.w, r.y + r.h);
    g.moveTo(r.x + r.w, r.y);
    g.lineTo(r.x, r.y + r.h);
    g.stroke();
  } finally {
    g.restore();
  }
}
