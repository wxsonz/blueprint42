// "Barebone" — as little drawing as possible: black and white (or white and
// black), no borders, no glow, no gradients, no floor pattern. Surfaces are
// told apart by a shade, not a line. Colour only where it means something:
// what's running, a live belt, pointers, returned values, errors, a value
// that just changed. The fastest skin to paint.
import { countBadge, makeSkin, type Theme } from './kit';
import { arrowHead, strokeLine, Walk } from './util';

const UI = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
const MONO = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

function barebone(dark: boolean): Theme {
  const c = dark
    ? { bg: '#000000', wall: '#080808', panel: '#0c0c0c', card: '#141414', live: '#4da3ff', belt: '#3a3a3a', beltOn: '#bdbdbd' }
    : { bg: '#ffffff', wall: '#f7f7f7', panel: '#f2f2f2', card: '#ebebeb', live: '#0a66d8', belt: '#c4c4c4', beltOn: '#555555' };
  return {
    id: dark ? 'barebone' : 'barebone-light',
    name: 'Barebone',
    blurb: dark ? 'black and white, colour only where it matters; the fastest to draw' : 'white paper, black ink, colour only where it matters',
    radius: 0,
    spotlight: dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.78)',
    ui: UI,
    mono: MONO,
    p: dark ? {
      // line = card: edges that don't show
      bg: c.bg, card: c.card, panel: c.panel, line: c.card,
      fg: '#ffffff', dim: '#a8a8a8', faint: '#5c5c5c', accent: c.live, ptr: '#ffb454', ret: '#6ee7a0', wait: '#bdbdbd', err: '#ff5c5c',
      param: '#ffffff', cell: '#262626', track: c.panel,
    } : {
      bg: c.bg, card: c.card, panel: c.panel, line: c.card,
      fg: '#000000', dim: '#555555', faint: '#9a9a9a', accent: c.live, ptr: '#b85c00', ret: '#0f7a42', wait: '#555555', err: '#d12a2a',
      param: '#000000', cell: '#dcdcdc', track: c.panel,
    },
    pulseColor: c.live,
    card(dc, r, o) {
      const g = dc.g;
      const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
      // a shade, no border
      const fill = o.kind === 'wall' ? c.wall : o.kind === 'frame' || o.kind === 'plate' ? c.panel : c.card;
      if (o.fill !== 'transparent' || o.kind === 'wall') ((g.fillStyle = fill), g.fillRect(x, y, w, h));
      // meaning only: a thin mark on the left in the colour that matters
      const quiet = dark ? '#5c5c5c' : '#9a9a9a';
      if (o.kind === 'plate' && o.stroke !== quiet) ((g.fillStyle = o.stroke), g.fillRect(x, y, 2, h));
      else if (o.glow) ((g.fillStyle = o.glow), g.fillRect(x, y, 2, h));
    },
    background(dc) {
      dc.g.fillStyle = c.bg;
      dc.g.fillRect(0, 0, dc.vw, dc.vh);
    },
    belt(dc, pts, o, t) {
      const g = dc.g;
      const col = o.live ? c.live : o.hovered || o.selected ? c.beltOn : c.belt;
      g.lineCap = 'butt';
      g.lineJoin = 'miter';
      strokeLine(g, pts, o.live ? 2 : 1, col);
      const e = new Walk(pts).at(Infinity);
      arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(4, 6 * dc.z), col);
      countBadge(dc, pts, o, t);
    },
  };
}

export const bareboneDark = { ...makeSkin(barebone(true)), mode: 'dark' as const };
export const bareboneLight = { ...makeSkin(barebone(false)), variantOf: 'barebone', mode: 'light' as const };
