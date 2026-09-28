// "Windows 8" — Metro: flat colour, no gradients, no shadows. Every window
// takes its own tile colour, titles in light lowercase, square everything,
// on the start-screen purple.
import { makeSkin, plainCard, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { fitText, hash } from './util';

const UI = (px: number, w = 400) => `${w >= 600 ? 600 : 300} ${px}px "Segoe UI", "Open Sans", "DejaVu Sans", sans-serif`;
const TILES = ['#2d89ef', '#00a300', '#ff0097', '#9f00a7', '#da532c', '#1e7145', '#b91d47', '#00aba9', '#603cba', '#e3a21a'];
const tileOf = (s: string) => TILES[Math.floor(hash(s.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9973) * TILES.length)];
const BG = '#1f0a4f';
const BG_LIGHT = '#e8e4f2';

function glyph(dc: Dc, r: Rect, kind: 'min' | 'max' | 'close', color = '#ffffff'): void {
  const g = dc.g;
  g.strokeStyle = color;
  g.lineWidth = Math.max(1, 1.3 * dc.z);
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const d = Math.min(r.w, r.h) * 0.2;
  g.beginPath();
  if (kind === 'close') (g.moveTo(c.x - d, c.y - d), g.lineTo(c.x + d, c.y + d), g.moveTo(c.x + d, c.y - d), g.lineTo(c.x - d, c.y + d));
  else if (kind === 'min') (g.moveTo(c.x - d, c.y), g.lineTo(c.x + d, c.y));
  else g.rect(c.x - d, c.y - d, d * 2, d * 2);
  g.stroke();
}

function metroOf(dark: boolean): Theme {
  const bg = dark ? BG : BG_LIGHT;
  const face = dark ? '#1d1d1d' : '#ffffff';
  return {
  id: dark ? 'metro' : 'metro-light',
  name: 'Windows 8',
  blurb: dark ? 'Metro: flat tiles, bold colour' : 'Metro, light: white windows, bold tiles',
  radius: 0,
  spotlight: dark ? 'rgba(10,2,30,0.72)' : 'rgba(240,238,248,0.75)',
  ui: UI,
  mono: (px, w = 400) => `${w >= 600 ? 600 : 400} ${px}px Consolas, "DejaVu Sans Mono", monospace`,
  p: dark ? {
    bg, card: face, panel: '#262626', line: '#3a3a3a',
    fg: '#ffffff', dim: '#bdbdbd', faint: '#7a7a7a', accent: '#2d89ef', ptr: '#00aba9', ret: '#99cc00', wait: '#e3a21a', err: '#ee1111',
    param: '#9fc6f5', cell: '#3a3a3a', track: '#141414',
  } : {
    bg, card: '#f3f3f3', panel: face, line: '#d0d0d0',
    fg: '#1a1a1a', dim: '#555555', faint: '#9a9a9a', accent: '#2d89ef', ptr: '#00807f', ret: '#4a8f00', wait: '#b87d00', err: '#d01010',
    param: '#1b5fb4', cell: '#dce9fa', track: '#ffffff',
  },
  pulseColor: 'rgba(45,137,239,0.85)',

  card(dc, r, o) {
    plainCard(dc, r, 0, { ...o, glow: null, lw: o.glow ? 2 : 1 });
  },

  background(dc, camX, camY) {
    const g = dc.g;
    g.fillStyle = bg;
    g.fillRect(0, 0, dc.vw, dc.vh);
    if (dc.cs < 16) return;
    // faint square tile seams
    g.strokeStyle = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    g.lineWidth = 1;
    g.beginPath();
    const s = 2;
    for (let x = Math.floor(camX / s) * s; x < camX + dc.vw / dc.cs + s; x += s) (g.moveTo(Math.round((x - camX) * dc.cs) + 0.5, 0), g.lineTo(Math.round((x - camX) * dc.cs) + 0.5, dc.vh));
    for (let y = Math.floor(camY / s) * s; y < camY + dc.vh / dc.cs + s; y += s) (g.moveTo(0, Math.round((y - camY) * dc.cs) + 0.5), g.lineTo(dc.vw, Math.round((y - camY) * dc.cs) + 0.5));
    g.stroke();
  },

  window: {
    border: 1,
    corner: 0,
    titleH: 26,
    face,
    workspace: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    frame(dc, r, active, client) {
      const g = dc.g;
      g.fillStyle = client;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = dark ? (active ? '#ffffff' : '#555555') : active ? '#2d89ef' : '#c8c8c8';
      g.lineWidth = 1;
      g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      // the tile colour comes from the name: each machine keeps its own
      const name = title.replace(/[( ].*$/, '');
      g.fillStyle = active ? tileOf(name) : dark ? '#2b2b2b' : '#e1e1e1';
      g.fillRect(r.x, r.y, r.w, r.h);
      let right = r.x + r.w;
      if (buttons && r.w > 140 * dc.z) {
        const bw = r.h * 1.3;
        for (const k of ['close', 'max', 'min'] as const) {
          if (k === 'close' && active) (g.fillStyle = '#c7372f'), g.fillRect(right - bw, r.y, bw, r.h);
          glyph(dc, { x: right - bw, y: r.y, w: bw, h: r.h }, k, active || dark ? '#ffffff' : '#333333');
          right -= bw;
        }
      }
      const fs = Math.max(7, 14 * dc.z);
      g.fillStyle = active || dark ? '#ffffff' : '#333333';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(fitText(g, title.toLowerCase(), UI, fs, right - r.x - 16 * dc.z), r.x + 10 * dc.z, r.y + r.h / 2);
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      g.fillStyle = dark ? '#333333' : '#dddddd';
      g.fillRect(r.x, r.y + r.h * 0.35, r.w, r.h * 0.3);
      g.fillStyle = '#2d89ef';
      if (anim) {
        // the dots that run across
        for (let k = 0; k < 5; k++) {
          const u = ((dc.time * 0.45 + k * 0.06) % 1.2) - 0.1;
          const x = r.x + r.w * (u < 0.5 ? u * 0.9 : 0.45 + (u - 0.5) * 1.3);
          if (x >= r.x && x <= r.x + r.w) g.fillRect(x, r.y + r.h * 0.3, Math.max(2, 4 * dc.z), r.h * 0.4);
        }
      } else g.fillRect(r.x, r.y + r.h * 0.35, r.w * fill, r.h * 0.3);
    },
  },
};
}

export const metroTheme = metroOf(true);

export const metro = { ...makeSkin(metroTheme), mode: 'dark' as const };
export const metroLight = { ...makeSkin(metroOf(false)), variantOf: 'metro', mode: 'light' as const };
