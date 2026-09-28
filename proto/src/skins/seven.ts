// "Windows 7" — Aero: glass frames over the Harmony wallpaper, dark title
// text with a soft white glow, glossy caption buttons with the wide red
// close, the green shine-sweep progress bar.
import { backdrop, glassBehind, makeSkin, plainCard, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { fitText, rrect } from './util';

const UI = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px "Segoe UI", "Open Sans", "DejaVu Sans", sans-serif`;

function glassButton(dc: Dc, r: Rect, kind: 'min' | 'max' | 'close', active: boolean): void {
  const g = dc.g;
  const rad = Math.max(1.5, 3 * dc.z);
  const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  if (kind === 'close') {
    grad.addColorStop(0, active ? '#e9a99c' : 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.5, active ? '#d4553e' : 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, active ? '#c63c20' : 'rgba(255,255,255,0.25)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0.3)');
  }
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(0,20,50,0.55)';
  g.lineWidth = 1;
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(1.2, 1.8 * dc.z);
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const d = Math.min(r.w, r.h) * 0.2;
  g.beginPath();
  if (kind === 'close') (g.moveTo(c.x - d, c.y - d), g.lineTo(c.x + d, c.y + d), g.moveTo(c.x + d, c.y - d), g.lineTo(c.x - d, c.y + d));
  else if (kind === 'min') (g.moveTo(c.x - d, c.y + d * 0.7), g.lineTo(c.x + d, c.y + d * 0.7));
  else g.rect(c.x - d, c.y - d * 0.8, d * 2, d * 1.6);
  g.stroke();
}

export const sevenTheme: Theme = {
  id: 'seven',
  name: 'Windows 7',
  blurb: 'Aero glass over Harmony',
  radius: 4,
  spotlight: 'rgba(4,16,36,0.6)',
  ui: UI,
  mono: (px, w = 400) => `${w >= 600 ? 700 : 400} ${px}px Consolas, "DejaVu Sans Mono", monospace`,
  p: {
    bg: '#1a4f8f', card: '#f0f0f0', panel: '#ffffff', line: '#8e9aa9',
    fg: '#1e1e1e', dim: '#555a60', faint: '#8f959c', accent: '#3399ff', ptr: '#0066cc', ret: '#2f9e44', wait: '#c77c02', err: '#d42f2f',
    param: '#1d5aa8', cell: '#cce4f7', track: '#ffffff',
  },
  pulseColor: 'rgba(51,153,255,0.85)',

  card(dc, r, o) {
    plainCard(dc, r, 3, { ...o, glow: null, fill: o.fill === 'transparent' ? 'transparent' : o.kind === 'frame' || o.kind === 'plate' ? '#ffffff' : '#f0f0f0' });
  },

  // Harmony: deep blue with soft glowing ribbons of light.
  background(dc) {
    backdrop(dc, 'harmony', (g, W, H) => {
      const base = g.createLinearGradient(0, 0, W, H);
      base.addColorStop(0, '#0e3a74');
      base.addColorStop(0.5, '#1b64b8');
      base.addColorStop(1, '#0a2a57');
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      for (const [cx, cy, rr, a] of [[0.72, 0.4, 0.45, 0.35], [0.25, 0.75, 0.35, 0.22], [0.5, 0.1, 0.3, 0.18]]) {
        const glow = g.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, Math.max(W, H) * rr);
        glow.addColorStop(0, `rgba(140,210,255,${a})`);
        glow.addColorStop(1, 'rgba(140,210,255,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
      }
      g.strokeStyle = 'rgba(200,235,255,0.25)';
      for (let k = 0; k < 6; k++) {
        g.lineWidth = 1 + k * 1.5;
        g.globalAlpha = 0.5 - k * 0.07;
        g.beginPath();
        g.moveTo(-W * 0.1, H * (0.9 - k * 0.04));
        g.bezierCurveTo(W * 0.3, H * (0.2 + k * 0.03), W * 0.6, H * (1.05 - k * 0.05), W * 1.1, H * (0.3 + k * 0.05));
        g.stroke();
      }
      g.globalAlpha = 1;
    });
  },

  window: {
    border: 7,
    corner: 6,
    titleH: 24,
    face: '#f0f0f0',
    workspace: 'rgba(180,210,240,0.35)',
    frame(dc, r, active, client) {
      const g = dc.g;
      const b = Math.max(2, 7 * dc.z);
      const rad = Math.max(2, 6 * dc.z);
      const th = 24 * dc.z;
      // a soft drop shadow, from two strokes (no blur: it's per frame)
      rrect(g, r.x - 1, r.y, r.w + 2, r.h + 2, rad + 1);
      g.strokeStyle = 'rgba(0,10,30,0.22)';
      g.lineWidth = Math.max(2, 5 * dc.z);
      g.stroke();
      // Aero glass: the wallpaper, blurred, through a tinted frame
      glassBehind(dc, r, rad, 8);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = active ? 'rgba(96,152,218,0.34)' : 'rgba(200,212,228,0.52)';
      g.fill();
      const hi = g.createLinearGradient(0, r.y, 0, r.y + th * 1.2);
      hi.addColorStop(0, 'rgba(255,255,255,0.5)');
      hi.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      hi.addColorStop(1, 'rgba(255,255,255,0.06)');
      g.fillStyle = hi;
      g.fill();
      // the diagonal light streaks across the glass
      g.save();
      g.clip();
      g.fillStyle = active ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.09)';
      const lean = Math.min(r.h, 160 * dc.z) * 0.8;
      for (const [u, w] of [[0.14, 26], [0.2, 9], [0.52, 34], [0.6, 12], [0.83, 20]]) {
        const x = r.x + r.w * u;
        g.beginPath();
        g.moveTo(x, r.y);
        g.lineTo(x + w * dc.z, r.y);
        g.lineTo(x + w * dc.z - lean, r.y + lean * 1.25);
        g.lineTo(x - lean, r.y + lean * 1.25);
        g.closePath();
        g.fill();
      }
      g.restore();
      // a dark outer edge and a white inner line
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.strokeStyle = 'rgba(0,15,40,0.75)';
      g.lineWidth = 1;
      g.stroke();
      rrect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad);
      g.strokeStyle = 'rgba(255,255,255,0.65)';
      g.stroke();
      g.fillStyle = client;
      g.fillRect(r.x + b, r.y + b + th, r.w - 2 * b, Math.max(0, r.h - 2 * b - th));
      g.strokeStyle = 'rgba(0,20,50,0.45)';
      g.strokeRect(r.x + b - 0.5, r.y + b + th - 0.5, r.w - 2 * b + 1, Math.max(0, r.h - 2 * b - th) + 1);
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const bh = Math.max(8, 18 * dc.z);
      let right = r.x + r.w;
      if (buttons && r.w > 120 * dc.z) {
        const cw = bh * 2.3;
        glassButton(dc, { x: right - cw, y: r.y - 2 * dc.z, w: cw, h: bh }, 'close', active);
        right -= cw;
        for (const k of ['max', 'min'] as const) {
          glassButton(dc, { x: right - bh * 1.35, y: r.y - 2 * dc.z, w: bh * 1.35, h: bh }, k, active);
          right -= bh * 1.35;
        }
      }
      const fs = Math.max(7, 12 * dc.z);
      const t = fitText(g, title, UI, fs, right - r.x - 16 * dc.z);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      // the soft white glow behind dark text
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.lineWidth = Math.max(2, 5 * dc.z);
      g.lineJoin = 'round';
      g.strokeText(t, r.x + 6 * dc.z, r.y + r.h / 2);
      g.restore();
      g.fillStyle = active ? '#000000' : '#4a4f55';
      g.fillText(t, r.x + 6 * dc.z, r.y + r.h / 2);
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 2 * dc.z));
      g.fillStyle = '#e6e6e6';
      g.fill();
      g.strokeStyle = '#bcbcbc';
      g.lineWidth = 1;
      g.stroke();
      const w = anim ? r.w - 2 : (r.w - 2) * fill;
      if (w <= 0) return;
      const green = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      green.addColorStop(0, '#b6f0b0'); green.addColorStop(0.45, '#37c13b'); green.addColorStop(0.55, '#06b025'); green.addColorStop(1, '#40d040');
      g.fillStyle = green;
      g.fillRect(r.x + 1, r.y + 1, w, r.h - 2);
      if (anim) {
        // the shine that sweeps across
        const sx = r.x + ((dc.time * 0.6) % 1.4 - 0.2) * r.w;
        const shine = g.createLinearGradient(sx - r.w * 0.15, 0, sx + r.w * 0.15, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)'); shine.addColorStop(0.5, 'rgba(255,255,255,0.65)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = shine;
        g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    },
  },
};

export const seven = makeSkin(sevenTheme);
