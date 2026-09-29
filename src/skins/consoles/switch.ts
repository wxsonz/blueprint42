import { chevron, ride, smooth } from '../belts';
import { backdrop, countBadge, makeSkin, softShadow, type Palette, type Theme } from '../kit';
import type { Dc } from '../types';
import { rrect, strokeLine, Walk } from '../util';
import { bar, MONO, NUNITO, text } from './common';

// The Switch HOME Menu: Basic White (#ebebeb) or Basic Black (#2d2d2d),
// plain square-ish tiles, and the selection: an outline 5px thick, 5px out
// from the tile, pulsing between hsl(200 100% 50%) and hsl(200 100% 80%)
// (from Adam Argyle's measured recreation); the selected title in cyan.
function switchOf(dark: boolean): Theme {
  const p: Palette = dark ? {
    bg: '#2d2d2d', card: '#3a3a3a', panel: '#333333', line: '#4f4f4f',
    fg: '#ffffff', dim: '#b4b4b4', faint: '#7a7a7a', accent: '#00c3e3', ptr: '#ff3c28', ret: '#4cd964', wait: '#ffcc00', err: '#ff3c28',
    param: '#7fe3f3', cell: '#1f4a54', track: '#262626',
  } : {
    bg: '#ebebeb', card: '#ffffff', panel: '#f6f6f6', line: '#d6d6d6',
    fg: '#2d2d2d', dim: '#6b6b6b', faint: '#a0a0a0', accent: '#0ab0cf', ptr: '#e6321f', ret: '#1e9e45', wait: '#c98f00', err: '#e6321f',
    param: '#0a93ae', cell: '#d4f3f9', track: '#ffffff',
  };
  const pulse = (dc: Dc) => `hsl(200 100% ${65 + 15 * Math.sin(dc.time * 3.2)}%)`;
  return {
    id: dark ? 'switch-dark' : 'switch', name: 'Switch', blurb: dark ? 'Basic Black: plain tiles, the pulsing blue outline' : 'Basic White: plain tiles, the pulsing blue outline',
    p, ui: NUNITO, mono: MONO('"JetBrains Mono"'), radius: 4, spotlight: dark ? 'rgba(0,0,0,0.55)' : 'rgba(200,200,200,0.6)',
    pulseColor: 'rgba(0,160,255,0.9)',
    // A hollow channel, drawn like the HOME Menu's selection outline: a flat
    // 2px-outlined strip with square ends. Idle it is grey; live the outline
    // pulses through the blue of the selection and small cyan blocks slide
    // through it the data's way.
    belt(dc, pts, o, t) { pts = smooth(dc, pts);
      const g = dc.g;
      const z = dc.z;
      const w = Math.max(6, 9 * z);
      const edge = Math.max(1.5, 2 * z);
      g.lineCap = 'butt';
      g.lineJoin = 'miter';
      const outline = o.live ? pulse(dc) : o.hovered || o.selected ? p.dim : p.faint;
      if (o.selected) strokeLine(g, pts, w + edge * 2 + 8 * z, dark ? 'rgba(0,195,227,0.25)' : 'rgba(10,176,207,0.22)');
      strokeLine(g, pts, w + edge * 2, outline);
      strokeLine(g, pts, w, p.card);
      const walk = new Walk(pts);
      if (o.live) {
        const s = w * 0.6;
        g.fillStyle = p.accent;
        ride(dc, walk, o, 70 * z, Math.max(22, 34 * z), (x, y) => g.fillRect(x - s / 2, y - s / 2, s, s), 0, s);
      }
      const e = walk.at(walk.length);
      g.lineCap = 'square';
      g.lineWidth = Math.max(2, 3 * z);
      g.strokeStyle = outline;
      chevron(g, e.x + e.dx * w * 0.9, e.y + e.dy * w * 0.9, e.dx, e.dy, Math.max(5, 8 * z));
      countBadge(dc, pts, o, t);
    },
    card(dc, r, o) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 4 * dc.z));
      if (o.fill !== 'transparent') {
        g.fillStyle = o.kind === 'wall' ? (dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)') : p.card;
        g.fill();
      }
      g.strokeStyle = o.glow ? pulse(dc) : p.line;
      g.lineWidth = o.glow ? Math.max(2, 3 * dc.z) : 1;
      g.stroke();
    },
    background(dc) {
      backdrop(dc, dark ? 'switch-dark' : 'switch', (g, W, H) => {
        g.fillStyle = p.bg;
        g.fillRect(0, 0, W, H);
      });
    },
    window: {
      border: 0, corner: 4, titleH: 30, face: p.card, workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(1, 4 * dc.z);
        softShadow(dc, r, 4, 6, dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.16)', 1.5 * dc.z);
        rrect(g, r.x, r.y, r.w, r.h, rad);
        g.fillStyle = face;
        g.fill();
        g.fillStyle = dark ? '#414141' : '#f4f4f4';
        g.fillRect(r.x, r.y + 30 * dc.z - 1, r.w, 1);
        if (active) {
          // 5px out, 5px thick, breathing between two blues
          const k = 5 * dc.z;
          rrect(g, r.x - k - k / 2, r.y - k - k / 2, r.w + 3 * k, r.h + 3 * k, rad + k * 1.5);
          g.strokeStyle = pulse(dc);
          g.lineWidth = Math.max(2, k);
          g.stroke();
        }
      },
      titleBar(dc, r, title, active) {
        // the selected title reads in the Switch's cyan-blue
        text(dc, r, title, NUNITO, 13.5, active ? (dark ? '#00c3e3' : '#0a9fcf') : p.dim, { w: 700, x: r.x + 12 * dc.z });
      },
      progress(dc, r, fill, anim) {
        bar(dc, r, fill, anim, dark ? '#262626' : '#e2e2e2', dark ? '#00c3e3' : '#0ab0cf');
      },
    },
  };
}
export const switchTheme = switchOf(false);

export const nswitch = { ...makeSkin(switchTheme), mode: 'light' as const };
export const nswitchDark = { ...makeSkin(switchOf(true)), variantOf: 'switch', mode: 'dark' as const };
