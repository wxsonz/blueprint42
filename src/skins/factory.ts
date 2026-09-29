// "Factory floor" — industry: riveted steel plates, hazard stripes, belts
// that are real conveyors (chevrons ride them), and warning lamps on the
// machines that are working.
import { makeSkin, countBadge, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { chevron, ride } from './belts';
import { arrowHead, rrect, strokeLine, Walk } from './util';

const AMBER = '#ffb000';
const STEEL = '#353a40';

function rivets(dc: Dc, r: Rect): void {
  const g = dc.g;
  const d = Math.max(3, 6 * dc.z);
  const rad = Math.max(1, 1.8 * dc.z);
  for (const [x, y] of [[r.x + d, r.y + d], [r.x + r.w - d, r.y + d], [r.x + d, r.y + r.h - d], [r.x + r.w - d, r.y + r.h - d]]) {
    g.fillStyle = '#6d747c';
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); g.arc(x + rad * 0.4, y + rad * 0.4, rad * 0.6, 0, Math.PI * 2); g.fill();
  }
}

function hazard(dc: Dc, r: Rect): void {
  const g = dc.g;
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.fillStyle = '#1a1a1a';
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = '#f2c200';
  const s = Math.max(6, 12 * dc.z);
  for (let x = r.x - r.h; x < r.x + r.w + r.h; x += s * 2) {
    g.beginPath();
    g.moveTo(x, r.y + r.h); g.lineTo(x + s, r.y + r.h); g.lineTo(x + s + r.h, r.y); g.lineTo(x + r.h, r.y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

export const factoryTheme: Theme = {
  id: 'factory',
  name: 'Factory floor',
  blurb: 'steel plates, hazard stripes, conveyors',
  radius: 2,
  upper: true,
  spotlight: 'rgba(8,8,6,0.72)',
  ui: (px, w = 500) => `${w >= 600 ? 700 : 600} ${px * 1.08}px Rajdhani, "DejaVu Sans Condensed", sans-serif`,
  mono: (px, w = 400) => `${w >= 600 ? 600 : 400} ${px}px "IBM Plex Mono", "DejaVu Sans Mono", monospace`,
  p: {
    bg: '#1c1e20', card: STEEL, panel: '#24272b', line: '#0b0c0d',
    fg: '#ece6d6', dim: '#aaa393', faint: '#6c685f', accent: AMBER, ptr: '#4fc3f7', ret: '#8bd450', wait: '#ffd54f', err: '#ff5252',
    param: '#ffcc80', cell: '#4f555c', track: '#141618',
  },
  pulseColor: 'rgba(255,176,0,0.95)',

  card(dc, r, o) {
    const g = dc.g;
    g.save();
    if (o.glow && o.kind !== 'wall') {
      // a halo (a blur costs too much to paint)
      rrect(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, Math.max(2, 4 * dc.z));
      g.strokeStyle = o.glow;
      g.globalAlpha *= 0.3;
      g.lineWidth = Math.max(3, 5 * dc.z);
      g.stroke();
      g.globalAlpha /= 0.3;
    }
    rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 2 * dc.z));
    if (o.kind === 'wall') {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fill();
    } else if (o.fill !== 'transparent') {
      const grad = g.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
      grad.addColorStop(0, o.kind === 'plate' ? '#2b2f34' : '#41474e');
      grad.addColorStop(1, o.kind === 'plate' ? '#1f2226' : '#2c3035');
      g.fillStyle = o.kind === 'frame' ? '#202327' : grad;
      g.fill();
    }
    g.shadowBlur = 0;
    g.strokeStyle = o.stroke === '#0b0c0d' ? '#090a0b' : o.stroke;
    g.lineWidth = o.kind === 'wall' ? Math.max(2, 3 * dc.z) : o.lw + 0.5;
    g.stroke();
    // a lighter bevel on top
    if (o.kind !== 'wall' && o.kind !== 'plate' && r.h > 10) {
      g.strokeStyle = 'rgba(255,255,255,0.08)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(r.x + 2, r.y + 1.5); g.lineTo(r.x + r.w - 2, r.y + 1.5); g.stroke();
    }
    if ((o.kind === 'node' || o.kind === 'module' || o.kind === 'proc') && r.w > 40) rivets(dc, r);
    g.restore();
  },

  // Floor plates, 4 cells square: two alternating shades, the seams as one
  // path, a rivet at each corner. Plain rectangles: a screen-sized pattern
  // fill (or thousands of tread marks) cost most of a frame.
  background(dc, camX, camY) {
    const g = dc.g;
    g.fillStyle = '#1c1e20';
    g.fillRect(0, 0, dc.vw, dc.vh);
    const P = 4;
    const cs = dc.cs;
    if (P * cs < 14) return; // far out: plain floor
    const x0 = Math.floor(camX / P) * P, y0 = Math.floor(camY / P) * P;
    const x1 = camX + dc.vw / cs + P, y1 = camY + dc.vh / cs + P;
    g.fillStyle = '#1f2124';
    for (let x = x0; x < x1; x += P) for (let y = y0; y < y1; y += P) if (((x + y) / P) % 2 === 0) g.fillRect((x - camX) * cs, (y - camY) * cs, P * cs, P * cs);
    g.strokeStyle = '#141516';
    g.lineWidth = Math.max(1, 2 * dc.z);
    g.beginPath();
    for (let x = x0; x < x1; x += P) (g.moveTo(Math.round((x - camX) * cs) + 0.5, 0), g.lineTo(Math.round((x - camX) * cs) + 0.5, dc.vh));
    for (let y = y0; y < y1; y += P) (g.moveTo(0, Math.round((y - camY) * cs) + 0.5), g.lineTo(dc.vw, Math.round((y - camY) * cs) + 0.5));
    g.stroke();
    if (cs < 20) return;
    g.fillStyle = '#3a3e43';
    const rv = Math.max(2, 3 * dc.z);
    for (let x = x0; x < x1; x += P) for (let y = y0; y < y1; y += P) g.fillRect((x - camX) * cs + rv, (y - camY) * cs + rv, rv, rv);
  },

  // A roller conveyor: steel side rails, a dark bed, rollers set across it that
  // turn the data's way when live, with lit amber chevrons; selected wears a
  // hazard rail of yellow and black stripes.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    const W = Math.max(6, 10 * z);
    g.lineJoin = 'miter';
    g.lineCap = 'butt';
    if (o.selected) {
      strokeLine(g, pts, W + 9 * z, '#15130a');
      strokeLine(g, pts, W + 9 * z, AMBER, [Math.max(5, 7 * z), Math.max(5, 7 * z)]);
    }
    strokeLine(g, pts, W + 5, '#8a9099');
    strokeLine(g, pts, W + 2, '#2c2f33');
    strokeLine(g, pts, W - 1, o.hovered ? '#2a2d31' : '#17191b');
    const step = Math.max(6, 9 * z);
    const shift = o.live ? (((dc.time * 30 * z * o.dir) % step) + step) % step : 0;
    const r1 = Math.max(2, 3 * z), r2 = Math.max(1, z);
    strokeLine(g, pts, W - 1, o.live ? '#4a4030' : '#3a3e44', [r1, step - r1], -shift);
    strokeLine(g, pts, W - 1, o.live ? '#8a6a20' : '#565b62', [r2, step - r2], -shift);
    const w = new Walk(pts);
    if (o.live) {
      g.strokeStyle = AMBER;
      g.lineWidth = Math.max(1.5, 2 * z);
      ride(dc, w, o, 30 * z, Math.max(28, 48 * z), (x, y, dx, dy) => chevron(g, x, y, dx, dy, W * 0.3), 0, W);
    }
    const e = w.at(w.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, W * 0.9, o.live ? AMBER : '#8a9099');
    countBadge(dc, pts, o, t);
  },

  // A warning lamp: amber and blinking while it works.
  nodeDecor(dc, r, n) {
    const g = dc.g;
    const x = r.x + r.w - Math.max(8, 14 * dc.z);
    const y = r.y + r.h * 0.62;
    const rad = Math.max(3, 5 * dc.z);
    const on = n.state === 'running' ? Math.floor(dc.time * 3) % 2 === 0 : n.state !== 'idle';
    const col = n.state === 'error' ? '#ff5252' : n.state === 'waiting' ? '#ffd54f' : n.state === 'running' ? AMBER : '#3b3f44';
    g.save();
    if (on) {
      // the lamp's glow: a faint larger disc, not a blur
      g.fillStyle = col;
      g.globalAlpha = 0.25;
      g.beginPath(); g.arc(x, y, rad * 2.2, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = on ? col : '#2a2d31';
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = '#0b0c0d';
    g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke();
  },

  wallDecor(dc, r, head, live) {
    // dark steel under the title (so it reads), hazard stripes as a thin band on top
    const g0 = dc.g;
    g0.fillStyle = '#26292d';
    g0.fillRect(head.x + 2, head.y + 2, head.w - 4, head.h - 2);
    hazard(dc, { x: head.x + 2, y: head.y + 2, w: head.w - 4, h: Math.max(2, Math.min(5 * dc.z, head.h * 0.16)) });
    if (live) {
      const g = dc.g;
      g.fillStyle = 'rgba(255,176,0,0.05)';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
  },
};

export const factory = makeSkin(factoryTheme);
