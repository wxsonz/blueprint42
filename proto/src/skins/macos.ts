// The Mac eras, as theme-kit specs: System 7, Mac OS 9 (Platinum), Mac OS X
// Leopard, OS X Yosemite, macOS Big Sur and macOS Tahoe (Liquid Glass).
// (Mac OS X 10.0–10.4 "Aqua" is its own hand-written skin.) Mac windows put
// their controls on the left and centre their titles.
import { backdrop, glassBehind, makeSkin, plainCard, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { fitText, rrect } from './util';

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

// Glass: a translucent body that lets the backdrop through, a bright rim
// where light catches the edge, and a soft inner highlight near the top.
// see: the glass sits on the wallpaper and frosts it (a window); cards
// inside windows only tint, there's no wallpaper under them. Frosted, not
// lensed: Tahoe's later releases dialled Liquid Glass back to clarity.
function liquidGlass(dc: Dc, r: Rect, rad: number, tint: string, strong: boolean, dark = false, see = false): void {
  const g = dc.g;
  if (see) glassBehind(dc, r, rad, 12);
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.fillStyle = tint;
  g.fill();
  const hi = g.createLinearGradient(0, r.y, 0, r.y + Math.min(r.h, 60 * dc.z));
  const a = (dark ? 0.35 : 1) * (strong ? 0.55 : 0.35);
  hi.addColorStop(0, `rgba(255,255,255,${a})`);
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hi;
  g.fill();
  const rim = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
  rim.addColorStop(0, dark ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.95)');
  rim.addColorStop(0.5, dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.25)');
  rim.addColorStop(1, dark ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.8)');
  g.strokeStyle = rim;
  g.lineWidth = Math.max(1, 1.5 * dc.z);
  g.stroke();
  if (see) {
    // the lensing edge: light caught along the top-left, a shade along the bottom-right
    const k = Math.max(1.5, 4 * dc.z);
    rrect(g, r.x + k / 2 + 1, r.y + k / 2 + 1, r.w - k - 2, r.h - k - 2, Math.max(1, rad - k / 2 - 1));
    const edge = g.createLinearGradient(r.x, r.y, r.x + r.w * 0.4, r.y + r.h);
    edge.addColorStop(0, `rgba(255,255,255,${dark ? 0.22 : 0.45})`);
    edge.addColorStop(0.35, 'rgba(255,255,255,0.05)');
    edge.addColorStop(0.7, 'rgba(0,0,0,0)');
    edge.addColorStop(1, `rgba(0,10,30,${dark ? 0.2 : 0.1})`);
    g.strokeStyle = edge;
    g.lineWidth = k;
    g.stroke();
  }
}

function tahoeOf(dark: boolean): Theme {
  const glassFace = dark ? 'rgba(28,32,40,0.72)' : 'rgba(250,251,253,0.76)';
  const cardTint = dark ? 'rgba(40,44,54,0.72)' : 'rgba(255,255,255,0.62)';
  const panelTint = dark ? 'rgba(24,27,34,0.86)' : 'rgba(255,255,255,0.82)';
  return {
    id: dark ? 'tahoe-dark' : 'tahoe', name: 'macOS Tahoe', blurb: dark ? 'frosted glass at night' : 'frosted glass over the lake at dusk',
    radius: 14, spotlight: 'rgba(6,14,34,0.5)',
    ui: INTER, mono: MONO('"SF Mono", "JetBrains Mono", Menlo, monospace'),
    p: dark ? {
      bg: '#0b1a30', card: cardTint, panel: panelTint, line: 'rgba(255,255,255,0.25)',
      fg: '#f2f4f8', dim: '#aab2c0', faint: '#6b7384', accent: '#0a84ff', ptr: '#64a8ff', ret: '#30d158', wait: '#ff9f0a', err: '#ff453a',
      param: '#64a8ff', cell: 'rgba(10,132,255,0.3)', track: 'rgba(0,0,0,0.35)',
    } : {
      bg: '#23466e', card: cardTint, panel: panelTint, line: 'rgba(255,255,255,0.7)',
      fg: '#111418', dim: '#4a5260', faint: '#8a92a0', accent: '#0a84ff', ptr: '#0a6fe0', ret: '#1f9d55', wait: '#ff9f0a', err: '#ff453a',
      param: '#0a6fe0', cell: 'rgba(10,132,255,0.2)', track: 'rgba(255,255,255,0.7)',
    },
    pulseColor: 'rgba(10,132,255,0.85)',
    card(dc, r, o) {
      if (o.kind === 'wall') return liquidGlass(dc, r, Math.max(4, 18 * dc.z), dark ? 'rgba(20,24,32,0.22)' : 'rgba(255,255,255,0.08)', false, dark);
      liquidGlass(dc, r, Math.max(3, (o.kind === 'plate' ? r.h / 2 / Math.max(dc.z, 0.01) : 12) * dc.z), o.kind === 'frame' || o.kind === 'plate' ? panelTint : cardTint, !!o.glow, dark);
      if (o.glow) {
        const g = dc.g;
        rrect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, Math.max(4, 14 * dc.z));
        g.strokeStyle = 'rgba(10,132,255,0.55)'; g.lineWidth = Math.max(2, 3 * dc.z); g.stroke();
      }
    },
    // Lake Tahoe: blue mountains over still water, at dusk or at night
    background(dc) {
      backdrop(dc, dark ? 'tahoe-dark' : 'tahoe', (g, W, H) => {
        const sky = g.createLinearGradient(0, 0, 0, H * 0.55);
        const st = dark ? ['#050b1a', '#12264a', '#2b4a78'] : ['#16325c', '#4c7fb8', '#a9c7e6'];
        sky.addColorStop(0, st[0]); sky.addColorStop(0.6, st[1]); sky.addColorStop(1, st[2]);
        g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.56);
        if (dark) {
          g.fillStyle = 'rgba(255,255,255,0.75)';
          for (let k = 0; k < 70; k++) g.fillRect((k * 937) % W, ((k * 613) % Math.round(H * 0.45)), 1, 1);
        }
        const ridge = (y: number, amp: number, col: string, seed: number) => {
          g.fillStyle = col;
          g.beginPath(); g.moveTo(0, H * 0.56);
          for (let x = 0; x <= W; x += W / 24) g.lineTo(x, H * y - Math.abs(Math.sin(x / W * 7 + seed)) * H * amp - Math.sin(x / W * 17 + seed) * H * amp * 0.25);
          g.lineTo(W, H * 0.56); g.closePath(); g.fill();
        };
        ridge(0.5, 0.14, dark ? '#16294a' : '#3a5f8f', 1.3);
        ridge(0.54, 0.09, dark ? '#0e1d36' : '#2a4a74', 4.1);
        const lake = g.createLinearGradient(0, H * 0.56, 0, H);
        lake.addColorStop(0, dark ? '#1f3a63' : '#6d97c7'); lake.addColorStop(1, dark ? '#030916' : '#0f2748');
        g.fillStyle = lake; g.fillRect(0, H * 0.56, W, H * 0.44);
        g.fillStyle = `rgba(255,255,255,${dark ? 0.07 : 0.12})`;
        for (let k = 0; k < 18; k++) g.fillRect(W * ((k * 0.37) % 1), H * (0.6 + (k % 7) * 0.05), W * 0.08, 1);
      });
    },
    window: {
      border: 1, corner: 18, titleH: 34, face: glassFace, workspace: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)',
      frame(dc, r, active, client) {
        const g = dc.g;
        const rad = Math.max(4, 18 * dc.z);
        const th = 34 * dc.z;
        // frosted glass over the lake, and the content on a whiter sheet under the title band
        liquidGlass(dc, r, rad, dark ? 'rgba(30,34,44,0.42)' : 'rgba(255,255,255,0.34)', active, dark, true);
        const k = Math.max(1, 6 * dc.z);
        const inner = Math.max(2, 10 * dc.z);
        rrect(g, r.x + k, r.y + th, r.w - 2 * k, Math.max(0, r.h - th - k), [inner, inner, Math.max(2, rad - k), Math.max(2, rad - k)]);
        g.fillStyle = client;
        g.fill();
      },
      titleBar(dc, r, title, active) {
        const g = dc.g;
        const d = Math.max(6, Math.min(r.h - 16 * dc.z, 13 * dc.z));
        const left = trafficLights(dc, r.x + 14 * dc.z, r.y + r.h / 2, d, active, 'glass');
        // the title rides a small glass pill
        const fs = Math.max(7, 13 * dc.z);
        const t = fitText(g, title, (x) => INTER(x, 600), fs, r.x + r.w - left - 40 * dc.z);
        const w = g.measureText(t).width + 22 * dc.z;
        const pill = { x: left + 14 * dc.z, y: r.y + r.h * 0.18, w, h: r.h * 0.64 };
        liquidGlass(dc, pill, pill.h / 2, dark ? (active ? 'rgba(70,76,90,0.8)' : 'rgba(50,54,64,0.6)') : active ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)', active, dark);
        g.fillStyle = dark ? (active ? '#f2f4f8' : '#8a92a0') : active ? '#111418' : '#8a92a0';
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillText(t, pill.x + 11 * dc.z, r.y + r.h / 2);
      },
      progress(dc, r, fill, anim) {
        const g = dc.g;
        liquidGlass(dc, r, r.h / 2, dark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)', false, dark);
        const w = anim ? r.w * (0.3 + 0.7 * ((dc.time * 0.35) % 1)) : r.w * fill;
        if (w <= 2) return;
        rrect(g, r.x + 2, r.y + 2, w - 4, r.h - 4, (r.h - 4) / 2);
        const blue = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        blue.addColorStop(0, '#6cb4ff'); blue.addColorStop(1, '#0a84ff');
        g.fillStyle = blue; g.fill();
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
