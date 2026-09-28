// "Factory floor" — industry: riveted steel plates, hazard stripes, belts
// that are real conveyors (chevrons ride them), and warning lamps on the
// machines that are working.
import { makeSkin, countBadge, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { arrowHead, rrect, Walk } from './util';

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
      g.shadowColor = o.glow;
      g.shadowBlur = 14 * dc.z;
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

  background(dc, camX, camY) {
    const g = dc.g;
    g.fillStyle = '#1c1e20';
    g.fillRect(0, 0, dc.vw, dc.vh);
    // floor plates, 4 cells square, with seams and a diamond tread
    const P = 4;
    const cs = dc.cs;
    const x0 = Math.floor(camX / P) * P, y0 = Math.floor(camY / P) * P;
    for (let x = x0; x < camX + dc.vw / cs + P; x += P) {
      for (let y = y0; y < camY + dc.vh / cs + P; y += P) {
        const sx = (x - camX) * cs, sy = (y - camY) * cs, s = P * cs;
        g.fillStyle = ((x + y) / P) % 2 === 0 ? '#1f2124' : '#1d1f22';
        g.fillRect(sx, sy, s, s);
        g.strokeStyle = '#141516';
        g.lineWidth = Math.max(1, 2 * dc.z);
        g.strokeRect(sx + 0.5, sy + 0.5, s, s);
        if (cs < 16) continue;
        g.fillStyle = 'rgba(255,255,255,0.025)';
        const step = cs * 0.5;
        for (let a = sx + step / 2; a < sx + s; a += step) {
          for (let b = sy + step / 2; b < sy + s; b += step) {
            g.beginPath(); g.moveTo(a - 4 * dc.z, b); g.lineTo(a, b - 2 * dc.z); g.lineTo(a + 4 * dc.z, b); g.lineTo(a, b + 2 * dc.z); g.closePath(); g.fill();
          }
        }
      }
    }
  },

  // A conveyor: a dark band with rails, chevrons riding it.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const W = Math.max(4, 9 * dc.z);
    g.lineJoin = 'miter';
    g.lineCap = 'butt';
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); };
    path(); g.strokeStyle = '#0c0d0e'; g.lineWidth = W + 2; g.stroke();
    path(); g.strokeStyle = o.live ? '#3a3326' : o.selected || o.hovered ? '#3a3f45' : '#2a2d31'; g.lineWidth = W; g.stroke();
    const w = new Walk(pts);
    const step = Math.max(8, 16 * dc.z);
    const shift = o.live ? (dc.time * 30 * dc.z * o.dir) % step : 0;
    g.strokeStyle = o.live ? AMBER : '#5a5f66';
    g.lineWidth = Math.max(1, 1.6 * dc.z);
    for (let d = step / 2 + shift; d < w.length - step / 2; d += step) {
      const a = w.at(d);
      const s = W * 0.32;
      g.beginPath();
      g.moveTo(a.x - a.dx * s - a.dy * s, a.y - a.dy * s + a.dx * s);
      g.lineTo(a.x, a.y);
      g.lineTo(a.x - a.dx * s + a.dy * s, a.y - a.dy * s - a.dx * s);
      g.stroke();
    }
    const e = w.at(w.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, W * 0.9, o.live ? AMBER : '#5a5f66');
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
    if (on) (g.shadowColor = col), (g.shadowBlur = 16 * dc.z);
    g.fillStyle = on ? col : '#2a2d31';
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = '#0b0c0d';
    g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.stroke();
  },

  wallDecor(dc, r, head, live) {
    hazard(dc, { x: head.x + 2, y: head.y + 2, w: head.w - 4, h: Math.max(3, head.h * 0.28) });
    if (live) {
      const g = dc.g;
      g.fillStyle = 'rgba(255,176,0,0.05)';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
  },
};

export const factory = makeSkin(factoryTheme);
