// Console skins: PlayStation 1–5, Wii, GameCube and Switch. Each is a theme for the kit (`makeSkin`): a
// wallpaper drawn once per size, window chrome in the console's own style,
// and a palette. Geometry is the engine's; only the look changes.
import { backdrop, countBadge, makeSkin, plainCard, softShadow, type Palette, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { arrowHead, fitText, hash, rrect, strokeLine, Walk } from './util';

const F = (family: string) => (px: number, w = 400) => `${w} ${px}px ${family}`;
const RUBIK = F('Rubik, "Open Sans", sans-serif');
const EXO = F('"Exo 2", "Open Sans", sans-serif');
const NUNITO = F('Nunito, "Open Sans", sans-serif');
const JOST = F('Jost, "Open Sans", sans-serif');
const RODIN = F('"M PLUS 1p", "Open Sans", sans-serif'); // the Wii's FOT-Rodin
const SST = F('"Source Sans 3", "Open Sans", sans-serif'); // PlayStation's SST
const RODIN_R = F('"M PLUS Rounded 1c", "Open Sans", sans-serif'); // the PS3's SCE Rodin
const MONO = (family: string) => (px: number, w = 400) => `${w >= 600 ? 700 : 400} ${px}px ${family}, "DejaVu Sans Mono", monospace`;


function text(dc: Dc, r: Rect, s: string, font: (px: number, w?: number) => string, px: number, color: string, opts: { w?: number; align?: CanvasTextAlign; x?: number; right?: number; halo?: string } = {}): void {
  const g = dc.g;
  const fs = Math.max(7, px * dc.z);
  const left = opts.x ?? r.x + 10 * dc.z;
  const right = opts.right ?? r.x + r.w - 8 * dc.z;
  const t = fitText(g, s, (x) => font(x, opts.w ?? 400), fs, Math.max(0, right - left));
  g.textAlign = opts.align ?? 'left';
  g.textBaseline = 'middle';
  const x = opts.align === 'center' ? (left + right) / 2 : left;
  if (opts.halo) {
    g.save();
    g.strokeStyle = opts.halo;
    g.lineWidth = Math.max(2, 4 * dc.z);
    g.lineJoin = 'round';
    g.strokeText(t, x, r.y + r.h / 2);
    g.restore();
  }
  g.fillStyle = color;
  g.fillText(t, x, r.y + r.h / 2);
}

// a bevelled plastic slab: light along the top and left, dark along the bottom and right
function plastic(dc: Dc, r: Rect, rad: number, face: string, light: string, dark: string): void {
  const g = dc.g;
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.fillStyle = face;
  g.fill();
  const k = Math.max(1, 1.5 * dc.z);
  g.lineWidth = k;
  g.strokeStyle = dark;
  g.beginPath();
  g.moveTo(r.x + r.w - k / 2, r.y + rad);
  g.lineTo(r.x + r.w - k / 2, r.y + r.h - k / 2);
  g.lineTo(r.x + rad, r.y + r.h - k / 2);
  g.stroke();
  g.strokeStyle = light;
  g.beginPath();
  g.moveTo(r.x + k / 2, r.y + r.h - rad);
  g.lineTo(r.x + k / 2, r.y + k / 2);
  g.lineTo(r.x + r.w - rad, r.y + k / 2);
  g.stroke();
}

function client(dc: Dc, r: Rect, b: number, th: number, face: string, rad = 0, edge?: string): Rect {
  const g = dc.g;
  const c = { x: r.x + b, y: r.y + th, w: r.w - 2 * b, h: Math.max(0, r.h - th - b) };
  rrect(g, c.x, c.y, c.w, c.h, rad);
  g.fillStyle = face;
  g.fill();
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = 1;
    g.stroke();
  }
  return c;
}

function bar(dc: Dc, r: Rect, fill: number, anim: boolean, track: string, color: string, round = true): void {
  const g = dc.g;
  const rad = round ? r.h / 2 : Math.max(1, 2 * dc.z);
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.fillStyle = track;
  g.fill();
  let x = r.x;
  let w = r.w * fill;
  if (anim) {
    const u = (dc.time * 0.5) % 1.3;
    x = r.x + r.w * (u - 0.3);
    w = r.w * 0.3;
  }
  const x0 = Math.max(r.x, x);
  const x1 = Math.min(r.x + r.w, x + w);
  if (x1 - x0 < 1) return;
  g.save();
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.clip();
  rrect(g, x0, r.y, x1 - x0, r.h, rad);
  g.fillStyle = color;
  g.fill();
  g.restore();
}

// the card the kit asks for (chests, plates, storage…): the palette's own,
// with a focus ring instead of a blurred glow
function cardOf(radius: number, ring: string) {
  return (dc: Dc, r: Rect, o: Parameters<Theme['card']>[2]) => {
    plainCard(dc, r, radius, { ...o, glow: null });
    if (o.glow) {
      const g = dc.g;
      rrect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, Math.max(2, (radius + 2) * dc.z));
      g.strokeStyle = ring;
      g.lineWidth = Math.max(1.5, 2 * dc.z);
      g.stroke();
    }
  };
}

// ---------------- PlayStation ----------------

// The PlayStation (1994), from its own visual language: Teiyu Goto's plain
// light-grey console, Manabu Sakamoto's logo (a red P over an S in yellow,
// green and blue), the controller's four symbols (△ green: a viewpoint;
// ○ red and ✕ blue: yes and no; □ pink: a sheet of paper), black jewel
// cases with ridged spines, and the black boot screen.
const PS_SYM = { tri: '#3ed6a0', circ: '#ff4d5e', cross: '#6aa8ff', sq: '#ff85c0' };
const PS_LOGO = ['#e4002b', '#f9b51b', '#00a651', '#0072ce'];

// The PS1's look: 15-bit colour (5 bits a channel) with a 4×4 ordered
// (Bayer) dither. Applied once to a cached canvas, never per frame.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function psDither(g: CanvasRenderingContext2D): void {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (BAYER4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] / 16 - 0.5) * 8;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = Math.max(0, Math.min(255, d[o + c] + t)) & 0xf8;
    }
  }
  g.putImageData(img, 0, 0);
}

// the logo's four colours as a thin stripe
function logoStripe(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const q = w / 4;
  PS_LOGO.forEach((c, k) => {
    g.fillStyle = c;
    g.fillRect(x + k * q, y, q + 0.5, h);
  });
}

function psSymbol(g: CanvasRenderingContext2D, kind: keyof typeof PS_SYM, x: number, y: number, s: number): void {
  g.beginPath();
  if (kind === 'tri') (g.moveTo(x, y - s), g.lineTo(x + s * 0.95, y + s * 0.7), g.lineTo(x - s * 0.95, y + s * 0.7), g.closePath());
  else if (kind === 'circ') g.arc(x, y, s, 0, Math.PI * 2);
  else if (kind === 'cross') (g.moveTo(x - s, y - s), g.lineTo(x + s, y + s), g.moveTo(x + s, y - s), g.lineTo(x - s, y + s));
  else g.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
  g.stroke();
}

const ps1P: Palette = {
  bg: '#000000', card: '#f1f0ec', panel: '#e4e3de', line: '#9b9a95',
  fg: '#1c1c20', dim: '#55555c', faint: '#8d8b85', accent: '#0072ce', ptr: '#c9337a', ret: '#00864a', wait: '#c77d00', err: '#d9303f',
  param: '#0063b3', cell: '#d2dcf0', track: '#ffffff',
};
export const ps1Theme: Theme = {
  id: 'ps1', name: 'PlayStation', blurb: 'the grey console, the black boot screen, the four colours and △○✕□',
  p: ps1P, ui: RUBIK, mono: MONO('"Share Tech Mono"'), radius: 3, spotlight: 'rgba(0,0,0,0.65)',
  pulseColor: 'rgba(106,168,255,0.85)',
  card: cardOf(3, PS_SYM.cross),
  // storage and stations as the windows are built: bevelled grey plastic under
  // a dark title bar (the logo's colours are kept for the active window)
  panel(dc, r, head, title, live) {
    const g = dc.g;
    plastic(dc, r, Math.max(1, 3 * dc.z), '#e4e3de', '#f6f5f1', '#8f8e89');
    const bar = { x: r.x + 2 * dc.z, y: r.y + 2 * dc.z, w: r.w - 4 * dc.z, h: Math.max(6, head.h - 2 * dc.z) };
    g.fillStyle = live ? '#26262b' : '#6f6e72';
    g.fillRect(bar.x, bar.y, bar.w, bar.h);
    text(dc, bar, title.toUpperCase(), RUBIK, 10, live ? '#f2f2f2' : '#d6d6d9', { w: 600, x: bar.x + 6 * dc.z });
  },
  // the PAL BIOS: a grey blocked background, each block bevelled, then
  // quantised to 15-bit colour with the PS1's 4×4 ordered dither (once, cached)
  background(dc) {
    backdrop(dc, 'ps1-bios', (g, W, H) => {
      g.fillStyle = '#9c9b96';
      g.fillRect(0, 0, W, H);
      const T = 48;
      for (let y = 0, j = 0; y < H; y += T, j++) {
        for (let x = 0, i = 0; x < W; x += T, i++) {
          const v = 150 + Math.round(18 * hash(i * 31 + j * 17 + 5));
          const face = g.createLinearGradient(x, y, x + T, y + T);
          face.addColorStop(0, `rgb(${v + 12},${v + 12},${v + 8})`);
          face.addColorStop(1, `rgb(${v - 16},${v - 16},${v - 20})`);
          g.fillStyle = face;
          g.fillRect(x + 1, y + 1, T - 2, T - 2);
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.fillRect(x + 1, y + 1, T - 2, 1);
          g.fillRect(x + 1, y + 1, 1, T - 2);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x + 1, y + T - 2, T - 2, 1);
          g.fillRect(x + T - 2, y + 1, 1, T - 2);
        }
      }
      psDither(g);
    });
  },
  window: {
    border: 5, corner: 4, titleH: 24, face: '#f1f0ec', workspace: 'rgba(255,255,255,0.04)',
    // the console's grey plastic, bevelled, with the logo's colours under a dark title bar
    frame(dc, r, active, face, kind) {
      softShadow(dc, r, 4, 8, 'rgba(0,0,0,0.7)', 3 * dc.z);
      plastic(dc, r, Math.max(1, 4 * dc.z), active ? '#c8c7c2' : '#b0afaa', '#eeede8', '#6f6e69');
      client(dc, r, Math.max(2, 5 * dc.z), 24 * dc.z, face, 0, '#8f8e89');
      // a machine is the console's top: its vent grille down the left side
      if (kind === 'machine' && r.h > 60 * dc.z) {
        const g = dc.g;
        const x = r.x + 7 * dc.z;
        const w = Math.max(3, 6 * dc.z);
        const top = r.y + 34 * dc.z;
        const bottom = r.y + r.h - 12 * dc.z;
        const step = Math.max(3, 5 * dc.z);
        g.fillStyle = 'rgba(0,0,0,0.05)';
        g.fillRect(x - 1, top - 1, w + 2, bottom - top + 2);
        for (let y = top; y < bottom; y += step) {
          g.fillStyle = 'rgba(70,70,66,0.45)';
          g.fillRect(x, y, w, Math.max(1, step * 0.35));
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(x, y + Math.max(1, step * 0.35), w, Math.max(0.5, step * 0.15));
        }
      }
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const bar = { x: r.x + 3 * dc.z, y: r.y + 3 * dc.z, w: r.w - 6 * dc.z, h: r.h - 8 * dc.z };
      g.fillStyle = active ? '#26262b' : '#57575c';
      g.fillRect(bar.x, bar.y, bar.w, bar.h);
      // the logo's four colours along its lower edge, only on the active
      // window so they mark focus instead of decorating everything
      const k = Math.max(1, 2.5 * dc.z);
      if (active) logoStripe(g, bar.x, bar.y + bar.h - k, bar.w, k);
      else (g.fillStyle = '#77767a'), g.fillRect(bar.x, bar.y + bar.h - k, bar.w, k);
      let right = bar.x + bar.w - 6 * dc.z;
      if (buttons && r.w > 110 * dc.z) {
        const s = Math.max(2.5, 4.2 * dc.z);
        g.lineWidth = Math.max(1, 1.6 * dc.z);
        for (const k of ['sq', 'cross', 'circ', 'tri'] as const) {
          g.strokeStyle = active ? PS_SYM[k] : '#9a9aa0';
          psSymbol(g, k, right - s, bar.y + bar.h / 2, s);
          right -= s * 3;
        }
      }
      text(dc, bar, title, RUBIK, 12, active ? '#f2f2f2' : '#c9c9cc', { w: 500, x: bar.x + 7 * dc.z, right });
    },
    // an old PC case's front panel: a green power light, an amber disk
    // light that flickers while it works, and a segmented load meter
    progress(dc, r, fill, anim) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 2 * dc.z));
      g.fillStyle = '#2b2b30';
      g.fill();
      g.strokeStyle = '#6f6e69';
      g.lineWidth = 1;
      g.stroke();
      const cy = r.y + r.h / 2;
      const d = Math.max(1.5, r.h * 0.2);
      const led = (x: number, on: boolean, c: string) => {
        if (on) {
          g.fillStyle = c + '55';
          g.beginPath(); g.arc(x, cy, d * 2, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = on ? c : '#4a4a50';
        g.beginPath(); g.arc(x, cy, d, 0, Math.PI * 2); g.fill();
      };
      const pad = r.h * 0.5;
      led(r.x + pad, true, '#3dff6a');
      const disk = anim && hash(Math.floor(dc.time * 14)) > 0.35;
      led(r.x + pad + d * 5, disk || (!anim && fill > 0 && fill < 1), '#ffb020');
      // the load meter
      const x0 = r.x + pad + d * 9;
      const w = r.x + r.w - pad * 0.6 - x0;
      const n = Math.max(4, Math.floor(w / Math.max(3, 6 * dc.z)));
      const seg = w / n;
      const level = anim ? 0.35 + 0.5 * Math.abs(Math.sin(dc.time * 2.3)) + 0.1 * hash(Math.floor(dc.time * 9)) : fill;
      const lit = Math.round(n * Math.min(1, level));
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        const c = u < 0.6 ? '#3dff6a' : u < 0.85 ? '#ffb020' : '#ff4040';
        g.fillStyle = k < lit ? c : '#3c3c42';
        g.fillRect(x0 + k * seg + 1, r.y + r.h * 0.28, Math.max(1, seg - 2), r.h * 0.44);
      }
    },
  },
};

// The PlayStation 2 (2000), after Teiyu Goto's own account: "the thin blue
// logo on the large black background" is the Earth, small in the vastness of
// space; a jet-black monolith of stacked, squared-off ridges; the logo's
// single blue lines bending at right angles "as if prisms were refracting a
// laser"; a blue gradient stand; and the boot towers.
// what's active is silver, as on the console's face; Sony keeps its blue
// for the logo (here: the lights: the boot screen's, data in flight, the progress trail)
const PS2_SILVER = '#d6d6dc';
const ORBITRON = F('Orbitron, "Exo 2", sans-serif');
const ps2P: Palette = {
  bg: '#000000', card: '#0d0d10', panel: '#08080a', line: '#2c2c33',
  fg: '#e4e4e8', dim: '#8e8e97', faint: '#55555e', accent: PS2_SILVER, ptr: '#b3a8c4', ret: '#5fd0c8', wait: '#ffcc55', err: '#ff5a6e',
  param: '#c4c4cc', cell: '#17171d', track: '#060607',
};
// the console's matte plastic: a fine, dense grain of light and dark
// specks, pre-rendered once as a tile and laid over a surface anchored to
// it (so it moves with the window, never swims)
let ps2GrainTile: HTMLCanvasElement | null = null;
// when each window's lights came on (keyed by name), for the flash
const ps2Lit = new Map<string, number>();
// the kind of window whose frame was drawn last (its title bar comes next)
let ps2Kind: 'machine' | 'module' | 'node' | undefined;
// the progress trail's sweep, 0..1, shared with the power light
const ps2Phase = (t: number) => (t / 1.6) % 1;
function ps2Grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 1): void {
  if (!ps2GrainTile) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const cg = c.getContext('2d')!;
    const img = cg.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      // 2 px specks (a coarse sandblast), dark pits only: light specks
      // read as dust on a dark screen
      const x = (i % 128) >> 1;
      const y = Math.floor(i / 128) >> 1;
      const r = hash(x * 131 + y * 977 + 3);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 0;
      img.data[i * 4 + 3] = r * 80;
    }
    cg.putImageData(img, 0, 0);
    ps2GrainTile = c;
  }
  const pat = g.createPattern(ps2GrainTile, 'repeat');
  if (!pat) return;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.globalAlpha *= a;
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}
// the ridges: stacked, squared-off grooves across a black slab
function ridges(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number): void {
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x, yy, w, 1);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x, yy + 1, w, 1);
  }
}
// The boot screen ("Sony Computer Entertainment"): black space with a
// low-resolution blue fog in the middle, glass cubes tumbling in it,
// and a few coloured lights sweeping through, each glowing at its head
// and dragging an ultra-sharp hairline trail. The fog is soft (small
// textures scaled up); the cubes and trails are drawn at full resolution. Stateless: a trail is the light's own path sampled back in
// time, so it looks the same at 15 or 60 frames a second and in the
// still preview.
const ps2Still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
// the fog: value noise on a tiny grid, a few octaves, inside a soft oval
function ps2FogTex(seed: number): HTMLCanvasElement {
  const W = 96;
  const H = 60;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const noise = (x: number, y: number, s: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const h = (i: number, j: number) => hash(i * 131 + j * 977 + s * 7919);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
    const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let n = 0;
      let amp = 0.55;
      for (let o = 0; o < 4; o++) (n += amp * noise((x / W) * 5 * 2 ** o, (y / H) * 3 * 2 ** o, seed + o)), (amp /= 2);
      const dx = (x / W - 0.5) / 0.42;
      const dy = (y / H - 0.47) / 0.42;
      const mask = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const d = Math.max(0, n - 0.3) * 2.2 * mask ** 1.2;
      const k = (y * W + x) * 4;
      img.data[k] = 20 + 26 * d;
      img.data[k + 1] = 22 + 26 * d;
      img.data[k + 2] = 110 + 70 * d;
      img.data[k + 3] = Math.min(255, 255 * d * 0.6);
    }
  g.putImageData(img, 0, 0);
  return c;
}
let ps2Fogs: HTMLCanvasElement[] | null = null;
const ps2Cubes = Array.from({ length: 6 }, (_, i) => ({
  x: [-0.34, 0.36, -0.1, 0.18, -0.42, 0.44][i], y: [-0.28, -0.3, -0.05, 0.2, 0.3, 0.26][i],
  s: 0.06 + 0.06 * hash(i * 5 + 1), depth: 0.1 + 0.12 * hash(i * 23 + 6), rx: 0.05 + 0.08 * hash(i * 7 + 2), ry: 0.04 + 0.07 * hash(i * 11 + 3), p: Math.PI * 2 * hash(i * 13 + 4),
}));
const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];
const ps2Lights = [
  { col: '#ff4a5e', a: 0.23, b: 0.31, c: 0.17, p: [0.3, 1.9, 4.1, 0.7] },
  { col: '#3dff72', a: 0.29, b: 0.19, c: 0.23, p: [2.4, 0.2, 1.3, 2.9] },
  { col: '#9b7dff', a: 0.19, b: 0.27, c: 0.29, p: [4.6, 3.3, 0.4, 5.1] },
  { col: '#4f78ff', a: 0.26, b: 0.23, c: 0.2, p: [1.1, 5.2, 2.7, 3.8] },
];
const ps2Sprites = new Map<string, HTMLCanvasElement>();
function ps2Sprite(col: string): HTMLCanvasElement {
  let c = ps2Sprites.get(col);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.12, col);
    r.addColorStop(0.35, col + '66');
    r.addColorStop(1, col + '00');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    ps2Sprites.set(col, c);
  }
  return c;
}
// Parallax: each layer follows the camera by a fraction of the grid's own
// motion (fog least, then the lights, the cubes most, each at its own
// depth), and zooms by a small power of the grid's zoom. Cubes wrap around;
// the fog and lights ease to a stop so they never leave the screen.
type Pan = { x: number; y: number; cx: number; cy: number; vw: number; vh: number };
const newPan = (): Pan => ({ x: 0, y: 0, cx: NaN, cy: NaN, vw: 0, vh: 0 });
// how far the grid has moved on screen, added up frame by frame: a zoom
// (anchored at the mouse) moves the grid at most the mouse's distance
// from the middle, so zooming far out or in never flings the layers
function trackPan(P: Pan, dc: Dc, camX: number, camY: number): void {
  const cx = camX + dc.vw / 2 / dc.cs;
  const cy = camY + dc.vh / 2 / dc.cs;
  if (P.vw === dc.vw && P.vh === dc.vh && Number.isFinite(P.cx)) (P.x += (cx - P.cx) * dc.cs), (P.y += (cy - P.cy) * dc.cs);
  Object.assign(P, { cx, cy, vw: dc.vw, vh: dc.vh });
}
const ps2Pan = newPan();
function ps2Boot(dc: Dc, camX: number, camY: number): void {
  const g = dc.g;
  const t = ps2Still || !dc.time ? 40 : dc.time;
  const W = dc.vw;
  const H = dc.vh;
  trackPan(ps2Pan, dc, camX, camY);
  const panX = ps2Pan.x;
  const panY = ps2Pan.y;
  const soft = (v: number, lim: number) => lim * Math.tanh(v / lim);
  const zoomOf = (zf: number) => Math.min(1.8, Math.max(0.7, dc.z ** zf));
  const layer = (k: number, zf: number, lim: number) => {
    const sc = zoomOf(zf);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(W / 2 - soft(panX * k, lim), H / 2 - soft(panY * k, lim));
    g.scale(sc, sc);
    g.translate(-W / 2, -H / 2);
  };
  const dpr = g.getTransform().a;
  g.save();
  g.imageSmoothingEnabled = true;
  // the fog: two layers drifting against each other, breathing a little
  ps2Fogs ??= [ps2FogTex(1), ps2FogTex(9)];
  layer(0.03, 0.12, W * 0.1);
  for (let i = 0; i < 2; i++) {
    const dir = i ? -1 : 1;
    const ox = Math.sin(t * 0.045 + i * 2) * W * 0.04 * dir;
    const oy = Math.cos(t * 0.037 + i) * H * 0.03;
    g.globalAlpha = i ? 0.55 + 0.1 * Math.sin(t * 0.3) : 0.85;
    g.drawImage(ps2Fogs[i], -W * 0.08 + ox, -H * 0.08 + oy, W * 1.16, H * 1.16);
  }
  g.globalAlpha = 1;
  // the glass cubes, sharp: faces sorted back to front; the far ones barely
  // there, the near ones tinted by where they point and crossed by a
  // reflection band that slides as the cube turns; no outlines
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sc = zoomOf(0.35);
  const wrap = (v: number, lo: number, span: number) => lo + ((((v - lo) % span) + span) % span);
  const u = Math.min(W, H) * sc;
  const LX = -0.45, LY = -0.6, LZ = 0.66; // the light: above, left, in front
  g.lineJoin = 'round';
  for (const C of ps2Cubes) {
    const ax = C.p + t * C.rx;
    const ay = C.p * 0.7 + t * C.ry;
    const v3 = CUBE_V.map(([x, y, z]) => {
      const y1 = y * Math.cos(ax) - z * Math.sin(ax);
      const z1 = y * Math.sin(ax) + z * Math.cos(ax);
      return [x * Math.cos(ay) + z1 * Math.sin(ay), y1, -x * Math.sin(ay) + z1 * Math.cos(ay)];
    });
    const cx = W / 2 + (wrap(W / 2 + C.x * W - panX * C.depth, -W * 0.2, W * 1.4) - W / 2) * sc;
    const cy = H / 2 + (wrap(H * 0.47 + C.y * H - panY * C.depth, -H * 0.25, H * 1.5) - H / 2) * sc;
    const pts = v3.map(([x, y, z]) => {
      const k = 3 / (4 - z * 0.6);
      return [cx + x * C.s * u * k, cy + y * C.s * u * k];
    });
    const faces = CUBE_F.map((f) => {
      // a cube face's centre is its outward normal
      const n = [0, 1, 2].map((i) => f.reduce((sum, v) => sum + v3[v][i], 0) / 4);
      return { f, n };
    }).sort((p, q) => p.n[2] - q.n[2]);
    for (const { f, n } of faces) {
      const path = () => {
        g.beginPath();
        f.forEach((v, i) => (i ? g.lineTo(pts[v][0], pts[v][1]) : g.moveTo(pts[v][0], pts[v][1])));
        g.closePath();
      };
      path();
      if (n[2] <= 0) {
        g.fillStyle = 'rgba(3,5,16,0.12)';
        g.fill();
        continue;
      }
      const lit = Math.max(0, n[0] * LX + n[1] * LY + n[2] * LZ);
      const xs = f.map((v) => pts[v][0]);
      const ys = f.map((v) => pts[v][1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      // dark glass, lighter where it faces the light
      const body = g.createLinearGradient(x0, y0, x1, y1);
      body.addColorStop(0, `rgba(${60 + 70 * lit | 0},${80 + 70 * lit | 0},${170 + 50 * lit | 0},${0.05 + 0.09 * lit})`);
      body.addColorStop(1, 'rgba(4,6,22,0.24)');
      g.fillStyle = body;
      g.fill();
      // the reflection: a soft band with a sharp core, placed by the face's angle
      g.save();
      path();
      g.clip();
      const at = Math.min(0.92, Math.max(0.08, 0.5 + n[0] * 0.7 - n[1] * 0.5));
      const band = g.createLinearGradient(x0, y0, x1, y1);
      const a = 0.04 + 0.16 * lit * n[2];
      band.addColorStop(Math.max(0, at - 0.22), 'rgba(200,220,255,0)');
      band.addColorStop(Math.max(0, at - 0.03), `rgba(200,220,255,${a * 0.5})`);
      band.addColorStop(at, `rgba(235,242,255,${a})`);
      band.addColorStop(Math.min(1, at + 0.05), `rgba(200,220,255,${a * 0.25})`);
      band.addColorStop(Math.min(1, at + 0.15), 'rgba(200,220,255,0)');
      g.fillStyle = band;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.restore();
    }
  }
  // the lights: a glowing head, a hairline trail
  layer(0.07, 0.25, W * 0.2);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  const at = (L: (typeof ps2Lights)[number], tt: number) => {
    const x3 = Math.sin(L.a * tt * 2.2 + L.p[0]) * (0.7 + 0.3 * Math.sin(0.11 * tt + L.p[3]));
    const y3 = Math.sin(L.b * tt * 2.2 + L.p[1]);
    const z3 = Math.cos(L.c * tt * 2.2 + L.p[2]);
    const k = 1.6 / (2.6 - z3);
    return { x: W / 2 + x3 * W * 0.46 * k, y: H * 0.47 + y3 * H * 0.36 * k, k };
  };
  const N = 90;
  for (const L of ps2Lights) {
    let prev = at(L, t - N * 0.018);
    for (let n = N - 1; n >= 0; n--) {
      const cur = at(L, t - n * 0.018);
      g.globalAlpha = (1 - n / N) ** 1.6 * 0.9;
      g.strokeStyle = L.col;
      g.lineWidth = n < 8 ? 1.4 : 1;
      g.beginPath();
      g.moveTo(prev.x, prev.y);
      g.lineTo(cur.x, cur.y);
      g.stroke();
      prev = cur;
    }
    const d = 26 * prev.k;
    g.globalAlpha = 1;
    g.drawImage(ps2Sprite(L.col), prev.x - d / 2, prev.y - d / 2, d, d);
  }
  g.restore();
}

export const ps2Theme: Theme = {
  id: 'ps2', name: 'PlayStation 2', blurb: 'the black monolith and the boot screen: blue fog, glass cubes, sharp trails of light',
  p: ps2P, ui: EXO, mono: MONO('"Share Tech Mono"'), radius: 0, spotlight: 'rgba(0,0,0,0.65)',
  pulseColor: 'rgba(63,107,255,0.9)',
  flow: '#3f6bff', // data in motion is the console's blue light
  card(dc, r, o) {
    const g = dc.g;
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(0,0,0,0.35)' : o.kind === 'frame' || o.kind === 'plate' ? ps2P.panel : ps2P.card;
      g.fillRect(r.x, r.y, r.w, r.h);
      if (o.kind !== 'wall') ps2Grain(g, r.x, r.y, r.w, r.h, 0.8);
    }
    // no glowing borders: plates keep their colour, everything else a hairline
    g.strokeStyle = o.kind === 'plate' ? o.stroke : 'rgba(255,255,255,0.1)';
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  },
  // belts: a hairline; a live one carries lights running along it like the
  // progress light (a hot core fading back over a soft glow), one every
  // 360 px or so, in the direction the data goes
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected) strokeLine(g, pts, Math.max(5, 8 * z), 'rgba(255,255,255,0.06)');
    const base = o.live ? 'rgba(63,107,255,0.4)' : o.hovered || o.selected ? ps2P.dim : ps2P.faint;
    strokeLine(g, pts, Math.max(1, 1.4 * z), base);
    const w = new Walk(pts);
    const end = w.at(w.length);
    arrowHead(g, end.x, end.y, end.dx, end.dy, Math.max(5, 7 * z), o.live ? '#6a8cff' : base);
    if (o.live && w.length > 4) {
      const gap = Math.max(120, 360 * z);
      const tail = Math.min(w.length * 0.6, Math.max(40, 150 * z));
      const run = (dc.time * 260 * z) % gap;
      const N = 16;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let head = run; head < w.length + tail; head += gap) {
        let prev: { x: number; y: number } | null = null;
        for (let k = 0; k <= N; k++) {
          const d = head - tail + (tail * k) / N;
          if (d < 0 || d > w.length) { prev = null; continue; }
          const q = w.at(o.dir < 0 ? w.length - d : d);
          if (prev) {
            const f = (k / N) ** 1.6;
            g.beginPath();
            g.moveTo(prev.x, prev.y);
            g.lineTo(q.x, q.y);
            g.strokeStyle = 'rgba(47,107,255,1)';
            g.globalAlpha = f * 0.3;
            g.lineWidth = Math.max(3, 5 * z);
            g.stroke();
            g.strokeStyle = '#d4ddff';
            g.globalAlpha = f;
            g.lineWidth = Math.max(1, 1.2 * z);
            g.stroke();
          }
          prev = q;
        }
        if (head <= w.length) {
          const q = w.at(o.dir < 0 ? w.length - head : head);
          const d = Math.max(10, 16 * z);
          g.globalAlpha = 1;
          g.drawImage(ps2Sprite('#4f78ff'), q.x - d / 2, q.y - d / 2, d, d);
        }
      }
      g.restore();
    }
    countBadge(dc, pts, o, t);
  },
  // storage and stations: the window, pared down. Graphite with the grain,
  // a hairline edge, a short ridged head with a small grey title
  panel(dc, r, head, title, live) {
    const g = dc.g;
    g.fillStyle = 'rgba(11,11,14,0.92)';
    g.fillRect(r.x, r.y, r.w, r.h);
    ps2Grain(g, r.x, r.y, r.w, r.h);
    ridges(g, r.x, r.y, r.w, head.h, Math.max(3, 6 * dc.z));
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(r.x, r.y + head.h, r.w, 1);
    text(dc, { ...head, x: r.x, w: r.w }, title.toUpperCase(), ORBITRON, 8.5, live ? '#d6d6dc' : '#7c7c85', { w: 500, x: r.x + 8 * dc.z });
  },
  // data in flight leaves the boot lights' trail: a hairline fading toward
  // the tail over a faint glow, a glowing head under the data
  trail(dc, pts, kind) {
    const g = dc.g;
    const col = kind === 'ret' ? '#5fd0c8' : '#4f78ff';
    const hot = kind === 'ret' ? '#c8fff6' : '#d4ddff';
    const n = pts.length - 1;
    if (n < 1) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.strokeStyle = col;
    const core = Math.max(1, Math.min(2, 1.3 * dc.z));
    for (let i = 1; i <= n; i++) {
      const f = (i / n) ** 1.5;
      g.beginPath();
      g.moveTo(pts[i - 1][0], pts[i - 1][1]);
      g.lineTo(pts[i][0], pts[i][1]);
      g.strokeStyle = col;
      g.globalAlpha = f * 0.22;
      g.lineWidth = core * 7;
      g.stroke();
      g.strokeStyle = hot;
      g.globalAlpha = f;
      g.lineWidth = core;
      g.stroke();
    }
    const [x, y] = pts[n];
    const d = Math.max(14, 24 * dc.z);
    g.globalAlpha = 0.9;
    g.drawImage(ps2Sprite(col), x - d / 2, y - d / 2, d, d);
    g.restore();
  },
  // the boot screen: black space, the fog, the cubes and the lights
  background(dc, camX, camY) {
    backdrop(dc, 'ps2-space', (g, W, H) => {
      g.fillStyle = '#000003';
      g.fillRect(0, 0, W, H);
    });
    ps2Boot(dc, camX, camY);
  },
  window: {
    border: 2, corner: 0, titleH: 26, face: 'rgba(4,5,9,0.25)', workspace: 'rgba(255,255,255,0.02)',
    // a black slab: stacked ridges along the head, thin lines turning at the corners
    frame(dc, r, active, face, kind) {
      const g = dc.g;
      ps2Kind = kind;
      softShadow(dc, r, 1, 10, 'rgba(0,0,0,0.8)', 3 * dc.z);
      // smoked, not solid: the dancing lights glow through between the panels
      g.fillStyle = 'rgba(8,9,12,0.82)';
      g.fillRect(r.x, r.y, r.w, r.h);
      ps2Grain(g, r.x, r.y, r.w, r.h);
      ridges(g, r.x, r.y, r.w, 26 * dc.z, Math.max(3, 5 * dc.z));
      g.fillStyle = face;
      g.fillRect(r.x + 2 * dc.z, r.y + 26 * dc.z, r.w - 4 * dc.z, Math.max(0, r.h - 28 * dc.z));
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      // focus isn't an outline: the power light says it (titleBar)
      // a machine is the console standing up: the raised side block down its
      // right edge, with two columns of short vertical slits
      if (kind === 'machine' && r.h > 60 * dc.z) {
        const z = dc.z;
        const bw = Math.max(5, 10 * z);
        const x = r.x + r.w - 4 * z - bw;
        const top = r.y + 32 * z;
        const bottom = r.y + r.h - 10 * z;
        g.fillStyle = '#16161a';
        g.fillRect(x, top, bw, bottom - top);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, top, 1, bottom - top);
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(x + bw - 1, top, 1, bottom - top);
        const sw = Math.max(1, 1.6 * z);
        const sh = Math.max(3, 7 * z);
        const step = sh + Math.max(1.5, 3 * z);
        for (let y = top + 4 * z; y + sh < bottom - 3 * z; y += step)
          for (const cx of [x + bw * 0.32, x + bw * 0.68]) {
            g.fillStyle = '#000000';
            g.fillRect(cx - sw / 2, y, sw, sh);
            g.fillStyle = 'rgba(255,255,255,0.16)';
            g.fillRect(cx - sw / 2, y + sh, sw, Math.max(0.5, 0.6 * z));
          }
      }
    },
    titleBar(dc, r, title, active, buttons) {
      text(dc, r, title.toUpperCase(), ORBITRON, 11, active ? '#f0f0f3' : '#7c7c85', { w: 500, x: r.x + 10 * dc.z });
      // one light, the power light. Idle: standby (dim red). Active: green,
      // flashing quickly when the window becomes active; on a function box
      // it also flares each time the progress trail reaches the right end,
      // as if the light ran into it.
      if (buttons && r.w > 110 * dc.z) {
        const g = dc.g;
        const z = dc.z;
        const key = title.split(' ')[0];
        if (active && !ps2Lit.has(key)) ps2Lit.set(key, dc.time);
        if (!active) ps2Lit.delete(key);
        const since = dc.time - (ps2Lit.get(key) ?? -9);
        const on = active && (since > 0.72 || Math.floor(since * 11) % 2 === 0);
        const ph = ps2Phase(dc.time);
        const flare = on && ps2Kind === 'node' ? (ph < 0.18 ? 1 - ph / 0.18 : 0) : 0;
        const y = r.y + r.h / 2;
        const s = Math.max(2, 3 * z);
        const px = r.x + r.w - 12 * z;
        g.fillStyle = on ? (flare > 0.3 ? '#b8ffc0' : '#2ee048') : active ? '#0f3a17' : '#5a1a1c';
        g.fillRect(px - s, y - s, s * 2, s * 2);
        if (on) {
          const d = s * (6 + 6 * flare);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.55 + 0.45 * flare;
          g.drawImage(ps2Sprite('#1ed03a'), px - d / 2, y - d / 2, d, d);
          g.restore();
        }
      }
    },
    // a light running along a hairline, trailing like the boot lights; when
    // it reaches the right end the power light flares (titleBar)
    progress(dc, r, fill, anim) {
      const g = dc.g;
      const y = Math.round(r.y + r.h / 2) + 0.5;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(r.x, y - 0.5, r.w, 1);
      const f = anim ? ps2Phase(dc.time) : fill;
      const x = r.x + r.w * f;
      if (x <= r.x + 1) return;
      const tail = Math.max(r.x, x - r.w * 0.5);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      const glow = g.createLinearGradient(tail, 0, x, 0);
      glow.addColorStop(0, 'rgba(47,107,255,0)');
      glow.addColorStop(1, anim ? 'rgba(47,107,255,0.35)' : 'rgba(47,107,255,0.15)');
      g.strokeStyle = glow;
      g.lineWidth = Math.max(3, 5 * dc.z);
      g.beginPath(); g.moveTo(tail, y); g.lineTo(x, y); g.stroke();
      const core = g.createLinearGradient(tail, 0, x, 0);
      core.addColorStop(0, 'rgba(212,221,255,0)');
      core.addColorStop(1, anim ? 'rgba(212,221,255,1)' : 'rgba(212,221,255,0.45)');
      g.strokeStyle = core;
      g.lineWidth = Math.max(1, 1.2 * dc.z);
      g.beginPath(); g.moveTo(tail, y); g.lineTo(x, y); g.stroke();
      if (anim) {
        const d = Math.max(10, 16 * dc.z);
        g.drawImage(ps2Sprite('#4f78ff'), x - d / 2, y - d / 2, d, d);
      }
      g.restore();
    },
  },
};

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
const ps3Dust = Array.from({ length: 170 }, (_, i) => {
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
// the ribbon's shape at u (0..1 across the page) and time t, as fractions of
// the page's height: its middle, and its half-width (negative where twisted)
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
      rg.globalAlpha = 0.06 + 0.09 * hash(i * 7 + 1);
      rg.beginPath();
      rows[i].forEach((y, k) => (k ? rg.lineTo(X(xs[k]), y) : rg.moveTo(X(xs[k]), y)));
      for (let k = xs.length - 1; k >= 0; k--) rg.lineTo(X(xs[k]), rows[i + 2][k]);
      rg.closePath();
      rg.fill();
    }
    rg.lineWidth = 0.8;
    for (let i = 0; i < N; i++) {
      rg.globalAlpha = 0.1 + 0.25 * hash(i * 11 + 3) + (i === 0 || i === N - 1 ? 0.2 : 0);
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
type Rgb = [number, number, number];
type Sky = { top: Rgb; mid: Rgb; bot: Rgb };
const rgbOf = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const toward = (c: Rgb, to: number, f: number): Rgb => c.map((v) => v + (to - v) * f) as Rgb;
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
export const ps3Theme: Theme = {
  id: 'ps3', name: 'PlayStation 3', blurb: 'the XMB: the wave, the sparkles, frosted panes, jelly icons; pick its colour on the top bar',
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

// PS4, from its system screens (Friends, Communities, Remote Play): a deep
// royal blue, lighter at the top left and sinking to navy at the bottom
// right, crossed by a few broad soft streaks of light; the content on
// lighter see-through blue cards with thin pale edges; fields dark navy
// with a white edge; focus a crisp white border; SST at light weights.
const ps4P: Palette = {
  bg: '#0538bc', card: 'rgba(80,140,255,0.24)', panel: 'rgba(80,140,255,0.18)', line: 'rgba(150,190,255,0.5)',
  fg: '#ffffff', dim: '#c6d6ff', faint: '#8aa6e8', accent: '#ffffff', ptr: '#ffd27a', ret: '#8ef0b8', wait: '#ffd166', err: '#ff8080',
  param: '#cfe0ff', cell: 'rgba(255,255,255,0.12)', track: 'rgba(0,12,70,0.35)',
};
// The background, after the PS4's welcome screen: one long twisted
// triangular prism at a time, following a slow arc across the view, flared
// at its head and tail but faded to nothing there, so only its pinched body
// shows. Of its three faces one is the sky's top colour, one the sky's
// middle (so near the middle it all but melts in) and the third isn't drawn;
// one edge carries a thick line of the top colour. Each face is one flat
// shape per stretch where it faces the viewer, faded toward the ends by one
// gradient along the chord: no banding, and cheap. It sweeps across in about
// 12 s, spinning as it goes, fading in and out. Stateless in time.
function ps4Prism(dc: Dc): void {
  const g = dc.g;
  const W = dc.vw;
  const H = dc.vh;
  const t = ps2Still || !dc.time ? 40 : dc.time;
  const P = 12;
  const n = Math.floor(t / P);
  const p = t / P - n;
  const hh = (k: number) => hash(n * 97 + k * 13 + 5);
  const fade = Math.sin(Math.PI * p) ** 0.7;
  // the arc: a slice of a circle centred off beyond one side of the view
  const diag = Math.hypot(W, H);
  const phi = hh(1) * Math.PI * 2;
  const D = diag * (0.7 + 0.3 * hh(2));
  const R = D * (0.8 + 0.2 * hh(3));
  const ox = W / 2 + Math.cos(phi) * D;
  const oy = H / 2 + Math.sin(phi) * D;
  const way = hh(4) < 0.5 ? -1 : 1;
  const span = 1.2 + 0.4 * hh(5);
  const mid = phi + Math.PI + way * (-0.8 + 1.6 * p);
  // flared at head and tail, pinched in the body (the ends fade out anyway)
  const rmin = H * (0.035 + 0.02 * hh(6));
  const rmax = H * (0.16 + 0.06 * hh(9));
  const spin = t * 0.45 * (hh(7) < 0.5 ? -1 : 1);
  const twist = (1.0 + 1.0 * hh(8)) * Math.PI;
  const N = 72;
  const ring: { x: number; y: number }[][] = [];
  const ang: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const th = mid - span / 2 + span * s;
    const cx = ox + Math.cos(th) * R, cy = oy + Math.sin(th) * R;
    const nx = -Math.cos(th), ny = -Math.sin(th);
    const r = rmin + (rmax - rmin) * Math.abs(Math.cos(Math.PI * s)) ** 1.6;
    const tw = spin + twist * s;
    ang.push(tw);
    const tri: { x: number; y: number }[] = [];
    for (let k = 0; k < 3; k++) {
      const a = tw + (k * 2 * Math.PI) / 3;
      tri.push({ x: cx + nx * r * Math.cos(a), y: cy + ny * r * Math.cos(a) });
    }
    ring.push(tri);
  }
  // the colours: the top of the sky and its middle, faded to nothing toward
  // the head and tail along the shape's chord
  const th0 = mid - span / 2, th1 = mid + span / 2;
  const x0 = ox + Math.cos(th0) * R, y0 = oy + Math.sin(th0) * R;
  const x1 = ox + Math.cos(th1) * R, y1 = oy + Math.sin(th1) * R;
  const along = (rgb: string, a: number) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(0.3, `rgba(${rgb},${a * fade})`);
    gr.addColorStop(0.7, `rgba(${rgb},${a * fade})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    return gr;
  };
  const TOP = '10,95,174';
  const MID = '6,62,192';
  // a face's visible stretches: where its outward normal turns to the viewer
  const faceRuns = (k: number) => {
    const runs: [number, number][] = [];
    let start = -1;
    for (let i = 0; i < N; i++) {
      const a = (ang[i] + ang[i + 1]) / 2 + ((k + 0.5) * 2 * Math.PI) / 3;
      const vis = Math.sin(a) > 0;
      if (vis && start < 0) start = i;
      if (!vis && start >= 0) runs.push([start, i]), (start = -1);
    }
    if (start >= 0) runs.push([start, N]);
    return runs;
  };
  g.save();
  // face 0 the sky's top colour, face 1 its middle; face 2 isn't drawn
  for (const [k, rgb, a] of [[1, MID, 0.8], [0, TOP, 0.75]] as const) {
    g.fillStyle = along(rgb, a);
    g.beginPath();
    for (const [i0, i1] of faceRuns(k)) {
      g.moveTo(ring[i0][k].x, ring[i0][k].y);
      for (let i = i0 + 1; i <= i1; i++) g.lineTo(ring[i][k].x, ring[i][k].y);
      for (let i = i1; i >= i0; i--) g.lineTo(ring[i][(k + 1) % 3].x, ring[i][(k + 1) % 3].y);
      g.closePath();
    }
    g.fill();
  }
  // one edge carries a thick line of the top colour, where it shows
  g.strokeStyle = along(TOP, 0.9);
  g.lineWidth = Math.max(2, H / 260);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  for (const [i0, i1] of faceRuns(0)) {
    g.moveTo(ring[i0][0].x, ring[i0][0].y);
    for (let i = i0 + 1; i <= i1; i++) g.lineTo(ring[i][0].x, ring[i][0].y);
  }
  g.stroke();
  g.restore();
}
// A belt as the PS4's progress bar: a flat track; live, a white fill runs
// along it the data's way. The gimmick: as a fill moves, controller symbols
// (○ □ △ ✕, picked at random) burst out behind it, drifting off the line,
// turning and fading. Stateless: a symbol is spawned at the fill's head on a
// fixed tick, so its place and age follow from the time alone.
function ps4Span(g: CanvasRenderingContext2D, w: Walk, a: number, b: number): void {
  a = Math.max(0, a);
  b = Math.min(w.length, b);
  if (b - a < 0.5) return;
  const p = w.at(a);
  g.beginPath();
  g.moveTo(p.x, p.y);
  for (const s of w.segs) if (s.at > a && s.at < b) g.lineTo(s.x, s.y);
  const q = w.at(b);
  g.lineTo(q.x, q.y);
  g.stroke();
}
function ps4Symbol(g: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number, rot: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  if (kind === 0) g.arc(0, 0, r, 0, Math.PI * 2);
  else if (kind === 1) g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
  else if (kind === 2) {
    g.moveTo(0, -r);
    g.lineTo(r * 0.95, r * 0.7);
    g.lineTo(-r * 0.95, r * 0.7);
    g.closePath();
  } else {
    g.moveTo(-r, -r);
    g.lineTo(r, r);
    g.moveTo(r, -r);
    g.lineTo(-r, r);
  }
  g.stroke();
  g.restore();
}
function ps4Belt(dc: Dc, pts: [number, number][], o: { live: boolean; dir: number; selected: boolean; hovered: boolean }): void {
  const g = dc.g;
  const z = dc.z;
  const w = new Walk(pts);
  const L = w.length;
  if (L < 1) return;
  g.save();
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  const th = Math.max(3, 4 * z);
  g.lineWidth = th;
  g.strokeStyle = o.live ? 'rgba(255,255,255,0.28)' : o.selected || o.hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.18)';
  ps4Span(g, w, 0, L);
  if (o.live) {
    const t = ps2Still ? 20 : dc.time || 0;
    const speed = 90 * z;
    const gap = Math.max(160, 380 * z);
    const seg = Math.min(L * 0.4, Math.max(40, 110 * z));
    const along = (d: number) => (o.dir < 0 ? L - d : d);
    // the fills: white segments, their heads leading the data's way
    g.strokeStyle = '#ffffff';
    const D = t * speed;
    for (let head = D % gap; head < L + seg; head += gap) {
      const a = along(head - seg), b = along(head);
      ps4Span(g, w, Math.min(a, b), Math.max(a, b));
    }
    // the symbols, spawned at a head every tick, living `life` seconds
    const tick = 0.11;
    const life = 1.1;
    const seed = Math.round(L / z);
    g.lineWidth = Math.max(1, 1.3 * z);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const now = Math.floor(t / tick);
    for (let j = 0; j * tick < life; j++) {
      const i = now - j;
      const ts = i * tick;
      const age = t - ts;
      if (age < 0 || age > life) continue;
      const Ds = ts * speed;
      for (let m = Math.floor((Ds - L) / gap); m <= Math.floor(Ds / gap); m++) {
        const head = Ds - m * gap;
        if (head < 0 || head > L) continue;
        const h = (k: number) => hash(i * 7 + m * 131 + seed * 3 + k * 977);
        if (h(0) < 0.35) continue; // not every tick: a burst, not a stream
        const q = w.at(along(head));
        const side = h(1) < 0.5 ? -1 : 1;
        const out = age * (18 + 34 * h(2)) * z + th;
        const back = age * (8 + 16 * h(3)) * z * (o.dir < 0 ? -1 : 1);
        const x = q.x - q.dx * back - q.dy * out * side;
        const y = q.y - q.dy * back + q.dx * out * side;
        const f = 1 - age / life;
        g.strokeStyle = `rgba(210,228,255,${0.85 * f ** 1.5})`;
        ps4Symbol(g, Math.floor(h(4) * 4), x, y, (3 + 2.5 * h(5)) * z * (0.8 + 0.4 * (1 - f)), h(6) * 6.28 + age * (h(7) - 0.5) * 4);
      }
    }
  }
  g.restore();
}
export const ps4Theme: Theme = {
  id: 'ps4', name: 'PlayStation 4', blurb: 'the system screens: royal blue, lighter cards with pale edges, a white border on focus',
  p: ps4P, ui: SST, mono: MONO('"JetBrains Mono"'), radius: 0, spotlight: 'rgba(0,10,60,0.5)',
  pulseColor: 'rgba(255,255,255,0.9)',
  belt(dc, pts, o, t) {
    ps4Belt(dc, pts, o);
    countBadge(dc, pts, o, t);
  },
  card(dc, r, o) {
    const g = dc.g;
    if (o.kind === 'plate') {
      // values in flight: the dark navy input field with a white edge
      g.fillStyle = 'rgba(3,5,42,0.92)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = o.glow ? '#ffffff' : 'rgba(220,230,255,0.8)';
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      return;
    }
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(255,255,255,0.04)' : o.kind === 'frame' ? ps4P.panel : ps4P.card;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    // focus is a crisp white border; otherwise a thin pale edge
    g.strokeStyle = o.glow ? '#ffffff' : 'rgba(150,190,255,0.45)';
    g.lineWidth = o.glow ? Math.max(2, 3 * dc.z) : 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  },
  // storage and stations: a lighter card, its title over a pale rule
  panel(dc, r, head, title, live) {
    const g = dc.g;
    g.fillStyle = ps4P.card;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = live ? 'rgba(200,220,255,0.8)' : 'rgba(150,190,255,0.45)';
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    g.fillStyle = 'rgba(150,190,255,0.45)';
    g.fillRect(r.x, head.y + head.h - 1, r.w, 1);
    text(dc, head, title, SST, 12, live ? '#ffffff' : '#c6d6ff', { w: 400, x: head.x + 8 * dc.z });
  },
  background(dc) {
    backdrop(dc, 'ps4-welcome', (g, W, H) => {
      // the welcome screen: azure at the top, bright royal blue through the
      // middle, sinking to near-black navy at the bottom
      const sky = g.createLinearGradient(0, 0, W * 0.12, H);
      sky.addColorStop(0, '#0a5fae');
      sky.addColorStop(0.35, '#0746c4');
      sky.addColorStop(0.55, '#0538bc');
      sky.addColorStop(0.82, '#031a78');
      sky.addColorStop(1, '#010a2e');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.max(W, H) * 0.5);
      glow.addColorStop(0, 'rgba(20,80,235,0.28)');
      glow.addColorStop(1, 'rgba(20,80,235,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
    });
    // one twisted prism sweeping through, in shades of the sky only
    ps4Prism(dc);
  },
  window: {
    border: 0, corner: 0, titleH: 28, face: 'rgba(3,30,76,0.8)', workspace: 'rgba(255,255,255,0.05)',
    // as the PS3's: files and machines have no pane, only a faint outline,
    // so their storage, stations and function box sit on the background;
    // the function box alone is a panel
    frame(dc, r, active, _face, kind) {
      const g = dc.g;
      if (kind === 'node') {
        g.fillStyle = ps4P.card;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = active ? '#ffffff' : 'rgba(150,190,255,0.45)';
        g.lineWidth = active ? Math.max(2, 3 * dc.z) : 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        return;
      }
      g.lineWidth = 1;
      g.strokeStyle = `rgba(255,255,255,${active ? 0.3 : 0.1})`;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    },
    // the title over a thin white rule; on the active window the rule is
    // the console's light bar, glowing blue
    titleBar(dc, r, title, active) {
      const g = dc.g;
      text(dc, r, title, SST, 14, active ? '#ffffff' : '#cfe0f5', { w: active ? 400 : 300, x: r.x + 10 * dc.z });
      const y = r.y + r.h - 1;
      if (active) {
        g.fillStyle = 'rgba(95,177,255,0.35)';
        g.fillRect(r.x, y - 1.5 * dc.z, r.w, 4 * dc.z);
        g.fillStyle = '#8fd0ff';
        g.fillRect(r.x, y, r.w, Math.max(1, 1.5 * dc.z));
      } else {
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillRect(r.x, y, r.w, 1);
      }
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      const h = Math.max(2, Math.min(r.h, 5 * dc.z));
      const y = r.y + (r.h - h) / 2;
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(r.x, y, r.w, h);
      const x = anim ? r.x + r.w * (((dc.time * 0.5) % 1.3) - 0.3) : r.x;
      const w = anim ? r.w * 0.3 : r.w * fill;
      const a = Math.max(r.x, x);
      const e = Math.min(r.x + r.w, x + w);
      if (e > a) (g.fillStyle = '#ffffff'), g.fillRect(a, y, e - a, h);
    },
  },
};

// PS5, after its home screen (and khaledOghli/PS5_Online's measurements):
// near-black under the selected game's art, blurred and darkened; cards with
// 17px corners on rgba(0,0,0,.65); the focus is a white ring standing a few
// pixels off the card; SST, light for the rest, medium for the focused.
const ps5P: Palette = {
  bg: '#0b0c10', card: 'rgba(28,29,36,0.82)', panel: 'rgba(20,21,27,0.9)', line: 'rgba(255,255,255,0.12)',
  fg: '#f5f6f8', dim: '#a9adb8', faint: '#6b707c', accent: '#ffffff', ptr: '#c79bff', ret: '#4fd18b', wait: '#ffbf47', err: '#ff5c5c',
  param: '#9cc2ff', cell: 'rgba(0,112,209,0.3)', track: 'rgba(255,255,255,0.06)',
};
export const ps5Theme: Theme = {
  id: 'ps5', name: 'PlayStation 5', blurb: 'the home screen: game art behind, dark cards, the white focus ring',
  p: ps5P, ui: SST, mono: MONO('"JetBrains Mono"'), radius: 12, spotlight: 'rgba(0,0,0,0.6)',
  pulseColor: 'rgba(255,255,255,0.9)',
  card(dc, r, o) {
    const g = dc.g;
    const rad = Math.max(2, (o.kind === 'wall' ? 17 : 12) * dc.z);
    rrect(g, r.x, r.y, r.w, r.h, rad);
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(255,255,255,0.03)' : o.kind === 'frame' || o.kind === 'plate' ? ps5P.panel : ps5P.card;
      g.fill();
    }
    if (o.glow) {
      const k = Math.max(2, 3 * dc.z);
      rrect(g, r.x - k, r.y - k, r.w + 2 * k, r.h + 2 * k, rad + k);
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1.5, 2 * dc.z);
    } else {
      g.strokeStyle = ps5P.line;
      g.lineWidth = 1;
    }
    g.stroke();
  },
  // a game's key art, blurred and darkened toward the bottom
  background(dc) {
    backdrop(dc, 'ps5', (g, W, H) => {
      g.fillStyle = '#0b0c10';
      g.fillRect(0, 0, W, H);
      const blob = (x: number, y: number, rr: number, c: string) => {
        const b = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * rr);
        b.addColorStop(0, c);
        b.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = b;
        g.fillRect(0, 0, W, H);
      };
      blob(0.72, 0.18, 0.55, 'rgba(46,92,150,0.75)');
      blob(0.35, 0.05, 0.45, 'rgba(150,70,60,0.45)');
      blob(0.9, 0.55, 0.4, 'rgba(210,140,70,0.28)');
      const shade = g.createLinearGradient(0, 0, 0, H);
      shade.addColorStop(0, 'rgba(11,12,16,0.1)');
      shade.addColorStop(0.55, 'rgba(11,12,16,0.55)');
      shade.addColorStop(1, 'rgba(11,12,16,0.95)');
      g.fillStyle = shade;
      g.fillRect(0, 0, W, H);
      // the DualSense's grip: tiny △○✕□, layered, barely there (Morisawa's Easter egg)
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      const kinds = ['tri', 'circ', 'cross', 'sq'] as const;
      for (let y = 6, row = 0; y < H; y += 13, row++) {
        for (let x = 6 + (row % 2) * 6, k = row; x < W; x += 13, k++) psSymbol(g, kinds[k % 4], x, y, 2.6);
      }
    });
  },
  window: {
    border: 0, corner: 17, titleH: 32, face: 'rgba(22,23,29,0.84)', workspace: 'rgba(255,255,255,0.03)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(3, 17 * dc.z);
      softShadow(dc, r, 17, 12, 'rgba(0,0,0,0.6)', 4 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = face;
      g.fill();
      if (active) {
        const k = Math.max(3, 5 * dc.z);
        rrect(g, r.x - k, r.y - k, r.w + 2 * k, r.h + 2 * k, rad + k);
        g.strokeStyle = '#ffffff';
        g.lineWidth = Math.max(2, 3 * dc.z);
        g.stroke();
      }
    },
    titleBar(dc, r, title, active) {
      text(dc, r, title, SST, 14.5, active ? '#ffffff' : '#a9adb8', { w: active ? 600 : 300, x: r.x + 16 * dc.z });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, 'rgba(255,255,255,0.16)', '#ffffff');
    },
  },
};

// ---------------- Nintendo ----------------

// The Wii Menu, after a recreation's measured tokens (zuvv/WiiMenu): a light
// blue desktop of fine lines, channels as glossy white 4:3 bezels (14px
// corners, #ccd5da edge) around a recessed "screen", grey #55636b labels,
// the Wii blue #35b4e5 ring on the one you point at.
function wiiOf(dark: boolean): Theme {
  const WII = '#35b4e5';
  const p: Palette = dark ? {
    bg: '#1a2024', card: '#2b3238', panel: '#252b30', line: '#46515a',
    fg: '#e8eef1', dim: '#a3b0b8', faint: '#6d7a83', accent: WII, ptr: '#ff9f43', ret: '#6bbf3a', wait: '#ffc94d', err: '#ff6464',
    param: '#7fd6f2', cell: '#1d3f4d', track: '#1f2529',
  } : {
    bg: '#dcecf3', card: '#ffffff', panel: '#f6f8f9', line: '#ccd5da',
    fg: '#3f4a51', dim: '#6b7980', faint: '#8a969c', accent: '#189fd6', ptr: '#e0782b', ret: '#4f9e22', wait: '#d69a00', err: '#e04848',
    param: '#0b6a9c', cell: '#d8f0fa', track: '#eef1f3',
  };
  const bezelTop = dark ? '#3a434a' : '#ffffff';
  const bezelBot = dark ? '#2c3439' : '#f2f5f7';
  const edge = dark ? '#4c5861' : '#ccd5da';
  return {
    id: dark ? 'wii-dark' : 'wii', name: 'Wii', blurb: dark ? 'the Wii Menu after dark' : 'the Wii Menu: glossy channels on fine blue lines',
    p, ui: RODIN, mono: MONO('"JetBrains Mono"'), radius: 10, spotlight: dark ? 'rgba(0,0,0,0.55)' : 'rgba(200,222,232,0.6)',
    pulseColor: 'rgba(53,180,229,0.9)',
    card(dc, r, o) {
      const g = dc.g;
      const rad = Math.max(2, 9 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      if (o.fill !== 'transparent') {
        const gl = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        gl.addColorStop(0, bezelTop);
        gl.addColorStop(1, bezelBot);
        g.fillStyle = o.kind === 'wall' ? (dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.35)') : gl;
        g.fill();
      }
      g.strokeStyle = o.glow ? WII : edge;
      g.lineWidth = o.glow ? Math.max(1.5, 2 * dc.z) : 1;
      g.stroke();
    },
    background(dc) {
      backdrop(dc, dark ? 'wii-dark' : 'wii', (g, W, H) => {
        const bg = g.createLinearGradient(0, 0, 0, H);
        if (dark) (bg.addColorStop(0, '#20282d'), bg.addColorStop(1, '#141a1e'));
        else (bg.addColorStop(0, '#eef7fa'), bg.addColorStop(0.5, '#dcecf3'), bg.addColorStop(1, '#c9e2ec'));
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        // the fine horizontal lines of the Wii desktop
        g.fillStyle = dark ? 'rgba(120,170,190,0.07)' : 'rgba(188,215,226,0.45)';
        for (let y = 0; y < H; y += 5) g.fillRect(0, y, W, 1);
      });
    },
    window: {
      border: 5, corner: 14, titleH: 26, face: dark ? '#20262b' : '#fbfcfd', workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.4)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(3, 14 * dc.z);
        softShadow(dc, r, 14, 9, dark ? 'rgba(0,0,0,0.55)' : 'rgba(55,95,125,0.35)', 3 * dc.z);
        // the glossy bezel
        rrect(g, r.x, r.y, r.w, r.h, rad);
        const gl = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        gl.addColorStop(0, bezelTop);
        gl.addColorStop(0.6, dark ? '#343c42' : '#ffffff');
        gl.addColorStop(1, bezelBot);
        g.fillStyle = gl;
        g.fill();
        g.strokeStyle = edge;
        g.lineWidth = 1;
        g.stroke();
        // the recessed "screen" set into it
        const b = Math.max(2, 5 * dc.z);
        const th = 26 * dc.z;
        const sc = { x: r.x + b, y: r.y + th, w: r.w - 2 * b, h: Math.max(0, r.h - th - b) };
        rrect(g, sc.x, sc.y, sc.w, sc.h, Math.max(2, 9 * dc.z));
        g.fillStyle = face;
        g.fill();
        g.strokeStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(30,60,80,0.12)';
        g.stroke();
        const inset = g.createLinearGradient(0, sc.y, 0, sc.y + Math.min(sc.h, 10 * dc.z));
        inset.addColorStop(0, dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.07)');
        inset.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = inset;
        g.fill();
        if (active) {
          // pointed at: the Wii-blue ring, lifted
          rrect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
          g.strokeStyle = dark ? WII : '#8ad3ef';
          g.lineWidth = Math.max(2, 2.5 * dc.z);
          g.stroke();
        }
      },
      titleBar(dc, r, title, active) {
        // the channel's label: grey, centred
        text(dc, r, title, RODIN, 12.5, active ? (dark ? '#ffffff' : '#3f4a51') : dark ? '#a3b0b8' : '#55636b', { w: 700, align: 'center' });
      },
      progress(dc, r, fill, anim) {
        const g = dc.g;
        rrect(g, r.x, r.y, r.w, r.h, r.h / 2);
        g.fillStyle = dark ? '#1b2125' : '#e3e9ed';
        g.fill();
        g.strokeStyle = dark ? '#3a444b' : '#ccd4d9';
        g.lineWidth = 1;
        g.stroke();
        const x = anim ? r.x + r.w * (((dc.time * 0.45) % 1.3) - 0.3) : r.x;
        const w = anim ? r.w * 0.3 : r.w * fill;
        const a = Math.max(r.x, x);
        const e = Math.min(r.x + r.w, x + w);
        if (e - a < 2) return;
        rrect(g, a, r.y + 1, e - a, r.h - 2, (r.h - 2) / 2);
        const blue = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        blue.addColorStop(0, '#4fd0ff');
        blue.addColorStop(0.5, WII);
        blue.addColorStop(1, '#189fd6');
        g.fillStyle = blue;
        g.fill();
      },
    },
  };
}
export const wiiTheme = wiiOf(false);

const gcP: Palette = {
  bg: '#1b1150', card: '#2a1f6e', panel: '#22185c', line: '#5a4bb8',
  fg: '#f1eeff', dim: '#b9b1e8', faint: '#7c72b8', accent: '#a393ff', ptr: '#ffb14e', ret: '#7bd88f', wait: '#ffd166', err: '#ff5a78',
  param: '#c9bfff', cell: '#3a2d8f', track: '#140b40',
};
export const gamecubeTheme: Theme = {
  id: 'gamecube', name: 'GameCube', blurb: 'the IPL menu: black, the violet cube, glassy purple panels',
  p: gcP, ui: JOST, mono: MONO('"JetBrains Mono"'), radius: 8, spotlight: 'rgba(8,2,30,0.58)',
  pulseColor: 'rgba(163,147,255,0.9)',
  card: cardOf(8, '#a393ff'),
  background(dc) {
    // the IPL menu: black, a violet haze, the translucent cube floating in it
    backdrop(dc, 'gamecube', (g, W, H) => {
      g.fillStyle = '#030208';
      g.fillRect(0, 0, W, H);
      const haze = g.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.6);
      haze.addColorStop(0, 'rgba(92,64,200,0.45)');
      haze.addColorStop(0.5, 'rgba(50,30,120,0.18)');
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = haze;
      g.fillRect(0, 0, W, H);
      const x = W * 0.5;
      const y = H * 0.5;
      const s = Math.min(W, H) * 0.3;
      const face = (pts: number[][], fill: string) => {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = 'rgba(190,170,255,0.25)';
        g.lineWidth = 1.5;
        g.stroke();
      };
      face([[x, y - s], [x + s, y - s / 2], [x, y], [x - s, y - s / 2]], 'rgba(170,150,255,0.14)');
      face([[x - s, y - s / 2], [x, y], [x, y + s], [x - s, y + s / 2]], 'rgba(120,90,230,0.1)');
      face([[x + s, y - s / 2], [x, y], [x, y + s], [x + s, y + s / 2]], 'rgba(80,50,190,0.08)');
    });
  },
  window: {
    border: 3, corner: 10, titleH: 26, face: '#1e1552', workspace: 'rgba(163,147,255,0.05)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(3, 10 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = active ? '#2e2280' : '#261c68';
      g.fill();
      g.strokeStyle = active ? '#a393ff' : '#4a3d99';
      g.lineWidth = Math.max(1, 1.5 * dc.z);
      g.stroke();
      client(dc, r, Math.max(2, 3 * dc.z), 26 * dc.z, face, Math.max(2, 6 * dc.z));
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      const s = Math.max(3, 5 * dc.z);
      const cx = r.x + 13 * dc.z;
      const cy = r.y + r.h / 2;
      g.fillStyle = active ? '#c9bfff' : '#6f63b8';
      g.fillRect(cx - s, cy - s, s * 2, s * 2);
      g.fillStyle = active ? '#6c58e0' : '#3a2d8f';
      g.fillRect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
      text(dc, r, title, JOST, 13, active ? '#f1eeff' : '#9f96d8', { w: 600, x: cx + 11 * dc.z });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#140b40', '#a393ff');
    },
  },
};

// The Switch HOME Menu: Basic White (#ebebeb) or Basic Black (#2d2d2d),
// plain square-ish tiles, and the selection: an outline 5px thick, 5px out
// from the tile, pulsing between hsl(200 100% 50%) and hsl(200 100% 80%)
// (from Adam Argyle's measured recreation); the selected title in cyan.
function switchOf(dark: boolean): Theme {
  const p: Palette = dark ? {
    bg: '#2d2d2d', card: '#3a3a3a', panel: '#333333', line: '#4f4f4f',
    fg: '#ffffff', dim: '#b4b4b4', faint: '#7a7a7a', accent: '#00c3e3', ptr: '#ff3c28', ret: '#4cd964', wait: '#ffcc00', err: '#ff3c28',
    param: '#7fe3f3', cell: '#1f4a54', track: '#262626',
  } : {
    bg: '#ebebeb', card: '#ffffff', panel: '#f6f6f6', line: '#d6d6d6',
    fg: '#2d2d2d', dim: '#6b6b6b', faint: '#a0a0a0', accent: '#0ab0cf', ptr: '#e6321f', ret: '#1e9e45', wait: '#c98f00', err: '#e6321f',
    param: '#0a93ae', cell: '#d4f3f9', track: '#ffffff',
  };
  const pulse = (dc: Dc) => `hsl(200 100% ${65 + 15 * Math.sin(dc.time * 3.2)}%)`;
  return {
    id: dark ? 'switch-dark' : 'switch', name: 'Switch', blurb: dark ? 'Basic Black: plain tiles, the pulsing blue outline' : 'Basic White: plain tiles, the pulsing blue outline',
    p, ui: NUNITO, mono: MONO('"JetBrains Mono"'), radius: 4, spotlight: dark ? 'rgba(0,0,0,0.55)' : 'rgba(200,200,200,0.6)',
    pulseColor: 'rgba(0,160,255,0.9)',
    card(dc, r, o) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 4 * dc.z));
      if (o.fill !== 'transparent') {
        g.fillStyle = o.kind === 'wall' ? (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)') : p.card;
        g.fill();
      }
      g.strokeStyle = o.glow ? pulse(dc) : p.line;
      g.lineWidth = o.glow ? Math.max(2, 3 * dc.z) : 1;
      g.stroke();
    },
    background(dc) {
      backdrop(dc, dark ? 'switch-dark' : 'switch', (g, W, H) => {
        g.fillStyle = p.bg;
        g.fillRect(0, 0, W, H);
      });
    },
    window: {
      border: 0, corner: 4, titleH: 30, face: p.card, workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(1, 4 * dc.z);
        softShadow(dc, r, 4, 6, dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.16)', 1.5 * dc.z);
        rrect(g, r.x, r.y, r.w, r.h, rad);
        g.fillStyle = face;
        g.fill();
        g.fillStyle = dark ? '#414141' : '#f4f4f4';
        g.fillRect(r.x, r.y + 30 * dc.z - 1, r.w, 1);
        if (active) {
          // 5px out, 5px thick, breathing between two blues
          const k = 5 * dc.z;
          rrect(g, r.x - k - k / 2, r.y - k - k / 2, r.w + 3 * k, r.h + 3 * k, rad + k * 1.5);
          g.strokeStyle = pulse(dc);
          g.lineWidth = Math.max(2, k);
          g.stroke();
        }
      },
      titleBar(dc, r, title, active) {
        // the selected title reads in the Switch's cyan-blue
        text(dc, r, title, NUNITO, 13.5, active ? (dark ? '#00c3e3' : '#0a9fcf') : p.dim, { w: 700, x: r.x + 12 * dc.z });
      },
      progress(dc, r, fill, anim) {
        bar(dc, r, fill, anim, dark ? '#262626' : '#e2e2e2', dark ? '#00c3e3' : '#0ab0cf');
      },
    },
  };
}
export const switchTheme = switchOf(false);

export const ps1 = { ...makeSkin(ps1Theme), mode: 'dark' as const };
export const ps2 = makeSkin(ps2Theme);
export const ps3 = makeSkin(ps3Theme);
{
  const flat = ps3.icon;
  ps3.icon = (g, kind, s) => jellyIcon(g, s, (h) => flat(h, kind, s));
  ps3.fullBleed = true;
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
export const ps4 = makeSkin(ps4Theme);
ps4.fullBleed = true; // the sky and its ribbons behind the whole page, as the PS3's
export const ps5 = makeSkin(ps5Theme);
export const wii = { ...makeSkin(wiiTheme), mode: 'light' as const };
export const wiiDark = { ...makeSkin(wiiOf(true)), variantOf: 'wii', mode: 'dark' as const };
export const gamecube = makeSkin(gamecubeTheme);
export const nswitch = { ...makeSkin(switchTheme), mode: 'light' as const };
export const nswitchDark = { ...makeSkin(switchOf(true)), variantOf: 'switch', mode: 'dark' as const };
