import { ride, smooth } from '../belts';
import { backdrop, countBadge, makeSkin, softShadow, type Palette, type Theme } from '../kit';
import { arrowHead, rrect, strokeLine, Walk } from '../util';
import { bar, MONO, ps2Still, psSymbol, SST, text } from './common';

// PS5, after its home screen (and khaledOghli/PS5_Online's measurements):
// near-black under the selected game's art, blurred and darkened; cards with
// 17px corners on rgba(0,0,0,.65); the focus is a white ring standing a few
// pixels off the card; SST, light for the rest, medium for the focused.
const ps5P: Palette = {
  bg: '#0b0c10', card: 'rgba(28,29,36,0.82)', panel: 'rgba(20,21,27,0.9)', line: 'rgba(255,255,255,0.12)',
  fg: '#f5f6f8', dim: '#a9adb8', faint: '#6b707c', accent: '#ffffff', ptr: '#c79bff', ret: '#4fd18b', wait: '#ffbf47', err: '#ff5c5c',
  param: '#9cc2ff', cell: 'rgba(0,112,209,0.3)', track: 'rgba(255,255,255,0.06)',
};
export const ps5Theme: Theme = {
  id: 'ps5', name: 'PlayStation 5', blurb: 'the home screen: game art behind, dark cards, the white focus ring',
  p: ps5P, ui: SST, mono: MONO('"JetBrains Mono"'), radius: 12, spotlight: 'rgba(0,0,0,0.6)',
  pulseColor: 'rgba(255,255,255,0.9)',
  // The home screen's download bar: a thin round track of translucent white;
  // live, white pills fill it, one after another, the data's way, and the
  // whole bar breathes softly like the controller's light; hovered and
  // selected lift the track and give it the ring's crisp white edge.
  belt(dc, pts, o, t) { pts = smooth(dc, pts);
    const g = dc.g;
    const z = dc.z;
    const w = Math.max(3, 4 * z);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected) strokeLine(g, pts, w + 10 * z, 'rgba(255,255,255,0.14)');
    strokeLine(g, pts, w, o.hovered || o.selected ? 'rgba(255,255,255,0.45)' : o.live ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.16)');
    const walk = new Walk(pts);
    if (o.live) {
      const len = Math.max(16, 34 * z);
      g.globalAlpha = ps2Still ? 1 : 0.8 + 0.2 * Math.sin(dc.time * 3);
      g.lineWidth = w;
      g.strokeStyle = '#ffffff';
      ride(dc, walk, o, 80 * z, Math.max(44, 70 * z), (x, y, dx, dy) => {
        g.beginPath(); g.moveTo(x - dx * len / 2, y - dy * len / 2); g.lineTo(x + dx * len / 2, y + dy * len / 2); g.stroke();
      }, 0, len / 2);
      g.globalAlpha = 1;
    }
    const e = walk.at(walk.length);
    arrowHead(g, e.x, e.y, e.dx, e.dy, Math.max(6, 9 * z), o.live ? '#ffffff' : o.hovered || o.selected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.4)');
    countBadge(dc, pts, o, t);
  },
  card(dc, r, o) {
    const g = dc.g;
    const rad = Math.max(2, (o.kind === 'wall' ? 17 : 12) * dc.z);
    rrect(g, r.x, r.y, r.w, r.h, rad);
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(255,255,255,0.03)' : o.kind === 'frame' || o.kind === 'plate' ? ps5P.panel : ps5P.card;
      g.fill();
    }
    if (o.glow) {
      const k = Math.max(2, 3 * dc.z);
      rrect(g, r.x - k, r.y - k, r.w + 2 * k, r.h + 2 * k, rad + k);
      g.strokeStyle = '#ffffff';
      g.lineWidth = Math.max(1.5, 2 * dc.z);
    } else {
      g.strokeStyle = ps5P.line;
      g.lineWidth = 1;
    }
    g.stroke();
  },
  // a game's key art, blurred and darkened toward the bottom
  background(dc) {
    backdrop(dc, 'ps5', (g, W, H) => {
      g.fillStyle = '#0b0c10';
      g.fillRect(0, 0, W, H);
      const blob = (x: number, y: number, rr: number, c: string) => {
        const b = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * rr);
        b.addColorStop(0, c);
        b.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = b;
        g.fillRect(0, 0, W, H);
      };
      blob(0.72, 0.18, 0.55, 'rgba(46,92,150,0.75)');
      blob(0.35, 0.05, 0.45, 'rgba(150,70,60,0.45)');
      blob(0.9, 0.55, 0.4, 'rgba(210,140,70,0.28)');
      const shade = g.createLinearGradient(0, 0, 0, H);
      shade.addColorStop(0, 'rgba(11,12,16,0.1)');
      shade.addColorStop(0.55, 'rgba(11,12,16,0.55)');
      shade.addColorStop(1, 'rgba(11,12,16,0.95)');
      g.fillStyle = shade;
      g.fillRect(0, 0, W, H);
      // the DualSense's grip: tiny △○✕□, layered, barely there (Morisawa's Easter egg)
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      const kinds = ['tri', 'circ', 'cross', 'sq'] as const;
      for (let y = 6, row = 0; y < H; y += 13, row++) {
        for (let x = 6 + (row % 2) * 6, k = row; x < W; x += 13, k++) psSymbol(g, kinds[k % 4], x, y, 2.6);
      }
    });
  },
  window: {
    border: 0, corner: 17, titleH: 32, face: 'rgba(22,23,29,0.84)', workspace: 'rgba(255,255,255,0.03)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(3, 17 * dc.z);
      softShadow(dc, r, 17, 12, 'rgba(0,0,0,0.6)', 4 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = face;
      g.fill();
      if (active) {
        const k = Math.max(3, 5 * dc.z);
        rrect(g, r.x - k, r.y - k, r.w + 2 * k, r.h + 2 * k, rad + k);
        g.strokeStyle = '#ffffff';
        g.lineWidth = Math.max(2, 3 * dc.z);
        g.stroke();
      }
    },
    titleBar(dc, r, title, active) {
      text(dc, r, title, SST, 14.5, active ? '#ffffff' : '#a9adb8', { w: active ? 600 : 300, x: r.x + 16 * dc.z });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, 'rgba(255,255,255,0.16)', '#ffffff');
    },
  },
};

export const ps5 = makeSkin(ps5Theme);
