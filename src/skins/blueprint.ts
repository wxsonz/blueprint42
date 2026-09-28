// "Blueprint" — engineering drawing: deep blue paper, a fine white grid,
// chalk lines that overshoot their corners, hand lettering, and a yellow
// highlighter on whatever is running.
import { makeSkin, countBadge, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { arrowHead, hash, rrect, strokeLine, Walk } from './util';

const INK = '#eef5ff';
const HI = '#ffe066';

// A drafted rectangle: slightly wavy edges that run past the corners.
function drafted(dc: Dc, r: Rect, stroke: string, lw: number): void {
  const g = dc.g;
  const seed = Math.round(r.x * 3 + r.y * 7 + r.w);
  const j = (k: number) => (hash(seed + k) - 0.5) * Math.min(2.2, 1.4 * dc.z);
  const over = Math.min(7, 5 * dc.z);
  const edge = (x0: number, y0: number, x1: number, y1: number, k: number) => {
    const dx = x1 - x0, dy = y1 - y0;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l, uy = dy / l;
    g.beginPath();
    g.moveTo(x0 - ux * over + j(k), y0 - uy * over + j(k + 1));
    g.quadraticCurveTo((x0 + x1) / 2 + j(k + 2) * 1.5, (y0 + y1) / 2 + j(k + 3) * 1.5, x1 + ux * over + j(k + 4), y1 + uy * over + j(k + 5));
    g.stroke();
  };
  g.strokeStyle = stroke;
  g.lineWidth = lw;
  g.lineCap = 'round';
  edge(r.x, r.y, r.x + r.w, r.y, 1);
  edge(r.x + r.w, r.y, r.x + r.w, r.y + r.h, 11);
  edge(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 21);
  edge(r.x, r.y + r.h, r.x, r.y, 31);
}

export const blueprintTheme: Theme = {
  id: 'blueprint',
  name: 'Blueprint',
  blurb: 'an engineering drawing: chalk on blue paper',
  radius: 0,
  spotlight: 'rgba(6,24,48,0.68)',
  ui: (px, w = 400) => `${w >= 600 ? 700 : 400} ${px}px "Architects Daughter", "Comic Sans MS", cursive`,
  mono: (px, w = 400) => `${w >= 600 ? 700 : 400} ${px}px "Share Tech Mono", "DejaVu Sans Mono", monospace`,
  p: {
    bg: '#123e6e', card: 'rgba(255,255,255,0.04)', panel: '#15487c', line: 'rgba(238,245,255,0.85)',
    fg: INK, dim: '#b9d0ec', faint: '#7fa3cc', accent: HI, ptr: '#ffa3b8', ret: '#9ff0c4', wait: '#ffc36b', err: '#ff7070',
    param: '#cfe2ff', cell: 'rgba(255,255,255,0.2)', track: '#0e3560',
  },
  pulseColor: 'rgba(255,224,102,0.9)',

  card(dc, r, o) {
    const g = dc.g;
    g.save();
    if (o.kind === 'plate') {
      rrect(g, r.x, r.y, r.w, r.h, r.h / 2);
      g.fillStyle = '#0f3a66';
      g.fill();
      g.strokeStyle = o.stroke;
      g.lineWidth = o.lw;
      g.stroke();
      g.restore();
      return;
    }
    if (o.fill !== 'transparent') {
      g.fillStyle = o.fill;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    // the running one gets a highlighter wash
    if (o.glow) {
      g.fillStyle = o.glow === HI ? 'rgba(255,224,102,0.13)' : 'rgba(255,112,112,0.14)';
      g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
    if (o.kind === 'wall') g.setLineDash([Math.max(3, 8 * dc.z), Math.max(2, 4 * dc.z)]);
    drafted(dc, r, o.stroke === 'transparent' ? INK : o.stroke, Math.max(1, o.lw * Math.min(1.3, dc.z)));
    g.restore();
  },

  background(dc, camX, camY) {
    const g = dc.g;
    g.fillStyle = '#123e6e';
    g.fillRect(0, 0, dc.vw, dc.vh);
    // paper grain: a soft vignette
    const v = g.createRadialGradient(dc.vw / 2, dc.vh / 2, Math.min(dc.vw, dc.vh) * 0.3, dc.vw / 2, dc.vh / 2, Math.max(dc.vw, dc.vh) * 0.8);
    v.addColorStop(0, 'rgba(255,255,255,0.03)');
    v.addColorStop(1, 'rgba(0,10,30,0.35)');
    g.fillStyle = v;
    g.fillRect(0, 0, dc.vw, dc.vh);
    if (dc.cs * 5 < 10) return; // far out: plain paper
    const x0 = Math.floor(camX), y0 = Math.floor(camY);
    const nx = dc.vw / dc.cs + 1, ny = dc.vh / dc.cs + 1;
    g.lineWidth = 1;
    for (let k = 0; k <= nx; k++) {
      const x = x0 + k;
      if (dc.cs < 12 && x % 5) continue;
      g.strokeStyle = x % 5 === 0 ? 'rgba(238,245,255,0.16)' : 'rgba(238,245,255,0.06)';
      const sx = Math.round((x - camX) * dc.cs) + 0.5;
      g.beginPath(); g.moveTo(sx, 0); g.lineTo(sx, dc.vh); g.stroke();
    }
    for (let k = 0; k <= ny; k++) {
      const y = y0 + k;
      if (dc.cs < 12 && y % 5) continue;
      g.strokeStyle = y % 5 === 0 ? 'rgba(238,245,255,0.16)' : 'rgba(238,245,255,0.06)';
      const sy = Math.round((y - camY) * dc.cs) + 0.5;
      g.beginPath(); g.moveTo(0, sy); g.lineTo(dc.vw, sy); g.stroke();
    }
  },

  // A dimension line: a tick where it starts, an arrow where it lands.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const col = o.live ? HI : o.hovered || o.selected ? INK : 'rgba(238,245,255,0.55)';
    g.lineCap = 'round';
    strokeLine(g, pts, Math.max(1, 1.3 * dc.z), col);
    if (o.live) strokeLine(g, pts, Math.max(1.5, 2.4 * dc.z), HI, [Math.max(3, 6 * dc.z), Math.max(4, 8 * dc.z)], -dc.time * 36 * dc.z * o.dir);
    const w = new Walk(pts);
    const a = w.at(0);
    const L = Math.max(4, 6 * dc.z);
    g.strokeStyle = col;
    g.beginPath(); g.moveTo(a.x - a.dy * L, a.y + a.dx * L); g.lineTo(a.x + a.dy * L, a.y - a.dx * L); g.stroke();
    const e = w.at(w.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(5, 8 * dc.z), col);
    countBadge(dc, pts, o, t);
  },

  nodeDecor(dc, r, n) {
    // a little title-block stamp in the corner
    const g = dc.g;
    const s = Math.max(6, 9 * dc.z);
    g.strokeStyle = 'rgba(238,245,255,0.5)';
    g.lineWidth = 1;
    g.strokeRect(r.x + r.w - s * 2.4, r.y + r.h - s * 1.4, s * 2, s);
    g.fillStyle = 'rgba(238,245,255,0.7)';
    g.font = `${Math.max(6, 7 * dc.z)}px "Share Tech Mono", monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(n.copy > 1 ? `#${n.copy}` : 'A1', r.x + r.w - s * 1.4, r.y + r.h - s * 0.9);
  },
};

export const blueprint = makeSkin(blueprintTheme);
