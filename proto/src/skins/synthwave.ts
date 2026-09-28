// "Synthwave" — neon on a night-purple horizon: a perspective grid under a
// striped sunset, cyan and magenta glow, chrome-gradient title bars.
import { makeSkin, countBadge, type Theme } from './kit';
import { arrowHead, rrect, strokeLine, Walk } from './util';

const PINK = '#ff3cac';
const CYAN = '#2de2e6';
const GOLD = '#f9c80e';

export const synthwaveTheme: Theme = {
  id: 'synthwave',
  name: 'Synthwave',
  blurb: 'neon grid, sunset, glow',
  radius: 5,
  upper: true,
  spotlight: 'rgba(12,2,24,0.7)',
  ui: (px, w = 500) => `${w >= 600 ? 700 : 500} ${px * 0.92}px Orbitron, "DejaVu Sans", sans-serif`,
  mono: (px, w = 400) => `${w >= 600 ? 700 : 400} ${px * 1.05}px "Share Tech Mono", "DejaVu Sans Mono", monospace`,
  p: {
    bg: '#140726', card: 'rgba(30,10,52,0.92)', panel: 'rgba(22,7,40,0.95)', line: 'rgba(45,226,230,0.55)',
    fg: '#fbeaff', dim: '#c9a0e0', faint: '#7c5c98', accent: PINK, ptr: CYAN, ret: GOLD, wait: '#ff9a3c', err: '#ff4365',
    param: '#a99bff', cell: '#3b1b63', track: '#0e041b',
  },
  pulseColor: 'rgba(255,60,172,0.95)',

  card(dc, r, o) {
    const g = dc.g;
    g.save();
    const rad = Math.max(2, 5 * dc.z);
    rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, o.kind === 'plate' ? r.h / 2 : rad);
    if (o.fill !== 'transparent') {
      g.fillStyle = o.fill;
      g.fill();
    } else if (o.kind === 'wall') {
      g.fillStyle = 'rgba(20,6,38,0.35)';
      g.fill();
    }
    // neon edge: a soft glow, then the tube
    g.shadowColor = o.glow ?? o.stroke;
    g.shadowBlur = (o.glow ? 20 : 8) * dc.z;
    g.strokeStyle = o.glow ?? o.stroke;
    g.lineWidth = o.glow ? o.lw + 0.8 : o.lw;
    g.stroke();
    g.restore();
  },

  background(dc) {
    const g = dc.g;
    const W = dc.vw, H = dc.vh;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b0217');
    sky.addColorStop(0.45, '#231046');
    sky.addColorStop(0.62, '#3a0f4f');
    sky.addColorStop(1, '#12051f');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const hz = H * 0.58;
    // the sun: a striped gradient disc sitting on the horizon
    const R = Math.min(W, H) * 0.2;
    const cx = W * 0.5, cy = hz - R * 0.35;
    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    const sun = g.createLinearGradient(0, cy - R, 0, cy + R);
    sun.addColorStop(0, '#ffe36e');
    sun.addColorStop(0.5, '#ff7a5c');
    sun.addColorStop(1, '#ff2e9a');
    g.fillStyle = sun;
    g.globalAlpha = 0.5;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.globalAlpha = 1;
    g.fillStyle = '#231046';
    for (let k = 0; k < 7; k++) {
      const y = cy + R * (0.1 + k * 0.14);
      g.fillRect(cx - R, y, R * 2, 2 + k * 1.3);
    }
    g.restore();
    // the floor: lines converging on the horizon, rows closer as they recede
    g.save();
    g.beginPath(); g.rect(0, hz, W, H - hz); g.clip();
    g.strokeStyle = 'rgba(255,60,172,0.35)';
    g.lineWidth = 1;
    const vx = W / 2;
    for (let k = -18; k <= 18; k++) {
      g.beginPath(); g.moveTo(vx + k * 8, hz); g.lineTo(vx + k * W * 0.16, H); g.stroke();
    }
    const t = (dc.time * 0.25) % 1;
    for (let k = 0; k < 14; k++) {
      const f = (k + t) / 14;
      const y = hz + (H - hz) * f * f;
      g.globalAlpha = 0.2 + 0.6 * f;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.restore();
    g.fillStyle = 'rgba(255,60,172,0.5)';
    g.fillRect(0, hz, W, 1);
  },

  // Belts are neon tubes; a live one carries light.
  belt(dc, pts, o, t) {
    const g = dc.g;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const col = o.live ? PINK : o.hovered || o.selected ? CYAN : 'rgba(45,226,230,0.45)';
    g.shadowColor = col;
    g.shadowBlur = (o.live ? 14 : 6) * dc.z;
    strokeLine(g, pts, Math.max(1.2, 2 * dc.z), col);
    if (o.live) strokeLine(g, pts, Math.max(1.5, 2.6 * dc.z), '#fff', [Math.max(2, 3 * dc.z), Math.max(8, 16 * dc.z)], -dc.time * 60 * dc.z * o.dir);
    const w = new Walk(pts);
    const e = w.at(w.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(5, 8 * dc.z), col);
    g.restore();
    countBadge(dc, pts, o, t);
  },

  // A sunset stripe across the top of every machine.
  nodeDecor(dc, r, n) {
    const g = dc.g;
    const h = Math.max(2, 4 * dc.z);
    const grad = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
    grad.addColorStop(0, GOLD);
    grad.addColorStop(0.5, '#ff7a5c');
    grad.addColorStop(1, PINK);
    g.fillStyle = grad;
    g.globalAlpha = n.state === 'idle' ? 0.45 : 1;
    g.fillRect(r.x + Math.max(2, 5 * dc.z), r.y + 1, r.w - Math.max(4, 10 * dc.z), h);
    g.globalAlpha = 1;
  },

  wallDecor(dc, r, head) {
    const g = dc.g;
    const grad = g.createLinearGradient(head.x, 0, head.x + head.w, 0);
    grad.addColorStop(0, 'rgba(249,200,14,0.25)');
    grad.addColorStop(0.5, 'rgba(255,60,172,0.18)');
    grad.addColorStop(1, 'rgba(45,226,230,0.18)');
    g.fillStyle = grad;
    g.fillRect(head.x + 2, head.y + 2, head.w - 4, head.h - 2);
    void r;
  },
};

export const synthwave = makeSkin(synthwaveTheme);
