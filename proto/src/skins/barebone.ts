// "Barebone" — as little drawing as possible, and still good-looking: flat
// fills and 1 px lines only (no gradients, glow, blur or shadows), a plain
// floor, belts that change colour instead of animating, system fonts. The
// fastest skin to paint.
import { countBadge, makeSkin, type Theme } from './kit';
import { arrowHead, strokeLine, Walk } from './util';

const BG = '#16181c';
const UI = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const MONO = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

export const barebone = makeSkin({
  id: 'barebone',
  name: 'Barebone',
  blurb: 'flat and quiet, the fastest to draw',
  radius: 0,
  spotlight: 'rgba(10,11,13,0.72)',
  ui: UI,
  mono: MONO,
  p: {
    bg: BG, card: '#1e2126', panel: '#1a1d21', line: '#343941',
    fg: '#e6e8eb', dim: '#9aa1ab', faint: '#5b626c', accent: '#6ea8fe', ptr: '#f0a868', ret: '#7fd4a0', wait: '#e5c07b', err: '#f07178',
    param: '#b7a4f5', cell: '#2c3e57', track: '#121418',
  },
  pulseColor: '#6ea8fe',
  card(dc, r, o) {
    const g = dc.g;
    const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
    if (o.fill !== 'transparent') ((g.fillStyle = o.kind === 'wall' ? 'rgba(255,255,255,0.02)' : o.fill), g.fillRect(x, y, w, h));
    g.strokeStyle = o.glow ?? o.stroke;
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    // what's running gets a 2 px accent edge on its left, nothing more
    if (o.glow && o.kind !== 'plate') ((g.fillStyle = o.glow), g.fillRect(x, y, 2, h));
  },
  background(dc) {
    dc.g.fillStyle = BG;
    dc.g.fillRect(0, 0, dc.vw, dc.vh);
  },
  belt(dc, pts, o, t) {
    const g = dc.g;
    const col = o.live ? '#6ea8fe' : o.hovered || o.selected ? '#9aa1ab' : '#3d434c';
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    strokeLine(g, pts, o.live ? 2 : 1, col);
    const e = new Walk(pts).at(Infinity);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(4, 6 * dc.z), col);
    countBadge(dc, pts, o, t);
  },
} satisfies Theme);
