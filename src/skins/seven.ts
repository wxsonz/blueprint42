// "Windows 7" — Aero: glass frames over the Harmony wallpaper, dark title
// text with a soft white glow, glossy caption buttons with the wide red
// close, the green shine-sweep progress bar.
import { backdrop, glassBehind, makeSkin, plainCard, softShadow, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { fitText, hash, rrect } from './util';

const UI = (px: number, w = 400) => `${w >= 600 ? 600 : 400} ${px}px "Segoe UI", "Open Sans", "DejaVu Sans", sans-serif`;

function glassButton(dc: Dc, r: Rect, kind: 'min' | 'max' | 'close', active: boolean, radius: number | [number, number, number, number] = 3): void {
  const g = dc.g;
  const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  if (kind === 'close') {
    // the glossy split at the middle: #e6a99f → #d16b5b | #cf4b34 → #d8654c
    grad.addColorStop(0, active ? '#e6a99f' : 'rgba(255,255,255,0.4)');
    grad.addColorStop(0.48, active ? '#d16b5b' : 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.5, active ? '#cf4b34' : 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, active ? '#d8654c' : 'rgba(255,255,255,0.25)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.48, 'rgba(255,255,255,0.25)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    grad.addColorStop(1, 'rgba(255,255,255,0.3)');
  }
  rrect(g, r.x, r.y, r.w, r.h, typeof radius === 'number' ? Math.max(1.5, radius * dc.z) : radius);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = 'rgba(0,20,50,0.55)';
  g.lineWidth = 1;
  g.stroke();
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(1.2, 1.8 * dc.z);
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  const d = Math.min(r.w, r.h) * 0.2;
  g.beginPath();
  if (kind === 'close') (g.moveTo(c.x - d, c.y - d), g.lineTo(c.x + d, c.y + d), g.moveTo(c.x + d, c.y - d), g.lineTo(c.x - d, c.y + d));
  else if (kind === 'min') (g.moveTo(c.x - d, c.y + d * 0.7), g.lineTo(c.x + d, c.y + d * 0.7));
  else g.rect(c.x - d, c.y - d * 0.8, d * 2, d * 1.6);
  g.stroke();
}

// Aero's glass texture: the Sky tint and the reflection streaks, which (as in
// the real DWM) are fixed to the screen, so windows slide under them. Baked
// once into the blurred wallpaper copy; each window is then one image draw.
function aeroBake(active: boolean) {
  return {
    key: active ? 'aero-active' : 'aero-inactive',
    paint(g: CanvasRenderingContext2D, W: number, H: number) {
      g.fillStyle = active ? 'rgba(53,133,212,0.52)' : 'rgba(150,176,208,0.5)';
      g.fillRect(0, 0, W, H);
      // the streaks run from top-left down to bottom-right (about 0.55
      // across per 1 down), soft-edged: blurred here, once, not per frame
      g.save();
      g.filter = `blur(${Math.round(12 * (g.getTransform().a || 1))}px)`;
      const lean = H * 0.55;
      // wide bands (60–180px), now and then a thin bright one beside them
      for (let x = -lean - 120, k = 0; x < W + 120; k++) {
        const thin = hash(k * 31 + 9) < 0.3;
        const w = thin ? 10 + 14 * hash(k * 7 + 1) : 60 + 120 * hash(k * 7 + 1);
        g.fillStyle = `rgba(255,255,255,${(thin ? 0.2 : 0.14) * (active ? 1 : 0.7)})`;
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x + w, 0);
        g.lineTo(x + w + lean, H);
        g.lineTo(x + lean, H);
        g.closePath();
        g.fill();
        x += w + (thin ? 18 + 30 * hash(k * 5 + 3) : 60 + 160 * hash(k * 13 + 5));
      }
      g.restore();
    },
  };
}
// the caption glow texture: a white pill, blurred once
let glowTex: HTMLCanvasElement | null = null;
function captionGlow(): HTMLCanvasElement {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 48;
  const cg = c.getContext('2d')!;
  cg.filter = 'blur(7px)';
  rrect(cg, 18, 14, 124, 20, 10);
  cg.fillStyle = 'rgba(255,255,255,0.95)';
  cg.fill();
  return (glowTex = c);
}
const AERO_ACTIVE = aeroBake(true);
const AERO_INACTIVE = aeroBake(false);

export const sevenTheme: Theme = {
  id: 'seven',
  name: 'Windows 7',
  blurb: 'Aero glass over Harmony',
  radius: 4,
  spotlight: 'rgba(4,16,36,0.6)',
  ui: UI,
  mono: (px, w = 400) => `${w >= 600 ? 700 : 400} ${px}px Consolas, "DejaVu Sans Mono", monospace`,
  p: {
    bg: '#1a4f8f', card: '#f0f0f0', panel: '#ffffff', line: '#8e9aa9',
    fg: '#1e1e1e', dim: '#555a60', faint: '#8f959c', accent: '#3399ff', ptr: '#0066cc', ret: '#2f9e44', wait: '#c77c02', err: '#d42f2f',
    param: '#1d5aa8', cell: '#cce4f7', track: '#ffffff',
  },
  pulseColor: 'rgba(51,153,255,0.85)',

  card(dc, r, o) {
    plainCard(dc, r, 3, { ...o, glow: null, fill: o.fill === 'transparent' ? 'transparent' : o.kind === 'frame' || o.kind === 'plate' ? '#ffffff' : '#f0f0f0' });
  },

  // Harmony: deep blue with soft glowing ribbons of light.
  background(dc) {
    backdrop(dc, 'harmony', (g, W, H) => {
      const base = g.createLinearGradient(0, 0, W, H);
      base.addColorStop(0, '#0e3a74');
      base.addColorStop(0.5, '#1b64b8');
      base.addColorStop(1, '#0a2a57');
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      for (const [cx, cy, rr, a] of [[0.72, 0.4, 0.45, 0.35], [0.25, 0.75, 0.35, 0.22], [0.5, 0.1, 0.3, 0.18]]) {
        const glow = g.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, Math.max(W, H) * rr);
        glow.addColorStop(0, `rgba(140,210,255,${a})`);
        glow.addColorStop(1, 'rgba(140,210,255,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);
      }
      g.strokeStyle = 'rgba(200,235,255,0.25)';
      for (let k = 0; k < 6; k++) {
        g.lineWidth = 1 + k * 1.5;
        g.globalAlpha = 0.5 - k * 0.07;
        g.beginPath();
        g.moveTo(-W * 0.1, H * (0.9 - k * 0.04));
        g.bezierCurveTo(W * 0.3, H * (0.2 + k * 0.03), W * 0.6, H * (1.05 - k * 0.05), W * 1.1, H * (0.3 + k * 0.05));
        g.stroke();
      }
      g.globalAlpha = 1;
    });
  },

  window: {
    // after Aero's own numbers: a 9px frame, 8px corners, "Sky" glass at
    // hsl(210 65% 52%) ~0.55, a strong top shine, streaks, an inner glow
    border: 9,
    corner: 8,
    titleH: 24,
    face: '#f0f0f0',
    workspace: 'rgba(180,210,240,0.35)',
    frame(dc, r, active, client) {
      const g = dc.g;
      const b = Math.max(2, 9 * dc.z);
      const rad = Math.max(2, 8 * dc.z);
      const th = 24 * dc.z;
      // the big soft shadow, from a pre-rendered nine-slice texture
      softShadow(dc, r, 8, 16, 'rgba(0,10,30,0.6)', 3 * dc.z);
      // the glass is only the ring around the client area (which covers the
      // rest anyway): the wallpaper, blurred, through the Sky tint
      const hole = { x: r.x + b, y: r.y + b + th, w: r.w - 2 * b, h: Math.max(0, r.h - 2 * b - th) };
      const ring = () => {
        rrect(g, r.x, r.y, r.w, r.h, rad);
        g.rect(hole.x, hole.y, hole.w, hole.h);
      };
      // the tint and the streaks are baked into the glass texture once
      glassBehind(dc, r, rad, 9, 1, hole, active ? AERO_ACTIVE : AERO_INACTIVE);
      ring();
      const hi = g.createLinearGradient(0, r.y, 0, r.y + b + th);
      hi.addColorStop(0, `rgba(255,255,255,${active ? 0.62 : 0.5})`);
      hi.addColorStop(0.45, 'rgba(255,255,255,0.2)');
      hi.addColorStop(0.5, 'rgba(255,255,255,0.08)');
      hi.addColorStop(1, 'rgba(255,255,255,0.12)');
      g.fillStyle = hi;
      g.fill('evenodd');
      // edges: dark outside, bright hairline inside, then a soft inner glow
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.strokeStyle = 'rgba(0,10,30,0.8)';
      g.lineWidth = 1;
      g.stroke();
      rrect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, rad - 1);
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.stroke();
      rrect(g, r.x + 2.5, r.y + 2.5, r.w - 5, r.h - 5, Math.max(1, rad - 2));
      g.strokeStyle = 'rgba(255,255,255,0.3)';
      g.stroke();
      // the client area, set into the glass with a dark hairline and a light one
      g.fillStyle = client;
      g.fillRect(r.x + b, r.y + b + th, r.w - 2 * b, Math.max(0, r.h - 2 * b - th));
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(0,20,50,0.55)';
      g.strokeRect(r.x + b - 0.5, r.y + b + th - 0.5, r.w - 2 * b + 1, Math.max(0, r.h - 2 * b - th) + 1);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.strokeRect(r.x + b - 1.5, r.y + b + th - 1.5, r.w - 2 * b + 3, Math.max(0, r.h - 2 * b - th) + 3);
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const b = Math.max(2, 9 * dc.z);
      let right = r.x + r.w;
      if (buttons && r.w > 110 * dc.z) {
        // the caption buttons hang from the window's top edge: 20 tall,
        // 29 wide (46 for close), square on top and rounded underneath
        const bh = Math.max(8, 19 * dc.z);
        const top = r.y - b + 1;
        const wm = bh * 1.45;
        const wc = bh * 2.3;
        const x0 = right - wc - 2 * wm + 2 * dc.z;
        const rad = Math.max(1.5, 4 * dc.z);
        glassButton(dc, { x: x0, y: top, w: wm, h: bh }, 'min', active, [0, 0, 0, rad]);
        glassButton(dc, { x: x0 + wm, y: top, w: wm, h: bh }, 'max', active, 0);
        glassButton(dc, { x: x0 + 2 * wm, y: top, w: wc, h: bh }, 'close', active, [0, 0, rad, 0]);
        right = x0;
      }
      const fs = Math.max(7, 12 * dc.z);
      const t = fitText(g, title, UI, fs, right - r.x - 16 * dc.z);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      // dark text on a soft white glow, as Aero draws captions over glass
      // Aero's caption glow is a soft white cloud behind the text (a
      // stretched bitmap in the theme): a pre-blurred pill, stretched
      const tw = g.measureText(t).width;
      g.drawImage(captionGlow(), r.x + 4 * dc.z - 10 * dc.z, r.y + r.h * 0.02, tw + 20 * dc.z, r.h * 0.96);
      g.fillStyle = active ? '#000000' : '#3a3f46';
      g.fillText(t, r.x + 4 * dc.z, r.y + r.h / 2);
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 2 * dc.z));
      g.fillStyle = '#e6e6e6';
      g.fill();
      g.strokeStyle = '#bcbcbc';
      g.lineWidth = 1;
      g.stroke();
      const w = anim ? r.w - 2 : (r.w - 2) * fill;
      if (w <= 0) return;
      const green = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      green.addColorStop(0, '#b6f0b0'); green.addColorStop(0.45, '#37c13b'); green.addColorStop(0.55, '#06b025'); green.addColorStop(1, '#40d040');
      g.fillStyle = green;
      g.fillRect(r.x + 1, r.y + 1, w, r.h - 2);
      if (anim) {
        // the shine that sweeps across
        const sx = r.x + ((dc.time * 0.6) % 1.4 - 0.2) * r.w;
        const shine = g.createLinearGradient(sx - r.w * 0.15, 0, sx + r.w * 0.15, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)'); shine.addColorStop(0.5, 'rgba(255,255,255,0.65)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = shine;
        g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    },
  },
};

export const seven = makeSkin(sevenTheme);
