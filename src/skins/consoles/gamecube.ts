import { ride } from '../belts';
import { backdrop, countBadge, makeSkin, type Palette, type Theme } from '../kit';
import type { Pt } from '../types';
import { arrowHead, rrect, strokeLine, Walk } from '../util';
import { bar, cardOf, client, JOST, MONO, text } from './common';

const gcP: Palette = {
  bg: '#1b1150', card: '#2a1f6e', panel: '#22185c', line: '#5a4bb8',
  fg: '#f1eeff', dim: '#b9b1e8', faint: '#7c72b8', accent: '#a393ff', ptr: '#ffb14e', ret: '#7bd88f', wait: '#ffd166', err: '#ff5a78',
  param: '#c9bfff', cell: '#3a2d8f', track: '#140b40',
};
export const gamecubeTheme: Theme = {
  id: 'gamecube', name: 'GameCube', blurb: 'the IPL menu: black, the violet cube, glassy purple panels',
  p: gcP, ui: JOST, mono: MONO('"JetBrains Mono"'), radius: 8, spotlight: 'rgba(8,2,30,0.58)',
  pulseColor: 'rgba(163,147,255,0.9)',
  // The IPL menu's glass: a translucent violet tube with a lavender rim; live,
  // little glass cubes (the logo's, turned on a corner) drift through it the
  // data's way, each a lit lavender diamond with a bright edge.
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    const w = Math.max(5, 7 * z);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected) strokeLine(g, pts, w + 10 * z, 'rgba(163,147,255,0.35)');
    strokeLine(g, pts, w + 2, o.hovered || o.selected ? '#d3caff' : o.live ? '#a393ff' : 'rgba(163,147,255,0.6)');
    strokeLine(g, pts, w - 1, o.live ? 'rgba(74,52,190,0.85)' : 'rgba(20,11,64,0.8)');
    strokeLine(g, pts.map(([x, y]) => [x, y - w * 0.2] as Pt), Math.max(1, w * 0.16), 'rgba(255,255,255,0.35)');
    const walk = new Walk(pts);
    if (o.live) {
      const r = w * 0.62;
      ride(dc, walk, o, 55 * z, Math.max(30, 44 * z), (x, y) => {
        g.beginPath();
        g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y);
        g.closePath();
        g.fillStyle = 'rgba(190,175,255,0.85)';
        g.fill();
        g.beginPath();
        g.moveTo(x - r, y); g.lineTo(x, y - r); g.lineTo(x + r, y);
        g.lineWidth = Math.max(1, 1.3 * z);
        g.strokeStyle = '#ffffff';
        g.stroke();
      }, 0, r);
    }
    const e = walk.at(walk.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(6, 9 * z), o.live ? '#d3caff' : 'rgba(163,147,255,0.8)');
    countBadge(dc, pts, o, t);
  },
  card: cardOf(8, '#a393ff'),
  background(dc) {
    // the IPL menu: black, a violet haze, the translucent cube floating in it
    backdrop(dc, 'gamecube', (g, W, H) => {
      g.fillStyle = '#030208';
      g.fillRect(0, 0, W, H);
      const haze = g.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.6);
      haze.addColorStop(0, 'rgba(92,64,200,0.45)');
      haze.addColorStop(0.5, 'rgba(50,30,120,0.18)');
      haze.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = haze;
      g.fillRect(0, 0, W, H);
      const x = W * 0.5;
      const y = H * 0.5;
      const s = Math.min(W, H) * 0.3;
      const face = (pts: number[][], fill: string) => {
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
        g.strokeStyle = 'rgba(190,170,255,0.25)';
        g.lineWidth = 1.5;
        g.stroke();
      };
      face([[x, y - s], [x + s, y - s / 2], [x, y], [x - s, y - s / 2]], 'rgba(170,150,255,0.14)');
      face([[x - s, y - s / 2], [x, y], [x, y + s], [x - s, y + s / 2]], 'rgba(120,90,230,0.1)');
      face([[x + s, y - s / 2], [x, y], [x, y + s], [x + s, y + s / 2]], 'rgba(80,50,190,0.08)');
    });
  },
  window: {
    border: 3, corner: 10, titleH: 26, face: '#1e1552', workspace: 'rgba(163,147,255,0.05)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(3, 10 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = active ? '#2e2280' : '#261c68';
      g.fill();
      g.strokeStyle = active ? '#a393ff' : '#4a3d99';
      g.lineWidth = Math.max(1, 1.5 * dc.z);
      g.stroke();
      client(dc, r, Math.max(2, 3 * dc.z), 26 * dc.z, face, Math.max(2, 6 * dc.z));
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      const s = Math.max(3, 5 * dc.z);
      const cx = r.x + 13 * dc.z;
      const cy = r.y + r.h / 2;
      g.fillStyle = active ? '#c9bfff' : '#6f63b8';
      g.fillRect(cx - s, cy - s, s * 2, s * 2);
      g.fillStyle = active ? '#6c58e0' : '#3a2d8f';
      g.fillRect(cx - s * 0.45, cy - s * 0.45, s * 0.9, s * 0.9);
      text(dc, r, title, JOST, 13, active ? '#f1eeff' : '#9f96d8', { w: 600, x: cx + 11 * dc.z });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#140b40', '#a393ff');
    },
  },
};

export const gamecube = makeSkin(gamecubeTheme);
