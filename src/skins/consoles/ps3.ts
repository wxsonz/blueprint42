import { backdrop, countBadge, makeSkin, type Look, type Palette, type Theme } from '../kit';
import type { Dc, Rect } from '../types';
import { hash, platePath, rrect, strokeLine, Walk } from '../util';
import { MONO, ps2Still, type Rgb, RODIN_R, text, toward } from './common';

// PS3, the XrossMediaBar in its classic blue: teal at the top sinking to
// navy, a ribbon of translucent sheets twisting across the middle, and white
// sparkles drifting through, all animated (stateless in time, like the PS2's
// boot screen) but fixed behind the grid (no parallax). The colour can be
// changed from the top bar and cross-fades, as the XMB's theme colour does.
// Windows are frosted rectangles with a fading white line under the title,
// focus is a breathing halo, lines are soft light, and the things you touch
// (values in flight, counts, icons) are jelly: glossy pale-cyan blobs.
const ps3P: Palette = {
  bg: '#1a5b98', card: 'rgba(6,34,86,0.42)', panel: 'rgba(6,30,78,0.5)', line: 'rgba(255,255,255,0.3)',
  fg: '#ffffff', dim: 'rgba(255,255,255,0.75)', faint: 'rgba(255,255,255,0.45)', accent: '#ffffff', ptr: '#ffe08a', ret: '#b8ffb0', wait: '#ffe08a', err: '#ff9a9a',
  param: '#e6f2ff', cell: 'rgba(255,255,255,0.14)', track: 'rgba(0,20,60,0.35)',
};
// the sparkles: most gather around the ribbon, the rest anywhere; a few are
// big soft bokeh
export const ps3Dust = Array.from({ length: 170 }, (_, i) => {
  const near = hash(i * 17 + 2) < 0.6;
  const big = i % 23 === 0;
  return {
    x: hash(i * 3 + 1), y: near ? 0.55 + (hash(i * 5 + 7) - 0.5) * 0.36 : hash(i * 5 + 7),
    v: 0.003 + 0.009 * hash(i * 7 + 3), r: big ? 2.5 + 3 * hash(i * 11 + 5) : 0.5 + 1.2 * hash(i * 11 + 5) ** 3,
    a: big ? 0.16 : 0.3 + 0.6 * hash(i * 13 + 9), f: 0.6 + 2.2 * hash(i * 19 + 4), ph: 6.28 * hash(i * 29 + 8),
  };
});
let ps3Spark: HTMLCanvasElement | null = null;
let ps3Rib: HTMLCanvasElement | null = null;
let ps3RibSoft: HTMLCanvasElement | null = null;
let ps3RibKey = '';
let ps3RibT = 0;
// how strongly ribbon line i (of 22) and sheet i (between lines i and i + 2)
// are drawn; the GPU scene (gfx/scenes/ps3.ts) takes the same numbers
export const ps3LineAlpha = (i: number) => 0.1 + 0.25 * hash(i * 11 + 3) + (i === 0 || i === 21 ? 0.2 : 0);
export const ps3SheetAlpha = (i: number) => 0.06 + 0.09 * hash(i * 7 + 1);
// the ribbon's shape at u (0..1 across the page) and time t, as fractions of
// the page's height: its middle, and its half-width (negative where twisted).
// (The GPU scene's shaders repeat this; keep them in step.)
function ps3Wave(u: number, t: number): { yc: number; a: number } {
  return {
    yc: 0.56 + 0.06 * Math.sin(6.28 * 0.55 * u + 0.9 + 0.11 * t) + 0.025 * Math.sin(6.28 * 1.3 * u + 2 - 0.19 * t),
    a: 0.02 + 0.08 * Math.sin(6.28 * 0.62 * u + 1 + 0.14 * t),
  };
}
function ps3Xmb(dc: Dc, tint: Rgb): void {
  const g = dc.g;
  const t = ps2Still || !dc.time ? 30 : dc.time;
  const W = dc.vw;
  const H = dc.vh;
  g.save();
  // the ribbon: N lines across a bundle whose width swings through zero, so
  // it twists; neighbouring lines are joined by faint sheets. It is soft, so
  // it's drawn at under a third of the size, softened with a slight blur
  // (cheap at that size, and it hides the stair-steps when scaled up or
  // when the window is resized), then scaled up.
  const RS = 0.3;
  const rw = Math.ceil(W * RS);
  const rh = Math.ceil(H * RS);
  ps3Rib ??= document.createElement('canvas');
  if (ps3Rib.width !== rw || ps3Rib.height !== rh) (ps3Rib.width = rw), (ps3Rib.height = rh);
  const rg = ps3Rib.getContext('2d')!;
  // it moves slowly: repaint it about 24 times a second
  const key = `${rw}x${rh}`;
  const fresh = key === ps3RibKey && Math.abs(t - ps3RibT) < 1 / 24;
  if (!fresh) {
    ps3RibKey = key;
    ps3RibT = t;
    rg.clearRect(0, 0, rw, rh);
    const N = 22;
    const step = Math.max(6, rw / 56);
    const xs: number[] = [];
    for (let x = -step; x <= rw + step; x += step) xs.push(x);
    const rows: number[][] = [];
    for (let i = 0; i < N; i++) {
      const o = -1 + (2 * i) / (N - 1);
      rows.push(xs.map((x) => {
        const u = x / rw;
        const wv = ps3Wave(u, t);
        const yc = rh * wv.yc;
        const a = rh * wv.a;
        const w = rh * 0.01 * Math.sin(6.28 * 1.7 * u + i * 0.6 + 0.33 * t);
        return yc + o * a + w;
      }));
    }
    const X = (x: number) => x;
    const shade = rg.createLinearGradient(0, 0, rw, 0);
    // the ribbon's light is the theme colour, nearly white
    const lite = toward(tint, 255, 0.78).map(Math.round).join(',');
    shade.addColorStop(0, `rgba(${lite},0.6)`);
    shade.addColorStop(0.45, `rgba(${lite},1)`);
    shade.addColorStop(1, `rgba(${lite},0.85)`);
    rg.fillStyle = shade;
    rg.strokeStyle = shade;
    // a soft glow along the middle, then the sheets, blurred, then the lines
    rg.globalAlpha = 0.035;
    rg.lineCap = 'round';
    for (const lw of [0.11, 0.07, 0.035]) {
      rg.lineWidth = rh * lw;
      rg.beginPath();
      rows[N >> 1].forEach((y, k) => (k ? rg.lineTo(X(xs[k]), y) : rg.moveTo(X(xs[k]), y)));
      rg.stroke();
    }
    for (let i = 0; i + 2 < N; i += 2) {
      rg.globalAlpha = ps3SheetAlpha(i);
      rg.beginPath();
      rows[i].forEach((y, k) => (k ? rg.lineTo(X(xs[k]), y) : rg.moveTo(X(xs[k]), y)));
      for (let k = xs.length - 1; k >= 0; k--) rg.lineTo(X(xs[k]), rows[i + 2][k]);
      rg.closePath();
      rg.fill();
    }
    rg.lineWidth = 0.8;
    for (let i = 0; i < N; i++) {
      rg.globalAlpha = ps3LineAlpha(i);
      rg.beginPath();
      rows[i].forEach((y, k) => (k ? rg.lineTo(X(xs[k]), y) : rg.moveTo(X(xs[k]), y)));
      rg.stroke();
    }
    ps3RibSoft ??= document.createElement('canvas');
    if (ps3RibSoft.width !== rw || ps3RibSoft.height !== rh) (ps3RibSoft.width = rw), (ps3RibSoft.height = rh);
    const sg = ps3RibSoft.getContext('2d')!;
    sg.clearRect(0, 0, rw, rh);
    sg.filter = 'blur(0.8px)';
    sg.drawImage(ps3Rib, 0, 0);
    sg.filter = 'none';
  }
  g.imageSmoothingEnabled = true;
  g.drawImage(ps3RibSoft ?? ps3Rib, 0, 0, rw, rh, 0, 0, W, H);
  // the sparkles: drifting right, bobbing, twinkling
  if (!ps3Spark) {
    ps3Spark = document.createElement('canvas');
    ps3Spark.width = ps3Spark.height = 32;
    const sg = ps3Spark.getContext('2d')!;
    const r = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    sg.fillStyle = r;
    sg.fillRect(0, 0, 32, 32);
  }
  const wrap = (v: number, span: number) => ((v % span) + span) % span;
  for (const d of ps3Dust) {
    const x = wrap(d.x * W * 1.2 + t * d.v * W, W * 1.2) - W * 0.1;
    const y = wrap(d.y * H + Math.sin(t * 0.3 + d.ph) * H * 0.01, H * 1.1) - H * 0.05;
    g.globalAlpha = d.a * (0.55 + 0.45 * Math.sin(t * d.f + d.ph));
    const r = d.r * 3;
    g.drawImage(ps3Spark, x - r, y - r, r * 2, r * 2);
  }
  g.restore();
}
// the colours of the glossy things (data tiles, icons) follow the theme
// colour (set with the sky, in ps3Fills)
const ps3Jel = { hi: [170, 232, 250], lo: [55, 135, 195], shade: [0, 24, 70], icon: ['#d2f1fb', '#63b4d8'] };
// The XMB's item tile (as behind a package's icon): dark glass in the theme
// colour, corners well rounded but not a pill, a thin light rim, a gloss
// over the top half that ends in a soft curve, and light pooling at the bottom.
function ps3Tile(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean): void {
  const rad = Math.min(h * 0.38, w / 2);
  const c = (v: number[], a: number) => `rgba(${v.map(Math.round).join(',')},${a})`;
  const dark = toward(ps3Jel.lo as Rgb, 0, 0.55);
  const mid = toward(ps3Jel.lo as Rgb, 0, 0.2);
  g.save();
  rrect(g, x, y, w, h, rad);
  g.shadowColor = c(ps3Jel.shade, 0.5);
  g.shadowBlur = Math.min(6, h * 0.3);
  g.shadowOffsetY = 1;
  const body = g.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, c(dark, 0.82));
  body.addColorStop(1, c(mid, 0.88));
  g.fillStyle = body;
  g.fill();
  g.shadowColor = 'transparent';
  g.clip();
  // light pooling along the bottom
  const pool = g.createLinearGradient(0, y + h * 0.55, 0, y + h);
  pool.addColorStop(0, 'rgba(255,255,255,0)');
  pool.addColorStop(1, 'rgba(255,255,255,0.16)');
  g.fillStyle = pool;
  g.fillRect(x, y + h * 0.55, w, h * 0.45);
  // the gloss: the top half, its lower edge a shallow curve
  const gy = y + h * 0.5;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, gy - h * 0.12);
  g.quadraticCurveTo(x + w / 2, gy + h * 0.08, x, gy - h * 0.12);
  g.closePath();
  const gl = g.createLinearGradient(0, y, 0, gy);
  gl.addColorStop(0, 'rgba(255,255,255,0.32)');
  gl.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = gl;
  g.fill();
  g.restore();
  // the rim: a thin light edge, brighter when lit
  g.save();
  g.lineWidth = 1;
  rrect(g, x + 0.5, y + 0.5, w - 1, h - 1, Math.max(0, rad - 0.5));
  g.strokeStyle = `rgba(255,255,255,${lit ? 0.75 : 0.45})`;
  g.stroke();
  g.restore();
}
// an icon as jelly: the flat icon, thickened, filled pale cyan, glossed
function jellyIcon(g: CanvasRenderingContext2D, s: number, draw: (h: CanvasRenderingContext2D) => void): void {
  const k = g.getTransform().a || 1;
  const S = Math.ceil(s * k);
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    return c;
  };
  const flat = mk();
  const fg = flat.getContext('2d')!;
  fg.scale(k, k);
  draw(fg);
  const blob = mk();
  const bg = blob.getContext('2d')!;
  const d = Math.max(1, S / 22);
  for (let a = 0; a < 8; a++) bg.drawImage(flat, Math.cos(a * 0.785) * d, Math.sin(a * 0.785) * d);
  bg.drawImage(flat, 0, 0);
  bg.globalCompositeOperation = 'source-in';
  const body = bg.createLinearGradient(0, 0, 0, S);
  body.addColorStop(0, ps3Jel.icon[0]);
  body.addColorStop(1, ps3Jel.icon[1]);
  bg.fillStyle = body;
  bg.fillRect(0, 0, S, S);
  bg.globalCompositeOperation = 'source-atop';
  // the icon's own lines, pressed into the gel
  bg.globalAlpha = 0.3;
  bg.drawImage(flat, 0, 0);
  bg.globalAlpha = 1;
  const gl = bg.createLinearGradient(0, 0, 0, S * 0.5);
  gl.addColorStop(0, 'rgba(255,255,255,0.6)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  bg.fillStyle = gl;
  bg.fillRect(0, 0, S, S * 0.5);
  g.save();
  g.shadowColor = 'rgba(0,24,70,0.55)';
  g.shadowBlur = 3 * k;
  g.shadowOffsetY = 1 * k;
  g.drawImage(blob, 0, 0, s, s);
  g.restore();
}
// The theme colours, picked from the top bar: the XMB's blue, then its
// classic colours. Each becomes a sky (top, middle, bottom); changing it
// cross-fades from whatever is showing, over 2.5 s.
export const PS3_TINTS = [
  { id: 'blue', name: 'XMB blue', colour: '#1d64a0' },
  { id: 'black', name: 'Black', colour: '#1c1c20' },
  { id: 'silver', name: 'Silver', colour: '#b8bcc4' },
  { id: 'gold', name: 'Gold', colour: '#c9a634' },
  { id: 'lime', name: 'Lime', colour: '#69a83a' },
  { id: 'pink', name: 'Pink', colour: '#e083b0' },
  { id: 'green', name: 'Green', colour: '#2f9e4e' },
  { id: 'purple', name: 'Purple', colour: '#8a5cc2' },
  { id: 'teal', name: 'Teal', colour: '#23a4a8' },
  { id: 'sky', name: 'Sky', colour: '#2f7fd0' },
  { id: 'magenta', name: 'Magenta', colour: '#b0409f' },
  { id: 'orange', name: 'Orange', colour: '#e39a22' },
  { id: 'brown', name: 'Brown', colour: '#8a5a34' },
  { id: 'red', name: 'Red', colour: '#c22e2e' },
];
export type Sky = { top: Rgb; mid: Rgb; bot: Rgb };
const rgbOf = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
function skyOf(id: string): Sky {
  if (id === 'blue') return { top: rgbOf('#3a8fae'), mid: rgbOf('#1d64a0'), bot: rgbOf('#122a78') };
  const c = rgbOf(PS3_TINTS.find((x) => x.id === id)?.colour ?? '#1d64a0');
  return { top: toward(c, 255, 0.12), mid: c, bot: toward(c, 0, 0.62) };
}
const css = (c: Rgb, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
const PS3_FADE = 2500;
const ps3Fade: { from: Sky; to: Sky; t0: number } = { from: skyOf('blue'), to: skyOf('blue'), t0: -1e9 };
function ps3Now(): { sky: Sky; busy: boolean } {
  const f = Math.min(1, (performance.now() - ps3Fade.t0) / PS3_FADE);
  if (f >= 1) return { sky: ps3Fade.to, busy: false };
  const e = f * f * (3 - 2 * f);
  const lerp = (a: Rgb, b: Rgb) => a.map((v, i) => v + (b[i] - v) * e) as Rgb;
  const { from, to } = ps3Fade;
  return { sky: { top: lerp(from.top, to.top), mid: lerp(from.mid, to.mid), bot: lerp(from.bot, to.bot) }, busy: true };
}
// the sky as it is now (mid-fade too), for the GPU scene; the frosted fills
// follow it as they do when the canvas paints it
export function ps3SkyNow(): Sky {
  const { sky } = ps3Now();
  ps3Fills(sky);
  return sky;
}
// the frosted fills follow the colour: its dark end, see-through
function ps3Fills(sky: Sky): void {
  const deep = toward(sky.bot, 0, 0.35);
  ps3P.card = css(deep, 0.42);
  ps3P.panel = css(deep, 0.5);
  ps3P.track = css(deep, 0.35);
  ps3P.bg = css(sky.mid);
  // jelly: the colour, lifted toward white at the top
  ps3Jel.hi = toward(sky.mid, 255, 0.55);
  ps3Jel.lo = toward(sky.mid, 0, 0.12);
  ps3Jel.shade = deep;
  const to = ps3Fade.to.mid;
  ps3Jel.icon = [css(toward(to, 255, 0.75)), css(toward(to, 255, 0.25))];
}
function ps3Sky(g: CanvasRenderingContext2D, W: number, H: number, sky: Sky): void {
  const grad = g.createLinearGradient(0, 0, W * 0.25, H);
  grad.addColorStop(0, css(sky.top));
  grad.addColorStop(0.42, css(sky.mid));
  grad.addColorStop(1, css(sky.bot));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const tl = g.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, W * 0.6);
  tl.addColorStop(0, 'rgba(255,255,255,0.14)');
  tl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = tl;
  g.fillRect(0, 0, W, H);
  const br = g.createRadialGradient(W * 0.7, H, 0, W * 0.7, H, W * 0.5);
  br.addColorStop(0, 'rgba(10,0,40,0.25)');
  br.addColorStop(1, 'rgba(10,0,40,0)');
  g.fillStyle = br;
  g.fillRect(0, 0, W, H);
}
// focus, the XMB way: a soft white halo. Rings widening outward, fainter
// each time (a shadow blur was too costly on big windows)
function ps3Halo(dc: Dc, r: Rect, rad: number, k = 1): void {
  const g = dc.g;
  const s = Math.max(2, 3 * dc.z);
  g.save();
  g.lineWidth = s;
  for (let i = 3; i >= 1; i--) {
    const o = s * (i - 0.5);
    rrect(g, r.x - o, r.y - o, r.w + 2 * o, r.h + 2 * o, rad + o);
    g.strokeStyle = `rgba(255,255,255,${(0.05 * k) / i})`;
    g.stroke();
  }
  g.restore();
}
// a line of soft light: a faint wide glow under a thin core
function ps3Light(g: CanvasRenderingContext2D, pts: [number, number][], z: number, core: number): void {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  strokeLine(g, pts, Math.max(3, 6 * z), `rgba(255,255,255,${0.07 + core * 0.06})`);
  strokeLine(g, pts, Math.max(1, 1.2 * z), `rgba(255,255,255,${core})`);
  g.restore();
}
// The newer pictures from the XMB's own parts (docs/VISUALS.md): capacity
// is its install bar (a see-through capsule, a glossy fill; amber when full,
// red past it), a pointer's address and the plates are its item tiles, and
// the IN dock is one of its panes whose state is a soft light at the head,
// with the halo it gives whatever has focus while it serves a call.
const ps3Look: Look = {
  cap: {
    w: (s) => s * 3.6,
    h: (s) => Math.max(4, s * 0.6),
    draw(g, x, y, w, h, c) {
      const top = y - h / 2;
      g.save();
      rrect(g, x, top, w, h, h / 2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.stroke();
      g.clip();
      if (c.used > 0) {
        const fw = Math.max(h, w * Math.min(1, c.used / c.max));
        rrect(g, x, top, fw, h, h / 2);
        g.fillStyle = c.used > c.max ? ps3P.err : c.used === c.max ? ps3P.wait : 'rgba(255,255,255,0.85)';
        g.fill();
        const gl = g.createLinearGradient(0, top, 0, top + h / 2);
        gl.addColorStop(0, 'rgba(255,255,255,0.6)');
        gl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gl;
        g.fillRect(x, top, fw, h / 2);
      }
      g.restore();
    },
  },
  tag: {
    padL: (h) => h * 0.95,
    padR: (h) => h * 0.5,
    draw(g, x, top, w, h, col) {
      ps3Tile(g, x, top, w, h, false);
      g.fillStyle = col;
      g.beginPath();
      g.arc(x + h * 0.5, top + h / 2, h * 0.17, 0, Math.PI * 2);
      g.fill();
      return '#ffffff';
    },
  },
  // the item tile, cut to the plate's shape
  plate(dc, x, y, w, h, role) {
    const g = dc.g;
    g.save();
    g.lineJoin = 'round';
    platePath(g, x, y, w, h, role);
    g.clip();
    ps3Tile(g, x - w / 2, y - h / 2, w, h, true);
    g.restore();
    g.save();
    g.lineJoin = 'round';
    platePath(g, x + 0, y, w - 1, h - 1, role);
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  },
  dock: {
    inset: 12,
    lamp(dc, r, head, s) {
      const g = dc.g;
      const z = dc.z;
      if (s.state === 'running' || s.state === 'error') ps3Halo(dc, r, Math.max(1, 3 * z), 0.9);
      const lit = s.state !== 'idle' && !s.stale;
      const x = r.x + 9 * z;
      const y = head.y + head.h / 2;
      if (lit && ps3Spark) {
        const d = 16 * z;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.drawImage(ps3Spark, x - d / 2, y - d / 2, d, d);
        g.restore();
      }
      g.fillStyle = lit ? s.col : 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.arc(x, y, Math.max(1.5, 2.4 * z), 0, Math.PI * 2);
      g.fill();
    },
  },
};

export const ps3Theme: Theme = {
  id: 'ps3', name: 'PlayStation 3', blurb: 'the XMB: the wave, the sparkles, frosted panes, jelly icons; pick its colour on the top bar',
  ptrTags: true, plateShapes: true, capacity: true, look: ps3Look,
  p: ps3P, ui: RODIN_R, mono: MONO('"JetBrains Mono"'), radius: 3, spotlight: 'rgba(0,16,50,0.5)',
  pulseColor: 'rgba(255,255,255,0.95)', flow: '#ffffff',
  card(dc, r, o) {
    const g = dc.g;
    if (o.kind === 'plate') {
      // values in flight and counts: the XMB's item tile
      ps3Tile(g, r.x, r.y, r.w, r.h, !!o.glow);
      return;
    }
    const rad = Math.max(1, 3 * dc.z);
    if (o.glow) ps3Halo(dc, r, rad, 0.8);
    rrect(g, r.x, r.y, r.w, r.h, rad);
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(0,0,0,0.08)' : o.kind === 'frame' ? ps3P.panel : ps3P.card;
      g.fill();
    } else if (o.kind === 'wall') {
      // a wall is only its outline elsewhere: here the faintest line
      g.strokeStyle = 'rgba(255,255,255,0.14)';
      g.lineWidth = 1;
      g.stroke();
    }
  },
  // belts are soft light; on live ones the data is a steady glow drifting
  // the data's way, with sparkles winking near the line
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    const core = o.live || o.selected ? 0.9 : o.hovered ? 0.65 : 0.35;
    ps3Light(g, pts, z, core);
    const w = new Walk(pts);
    const end = w.at(w.length);
    // a soft chevron, not a hard arrowhead
    const L = Math.max(4, 6 * z);
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = `rgba(255,255,255,${core})`;
    g.lineWidth = Math.max(1, 1.4 * z);
    g.beginPath();
    g.moveTo(end.x - end.dx * L - end.dy * L * 0.7, end.y - end.dy * L + end.dx * L * 0.7);
    g.lineTo(end.x, end.y);
    g.lineTo(end.x - end.dx * L + end.dy * L * 0.7, end.y - end.dy * L - end.dx * L * 0.7);
    g.stroke();
    if (o.live && w.length > 4 && ps3Spark) {
      const time = ps2Still ? 30 : dc.time || 0;
      // the data: a steady glow drifting slowly along, one every ~320 px
      const gap = Math.max(160, 320 * z);
      const run = (time * 36 * z) % gap;
      for (let d = run; d < w.length; d += gap) {
        const q = w.at(o.dir < 0 ? w.length - d : d);
        const r = Math.max(6, 11 * z);
        g.globalAlpha = 0.85;
        g.drawImage(ps3Spark, q.x - r, q.y - r, r * 2, r * 2);
      }
      // and sparkles winking in and out at random spots near the line; each
      // shows for a moment, then comes back somewhere else. Seeded by the
      // belt's length on the grid, so belts don't wink in step
      const seed = Math.round(w.length / z);
      const n = Math.ceil(w.length / Math.max(18, 36 * z));
      for (let k = 0; k < n; k++) {
        const per = 1.4 + 2.2 * hash(seed + k * 13);
        const u = (time + per * hash(seed * 3 + k * 7)) / per;
        const life = u - Math.floor(u);
        if (life > 0.35) continue; // resting between winks
        const c = Math.floor(u) * 31 + k * 17 + seed;
        const q = w.at(hash(c) * w.length);
        const off = (hash(c + 5) - 0.5) * Math.max(8, 14 * z);
        const a = Math.sin((life / 0.35) * Math.PI);
        const r = Math.max(1.5, (1.5 + 2.5 * hash(c + 9)) * z) * (0.6 + 0.4 * a) * 2;
        g.globalAlpha = a * 0.9;
        g.drawImage(ps3Spark, q.x - q.dy * off - r, q.y + q.dx * off - r, r * 2, r * 2);
      }
    }
    g.restore();
    countBadge(dc, pts, o, t);
  },
  panel(dc, r, head, title, live) {
    const g = dc.g;
    g.fillStyle = ps3P.card;
    g.fillRect(r.x, r.y, r.w, r.h);
    ps3Rule(g, r.x, head.y + head.h - 1, r.w, live ? 0.9 : 0.4, live);
    text(dc, head, title, RODIN_R, 11.5, live ? '#ffffff' : 'rgba(255,255,255,0.75)', { w: 400, x: head.x + 8 * dc.z });
  },
  background(dc) {
    const { sky, busy } = ps3Now();
    ps3Fills(sky);
    if (busy) {
      // fading: paint the sky straight in, every frame
      const g = dc.g;
      g.save();
      ps3Sky(g, dc.vw, dc.vh, sky);
      g.restore();
    } else backdrop(dc, `ps3-${sky.mid.join(',')}`, (g, W, H) => ps3Sky(g, W, H, sky));
    ps3Xmb(dc, sky.mid);
  },
  window: {
    border: 0, corner: 3, titleH: 28, face: 'rgba(0,0,0,0.12)', workspace: 'rgba(0,0,0,0.05)',
    // files and machines have no pane at all: the window is its title and
    // line, and what's inside (storage, stations, the function box) floats
    // on the sky; only the function box itself is a tinted panel
    frame(dc, r, active, _face, kind) {
      const g = dc.g;
      if (kind !== 'node') {
        ps3Edge(dc, r, active);
        return;
      }
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 3 * dc.z));
      g.fillStyle = ps3P.card;
      g.fill();
    },
    // the title in white Rodin over a white line that fades out at both ends
    titleBar(dc, r, title, active) {
      text(dc, r, title, RODIN_R, 13.5, active ? '#ffffff' : 'rgba(255,255,255,0.75)', { w: 400, x: r.x + 10 * dc.z });
      // the line under the title is part of the frame's faint shape; the
      // frame lights up where the wave passes (ps3Edge)
      ps3Rule(dc.g, r.x, r.y + r.h - 1, r.w, active ? 0.3 : 0.16, false);
    },
    // the install bar: a see-through capsule, a glossy fill; running, a soft
    // light slides along it
    progress(dc, r, fill, anim) {
      const g = dc.g;
      const h = Math.max(4, Math.min(r.h, 7 * dc.z));
      const y = r.y + (r.h - h) / 2;
      g.save();
      rrect(g, r.x, y, r.w, h, h / 2);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.stroke();
      g.clip();
      const bar = (x0: number, x1: number, a: number) => {
        if (x1 - x0 < 1) return;
        const body = g.createLinearGradient(0, y, 0, y + h);
        body.addColorStop(0, `rgba(255,255,255,${a})`);
        body.addColorStop(1, `rgba(150,215,245,${a})`);
        g.fillStyle = body;
        rrect(g, x0, y, x1 - x0, h, h / 2);
        g.fill();
      };
      if (anim) {
        const seg = r.w * 0.3;
        const x = r.x - seg + ((dc.time * 0.45) % 1) * (r.w + seg);
        const grad = g.createLinearGradient(x, 0, x + seg, 0);
        grad.addColorStop(0, 'rgba(200,235,255,0)');
        grad.addColorStop(0.7, 'rgba(230,246,255,0.85)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x, y, seg, h);
      } else bar(r.x, r.x + r.w * fill, 0.9);
      const gl = g.createLinearGradient(0, y, 0, y + h / 2);
      gl.addColorStop(0, 'rgba(255,255,255,0.35)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl;
      g.fillRect(r.x, y, r.w, h / 2);
      g.restore();
    },
  },
};
// A file's or machine's frame: its outline, barely there, lit by the wave:
// brighter where the ribbon passes near or behind it. The wave is drawn on
// the page, so the grid canvas's place on the page (read once a frame) maps
// the frame into the wave's coordinates. Each edge is one stroke with a
// gradient sampled along it.
const ps3Off = { t: NaN, x: 0, y: 0 };
function ps3Edge(dc: Dc, r: Rect, active: boolean): void {
  const g = dc.g;
  const t = ps2Still ? 30 : dc.time || 0;
  if (ps3Off.t !== t) {
    const b = g.canvas.getBoundingClientRect();
    Object.assign(ps3Off, { t, x: b.left, y: b.top });
  }
  const W = window.innerWidth || dc.vw;
  const H = window.innerHeight || dc.vh;
  const lit = (x: number, y: number) => {
    const wv = ps3Wave((x + ps3Off.x) / W, t);
    const d = Math.abs(y + ps3Off.y - wv.yc * H) - Math.abs(wv.a) * H;
    const near = Math.max(0, 1 - Math.max(0, d) / (0.16 * H));
    return near * near;
  };
  const base = active ? 0.1 : 0.06;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    const glow = g.createLinearGradient(x0, y0, x1, y1);
    const n = 10;
    for (let k = 0; k <= n; k++) {
      const f = lit(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
      grad.addColorStop(k / n, `rgba(255,255,255,${base + 0.7 * f})`);
      glow.addColorStop(k / n, `rgba(255,255,255,${0.12 * f})`);
    }
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.strokeStyle = glow;
    g.lineWidth = Math.max(3, 4 * dc.z);
    g.stroke();
    g.strokeStyle = grad;
    g.lineWidth = 1;
    g.stroke();
  };
  g.save();
  g.lineCap = 'square';
  const x0 = r.x + 0.5, y0 = r.y + 0.5, x1 = r.x + r.w - 0.5, y1 = r.y + r.h - 0.5;
  edge(x0, y0, x1, y0);
  edge(x1, y0, x1, y1);
  edge(x0, y1, x1, y1);
  edge(x0, y0, x0, y1);
  g.restore();
}
// a white rule that fades out at both ends; lit, a faint band around it
// (no shadow blur: too costly)
function ps3Rule(g: CanvasRenderingContext2D, x: number, y: number, w: number, a: number, glow: boolean): void {
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.06, `rgba(255,255,255,${a})`);
  grad.addColorStop(0.7, `rgba(255,255,255,${a * 0.8})`);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.save();
  g.fillStyle = grad;
  if (glow) {
    g.globalAlpha = 0.15;
    g.fillRect(x, y - 1.5, w, 4);
    g.globalAlpha = 1;
  }
  g.fillRect(x, y, w, 1);
  g.restore();
}

export const ps3 = makeSkin(ps3Theme);
{
  const flat = ps3.icon;
  ps3.icon = (g, kind, s) => jellyIcon(g, s, (h) => flat(h, kind, s));
  ps3.fullBleed = true;
  // focus mode's veil: the sky's own dark end, so dimming keeps the theme
  // colour (a fixed navy turned every other colour purple)
  Object.defineProperty(ps3, 'spotlight', { configurable: true, enumerable: true, get: () => css(toward(ps3Now().sky.bot, 0, 0.45), 0.55) });
  ps3.tints = PS3_TINTS;
  ps3.tint = (id, instant) => {
    const to = skyOf(id);
    ps3Fade.from = instant || ps2Still ? to : ps3Now().sky;
    ps3Fade.to = to;
    ps3Fade.t0 = instant || ps2Still ? -1e9 : performance.now();
    ps3Fills(ps3Now().sky);
    return { '--xmb-top': css(to.top), '--xmb-mid': css(to.mid), '--xmb-bot': css(to.bot) };
  };
  ps3.busy = () => ps3Now().busy;
}
