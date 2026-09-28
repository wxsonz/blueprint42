// "Game Boy" — four shades of green and nothing else: pixel-snapped boxes,
// dithered shadows, belts of dots, and a blinking ▶ on whatever runs.
import { makeSkin, countBadge, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { Walk } from './util';

// the DMG palette, darkest to lightest
const C0 = '#0f380f';
const C1 = '#306230';
const C2 = '#8bac0f';
const C3 = '#9bbc0f';

// a 50% checker, for shadows
function dither(dc: Dc, r: Rect, color: string): void {
  const g = dc.g;
  const s = Math.max(1, Math.round(2 * Math.min(1.5, dc.z)));
  g.fillStyle = color;
  for (let y = Math.round(r.y); y < r.y + r.h; y += s) {
    for (let x = Math.round(r.x) + (((y - Math.round(r.y)) / s) % 2 ? s : 0); x < r.x + r.w; x += s * 2) g.fillRect(x, y, s, s);
  }
}

export const gameboyTheme: Theme = {
  id: 'gameboy',
  name: 'Game Boy',
  blurb: 'four shades of green, pixel by pixel',
  radius: 0,
  pixel: true,
  upper: true,
  spotlight: 'rgba(15,56,15,0.55)',
  ui: (px) => `${Math.max(6, Math.round(px * 0.62))}px "Press Start 2P", monospace`,
  mono: (px) => `${Math.round(px * 1.35)}px VT323, monospace`,
  p: {
    bg: C3, card: C2, panel: C3, line: C0,
    fg: C0, dim: C1, faint: '#6f8f22', accent: C0, ptr: C1, ret: C0, wait: C1, err: C0,
    param: C1, cell: C2, track: C3,
  },
  pulseColor: 'rgba(15,56,15,0.55)',

  card(dc, r0, o) {
    const g = dc.g;
    const r = { x: Math.round(r0.x), y: Math.round(r0.y), w: Math.round(r0.w), h: Math.round(r0.h) };
    const b = Math.max(1, Math.round(2 * Math.min(1.5, dc.z)));
    if (o.kind === 'wall') {
      g.fillStyle = o.stroke;
      for (let x = r.x; x < r.x + r.w; x += b * 3) (g.fillRect(x, r.y, b, b), g.fillRect(x, r.y + r.h - b, b, b));
      for (let y = r.y; y < r.y + r.h; y += b * 3) (g.fillRect(r.x, y, b, b), g.fillRect(r.x + r.w - b, y, b, b));
      return;
    }
    if (o.kind !== 'plate' && r.h > 8) dither(dc, { x: r.x + b * 2, y: r.y + b * 2, w: r.w, h: r.h }, C1);
    g.fillStyle = o.fill === 'transparent' ? C3 : o.glow ? C2 : o.fill;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = o.stroke;
    g.fillRect(r.x, r.y, r.w, b);
    g.fillRect(r.x, r.y + r.h - b, r.w, b);
    g.fillRect(r.x, r.y, b, r.h);
    g.fillRect(r.x + r.w - b, r.y, b, r.h);
    // the one that runs gets a dark title bar
    if (o.glow && o.kind === 'node') g.fillRect(r.x, r.y, r.w, Math.max(b * 3, Math.round(r.h * 0.07)));
  },

  background(dc, camX, camY) {
    const g = dc.g;
    g.fillStyle = C3;
    g.fillRect(0, 0, dc.vw, dc.vh);
    if (dc.cs < 12) return;
    g.fillStyle = C2;
    const s = Math.max(1, Math.round(dc.z * 1.5));
    for (let x = Math.floor(camX); x < camX + dc.vw / dc.cs + 1; x++) {
      for (let y = Math.floor(camY); y < camY + dc.vh / dc.cs + 1; y++) g.fillRect(Math.round((x - camX) * dc.cs), Math.round((y - camY) * dc.cs), s, s);
    }
  },

  // Belts are dotted paths; the dots march when a call is live.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const w = new Walk(pts);
    const s = Math.max(2, Math.round(3 * Math.min(1.5, dc.z)));
    const step = s * 3;
    const shift = o.live ? Math.floor((dc.time * 20 * o.dir) % 3) * s : 0;
    g.fillStyle = o.live || o.selected ? C0 : C1;
    for (let d = shift; d < w.length; d += step) {
      const a = w.at(d);
      g.fillRect(Math.round(a.x - s / 2), Math.round(a.y - s / 2), s, s);
    }
    const e = w.at(w.length);
    // a pixel arrow
    g.fillStyle = o.live ? C0 : C1;
    for (let k = 0; k < 3; k++) {
      const bx = e.x - e.dx * s * k, by = e.y - e.dy * s * k;
      g.fillRect(Math.round(bx - e.dy * s * k - s / 2), Math.round(by + e.dx * s * k - s / 2), s, s);
      g.fillRect(Math.round(bx + e.dy * s * k - s / 2), Math.round(by - e.dx * s * k - s / 2), s, s);
    }
    countBadge(dc, pts, o, t);
  },

  nodeDecor(dc, r, n) {
    if (n.state !== 'running' || Math.floor(dc.time * 2.5) % 2) return;
    const g = dc.g;
    g.fillStyle = C0;
    g.font = `${Math.max(6, Math.round(9 * dc.z))}px "Press Start 2P", monospace`;
    g.textAlign = 'right';
    g.textBaseline = 'top';
    g.fillText('▶', Math.round(r.x + r.w - 6 * dc.z), Math.round(r.y + r.h * 0.42));
  },
};

export const gameboy = makeSkin(gameboyTheme);
