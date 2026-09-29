// "Synthwave" — neon on a night-purple horizon: a perspective grid under a
// striped sunset, cyan and magenta glow, chrome-gradient title bars.
import { span } from './belts';
import { makeSkin, countBadge, type Theme } from './kit';
import { arrowHead, rrect, strokeLine, Walk } from './util';

const PINK = '#ff3cac';
const CYAN = '#2de2e6';
const GOLD = '#f9c80e';

const skies = new Map<string, HTMLCanvasElement>(); // by size: the main view and its lenses

function paintSky(W: number, H: number, hz: number, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(W * dpr);
  c.height = Math.round(H * dpr);
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0b0217');
  grad.addColorStop(0.45, '#231046');
  grad.addColorStop(0.62, '#3a0f4f');
  grad.addColorStop(1, '#12051f');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
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
  for (let k = 0; k < 7; k++) g.fillRect(cx - R, cy + R * (0.1 + k * 0.14), R * 2, 2 + k * 1.3);
  g.restore();
  return c;
}

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
    // neon edge: a wide faint halo (cheap, unlike a blur), then the tube
    g.strokeStyle = o.glow ?? o.stroke;
    g.globalAlpha *= o.glow ? 0.28 : 0.14;
    g.lineWidth = o.lw + Math.max(3, (o.glow ? 9 : 5) * dc.z);
    g.stroke();
    g.globalAlpha /= o.glow ? 0.28 : 0.14;
    g.lineWidth = o.glow ? o.lw + 0.8 : o.lw;
    g.stroke();
    g.restore();
  },

  background(dc) {
    const g = dc.g;
    const W = dc.vw, H = dc.vh;
    const hz = H * 0.58;
    // the sky and the sun only change with the canvas size: paint them once
    const dpr = g.getTransform().a || 1;
    const key = `${Math.round(W)}x${Math.round(H)}@${dpr}`;
    let sky = skies.get(key);
    if (!sky) {
      if (skies.size > 4) skies.clear();
      skies.set(key, (sky = paintSky(W, H, hz, dpr)));
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(sky, 0, 0);
    g.restore();
    // the floor: lines converging on the horizon, rows closer as they recede
    g.save();
    g.beginPath(); g.rect(0, hz, W, H - hz); g.clip();
    g.strokeStyle = 'rgba(255,60,172,0.35)';
    g.lineWidth = 1;
    const vx = W / 2;
    g.beginPath();
    for (let k = -18; k <= 18; k++) (g.moveTo(vx + k * 8, hz), g.lineTo(vx + k * W * 0.16, H));
    g.stroke();
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
    const z = dc.z;
    const col = o.live ? PINK : o.hovered || o.selected ? CYAN : 'rgba(45,226,230,0.45)';
    // a neon tube: three widths of glow (no blur), a hot core; live it is pink,
    // and comets of white light with a magenta-to-cyan tail run through it
    const gw = Math.max(4, (o.live ? 12 : 8) * z);
    g.globalAlpha = o.live ? 0.1 : 0.06;
    strokeLine(g, pts, gw * 1.8, col);
    g.globalAlpha = o.live ? 0.2 : 0.11;
    strokeLine(g, pts, gw, col);
    g.globalAlpha = o.live ? 0.35 : 0.2;
    strokeLine(g, pts, gw * 0.5, col);
    g.globalAlpha = 1;
    if (o.selected) strokeLine(g, pts, gw * 2.4, 'rgba(45,226,230,0.12)');
    strokeLine(g, pts, Math.max(1.4, 2.2 * z), col);
    strokeLine(g, pts, Math.max(0.8, 1 * z), o.live ? '#ffd6ee' : 'rgba(220,255,255,0.7)');
    const w = new Walk(pts);
    if (o.live && w.length > 4) {
      const tail = Math.min(w.length * 0.5, Math.max(24, 60 * z)), N = 6;
      const gap = Math.max(90, 200 * z);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      const run = (dc.time * 130 * z) % gap;
      for (let head = run; head < w.length + tail; head += gap) {
        for (let k = 0; k < N; k++) {
          const a = head - tail + (tail * k) / N, b = a + tail / N;
          if (b < 0 || a > w.length) continue;
          const [s0, s1] = o.dir < 0 ? [w.length - b, w.length - a] : [a, b];
          const f = ((k + 1) / N) ** 1.5;
          g.strokeStyle = k < 3 ? CYAN : PINK;
          g.globalAlpha = f * 0.9;
          g.lineWidth = Math.max(2, 3.4 * z) * (0.5 + f * 0.5);
          span(g, w, s0, s1);
        }
        if (head <= w.length) {
          const q = w.at(o.dir < 0 ? w.length - head : head);
          g.globalAlpha = 1;
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(q.x, q.y, Math.max(2, 3 * z), 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
    }
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
