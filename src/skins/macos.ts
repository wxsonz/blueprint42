// The Mac eras, as theme-kit specs: System 7, Mac OS 9 (Platinum), Mac OS X
// Leopard, OS X Yosemite, macOS Big Sur and macOS Tahoe (Liquid Glass).
// (Mac OS X 10.0–10.4 "Aqua" is its own hand-written skin.) Mac windows put
// their controls on the left and centre their titles.
import { barberPole, chevron, layers, ride } from './belts';
import { backdrop, countBadge, glassBehind, makeSkin, plainCard, type Theme } from './kit';
import type { Dc, Pt, Rect } from './types';
import { arrowHead, fitText, rrect, strokeLine, Walk } from './util';

const SANS = (family: string) => (px: number, w = 400) => `${w >= 600 ? 700 : w} ${px}px ${family}`;
const MONO = (family: string) => (px: number, w = 400) => `${w >= 600 ? 700 : 400} ${px}px ${family}`;

// ---------------- shared pieces ----------------

// Close, minimise, zoom: red, yellow, green. Glossy (Leopard) or flat.
function trafficLights(dc: Dc, x: number, cy: number, d: number, active: boolean, style: 'gloss' | 'flat' | 'glass'): number {
  const g = dc.g;
  const cols = active ? ['#ff5f57', '#febc2e', '#28c840'] : ['#c8c8c8', '#c8c8c8', '#c8c8c8'];
  const gap = d * 0.55;
  cols.forEach((c, k) => {
    const cx = x + d / 2 + k * (d + gap);
    g.beginPath(); g.arc(cx, cy, d / 2, 0, Math.PI * 2);
    if (style === 'gloss') {
      const grad = g.createRadialGradient(cx, cy - d * 0.25, d * 0.05, cx, cy, d * 0.55);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.35, c);
      grad.addColorStop(1, shade(c, -0.35));
      g.fillStyle = grad;
    } else g.fillStyle = c;
    g.fill();
    g.strokeStyle = style === 'glass' ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.25)';
    g.lineWidth = Math.max(0.6, 0.8 * dc.z);
    g.stroke();
  });
  return x + 3 * d + 2 * gap;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (f < 0 ? v * f : (255 - v) * f))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// A title, centred in what the controls leave, on its own backing when asked.
function centredTitle(dc: Dc, r: Rect, left: number, title: string, font: (px: number, w?: number) => string, fs: number, color: string, backing?: string): void {
  const g = dc.g;
  const t = fitText(g, title, (s) => font(s, 600), fs, r.x + r.w - left - 12 * dc.z);
  const w = g.measureText(t).width;
  const cx = Math.max(left + w / 2 + 6 * dc.z, r.x + r.w / 2);
  if (backing) {
    g.fillStyle = backing;
    g.fillRect(cx - w / 2 - 6 * dc.z, r.y + 1, w + 12 * dc.z, r.h - 2);
  }
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, cx, r.y + r.h / 2 + 0.5);
}

// Horizontal pinstripes across a title bar (System 7, Platinum).
function stripes(dc: Dc, r: Rect, light: string, dark: string, step: number): void {
  const g = dc.g;
  g.fillStyle = light;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = dark;
  const s = Math.max(2, step * dc.z);
  for (let y = r.y + s * 0.75; y < r.y + r.h - s * 0.5; y += s) g.fillRect(r.x + 2, Math.round(y), r.w - 4, Math.max(1, Math.round(s * 0.35)));
}

function barber(dc: Dc, r: Rect, a: string, b: string, time: number): void {
  const g = dc.g;
  g.save();
  g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  g.fillStyle = a;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = b;
  const s = Math.max(6, 10 * dc.z);
  const off = (time * 20 * dc.z) % (s * 2);
  for (let x = r.x - r.h - s * 2 + off; x < r.x + r.w + r.h; x += s * 2) {
    g.beginPath(); g.moveTo(x, r.y + r.h); g.lineTo(x + s, r.y + r.h); g.lineTo(x + s + r.h, r.y); g.lineTo(x + r.h, r.y); g.closePath(); g.fill();
  }
  g.restore();
}

// ---------------- System 7 ----------------

const S7 = SANS('"Pixelify Sans", Chicago, "Geneva", monospace');
export const system7Theme: Theme = {
  id: 'system7', name: 'System 7', blurb: '1-bit: black, white and a striped title bar',
  radius: 0, pixel: true, spotlight: 'rgba(0,0,0,0.5)',
  ui: (px, w) => S7(px * 1.05, w), mono: (px, w) => MONO('VT323, monospace')(Math.round(px * 1.35), w),
  p: {
    bg: '#9a9a9a', card: '#ffffff', panel: '#ffffff', line: '#000000',
    fg: '#000000', dim: '#333333', faint: '#808080', accent: '#000000', ptr: '#000000', ret: '#000000', wait: '#555555', err: '#000000',
    param: '#000000', cell: '#dddddd', track: '#ffffff',
  },
  pulseColor: 'rgba(0,0,0,0.5)',
  // 1-bit: black on a white keyline. Idle is a dotted (checker) line, hovered
  // solid, selected fat; live it is the marching ants of a selection, running
  // the data's way.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = Math.max(1, Math.round(dc.z));
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    const th = 2 * z;
    strokeLine(g, pts, th + 2 * z + (o.selected ? 2 * z : 0), '#ffffff');
    if (o.selected) strokeLine(g, pts, th + 2 * z, '#000000');
    else if (o.live) {
      const per = 8 * z;
      strokeLine(g, pts, th, '#000000', [5 * z, 3 * z], -Math.floor((((dc.time * 16 * z * o.dir) % per) + per) % per));
    } else if (o.hovered) strokeLine(g, pts, th, '#000000');
    else strokeLine(g, pts, th, '#000000', [z, z]);
    if (o.selected && o.live) strokeLine(g, pts, th, '#ffffff', [3 * z, 5 * z], -Math.floor((((dc.time * 16 * z * o.dir) % (8 * z)) + 8 * z) % (8 * z)) - 5 * z);
    const w = new Walk(pts);
    const e = w.at(w.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(6, Math.round(8 * dc.z)), '#000000');
    countBadge(dc, pts, o, t);
  },
  card(dc, r, o) {
    const g = dc.g;
    const R = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
    if (o.fill !== 'transparent') ((g.fillStyle = o.kind === 'wall' ? '#ffffff' : '#ffffff'), g.fillRect(R.x, R.y, R.w, R.h));
    g.strokeStyle = '#000000';
    g.lineWidth = o.glow ? 2 : 1;
    g.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    if (o.kind === 'node' || o.kind === 'module') (g.fillStyle = '#000000'), g.fillRect(R.x + 2, R.y + R.h, R.w, 1), g.fillRect(R.x + R.w, R.y + 2, 1, R.h);
  },
  // the classic 50% gray desktop pattern
  background(dc) {
    backdrop(dc, 'system7', (g, W, H) => {
      // a 2×2 checker, repeated
      const tile = document.createElement('canvas');
      tile.width = tile.height = 2;
      const tg = tile.getContext('2d')!;
      tg.fillStyle = '#ffffff'; tg.fillRect(0, 0, 2, 2);
      tg.fillStyle = '#000000'; tg.fillRect(0, 0, 1, 1); tg.fillRect(1, 1, 1, 1);
      g.fillStyle = g.createPattern(tile, 'repeat')!;
      g.fillRect(0, 0, W, H);
    });
  },
  window: {
    border: 1, corner: 0, titleH: 19, face: '#ffffff', workspace: '#ffffff',
    frame(dc, r) {
      const g = dc.g;
      const R = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
      g.fillStyle = '#ffffff'; g.fillRect(R.x, R.y, R.w, R.h);
      g.fillStyle = '#000000';
      g.fillRect(R.x + 1, R.y + R.h, R.w, 1); g.fillRect(R.x + R.w, R.y + 1, 1, R.h);
      g.strokeStyle = '#000000'; g.lineWidth = 1;
      g.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const R = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
      g.fillStyle = '#ffffff'; g.fillRect(R.x, R.y, R.w, R.h);
      if (active) stripes(dc, { x: R.x + 1, y: R.y + 2, w: R.w - 2, h: R.h - 4 }, '#ffffff', '#000000', 2);
      g.fillStyle = '#000000'; g.fillRect(R.x, R.y + R.h - 1, R.w, 1);
      let left = R.x + 6;
      if (buttons && active) {
        const s = Math.round(R.h * 0.6);
        const bx = R.x + 8, by = Math.round(R.y + (R.h - s) / 2);
        g.fillStyle = '#ffffff'; g.fillRect(bx - 1, by - 1, s + 2, s + 2);
        g.strokeStyle = '#000000'; g.strokeRect(bx + 0.5, by + 0.5, s - 1, s - 1);
        left = bx + s + 6;
      }
      centredTitle(dc, R, left, title, S7, Math.max(7, 12 * dc.z), '#000000', '#ffffff');
    },
    progress(dc, r, fill) {
      const g = dc.g;
      g.fillStyle = '#ffffff'; g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = '#000000'; g.lineWidth = 1; g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
      g.fillStyle = '#000000';
      const f = fill >= 1 ? ((dc.time * 0.4) % 1) : fill;
      g.fillRect(r.x + 1, r.y + 1, (r.w - 2) * f, r.h - 2);
    },
  },
};

// ---------------- Mac OS 9 (Platinum) ----------------

const P9 = SANS('Charcoal, "Pixelify Sans", Chicago, sans-serif');
export const platinumTheme: Theme = {
  id: 'platinum', name: 'Mac OS 9', blurb: 'Platinum: gray bevels and a striped title bar',
  radius: 0, spotlight: 'rgba(20,20,60,0.5)',
  ui: (px, w) => SANS('Geneva, "Open Sans", "DejaVu Sans", sans-serif')(px, w), mono: MONO('Monaco, "DejaVu Sans Mono", monospace'),
  p: {
    bg: '#5d7bb7', card: '#dddddd', panel: '#ffffff', line: '#5a5a5a',
    fg: '#000000', dim: '#444444', faint: '#8a8a8a', accent: '#6666cc', ptr: '#0000cc', ret: '#006600', wait: '#996600', err: '#cc0000',
    param: '#333399', cell: '#ccccff', track: '#ffffff',
  },
  pulseColor: 'rgba(102,102,204,0.7)',
  // Platinum: a grey trough, etched (dark inside edge, white lip), like the
  // scroll bar's; live, it is the barber-pole progress bar, lavender stripes
  // running the data's way; selected gets the dark outline of a focused control.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    const w = Math.max(6, Math.round(8 * z));
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    if (o.selected) layers(g, pts, [[w + 8, '#000000']]);
    layers(g, pts, [[w + 2, '#ffffff']], [1, 1]);
    layers(g, pts, [[w + 2, o.hovered || o.selected ? '#000000' : '#5a5a5a']]);
    layers(g, pts, [[w - 1, o.live ? '#eef0ff' : o.hovered ? '#f4f4f4' : '#cfcfcf']]);
    layers(g, pts, [[Math.max(1, w * 0.25), o.live ? '#ffffff' : '#e6e6e6']], [0, -w * 0.25]);
    const walk = new Walk(pts);
    if (o.live) {
      g.fillStyle = '#6666cc';
      barberPole(dc, walk, o, (w - 1) / 2, Math.max(3, 4 * z), Math.max(8, 10 * z), 28 * z, w);
      g.fillStyle = '#9999dd';
      barberPole(dc, walk, o, (w - 1) / 2, Math.max(1, 1.5 * z), Math.max(8, 10 * z), 28 * z, w);
    }
    const e = walk.at(walk.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(6, 9 * z), o.live ? '#3a3a99' : '#333333');
    countBadge(dc, pts, o, t);
  },
  card(dc, r, o) {
    const g = dc.g;
    plainCard(dc, r, 0, { ...o, glow: null, fill: o.fill === 'transparent' ? 'transparent' : o.kind === 'frame' || o.kind === 'plate' ? '#ffffff' : '#dddddd' });
    if (o.kind === 'node' || o.kind === 'module' || o.kind === 'proc') {
      g.strokeStyle = '#ffffff'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(r.x + 1.5, r.y + r.h - 2); g.lineTo(r.x + 1.5, r.y + 1.5); g.lineTo(r.x + r.w - 2, r.y + 1.5); g.stroke();
    }
  },
  // the Mac OS 9 blue desktop with soft waves
  background(dc) {
    backdrop(dc, 'platinum', (g, W, H) => {
      const grad = g.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#6f8ccc'); grad.addColorStop(1, '#3f5b9a');
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let k = 0; k < 12; k++) {
        g.lineWidth = 18 + k * 4;
        g.beginPath(); g.moveTo(-50, H * (0.1 + k * 0.08)); g.bezierCurveTo(W * 0.3, H * (k * 0.08 - 0.05), W * 0.7, H * (0.2 + k * 0.08), W + 50, H * (0.05 + k * 0.08)); g.stroke();
      }
    });
  },
  window: {
    border: 4, corner: 0, titleH: 20, face: '#dddddd', workspace: '#c4c4d8',
    frame(dc, r, active, client) {
      const g = dc.g;
      const b = Math.max(2, 4 * dc.z);
      g.fillStyle = '#cccccc'; g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = '#000000'; g.lineWidth = 1; g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
      g.strokeStyle = active ? '#ffffff' : '#e8e8e8';
      g.beginPath(); g.moveTo(r.x + 1.5, r.y + r.h - 2); g.lineTo(r.x + 1.5, r.y + 1.5); g.lineTo(r.x + r.w - 2, r.y + 1.5); g.stroke();
      g.fillStyle = client; g.fillRect(r.x + b, r.y + b, r.w - 2 * b, r.h - 2 * b);
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      g.fillStyle = '#cccccc'; g.fillRect(r.x, r.y, r.w, r.h);
      if (active) stripes(dc, { x: r.x + 2, y: r.y + 3, w: r.w - 4, h: r.h - 6 }, '#cccccc', '#999999', 2.5);
      let left = r.x + 6;
      if (buttons) {
        const s = r.h * 0.62;
        const by = r.y + (r.h - s) / 2;
        for (const bx of [r.x + 6, r.x + r.w - s - 6]) {
          g.fillStyle = '#dddddd'; g.fillRect(bx - 2, by - 2, s + 4, s + 4);
          const grad = g.createLinearGradient(bx, by, bx + s, by + s);
          grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#999999');
          g.fillStyle = grad; g.fillRect(bx, by, s, s);
          g.strokeStyle = '#333333'; g.lineWidth = 1; g.strokeRect(Math.round(bx) + 0.5, Math.round(by) + 0.5, Math.round(s) - 1, Math.round(s) - 1);
        }
        left = r.x + 6 + s + 8;
      }
      centredTitle(dc, r, left, title, P9, Math.max(7, 12 * dc.z), active ? '#000000' : '#777777', '#cccccc');
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      g.fillStyle = '#eeeeee'; g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = '#555555'; g.lineWidth = 1; g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
      if (anim) barber(dc, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, '#9999dd', '#6666bb', dc.time);
      else if (fill > 0) (g.fillStyle = '#6666cc'), g.fillRect(r.x + 1, r.y + 1, (r.w - 2) * fill, r.h - 2);
    },
  },
};

// ---------------- Mac OS X Leopard ----------------

const LUCIDA = SANS('"Lucida Grande", "Open Sans", "DejaVu Sans", sans-serif');
export const leopardTheme: Theme = {
  id: 'leopard', name: 'Mac OS X Leopard', blurb: 'unified gray, glossy lights, Aurora',
  radius: 5, spotlight: 'rgba(10,6,30,0.55)',
  ui: LUCIDA, mono: MONO('Monaco, Menlo, "DejaVu Sans Mono", monospace'),
  p: {
    bg: '#2a1f5c', card: '#e8e8e8', panel: '#ffffff', line: '#8c8c8c',
    fg: '#1a1a1a', dim: '#505050', faint: '#8e8e8e', accent: '#3875d7', ptr: '#1d5fcf', ret: '#2c8a3a', wait: '#c47d00', err: '#d12f2f',
    param: '#2a56a8', cell: '#c8dcfb', track: '#ffffff',
  },
  pulseColor: 'rgba(56,117,215,0.8)',
  // Leopard: a brushed-metal cable in the unified grey; live, glossy blue
  // capsules (the pulsing default button, sliced) slide along it the data's way.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    const w = Math.max(5, 7 * z);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected) strokeLine(g, pts, w + 9 * z, 'rgba(56,117,215,0.4)');
    layers(g, pts, [[w + 2, o.hovered || o.selected ? '#3f5f99' : '#6e6e6e'], [w, '#9c9c9c'], [w * 0.62, '#c9c9c9']]);
    layers(g, pts, [[Math.max(1, w * 0.2), 'rgba(255,255,255,0.85)']], [0, -w * 0.22]);
    const walk = new Walk(pts);
    if (o.live) {
      const len = Math.max(10, 16 * z);
      g.lineCap = 'round';
      ride(dc, walk, o, 60 * z, Math.max(28, 46 * z), (x, y, dx, dy) => {
        const a = { x: x - dx * len / 2, y: y - dy * len / 2 }, b = { x: x + dx * len / 2, y: y + dy * len / 2 };
        g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y);
        g.lineWidth = w + 1; g.strokeStyle = '#1d4fa8'; g.stroke();
        g.lineWidth = w - 1.5; g.strokeStyle = '#4f93f0'; g.stroke();
        g.beginPath(); g.moveTo(a.x + dy * 0, a.y - w * 0.15); g.lineTo(b.x, b.y - w * 0.15);
        g.lineWidth = Math.max(1, w * 0.3); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
      }, 0, len);
    }
    const e = walk.at(walk.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(6, 9 * z), o.live ? '#1d4fa8' : '#555555');
    countBadge(dc, pts, o, t);
  },
  card(dc, r, o) {
    plainCard(dc, r, 5, { ...o, glow: null, fill: o.fill === 'transparent' ? 'transparent' : o.kind === 'frame' || o.kind === 'plate' ? '#ffffff' : '#e8e8e8' });
  },
  // Aurora: violet and blue light sweeping across deep space
  background(dc) {
    backdrop(dc, 'aurora', (g, W, H) => {
      g.fillStyle = '#12092e'; g.fillRect(0, 0, W, H);
      for (const [x, y, r, c] of [[0.3, 0.55, 0.6, 'rgba(120,70,220,0.55)'], [0.75, 0.35, 0.5, 'rgba(60,110,230,0.5)'], [0.55, 0.8, 0.45, 'rgba(210,90,200,0.35)']] as [number, number, number, string][]) {
        const gr = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * r);
        gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let k = 0; k < 90; k++) g.fillRect((k * 937) % W, (k * 613) % H, 1, 1);
    });
  },
  window: {
    border: 1, corner: 5, titleH: 22, face: '#e8e8e8', workspace: 'rgba(230,230,240,0.25)',
    frame(dc, r, active, client) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(2, 5 * dc.z));
      g.fillStyle = client; g.fill();
      g.strokeStyle = active ? '#555555' : '#9a9a9a'; g.lineWidth = 1; g.stroke();
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      grad.addColorStop(0, active ? '#d9d9d9' : '#f0f0f0'); grad.addColorStop(1, active ? '#a8a8a8' : '#dcdcdc');
      rrect(g, r.x, r.y, r.w, r.h, [Math.max(2, 5 * dc.z), Math.max(2, 5 * dc.z), 0, 0]);
      g.fillStyle = grad; g.fill();
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      const d = Math.max(6, Math.min(r.h - 8 * dc.z, 13 * dc.z));
      const left = trafficLights(dc, r.x + 8 * dc.z, r.y + r.h / 2, d, active, 'gloss');
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.6)';
      centredTitle(dc, { ...r, y: r.y + 1 }, left, title, LUCIDA, Math.max(7, 12.5 * dc.z), 'rgba(255,255,255,0.6)');
      g.restore();
      centredTitle(dc, r, left, title, LUCIDA, Math.max(7, 12.5 * dc.z), active ? '#1a1a1a' : '#8a8a8a');
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, r.h / 2);
      g.fillStyle = '#e4e4e4'; g.fill();
      g.strokeStyle = '#8c8c8c'; g.lineWidth = 1; g.stroke();
      g.save();
      rrect(g, r.x + 1, r.y + 1, anim ? r.w - 2 : (r.w - 2) * fill, r.h - 2, r.h / 2);
      g.clip();
      barber(dc, r, '#6aa6f2', '#3875d7', anim ? dc.time : 0);
      const shine = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      shine.addColorStop(0, 'rgba(255,255,255,0.7)'); shine.addColorStop(0.5, 'rgba(255,255,255,0.1)'); shine.addColorStop(1, 'rgba(255,255,255,0.3)');
      g.fillStyle = shine; g.fillRect(r.x, r.y, r.w, r.h);
      g.restore();
    },
  },
};

// ---------------- OS X Yosemite ----------------

const HELV = SANS('"Helvetica Neue", Inter, "DejaVu Sans", sans-serif');
export const yosemiteTheme: Theme = {
  id: 'yosemite', name: 'OS X Yosemite', blurb: 'flat and light, frosted bars, a mountain at dusk',
  radius: 5, spotlight: 'rgba(20,20,40,0.5)',
  ui: HELV, mono: MONO('Menlo, "JetBrains Mono", "DejaVu Sans Mono", monospace'),
  p: {
    bg: '#5b6f9a', card: '#f6f6f6', panel: '#ffffff', line: '#c8c8c8',
    fg: '#222222', dim: '#6b6b6b', faint: '#a3a3a3', accent: '#1e88f7', ptr: '#1e6fd9', ret: '#29a745', wait: '#e3960b', err: '#e53935',
    param: '#1e6fd9', cell: '#d6e8fd', track: '#ffffff',
  },
  pulseColor: 'rgba(30,136,247,0.8)',
  // Yosemite: flat and thin. A frosted white 4px track with a hairline edge;
  // live, it is the flat blue progress bar with a pale streak of light
  // sweeping the data's way; a thin rounded chevron for the arrow.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    const w = Math.max(3, 4 * z);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected) strokeLine(g, pts, w + 9 * z, 'rgba(30,136,247,0.3)');
    strokeLine(g, pts, w + 1.5, 'rgba(0,0,0,0.16)');
    strokeLine(g, pts, w, o.live ? '#1e88f7' : o.hovered || o.selected ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.72)');
    const walk = new Walk(pts);
    if (o.live) {
      const len = Math.max(12, 30 * z);
      g.lineCap = 'round';
      ride(dc, walk, o, 90 * z, Math.max(60, 120 * z), (x, y, dx, dy) => {
        g.beginPath(); g.moveTo(x - dx * len / 2, y - dy * len / 2); g.lineTo(x + dx * len / 2, y + dy * len / 2);
        g.lineWidth = w - 1; g.strokeStyle = 'rgba(200,228,255,0.9)'; g.stroke();
      }, 0, len / 2);
    }
    const e = walk.at(walk.length);
    g.lineWidth = Math.max(1.6, 2 * z);
    g.strokeStyle = o.live ? '#1e88f7' : o.hovered || o.selected ? '#ffffff' : 'rgba(255,255,255,0.9)';
    chevron(g, e.x, e.y, e.dx, e.dy, Math.max(5, 7 * z));
    countBadge(dc, pts, o, t);
  },
  card(dc, r, o) {
    plainCard(dc, r, 5, { ...o, glow: null, fill: o.fill === 'transparent' ? 'transparent' : o.kind === 'frame' || o.kind === 'plate' ? '#ffffff' : '#f6f6f6' });
  },
  // El Capitan at dusk: a warm sky over a dark granite face
  background(dc) {
    backdrop(dc, 'yosemite', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2c3e6b'); sky.addColorStop(0.45, '#9a6f93'); sky.addColorStop(0.75, '#e8a07a'); sky.addColorStop(1, '#f2c48d');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = '#26314f';
      g.beginPath(); g.moveTo(0, H);
      g.lineTo(0, H * 0.62); g.lineTo(W * 0.18, H * 0.5); g.bezierCurveTo(W * 0.35, H * 0.2, W * 0.5, H * 0.22, W * 0.56, H * 0.42);
      g.lineTo(W * 0.7, H * 0.55); g.lineTo(W, H * 0.48); g.lineTo(W, H); g.closePath(); g.fill();
      g.fillStyle = '#1a2139';
      g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.82); g.bezierCurveTo(W * 0.3, H * 0.72, W * 0.6, H * 0.86, W, H * 0.76); g.lineTo(W, H); g.closePath(); g.fill();
    });
  },
  window: {
    border: 1, corner: 5, titleH: 22, face: '#f6f6f6', workspace: 'rgba(255,255,255,0.18)',
    frame(dc, r, active, client) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(2, 5 * dc.z));
      g.fillStyle = client; g.fill();
      g.strokeStyle = active ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.stroke();
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, [Math.max(2, 5 * dc.z), Math.max(2, 5 * dc.z), 0, 0]);
      g.fillStyle = active ? 'rgba(236,236,236,0.96)' : 'rgba(246,246,246,0.96)'; g.fill();
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      const d = Math.max(6, Math.min(r.h - 9 * dc.z, 12 * dc.z));
      const left = trafficLights(dc, r.x + 8 * dc.z, r.y + r.h / 2, d, active, 'flat');
      centredTitle(dc, r, left, title, HELV, Math.max(7, 12.5 * dc.z), active ? '#4d4d4d' : '#aaaaaa');
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      const h = Math.max(3, r.h * 0.4), y = r.y + (r.h - h) / 2;
      rrect(g, r.x, y, r.w, h, h / 2); g.fillStyle = '#dcdcdc'; g.fill();
      const w = anim ? r.w * (0.25 + 0.75 * ((dc.time * 0.4) % 1)) : r.w * fill;
      if (w > 0) (rrect(g, r.x, y, w, h, h / 2), (g.fillStyle = '#1e88f7'), g.fill());
    },
  },
};

// ---------------- macOS Big Sur (light and dark) ----------------

const INTER = SANS('"SF Pro Text", Inter, "DejaVu Sans", sans-serif');
function bigSurOf(dark: boolean): Theme {
  const face = dark ? '#2a2a2c' : '#f5f5f7';
  const white = dark ? '#1f1f21' : '#ffffff';
  return {
    id: dark ? 'bigsur-dark' : 'bigsur', name: 'macOS Big Sur', blurb: dark ? 'Big Sur in dark mode' : 'big rounded windows over coastal waves',
    radius: 10, spotlight: 'rgba(12,16,40,0.5)',
    ui: INTER, mono: MONO('"SF Mono", "JetBrains Mono", Menlo, monospace'),
    p: dark ? {
      bg: '#1b2244', card: face, panel: white, line: '#3a3a3c',
      fg: '#f5f5f7', dim: '#a1a1a6', faint: '#636366', accent: '#0a84ff', ptr: '#64a8ff', ret: '#32d74b', wait: '#ff9f0a', err: '#ff453a',
      param: '#64a8ff', cell: '#1d3557', track: '#161618',
    } : {
      bg: '#3b5da8', card: face, panel: white, line: '#d2d2d7',
      fg: '#1d1d1f', dim: '#6e6e73', faint: '#a1a1a6', accent: '#007aff', ptr: '#0066d6', ret: '#28a745', wait: '#ff9500', err: '#ff3b30',
      param: '#0066d6', cell: '#d8e9ff', track: '#ffffff',
    },
    pulseColor: 'rgba(10,132,255,0.8)',
    // Big Sur: a plump rounded pill with a soft drop shadow, like a symbol
    // in a toolbar; live, it is filled system blue and white dots (round
    // pips) stream along it the data's way; the arrow is a bold rounded chevron.
    belt(dc, pts, o, t) {
      const g = dc.g;
      const z = dc.z;
      const w = Math.max(5, 7 * z);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (o.selected) strokeLine(g, pts, w + 10 * z, dark ? 'rgba(10,132,255,0.4)' : 'rgba(0,122,255,0.28)');
      strokeLine(g, pts.map(([x, y]) => [x, y + 1.5 * z] as Pt), w + 2, dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,20,60,0.22)');
      const idle = dark ? (o.hovered || o.selected ? '#8e8e93' : '#5a5a5f') : o.hovered || o.selected ? '#ffffff' : 'rgba(255,255,255,0.86)';
      strokeLine(g, pts, w, o.live ? t.p.accent : idle);
      if (!o.live) strokeLine(g, pts, Math.max(1, w * 0.3), dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)', undefined, 0);
      const walk = new Walk(pts);
      if (o.live) {
        g.fillStyle = '#ffffff';
        const r = Math.max(1.6, w * 0.24);
        ride(dc, walk, o, 70 * z, Math.max(14, 20 * z), (x, y) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }, 0, w);
      }
      const e = walk.at(walk.length);
      g.lineWidth = Math.max(2.4, 3.2 * z);
      g.strokeStyle = o.live ? t.p.accent : dark ? '#a1a1a6' : '#ffffff';
      chevron(g, e.x + e.dx * w * 0.8, e.y + e.dy * w * 0.8, e.dx, e.dy, Math.max(5, 7 * z));
      countBadge(dc, pts, o, t);
    },
    card(dc, r, o) {
      plainCard(dc, r, o.kind === 'plate' ? 8 : 9, { ...o, glow: null, fill: o.fill === 'transparent' ? 'transparent' : o.kind === 'frame' || o.kind === 'plate' ? white : face });
    },
    // the Big Sur coast: layered waves (at night in dark mode)
    background(dc) {
      backdrop(dc, dark ? 'bigsur-dark' : 'bigsur', (g, W, H) => {
        const sky = g.createLinearGradient(0, 0, 0, H);
        const stops = dark ? ['#2a1d4a', '#3b2a6b', '#1c2c6b', '#0a1433'] : ['#f39c6b', '#e86f8a', '#6b5bc4', '#1d3b8f'];
        [0, 0.35, 0.6, 1].forEach((t, k) => sky.addColorStop(t, stops[k]));
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        const bands = dark
          ? ['rgba(120,70,160,0.45)', 'rgba(80,60,150,0.45)', 'rgba(40,60,140,0.5)', 'rgba(20,40,110,0.6)', 'rgba(8,18,60,0.75)']
          : ['rgba(255,170,120,0.55)', 'rgba(230,100,150,0.5)', 'rgba(130,90,210,0.55)', 'rgba(60,90,200,0.6)', 'rgba(20,50,140,0.75)'];
        bands.forEach((c, k) => {
          g.fillStyle = c;
          const y0 = H * (0.35 + k * 0.13);
          g.beginPath(); g.moveTo(0, y0);
          g.bezierCurveTo(W * 0.3, y0 - H * 0.12, W * 0.6, y0 + H * 0.1, W, y0 - H * 0.05);
          g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
        });
      });
    },
    window: {
      border: 1, corner: 10, titleH: 30, face, workspace: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.18)',
      frame(dc, r, active, client) {
        const g = dc.g;
        rrect(g, r.x, r.y, r.w, r.h, Math.max(3, 10 * dc.z));
        g.fillStyle = client; g.fill();
        g.strokeStyle = dark ? (active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)') : active ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.14)';
        g.lineWidth = 1; g.stroke();
      },
      titleBar(dc, r, title, active) {
        const g = dc.g;
        rrect(g, r.x, r.y, r.w, r.h, [Math.max(3, 10 * dc.z), Math.max(3, 10 * dc.z), 0, 0]);
        g.fillStyle = dark ? (active ? 'rgba(58,58,60,0.97)' : 'rgba(44,44,46,0.97)') : active ? 'rgba(236,236,238,0.97)' : 'rgba(246,246,248,0.97)';
        g.fill();
        g.fillStyle = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.08)'; g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
        const d = Math.max(6, Math.min(r.h - 14 * dc.z, 12 * dc.z));
        const left = trafficLights(dc, r.x + 12 * dc.z, r.y + r.h / 2, d, active, 'flat');
        // Big Sur titles sit left, after the lights, in bold
        const t = fitText(g, title, (x) => INTER(x, 600), Math.max(7, 13 * dc.z), r.x + r.w - left - 20 * dc.z);
        g.fillStyle = dark ? (active ? '#f5f5f7' : '#8e8e93') : active ? '#1d1d1f' : '#a1a1a6';
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(t, left + 14 * dc.z, r.y + r.h / 2);
      },
      progress(dc, r, fill, anim) {
        const g = dc.g;
        const h = Math.max(4, r.h * 0.45), y = r.y + (r.h - h) / 2;
        rrect(g, r.x, y, r.w, h, h / 2); g.fillStyle = dark ? '#3a3a3c' : '#e5e5ea'; g.fill();
        const w = anim ? r.w * (0.3 + 0.7 * ((dc.time * 0.35) % 1)) : r.w * fill;
        if (w > 0) (rrect(g, r.x, y, w, h, h / 2), (g.fillStyle = dark ? '#0a84ff' : '#007aff'), g.fill());
      },
    },
  };
}
export const bigSurTheme = bigSurOf(false);

// ---------------- macOS Tahoe, Liquid Glass (light and dark) ----------------


// Tahoe, after Apple's own description: windows with a toolbar have 26pt
// corners and a calm, near-solid surface (frosted a little by the wallpaper);
// the title is plain bold text by the traffic lights; the glass lives on the
// toolbar's capsules; content sits in flat grouped cards; the wallpaper is
// the abstract wave (light blue by day, violet by night).
function tahoeOf(dark: boolean): Theme {
  const surface = dark ? 'rgba(34,34,40,0.9)' : 'rgba(246,246,249,0.9)';
  const group = dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.92)';
  const groupLine = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)';
  return {
    id: dark ? 'tahoe-dark' : 'tahoe', name: 'macOS Tahoe', blurb: dark ? 'frosted glass at night, over the violet wave' : 'frosted glass and 26pt corners over the blue wave',
    radius: 12, spotlight: dark ? 'rgba(8,4,24,0.5)' : 'rgba(10,30,60,0.35)',
    ui: INTER, mono: MONO('"SF Mono", "JetBrains Mono", Menlo, monospace'),
    p: dark ? {
      bg: '#1a1540', card: group, panel: 'rgba(40,40,46,0.96)', line: groupLine,
      fg: '#f2f2f5', dim: '#a8a8b3', faint: '#6e6e7a', accent: '#0a84ff', ptr: '#64a8ff', ret: '#30d158', wait: '#ff9f0a', err: '#ff453a',
      param: '#64a8ff', cell: 'rgba(10,132,255,0.28)', track: 'rgba(255,255,255,0.06)',
    } : {
      bg: '#5aa4e0', card: group, panel: 'rgba(255,255,255,0.96)', line: groupLine,
      fg: '#1d1d1f', dim: '#5e5e66', faint: '#9a9aa2', accent: '#0a84ff', ptr: '#0a6fe0', ret: '#1f9d55', wait: '#e08600', err: '#e5362c',
      param: '#0a6fe0', cell: 'rgba(10,132,255,0.16)', track: 'rgba(0,0,0,0.04)',
    },
    pulseColor: 'rgba(10,132,255,0.85)',
    // Tahoe: a Liquid Glass tube: a bright specular rim round a clear
    // core; live, the core fills with tinted blue glass and glass lenses (white
    // capsules with a bright lip) glide through it the data's way.
    belt(dc, pts, o, t) {
      const g = dc.g;
      const z = dc.z;
      const w = Math.max(6, 9 * z);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (o.selected) strokeLine(g, pts, w + 10 * z, dark ? 'rgba(10,132,255,0.4)' : 'rgba(10,132,255,0.3)');
      strokeLine(g, pts.map(([x, y]) => [x, y + 1.5 * z] as Pt), w + 2, dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,30,80,0.16)');
      strokeLine(g, pts, w, o.hovered || o.selected ? 'rgba(255,255,255,0.95)' : dark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)');
      strokeLine(g, pts, w - 2.4, o.live ? (dark ? 'rgba(20,90,220,0.85)' : 'rgba(10,132,255,0.72)') : dark ? 'rgba(30,26,70,0.62)' : 'rgba(200,225,250,0.5)');
      strokeLine(g, pts.map(([x, y]) => [x, y - w * 0.18] as Pt), Math.max(1, w * 0.13), 'rgba(255,255,255,0.6)');
      const walk = new Walk(pts);
      if (o.live) {
        const len = Math.max(10, 18 * z);
        ride(dc, walk, o, 70 * z, Math.max(36, 60 * z), (x, y, dx, dy) => {
          g.beginPath(); g.moveTo(x - dx * len / 2, y - dy * len / 2); g.lineTo(x + dx * len / 2, y + dy * len / 2);
          g.lineWidth = w - 3; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.stroke();
          g.lineWidth = Math.max(1, w - 6); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
        }, 0, len);
      }
      const e = walk.at(walk.length);
      arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(6, 9 * z), o.live ? (dark ? '#64a8ff' : '#0a84ff') : dark ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.95)');
      countBadge(dc, pts, o, t);
    },
    // flat grouped cards, the way Settings and Finder group content
    card(dc, r, o) {
      const g = dc.g;
      const rad = Math.max(3, (o.kind === 'plate' ? r.h / 2 / Math.max(dc.z, 0.01) : o.kind === 'wall' ? 26 : 12) * dc.z);
      if (o.kind === 'wall') {
        glassBehind(dc, r, rad, 12);
        rrect(g, r.x, r.y, r.w, r.h, rad);
        g.fillStyle = dark ? 'rgba(30,26,60,0.35)' : 'rgba(255,255,255,0.22)';
        g.fill();
        g.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.6)';
        g.lineWidth = 1;
        g.stroke();
        return;
      }
      rrect(g, r.x, r.y, r.w, r.h, rad);
      if (o.fill !== 'transparent') {
        g.fillStyle = o.kind === 'frame' || o.kind === 'plate' ? (dark ? 'rgba(48,48,56,0.96)' : 'rgba(255,255,255,0.97)') : group;
        g.fill();
      }
      g.strokeStyle = o.glow ? '#0a84ff' : groupLine;
      g.lineWidth = o.glow ? Math.max(1.5, 2.5 * dc.z) : 1;
      g.stroke();
    },
    // the default wallpaper: a wave seen from just under the surface of the lake
    background(dc) {
      backdrop(dc, dark ? 'tahoe-wave-dark' : 'tahoe-wave', (g, W, H) => {
        const base = g.createLinearGradient(0, 0, W * 0.4, H);
        if (dark) (base.addColorStop(0, '#120c32'), base.addColorStop(0.5, '#2a1f66'), base.addColorStop(1, '#0a0822'));
        else (base.addColorStop(0, '#bfe3fb'), base.addColorStop(0.45, '#5aa4e0'), base.addColorStop(1, '#1d5fb0'));
        g.fillStyle = base;
        g.fillRect(0, 0, W, H);
        // layered bands of the wave, each a curved sheet with its own light
        const bands: [number, number, string, string][] = dark
          ? [[0.25, 0.22, 'rgba(120,90,230,0.55)', 'rgba(60,40,150,0)'], [0.45, 0.2, 'rgba(90,120,255,0.45)', 'rgba(40,60,170,0)'], [0.66, 0.18, 'rgba(170,110,255,0.35)', 'rgba(80,40,160,0)']]
          : [[0.28, 0.22, 'rgba(255,255,255,0.7)', 'rgba(150,210,250,0)'], [0.48, 0.2, 'rgba(110,200,245,0.6)', 'rgba(40,120,210,0)'], [0.68, 0.18, 'rgba(40,110,210,0.55)', 'rgba(20,70,160,0)']];
        for (const [y, amp, c0, c1] of bands) {
          const top = (x: number) => H * y + Math.sin((x / W) * Math.PI * 1.6 + y * 6) * H * amp * 0.5 - (x / W) * H * 0.18;
          g.beginPath();
          g.moveTo(0, top(0));
          for (let x = 0; x <= W; x += W / 40) g.lineTo(x, top(x));
          g.lineTo(W, H);
          g.lineTo(0, H);
          g.closePath();
          const fill = g.createLinearGradient(0, H * (y - amp), 0, H * (y + amp * 1.5));
          fill.addColorStop(0, c0);
          fill.addColorStop(1, c1);
          g.fillStyle = fill;
          g.fill();
          // the bright crest
          g.beginPath();
          for (let x = 0; x <= W; x += W / 40) (x === 0 ? g.moveTo(x, top(x)) : g.lineTo(x, top(x)));
          g.strokeStyle = dark ? 'rgba(200,180,255,0.35)' : 'rgba(255,255,255,0.75)';
          g.lineWidth = 1.5;
          g.stroke();
        }
      });
    },
    window: {
      border: 1, corner: 26, titleH: 34, face: surface, workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.12)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(4, 26 * dc.z);
        // a large soft shadow, from strokes
        rrect(g, r.x, r.y + 3 * dc.z, r.w, r.h, rad);
        g.strokeStyle = dark ? 'rgba(0,0,0,0.3)' : 'rgba(10,30,70,0.12)';
        g.lineWidth = Math.max(3, 12 * dc.z);
        g.stroke();
        // frosted: the wallpaper, well blurred, under a near-solid surface
        glassBehind(dc, r, rad, 14);
        rrect(g, r.x, r.y, r.w, r.h, rad);
        g.fillStyle = face;
        g.fill();
        // the rim: a hairline outside, a light catch inside
        g.strokeStyle = dark ? 'rgba(0,0,0,0.6)' : active ? 'rgba(0,0,0,0.16)' : 'rgba(0,0,0,0.1)';
        g.lineWidth = 1;
        g.stroke();
        rrect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad - 1);
        g.strokeStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.85)';
        g.stroke();
      },
      titleBar(dc, r, title, active, buttons) {
        const g = dc.g;
        const d = Math.max(5, Math.min(r.h * 0.42, 12 * dc.z));
        const left = trafficLights(dc, r.x + 14 * dc.z, r.y + r.h / 2 + 2 * dc.z, d, active, 'flat');
        let right = r.x + r.w - 12 * dc.z;
        // a glass capsule of toolbar buttons at the trailing edge
        if (buttons && r.w > 220 * dc.z) {
          const ch = Math.max(8, r.h * 0.72);
          const cw = ch * 2.3;
          const cap = { x: right - cw, y: r.y + (r.h - ch) / 2 + 2 * dc.z, w: cw, h: ch };
          rrect(g, cap.x, cap.y, cap.w, cap.h, ch / 2);
          g.fillStyle = dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.75)';
          g.fill();
          g.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)';
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = active ? (dark ? '#e6e6ea' : '#3a3a40') : '#9a9aa2';
          const cy = cap.y + ch / 2;
          const dot = Math.max(1, 1.4 * dc.z);
          for (const k of [-1, 0, 1]) (g.beginPath(), g.arc(cap.x + cw * 0.3 + k * dot * 3, cy, dot, 0, Math.PI * 2), g.fill());
          g.beginPath();
          g.arc(cap.x + cw * 0.7, cy - dot * 0.6, dot * 2.6, 0, Math.PI * 2);
          g.strokeStyle = g.fillStyle;
          g.lineWidth = Math.max(1, 1.3 * dc.z);
          g.stroke();
          right = cap.x - 8 * dc.z;
        }
        const fs = Math.max(7, 13.5 * dc.z);
        const t = fitText(g, title, (x) => INTER(x, 700), fs, Math.max(0, right - left - 16 * dc.z));
        g.fillStyle = dark ? (active ? '#f2f2f5' : '#8e8e98') : active ? '#1d1d1f' : '#8e8e96';
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillText(t, left + 14 * dc.z, r.y + r.h / 2 + 2 * dc.z);
      },
      progress(dc, r, fill, anim) {
        // a thin capsule, the system's
        const g = dc.g;
        const h = Math.max(3, Math.min(r.h, 6 * dc.z));
        const y = r.y + (r.h - h) / 2;
        rrect(g, r.x, y, r.w, h, h / 2);
        g.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
        g.fill();
        const x0 = anim ? r.x + r.w * (((dc.time * 0.5) % 1.3) - 0.3) : r.x;
        const w = anim ? r.w * 0.3 : r.w * fill;
        const a = Math.max(r.x, x0);
        const b = Math.min(r.x + r.w, x0 + w);
        if (b - a < 1) return;
        rrect(g, a, y, b - a, h, h / 2);
        g.fillStyle = '#0a84ff';
        g.fill();
      },
    },
  };
}
export const tahoeTheme = tahoeOf(false);

export const system7 = makeSkin(system7Theme);
export const platinum = makeSkin(platinumTheme);
export const leopard = makeSkin(leopardTheme);
export const yosemite = makeSkin(yosemiteTheme);
export const bigsur = { ...makeSkin(bigSurTheme), mode: 'light' as const };
export const tahoe = { ...makeSkin(tahoeTheme), mode: 'light' as const };
export const bigsurDark = { ...makeSkin(bigSurOf(true)), variantOf: 'bigsur', mode: 'dark' as const };
export const tahoeDark = { ...makeSkin(tahoeOf(true)), variantOf: 'tahoe', mode: 'dark' as const };
