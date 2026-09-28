// "Barebone" — as little drawing as possible: black and white, no borders,
// no glow, no gradients, no floor pattern. Surfaces are told apart by a
// shade, not a line. Colour only where it means something: what's running,
// a live belt, pointers, returned values, errors, a value that just changed.
// The fastest skin to paint.
import { countBadge, makeSkin, type Theme } from './kit';
import { arrowHead, strokeLine, Walk } from './util';

const BG = '#000000';
const LIVE = '#4da3ff';
const UI = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const MONO = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

export const barebone = makeSkin({
  id: 'barebone',
  name: 'Barebone',
  blurb: 'black and white, colour only where it matters; the fastest to draw',
  radius: 0,
  spotlight: 'rgba(0,0,0,0.75)',
  ui: UI,
  mono: MONO,
  p: {
    // line = card: edges that don't show
    bg: BG, card: '#141414', panel: '#0c0c0c', line: '#141414',
    fg: '#ffffff', dim: '#a8a8a8', faint: '#5c5c5c', accent: LIVE, ptr: '#ffb454', ret: '#6ee7a0', wait: '#bdbdbd', err: '#ff5c5c',
    param: '#ffffff', cell: '#262626', track: '#0c0c0c',
  },
  pulseColor: LIVE,
  card(dc, r, o) {
    const g = dc.g;
    const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
    // a shade, no border
    const fill = o.kind === 'wall' ? '#080808' : o.kind === 'frame' || o.kind === 'plate' ? '#0c0c0c' : '#141414';
    if (o.fill !== 'transparent' || o.kind === 'wall') ((g.fillStyle = fill), g.fillRect(x, y, w, h));
    // meaning only: a thin mark on the left in the colour that matters
    if (o.kind === 'plate' && o.stroke !== '#5c5c5c') ((g.fillStyle = o.stroke), g.fillRect(x, y, 2, h));
    else if (o.glow) ((g.fillStyle = o.glow), g.fillRect(x, y, 2, h));
  },
  background(dc) {
    dc.g.fillStyle = BG;
    dc.g.fillRect(0, 0, dc.vw, dc.vh);
  },
  belt(dc, pts, o, t) {
    const g = dc.g;
    const col = o.live ? LIVE : o.hovered || o.selected ? '#bdbdbd' : '#3a3a3a';
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    strokeLine(g, pts, o.live ? 2 : 1, col);
    const e = new Walk(pts).at(Infinity);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(4, 6 * dc.z), col);
    countBadge(dc, pts, o, t);
  },
} satisfies Theme);
