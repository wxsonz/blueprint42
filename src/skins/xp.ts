// "Windows XP" — Luna blue: rounded blue title bars with a glossy gradient,
// beige window faces, the red close button, green progress blocks, on the
// Bliss hill.
import { backdrop, countBadge, makeSkin, plainCard, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { arrowHead, fitText, rrect, strokeLine, Walk } from './util';

const FACE = '#ece9d8';
const UI = (px: number, w = 400) => `${w >= 600 ? 700 : 400} ${px}px Tahoma, Verdana, "DejaVu Sans", sans-serif`;
const TITLE = (px: number) => `700 ${px}px "Trebuchet MS", Tahoma, "DejaVu Sans", sans-serif`;

function capButton(dc: Dc, r: Rect, kind: 'min' | 'max' | 'close', active: boolean): void {
  const g = dc.g;
  const rad = Math.max(1.5, 3 * dc.z);
  const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  if (kind === 'close') {
    grad.addColorStop(0, active ? '#f0917a' : '#e6a99a');
    grad.addColorStop(1, active ? '#c2351a' : '#c98474');
  } else {
    grad.addColorStop(0, active ? '#6d9cf5' : '#a9bcef');
    grad.addColorStop(1, active ? '#1f55d8' : '#8ea4e3');
  }
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(1, dc.z);
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(1.2, 2 * dc.z);
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const d = r.w * 0.22;
  g.beginPath();
  if (kind === 'close') (g.moveTo(c.x - d, c.y - d), g.lineTo(c.x + d, c.y + d), g.moveTo(c.x + d, c.y - d), g.lineTo(c.x - d, c.y + d));
  else if (kind === 'min') (g.moveTo(c.x - d, c.y + d), g.lineTo(c.x + d * 0.3, c.y + d));
  else g.rect(c.x - d, c.y - d, d * 2, d * 2);
  g.stroke();
}

export const xpTheme: Theme = {
  id: 'xp',
  name: 'Windows XP',
  blurb: 'Luna blue on the Bliss hill',
  radius: 3,
  spotlight: 'rgba(8,24,64,0.6)',
  ui: UI,
  mono: (px, w = 400) => `${w >= 600 ? 700 : 400} ${px}px "Lucida Console", "DejaVu Sans Mono", monospace`,
  p: {
    bg: '#5a8fe0', card: FACE, panel: '#ffffff', line: '#7f9db9',
    fg: '#000000', dim: '#444444', faint: '#8d8d8d', accent: '#316ac5', ptr: '#0000ee', ret: '#2c8a1a', wait: '#c58a00', err: '#d9261c',
    param: '#1f4e9c', cell: '#c9dcfa', track: '#ffffff',
  },
  pulseColor: 'rgba(49,106,197,0.8)',

  // A Luna pipe: a rounded, glossy tube with a pale blue-grey edge; live, the
  // progress bar's green blocks run through it (the way the data goes);
  // hovered, the edge turns Luna orange; selected, a blue halo.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    const w = Math.max(6, 9 * z);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected) strokeLine(g, pts, w + 9 * z, 'rgba(49,106,197,0.35)');
    strokeLine(g, pts, w + 2, o.hovered ? '#e08a1e' : o.live ? '#1f4e9c' : '#7f9db9');
    strokeLine(g, pts, w, o.live ? '#dbe8fb' : '#f1efe2');
    strokeLine(g, pts, w * 0.55, o.live ? '#c3d7f7' : '#dddbca');
    const walk = new Walk(pts);
    if (o.live) {
      // green progress blocks, each with its own gloss
      const blk = Math.max(4, 6 * z), gap = Math.max(2, 2.5 * z), per = blk + gap;
      const off = (((dc.time * 34 * z * o.dir) % per) + per) % per;
      g.lineCap = 'butt';
      g.lineJoin = 'miter';
      strokeLine(g, pts, w - 3, '#2fae22', [blk, gap], -off);
      strokeLine(g, pts, Math.max(1.5, (w - 3) * 0.5), '#7be36a', [blk, gap], -off);
      strokeLine(g, pts, Math.max(1, (w - 3) * 0.18), '#e6ffd9', [blk, gap], -off);
      g.lineCap = 'round';
    } else {
      strokeLine(g, pts, Math.max(1, w * 0.2), 'rgba(255,255,255,0.9)');
    }
    const e = walk.at(walk.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(6, 9 * z), o.live ? '#1f4e9c' : o.hovered ? '#e08a1e' : '#5c7fa8');
    countBadge(dc, pts, o, t);
  },

  card(dc, r, o) {
    plainCard(dc, r, o.kind === 'plate' ? 3 : 3, { ...o, glow: null, fill: o.fill === 'transparent' ? 'transparent' : o.kind === 'frame' || o.kind === 'plate' ? '#ffffff' : FACE });
  },

  // Bliss: a blue sky with soft clouds over a green hill.
  background(dc) {
    backdrop(dc, 'bliss', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H * 0.7);
      sky.addColorStop(0, '#2f6fd8');
      sky.addColorStop(1, '#a9d1f5');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      for (const [x, y, rx, ry] of [[0.2, 0.18, 0.12, 0.04], [0.55, 0.12, 0.16, 0.05], [0.8, 0.25, 0.1, 0.035]]) {
        g.beginPath(); g.ellipse(W * x, H * y, W * rx, H * ry, 0, 0, Math.PI * 2); g.fill();
      }
      const hill = g.createLinearGradient(0, H * 0.55, 0, H);
      hill.addColorStop(0, '#6cc04a');
      hill.addColorStop(1, '#2e7d1f');
      g.fillStyle = hill;
      g.beginPath();
      g.moveTo(0, H * 0.72);
      g.bezierCurveTo(W * 0.3, H * 0.52, W * 0.62, H * 0.55, W, H * 0.66);
      g.lineTo(W, H); g.lineTo(0, H); g.closePath();
      g.fill();
    });
  },

  window: {
    border: 4,
    corner: 8,
    squareBottom: true,
    flushTitle: true,
    titleH: 24,
    face: FACE,
    workspace: '#7a9bd9',
    // the title bar is the top of the frame; the same blue runs down both
    // sides and along the bottom, lighter inside, darker at the outer edge
    frame(dc, r, active, client) {
      const g = dc.g;
      const b = Math.max(1, 4 * dc.z);
      const th = 24 * dc.z;
      rrect(g, r.x, r.y, r.w, r.h, [Math.max(2, 8 * dc.z), Math.max(2, 8 * dc.z), 0, 0]);
      g.fillStyle = active ? '#0843d5' : '#7b97e0';
      g.fill();
      g.strokeStyle = active ? '#00138c' : '#6a7fc8';
      g.lineWidth = 1;
      g.stroke();
      // a lighter inner line where the frame meets the client
      g.fillStyle = active ? '#166aee' : '#94acea';
      g.fillRect(r.x + b - 1, r.y + th, r.w - 2 * b + 2, r.h - th - b + 1);
      g.fillStyle = client;
      g.fillRect(r.x + b, r.y + th, r.w - 2 * b, Math.max(0, r.h - th - b));
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (active) {
        grad.addColorStop(0, '#0997ff'); grad.addColorStop(0.1, '#0053ee'); grad.addColorStop(0.5, '#0050ee'); grad.addColorStop(0.9, '#0066ff'); grad.addColorStop(1, '#0043c8');
      } else {
        grad.addColorStop(0, '#a6c1f3'); grad.addColorStop(0.5, '#8ea9eb'); grad.addColorStop(1, '#7d98e2');
      }
      rrect(g, r.x, r.y, r.w, r.h, [Math.max(2, 7 * dc.z), Math.max(2, 7 * dc.z), 0, 0]);
      g.fillStyle = grad;
      g.fill();
      const bs = r.h - Math.max(4, 6 * dc.z);
      let right = r.x + r.w - Math.max(2, 4 * dc.z);
      if (buttons && r.w > bs * 5) {
        for (const k of ['close', 'max', 'min'] as const) {
          capButton(dc, { x: right - bs, y: r.y + (r.h - bs) / 2, w: bs, h: bs }, k, active);
          right -= bs + Math.max(1, 2 * dc.z);
        }
      }
      const fs = Math.max(7, 12 * dc.z);
      const t = fitText(g, title, TITLE, fs, right - r.x - 12 * dc.z);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillText(t, r.x + 8 * dc.z + 1, r.y + r.h / 2 + 1);
      g.fillStyle = active ? '#ffffff' : '#dfe6f7';
      g.fillText(t, r.x + 8 * dc.z, r.y + r.h / 2);
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 3 * dc.z));
      g.fillStyle = '#ffffff';
      g.fill();
      g.strokeStyle = '#686868';
      g.lineWidth = 1;
      g.stroke();
      const bw = Math.max(3, 7 * dc.z);
      const gap = Math.max(1, 2 * dc.z);
      const inner = r.w - 4;
      const n = Math.floor(inner / (bw + gap));
      const shown = anim ? Math.floor(dc.time * 6) % (n + 4) : Math.round(n * fill);
      const green = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      green.addColorStop(0, '#9fe29d'); green.addColorStop(0.5, '#2fbc2f'); green.addColorStop(1, '#1f9d1f');
      g.fillStyle = green;
      for (let k = 0; k < n; k++) {
        const on = anim ? k >= shown - 3 && k <= shown : k < shown;
        if (on) g.fillRect(r.x + 2 + k * (bw + gap), r.y + 2, bw, r.h - 4);
      }
    },
  },
};

export const xp = makeSkin(xpTheme);
