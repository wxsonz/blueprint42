// Console skins: PlayStation 1–5, Wii, GameCube, Nintendo 64, Switch, SNES
// and Game Boy Advance. Each is a theme for the kit (`makeSkin`): a
// wallpaper drawn once per size, window chrome in the console's own style,
// and a palette. Geometry is the engine's; only the look changes.
import { backdrop, makeSkin, plainCard, type Palette, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { fitText, hash, rrect } from './util';

const F = (family: string) => (px: number, w = 400) => `${w} ${px}px ${family}`;
const RUBIK = F('Rubik, "Open Sans", sans-serif');
const EXO = F('"Exo 2", "Open Sans", sans-serif');
const OPEN = F('"Open Sans", "DejaVu Sans", sans-serif');
const NUNITO = F('Nunito, "Open Sans", sans-serif');
const JOST = F('Jost, "Open Sans", sans-serif');
const CHAKRA = F('"Chakra Petch", "Open Sans", sans-serif');
const PIXEL = F('"Pixelify Sans", "Open Sans", sans-serif');
const MONO = (family: string) => (px: number, w = 400) => `${w >= 600 ? 700 : 400} ${px}px ${family}, "DejaVu Sans Mono", monospace`;

const nameHash = (s: string) => hash(s.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 9973);
// the machine's name, without "(args) - Running"
const bare = (title: string) => title.replace(/[( ].*$/, '');

function text(dc: Dc, r: Rect, s: string, font: (px: number, w?: number) => string, px: number, color: string, opts: { w?: number; align?: CanvasTextAlign; x?: number; right?: number; halo?: string } = {}): void {
  const g = dc.g;
  const fs = Math.max(7, px * dc.z);
  const left = opts.x ?? r.x + 10 * dc.z;
  const right = opts.right ?? r.x + r.w - 8 * dc.z;
  const t = fitText(g, s, (x) => font(x, opts.w ?? 400), fs, Math.max(0, right - left));
  g.textAlign = opts.align ?? 'left';
  g.textBaseline = 'middle';
  const x = opts.align === 'center' ? (left + right) / 2 : left;
  if (opts.halo) {
    g.save();
    g.strokeStyle = opts.halo;
    g.lineWidth = Math.max(2, 4 * dc.z);
    g.lineJoin = 'round';
    g.strokeText(t, x, r.y + r.h / 2);
    g.restore();
  }
  g.fillStyle = color;
  g.fillText(t, x, r.y + r.h / 2);
}

// a bevelled plastic slab: light along the top and left, dark along the bottom and right
function plastic(dc: Dc, r: Rect, rad: number, face: string, light: string, dark: string): void {
  const g = dc.g;
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.fillStyle = face;
  g.fill();
  const k = Math.max(1, 1.5 * dc.z);
  g.lineWidth = k;
  g.strokeStyle = dark;
  g.beginPath();
  g.moveTo(r.x + r.w - k / 2, r.y + rad);
  g.lineTo(r.x + r.w - k / 2, r.y + r.h - k / 2);
  g.lineTo(r.x + rad, r.y + r.h - k / 2);
  g.stroke();
  g.strokeStyle = light;
  g.beginPath();
  g.moveTo(r.x + k / 2, r.y + r.h - rad);
  g.lineTo(r.x + k / 2, r.y + k / 2);
  g.lineTo(r.x + r.w - rad, r.y + k / 2);
  g.stroke();
}

function client(dc: Dc, r: Rect, b: number, th: number, face: string, rad = 0, edge?: string): Rect {
  const g = dc.g;
  const c = { x: r.x + b, y: r.y + th, w: r.w - 2 * b, h: Math.max(0, r.h - th - b) };
  rrect(g, c.x, c.y, c.w, c.h, rad);
  g.fillStyle = face;
  g.fill();
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = 1;
    g.stroke();
  }
  return c;
}

function bar(dc: Dc, r: Rect, fill: number, anim: boolean, track: string, color: string, round = true): void {
  const g = dc.g;
  const rad = round ? r.h / 2 : Math.max(1, 2 * dc.z);
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.fillStyle = track;
  g.fill();
  let x = r.x;
  let w = r.w * fill;
  if (anim) {
    const u = (dc.time * 0.5) % 1.3;
    x = r.x + r.w * (u - 0.3);
    w = r.w * 0.3;
  }
  const x0 = Math.max(r.x, x);
  const x1 = Math.min(r.x + r.w, x + w);
  if (x1 - x0 < 1) return;
  g.save();
  rrect(g, r.x, r.y, r.w, r.h, rad);
  g.clip();
  rrect(g, x0, r.y, x1 - x0, r.h, rad);
  g.fillStyle = color;
  g.fill();
  g.restore();
}

// the card the kit asks for (chests, plates, storage…): the palette's own,
// with a focus ring instead of a blurred glow
function cardOf(radius: number, ring: string) {
  return (dc: Dc, r: Rect, o: Parameters<Theme['card']>[2]) => {
    plainCard(dc, r, radius, { ...o, glow: null });
    if (o.glow) {
      const g = dc.g;
      rrect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, Math.max(2, (radius + 2) * dc.z));
      g.strokeStyle = ring;
      g.lineWidth = Math.max(1.5, 2 * dc.z);
      g.stroke();
    }
  };
}

// ---------------- PlayStation ----------------

const PS_SYM = { tri: '#3ed6a0', circ: '#ff4d5e', cross: '#6aa8ff', sq: '#ff85c0' };

function psSymbol(g: CanvasRenderingContext2D, kind: keyof typeof PS_SYM, x: number, y: number, s: number): void {
  g.beginPath();
  if (kind === 'tri') (g.moveTo(x, y - s), g.lineTo(x + s * 0.95, y + s * 0.7), g.lineTo(x - s * 0.95, y + s * 0.7), g.closePath());
  else if (kind === 'circ') g.arc(x, y, s, 0, Math.PI * 2);
  else if (kind === 'cross') (g.moveTo(x - s, y - s), g.lineTo(x + s, y + s), g.moveTo(x + s, y - s), g.lineTo(x - s, y + s));
  else g.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
  g.stroke();
}

const ps1P: Palette = {
  bg: '#0a0b14', card: '#f1efe8', panel: '#e3e1d9', line: '#8f8d86',
  fg: '#1d1d22', dim: '#55555c', faint: '#8d8b85', accent: '#2f6fd6', ptr: '#c9337a', ret: '#16946a', wait: '#c77d00', err: '#d9303f',
  param: '#2f6fd6', cell: '#d2dcf0', track: '#ffffff',
};
export const ps1Theme: Theme = {
  id: 'ps1', name: 'PlayStation', blurb: 'grey plastic, the black boot screen, △○✕□',
  p: ps1P, ui: RUBIK, mono: MONO('"Share Tech Mono"'), radius: 3, spotlight: 'rgba(0,0,8,0.62)',
  pulseColor: 'rgba(106,168,255,0.85)',
  card: cardOf(3, PS_SYM.cross),
  background(dc) {
    backdrop(dc, 'ps1', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#050509');
      sky.addColorStop(1, '#131a3c');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const kinds = Object.keys(PS_SYM) as (keyof typeof PS_SYM)[];
      g.lineWidth = 3;
      for (let k = 0; k < 16; k++) {
        const kind = kinds[k % 4];
        g.strokeStyle = PS_SYM[kind];
        g.globalAlpha = 0.07 + (k % 3) * 0.03;
        psSymbol(g, kind, W * hash(k * 7 + 1), H * hash(k * 13 + 5), 26 + 70 * hash(k * 3 + 2));
      }
      g.globalAlpha = 1;
    });
  },
  window: {
    border: 5, corner: 3, titleH: 22, face: '#f1efe8', workspace: 'rgba(255,255,255,0.05)',
    frame(dc, r, active, face) {
      plastic(dc, r, Math.max(1, 3 * dc.z), active ? '#c3c1b9' : '#a9a7a0', '#ecEAe2', '#6f6d67');
      client(dc, r, Math.max(2, 5 * dc.z), 22 * dc.z, face, 0, '#8f8d86');
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const bar = { x: r.x + 3 * dc.z, y: r.y + 3 * dc.z, w: r.w - 6 * dc.z, h: r.h - 5 * dc.z };
      g.fillStyle = active ? '#2a2a30' : '#5b5b61';
      g.fillRect(bar.x, bar.y, bar.w, bar.h);
      let right = bar.x + bar.w - 6 * dc.z;
      if (buttons && r.w > 150 * dc.z) {
        const s = Math.max(2.5, 4.2 * dc.z);
        g.lineWidth = Math.max(1, 1.6 * dc.z);
        for (const k of ['sq', 'cross', 'circ', 'tri'] as const) {
          g.strokeStyle = active ? PS_SYM[k] : '#9a9aa0';
          psSymbol(g, k, right - s, bar.y + bar.h / 2, s);
          right -= s * 3;
        }
      }
      text(dc, bar, title, RUBIK, 12, active ? '#f2f2f2' : '#c9c9cc', { w: 500, x: bar.x + 7 * dc.z, right });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#2a2a30', PS_SYM.cross, false);
    },
  },
};

const ps2P: Palette = {
  bg: '#02040c', card: '#0f1d3a', panel: '#0b1630', line: '#2f5f9e',
  fg: '#dbe8ff', dim: '#8fa6cc', faint: '#566b90', accent: '#4fb3ff', ptr: '#b48cff', ret: '#58e0c0', wait: '#ffcc55', err: '#ff5a6e',
  param: '#7cc4ff', cell: '#16305c', track: '#060d1e',
};
export const ps2Theme: Theme = {
  id: 'ps2', name: 'PlayStation 2', blurb: 'the boot towers, deep blue glass, cyan light',
  p: ps2P, ui: EXO, mono: MONO('"Share Tech Mono"'), radius: 5, spotlight: 'rgba(0,2,10,0.6)',
  pulseColor: 'rgba(79,179,255,0.9)',
  card: cardOf(5, '#4fb3ff'),
  // the towers: columns of blue light standing on a dark floor, reflected
  background(dc) {
    backdrop(dc, 'ps2', (g, W, H) => {
      const hz = H * 0.64;
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#000105');
      sky.addColorStop(0.64, '#061536');
      sky.addColorStop(1, '#010308');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(W * 0.5, hz, 0, W * 0.5, hz, W * 0.6);
      glow.addColorStop(0, 'rgba(60,130,255,0.28)');
      glow.addColorStop(1, 'rgba(60,130,255,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      for (let k = 0; k < 46; k++) {
        const x = W * hash(k * 17 + 3);
        const depth = 0.35 + 0.65 * hash(k * 5 + 11);
        const h = H * (0.08 + 0.42 * hash(k * 29 + 7)) * depth;
        const w = (5 + 16 * hash(k * 3 + 1)) * depth;
        const tower = g.createLinearGradient(0, hz - h, 0, hz);
        tower.addColorStop(0, 'rgba(90,170,255,0)');
        tower.addColorStop(1, `rgba(90,170,255,${0.18 + 0.3 * depth})`);
        g.fillStyle = tower;
        g.fillRect(x, hz - h, w, h);
        const refl = g.createLinearGradient(0, hz, 0, hz + h * 0.5);
        refl.addColorStop(0, `rgba(90,170,255,${0.1 * depth})`);
        refl.addColorStop(1, 'rgba(90,170,255,0)');
        g.fillStyle = refl;
        g.fillRect(x, hz, w, h * 0.5);
      }
      g.fillStyle = 'rgba(120,190,255,0.35)';
      g.fillRect(0, hz, W, 1);
    });
  },
  window: {
    border: 2, corner: 6, titleH: 24, face: '#0a1428', workspace: 'rgba(79,179,255,0.05)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(2, 6 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = 'rgba(8,18,40,0.94)';
      g.fill();
      if (active) {
        g.strokeStyle = 'rgba(79,179,255,0.35)';
        g.lineWidth = Math.max(3, 6 * dc.z);
        g.stroke();
      }
      g.strokeStyle = active ? '#4fb3ff' : 'rgba(79,179,255,0.4)';
      g.lineWidth = Math.max(1, 1.2 * dc.z);
      g.stroke();
      client(dc, r, Math.max(1, 2 * dc.z), 24 * dc.z, face, Math.max(1, 3 * dc.z));
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      const head = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      head.addColorStop(0, active ? '#1d4f9c' : '#15284a');
      head.addColorStop(1, active ? '#0a1f45' : '#0b1530');
      rrect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 1, [Math.max(2, 5 * dc.z), Math.max(2, 5 * dc.z), 0, 0]);
      g.fillStyle = head;
      g.fill();
      g.fillStyle = active ? 'rgba(140,210,255,0.7)' : 'rgba(140,210,255,0.2)';
      g.fillRect(r.x + 6 * dc.z, r.y + 1, r.w - 12 * dc.z, 1);
      // a little crystal cube
      const s = Math.max(3, 5 * dc.z);
      const cx = r.x + 12 * dc.z;
      const cy = r.y + r.h / 2;
      g.beginPath();
      g.moveTo(cx, cy - s); g.lineTo(cx + s, cy - s / 2); g.lineTo(cx + s, cy + s / 2); g.lineTo(cx, cy + s); g.lineTo(cx - s, cy + s / 2); g.lineTo(cx - s, cy - s / 2); g.closePath();
      g.fillStyle = active ? 'rgba(120,200,255,0.8)' : 'rgba(120,200,255,0.35)';
      g.fill();
      text(dc, r, title, EXO, 12.5, active ? '#e6f1ff' : '#8fa6cc', { w: 600, x: cx + 11 * dc.z });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#060d1e', '#4fb3ff');
    },
  },
};

const ps3P: Palette = {
  bg: '#061a4f', card: 'rgba(12,22,50,0.92)', panel: 'rgba(6,14,36,0.9)', line: 'rgba(255,255,255,0.3)',
  fg: '#ffffff', dim: '#b8c6e6', faint: '#7488b4', accent: '#8fd3ff', ptr: '#ffb86b', ret: '#8ff0a4', wait: '#ffd76b', err: '#ff7a7a',
  param: '#bfe3ff', cell: 'rgba(143,211,255,0.2)', track: 'rgba(0,0,0,0.35)',
};
export const ps3Theme: Theme = {
  id: 'ps3', name: 'PlayStation 3', blurb: 'the XMB: a flowing wave over blue, thin white type',
  p: ps3P, ui: OPEN, mono: MONO('"JetBrains Mono"'), radius: 4, spotlight: 'rgba(0,6,24,0.55)',
  pulseColor: 'rgba(255,255,255,0.9)',
  card: cardOf(4, 'rgba(255,255,255,0.85)'),
  // the wave: bundles of thin light curves drifting across a blue gradient
  background(dc) {
    backdrop(dc, 'ps3', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, W * 0.3, H);
      sky.addColorStop(0, '#0e3aa0');
      sky.addColorStop(0.55, '#082a78');
      sky.addColorStop(1, '#020c2c');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const band = g.createLinearGradient(0, H * 0.35, 0, H * 0.75);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, 'rgba(160,210,255,0.12)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = band;
      g.fillRect(0, H * 0.35, W, H * 0.4);
      for (let k = 0; k < 22; k++) {
        g.strokeStyle = `rgba(255,255,255,${0.05 + 0.18 * hash(k * 7 + 3)})`;
        g.lineWidth = 0.6 + 1.6 * hash(k * 11 + 1);
        g.beginPath();
        for (let x = -10; x <= W + 10; x += 12) {
          const u = x / W;
          const y = H * 0.55 + Math.sin(u * Math.PI * 2 * 0.9 + k * 0.18) * H * (0.07 + k * 0.004) + Math.sin(u * Math.PI * 5 + k * 0.4) * H * 0.02;
          if (x < 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    });
  },
  window: {
    border: 1, corner: 4, titleH: 26, face: 'rgba(4,12,34,0.86)', workspace: 'rgba(255,255,255,0.04)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(1, 4 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fill();
      g.strokeStyle = active ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      g.stroke();
      client(dc, r, 1, 26 * dc.z, face, Math.max(1, 3 * dc.z));
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      if (active) {
        // the XMB's highlight band behind the selected item
        const hl = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
        hl.addColorStop(0, 'rgba(255,255,255,0)');
        hl.addColorStop(0.3, 'rgba(255,255,255,0.22)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = hl;
        g.fillRect(r.x, r.y + r.h * 0.15, r.w, r.h * 0.7);
      }
      text(dc, r, title, OPEN, 13.5, active ? '#ffffff' : 'rgba(255,255,255,0.6)', { w: 300, halo: active ? 'rgba(160,210,255,0.35)' : undefined });
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(r.x, r.y + r.h / 2 - 0.5, r.w, 1);
      const x = anim ? r.x + r.w * ((dc.time * 0.4) % 1) : r.x + r.w * fill;
      g.fillStyle = '#ffffff';
      g.fillRect(r.x, r.y + r.h / 2 - 1, x - r.x, 2);
      g.beginPath();
      g.arc(x, r.y + r.h / 2, Math.max(2, r.h * 0.3), 0, Math.PI * 2);
      g.fill();
    },
  },
};

const ps4P: Palette = {
  bg: '#0b2466', card: '#123580', panel: '#0d2a6a', line: '#3d6fd0',
  fg: '#ffffff', dim: '#b5c9f2', faint: '#6f8ccc', accent: '#5fb1ff', ptr: '#ffb454', ret: '#6ee7a8', wait: '#ffd166', err: '#ff6b6b',
  param: '#a9d4ff', cell: '#1c4aa6', track: '#08194a',
};
export const ps4Theme: Theme = {
  id: 'ps4', name: 'PlayStation 4', blurb: 'the dynamic menu: blue light, soft bokeh, flat tiles',
  p: ps4P, ui: RUBIK, mono: MONO('"JetBrains Mono"'), radius: 2, spotlight: 'rgba(0,8,32,0.55)',
  pulseColor: 'rgba(255,255,255,0.9)',
  card: cardOf(2, '#ffffff'),
  background(dc) {
    backdrop(dc, 'ps4', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, W, H);
      sky.addColorStop(0, '#0a1c55');
      sky.addColorStop(0.5, '#1447a8');
      sky.addColorStop(1, '#081a4d');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      for (let k = 0; k < 34; k++) {
        const x = W * hash(k * 19 + 2);
        const y = H * hash(k * 23 + 9);
        const rr = 12 + 60 * hash(k * 5 + 4);
        const b = g.createRadialGradient(x, y, 0, x, y, rr);
        b.addColorStop(0, `rgba(190,220,255,${0.05 + 0.08 * hash(k)})`);
        b.addColorStop(1, 'rgba(190,220,255,0)');
        g.fillStyle = b;
        g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      const streak = g.createLinearGradient(0, H * 0.2, W, H * 0.8);
      streak.addColorStop(0.35, 'rgba(255,255,255,0)');
      streak.addColorStop(0.5, 'rgba(255,255,255,0.07)');
      streak.addColorStop(0.65, 'rgba(255,255,255,0)');
      g.fillStyle = streak;
      g.fillRect(0, 0, W, H);
    });
  },
  window: {
    border: 2, corner: 1, titleH: 26, face: '#0c2a6b', workspace: 'rgba(255,255,255,0.04)',
    frame(dc, r, active, face) {
      const g = dc.g;
      g.fillStyle = active ? '#1a4fb4' : '#123a8a';
      g.fillRect(r.x, r.y, r.w, r.h);
      client(dc, r, Math.max(1, 2 * dc.z), 26 * dc.z, face);
      if (active) {
        // the focused tile: a white frame with a soft halo
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        g.lineWidth = Math.max(3, 7 * dc.z);
        g.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
        g.strokeStyle = '#ffffff';
        g.lineWidth = Math.max(1.5, 2.5 * dc.z);
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
    },
    titleBar(dc, r, title, active) {
      text(dc, r, title, RUBIK, 13, active ? '#ffffff' : '#b5c9f2', { w: 300 });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#08194a', '#5fb1ff', false);
    },
  },
};

const ps5P: Palette = {
  bg: '#0e0f13', card: '#24262f', panel: '#1b1d24', line: '#3a3d49',
  fg: '#f5f6f8', dim: '#a4a8b4', faint: '#666b78', accent: '#3d8bff', ptr: '#c79bff', ret: '#4fd18b', wait: '#ffbf47', err: '#ff5c5c',
  param: '#8fb9ff', cell: '#1f3a66', track: '#101116',
};
export const ps5Theme: Theme = {
  id: 'ps5', name: 'PlayStation 5', blurb: 'near-black, rounded cards, the white focus ring',
  p: ps5P, ui: RUBIK, mono: MONO('"JetBrains Mono"'), radius: 10, spotlight: 'rgba(0,0,0,0.6)',
  pulseColor: 'rgba(61,139,255,0.9)',
  card: cardOf(10, '#ffffff'),
  background(dc) {
    backdrop(dc, 'ps5', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#15171e');
      sky.addColorStop(1, '#08090c');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(W * 0.8, H * 0.1, 0, W * 0.8, H * 0.1, W * 0.7);
      glow.addColorStop(0, 'rgba(0,112,209,0.22)');
      glow.addColorStop(1, 'rgba(0,112,209,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.035)';
      g.lineWidth = 1;
      for (let k = 0; k < 7; k++) {
        g.beginPath();
        g.moveTo(W * (0.2 + k * 0.12), 0);
        g.lineTo(W * (0.2 + k * 0.12) - H * 0.6, H);
        g.stroke();
      }
    });
  },
  window: {
    border: 0, corner: 12, titleH: 30, face: '#1b1d24', workspace: 'rgba(255,255,255,0.03)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(3, 12 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = face;
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(r.x + rad, r.y, r.w - 2 * rad, 30 * dc.z);
      if (active) {
        const k = Math.max(2, 4 * dc.z);
        rrect(g, r.x - k, r.y - k, r.w + 2 * k, r.h + 2 * k, rad + k);
        g.strokeStyle = '#ffffff';
        g.lineWidth = Math.max(1.5, 2.5 * dc.z);
        g.stroke();
      }
    },
    titleBar(dc, r, title, active) {
      text(dc, r, title, RUBIK, 13.5, active ? '#ffffff' : '#a4a8b4', { w: 500, x: r.x + 14 * dc.z });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#2a2c35', '#3d8bff');
    },
  },
};

// ---------------- Nintendo ----------------

function wiiOf(dark: boolean): Theme {
  const WII = '#34bee8';
  const p: Palette = dark ? {
    bg: '#17191d', card: '#2a2d33', panel: '#23262b', line: '#454a52',
    fg: '#eef1f4', dim: '#a7adb6', faint: '#6c727c', accent: WII, ptr: '#ff9f43', ret: '#5fd18b', wait: '#ffc94d', err: '#ff6464',
    param: '#7fd6f2', cell: '#1d3f4d', track: '#1b1d21',
  } : {
    bg: '#eef1f4', card: '#ffffff', panel: '#f7f8fa', line: '#c9ced6',
    fg: '#3c424c', dim: '#6f7682', faint: '#a3a9b3', accent: '#1aa3d4', ptr: '#e0782b', ret: '#2c9e5c', wait: '#d69a00', err: '#e04848',
    param: '#1a8fbd', cell: '#d6f0fa', track: '#ffffff',
  };
  return {
    id: dark ? 'wii-dark' : 'wii', name: 'Wii', blurb: dark ? 'the Wii Menu after dark' : 'white channels, fine lines, a soft blue glow',
    p, ui: NUNITO, mono: MONO('"JetBrains Mono"'), radius: 12, spotlight: dark ? 'rgba(0,0,0,0.55)' : 'rgba(210,218,228,0.6)',
    pulseColor: 'rgba(52,190,232,0.9)',
    card: cardOf(12, WII),
    background(dc) {
      backdrop(dc, dark ? 'wii-dark' : 'wii', (g, W, H) => {
        g.fillStyle = p.bg;
        g.fillRect(0, 0, W, H);
        g.fillStyle = dark ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.035)';
        for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
        const foot = g.createLinearGradient(0, H * 0.75, 0, H);
        foot.addColorStop(0, 'rgba(52,190,232,0)');
        foot.addColorStop(1, dark ? 'rgba(52,190,232,0.12)' : 'rgba(52,190,232,0.16)');
        g.fillStyle = foot;
        g.fillRect(0, H * 0.75, W, H * 0.25);
      });
    },
    window: {
      border: 4, corner: 18, titleH: 30, face: p.card, workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.5)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(4, 18 * dc.z);
        if (active) {
          rrect(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, rad + 3);
          g.strokeStyle = 'rgba(52,190,232,0.35)';
          g.lineWidth = Math.max(3, 6 * dc.z);
          g.stroke();
        }
        rrect(g, r.x, r.y, r.w, r.h, rad);
        g.fillStyle = dark ? '#30343b' : '#f6f7f9';
        g.fill();
        g.strokeStyle = active ? WII : p.line;
        g.lineWidth = Math.max(1.5, (active ? 3 : 2) * dc.z);
        g.stroke();
        client(dc, r, Math.max(2, 4 * dc.z), 30 * dc.z, face, Math.max(3, 12 * dc.z));
      },
      titleBar(dc, r, title, active) {
        const g = dc.g;
        const pill = { x: r.x + 8 * dc.z, y: r.y + 5 * dc.z, w: r.w - 16 * dc.z, h: r.h - 8 * dc.z };
        const shine = g.createLinearGradient(0, pill.y, 0, pill.y + pill.h);
        shine.addColorStop(0, dark ? '#454a53' : '#ffffff');
        shine.addColorStop(1, dark ? '#353940' : '#e2e7ee');
        rrect(g, pill.x, pill.y, pill.w, pill.h, pill.h / 2);
        g.fillStyle = shine;
        g.fill();
        text(dc, pill, title, NUNITO, 12.5, active ? (dark ? '#ffffff' : '#3c424c') : p.dim, { w: 700, align: 'center' });
      },
      progress(dc, r, fill, anim) {
        bar(dc, r, fill, anim, dark ? '#1b1d21' : '#e2e7ee', WII);
      },
    },
  };
}
export const wiiTheme = wiiOf(false);

const gcP: Palette = {
  bg: '#1b1150', card: '#2a1f6e', panel: '#22185c', line: '#5a4bb8',
  fg: '#f1eeff', dim: '#b9b1e8', faint: '#7c72b8', accent: '#a393ff', ptr: '#ffb14e', ret: '#7bd88f', wait: '#ffd166', err: '#ff5a78',
  param: '#c9bfff', cell: '#3a2d8f', track: '#140b40',
};
export const gamecubeTheme: Theme = {
  id: 'gamecube', name: 'GameCube', blurb: 'indigo, glassy cubes, lilac light',
  p: gcP, ui: JOST, mono: MONO('"JetBrains Mono"'), radius: 8, spotlight: 'rgba(8,2,30,0.58)',
  pulseColor: 'rgba(163,147,255,0.9)',
  card: cardOf(8, '#a393ff'),
  background(dc) {
    backdrop(dc, 'gamecube', (g, W, H) => {
      const sky = g.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.max(W, H) * 0.8);
      sky.addColorStop(0, '#4a37b0');
      sky.addColorStop(1, '#0e0636');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      // faint isometric cubes, three shades of lilac
      for (let k = 0; k < 14; k++) {
        const x = W * hash(k * 13 + 4);
        const y = H * hash(k * 31 + 8);
        const s = 18 + 50 * hash(k * 7 + 2);
        const a = 0.05 + 0.05 * hash(k);
        const face = (pts: number[][], alpha: number) => {
          g.beginPath();
          g.moveTo(pts[0][0], pts[0][1]);
          for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
          g.closePath();
          g.fillStyle = `rgba(200,190,255,${alpha})`;
          g.fill();
        };
        face([[x, y - s], [x + s, y - s / 2], [x, y], [x - s, y - s / 2]], a * 1.6);
        face([[x - s, y - s / 2], [x, y], [x, y + s], [x - s, y + s / 2]], a);
        face([[x + s, y - s / 2], [x, y], [x, y + s], [x + s, y + s / 2]], a * 0.6);
      }
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

const N64 = ['#e3232b', '#1fa84a', '#f2b600', '#1c5fc7'];
const n64P: Palette = {
  bg: '#141418', card: '#e6e6ea', panel: '#d7d7dc', line: '#8d8d95',
  fg: '#1b1b20', dim: '#55555e', faint: '#8c8c94', accent: '#1c5fc7', ptr: '#d0212a', ret: '#16883c', wait: '#c98f00', err: '#d0212a',
  param: '#1c5fc7', cell: '#cfdcf5', track: '#ffffff',
};
export const n64Theme: Theme = {
  id: 'n64', name: 'Nintendo 64', blurb: 'charcoal plastic, the four logo colours, chunky 3D',
  p: n64P, ui: CHAKRA, mono: MONO('"Share Tech Mono"'), radius: 3, spotlight: 'rgba(0,0,0,0.6)',
  pulseColor: 'rgba(242,182,0,0.9)',
  card: cardOf(3, '#f2b600'),
  background(dc) {
    backdrop(dc, 'n64', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#1d1d23');
      sky.addColorStop(1, '#0b0b0e');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      // the four colours as a band across the bottom-left, like the box art
      const w = Math.max(W, H) * 0.07;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = N64[k];
        g.globalAlpha = 0.16;
        g.beginPath();
        const x = -H * 0.2 + k * w;
        g.moveTo(x, H);
        g.lineTo(x + w, H);
        g.lineTo(x + w + H * 0.6, H * 0.4);
        g.lineTo(x + H * 0.6, H * 0.4);
        g.closePath();
        g.fill();
      }
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.035)';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 32) (g.beginPath(), g.moveTo(x, 0), g.lineTo(x, H), g.stroke());
      for (let y = 0; y < H; y += 32) (g.beginPath(), g.moveTo(0, y), g.lineTo(W, y), g.stroke());
    });
  },
  window: {
    border: 4, corner: 4, titleH: 24, face: '#e6e6ea', workspace: 'rgba(255,255,255,0.04)',
    frame(dc, r, active, face) {
      plastic(dc, r, Math.max(1, 4 * dc.z), active ? '#6a6a72' : '#4a4a52', '#9a9aa2', '#232328');
      client(dc, r, Math.max(2, 4 * dc.z), 24 * dc.z, face, 0, '#2a2a30');
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      const bar = { x: r.x + 4 * dc.z, y: r.y + 4 * dc.z, w: r.w - 8 * dc.z, h: r.h - 6 * dc.z };
      g.fillStyle = active ? N64[Math.floor(nameHash(bare(title)) * 4)] : '#5a5a62';
      g.fillRect(bar.x, bar.y, bar.w, bar.h);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(bar.x, bar.y, bar.w, Math.max(1, 1.5 * dc.z));
      text(dc, bar, title, CHAKRA, 12.5, '#ffffff', { w: 700, x: bar.x + 7 * dc.z, halo: 'rgba(0,0,0,0.35)' });
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      g.fillStyle = '#2a2a30';
      g.fillRect(r.x, r.y, r.w, r.h);
      const n = Math.max(4, Math.floor(r.w / Math.max(4, 8 * dc.z)));
      const on = anim ? Math.floor(dc.time * 8) % (n + 1) : Math.round(n * fill);
      const w = r.w / n;
      for (let k = 0; k < on; k++) {
        g.fillStyle = N64[k % 4];
        g.fillRect(r.x + k * w + 1, r.y + 1, w - 2, r.h - 2);
      }
    },
  },
};

function switchOf(dark: boolean): Theme {
  const CYAN = '#00c3e3';
  const p: Palette = dark ? {
    bg: '#2d2d2d', card: '#3a3a3a', panel: '#333333', line: '#555555',
    fg: '#ffffff', dim: '#b4b4b4', faint: '#7a7a7a', accent: CYAN, ptr: '#ff3c28', ret: '#4cd964', wait: '#ffcc00', err: '#ff3c28',
    param: '#7fe3f3', cell: '#1f4a54', track: '#262626',
  } : {
    bg: '#ebebeb', card: '#ffffff', panel: '#f6f6f6', line: '#cdcdcd',
    fg: '#2d2d2d', dim: '#6b6b6b', faint: '#a0a0a0', accent: '#0ab0cf', ptr: '#e6321f', ret: '#1e9e45', wait: '#c98f00', err: '#e6321f',
    param: '#0a93ae', cell: '#d4f3f9', track: '#ffffff',
  };
  return {
    id: dark ? 'switch-dark' : 'switch', name: 'Switch', blurb: dark ? 'Basic Black: dark tiles, neon red and blue' : 'Basic White: rounded tiles, the pulsing cyan focus',
    p, ui: NUNITO, mono: MONO('"JetBrains Mono"'), radius: 8, spotlight: dark ? 'rgba(0,0,0,0.55)' : 'rgba(200,200,200,0.6)',
    pulseColor: 'rgba(0,195,227,0.9)',
    card: cardOf(8, CYAN),
    background(dc) {
      backdrop(dc, dark ? 'switch-dark' : 'switch', (g, W, H) => {
        g.fillStyle = p.bg;
        g.fillRect(0, 0, W, H);
        // a hint of the Joy-Con: neon red down the left edge, neon blue down the right
        const l = g.createLinearGradient(0, 0, W * 0.12, 0);
        l.addColorStop(0, 'rgba(255,60,40,0.14)');
        l.addColorStop(1, 'rgba(255,60,40,0)');
        g.fillStyle = l;
        g.fillRect(0, 0, W * 0.12, H);
        const r = g.createLinearGradient(W, 0, W * 0.88, 0);
        r.addColorStop(0, 'rgba(10,185,230,0.14)');
        r.addColorStop(1, 'rgba(10,185,230,0)');
        g.fillStyle = r;
        g.fillRect(W * 0.88, 0, W * 0.12, H);
      });
    },
    window: {
      border: 0, corner: 10, titleH: 30, face: p.card, workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(3, 10 * dc.z);
        rrect(g, r.x, r.y + 2, r.w, r.h, rad);
        g.fillStyle = dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)';
        g.fill();
        rrect(g, r.x, r.y, r.w, r.h, rad);
        g.fillStyle = face;
        g.fill();
        g.fillStyle = dark ? '#444444' : '#f4f4f4';
        rrect(g, r.x, r.y, r.w, 30 * dc.z, [rad, rad, 0, 0]);
        g.fill();
        if (active) {
          // the focus outline breathes, cyan into blue
          const k = Math.max(2, 4 * dc.z);
          const a = 0.65 + 0.35 * Math.sin(dc.time * 4);
          rrect(g, r.x - k, r.y - k, r.w + 2 * k, r.h + 2 * k, rad + k);
          g.strokeStyle = `rgba(0,195,227,${a})`;
          g.lineWidth = Math.max(2, 3.5 * dc.z);
          g.stroke();
        }
      },
      titleBar(dc, r, title, active) {
        const g = dc.g;
        // the two Joy-Con, as a red and a blue dot
        const d = Math.max(2, 3.5 * dc.z);
        g.fillStyle = active ? '#ff3c28' : p.faint;
        g.beginPath(); g.arc(r.x + 12 * dc.z, r.y + r.h / 2, d, 0, Math.PI * 2); g.fill();
        g.fillStyle = active ? '#0ab9e6' : p.faint;
        g.beginPath(); g.arc(r.x + 21 * dc.z, r.y + r.h / 2, d, 0, Math.PI * 2); g.fill();
        text(dc, r, title, NUNITO, 13, active ? p.fg : p.dim, { w: 700, x: r.x + 31 * dc.z });
      },
      progress(dc, r, fill, anim) {
        bar(dc, r, fill, anim, dark ? '#262626' : '#e2e2e2', CYAN);
      },
    },
  };
}
export const switchTheme = switchOf(false);

const SFC = { a: '#d8302f', b: '#f2b90d', x: '#2a5fc4', y: '#2c9a45' };
const snesP: Palette = {
  bg: '#cfcdd6', card: '#f4f3f7', panel: '#e9e7ef', line: '#9d99ad',
  fg: '#262233', dim: '#5b566b', faint: '#918ca3', accent: '#5b4c96', ptr: '#c22a2a', ret: '#23843b', wait: '#b88a00', err: '#c22a2a',
  param: '#4a3d8a', cell: '#dcd6f0', track: '#ffffff',
};
export const snesTheme: Theme = {
  id: 'snes', name: 'SNES', blurb: 'grey plastic ridges, purple bars, the four Super Famicom colours',
  p: snesP, ui: PIXEL, mono: MONO('"Share Tech Mono"'), radius: 6, spotlight: 'rgba(60,54,80,0.45)',
  pulseColor: 'rgba(91,76,150,0.9)',
  card: cardOf(6, '#5b4c96'),
  background(dc) {
    backdrop(dc, 'snes', (g, W, H) => {
      const body = g.createLinearGradient(0, 0, 0, H);
      body.addColorStop(0, '#d9d7e0');
      body.addColorStop(1, '#bdbac6');
      g.fillStyle = body;
      g.fillRect(0, 0, W, H);
      // the ridges on the console's top
      for (let y = 18; y < H * 0.2; y += 9) {
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.fillRect(0, y, W, 2);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(0, y + 2, W, 1);
      }
      g.fillStyle = 'rgba(91,76,150,0.12)';
      g.fillRect(0, H * 0.86, W, H * 0.14);
    });
  },
  window: {
    border: 4, corner: 8, titleH: 24, face: '#f4f3f7', workspace: 'rgba(255,255,255,0.25)',
    frame(dc, r, active, face) {
      plastic(dc, r, Math.max(2, 8 * dc.z), active ? '#c2bfcc' : '#b1aebc', '#eceaf2', '#7d798d');
      client(dc, r, Math.max(2, 4 * dc.z), 24 * dc.z, face, Math.max(1, 3 * dc.z), '#9d99ad');
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const bar = { x: r.x + 4 * dc.z, y: r.y + 4 * dc.z, w: r.w - 8 * dc.z, h: r.h - 6 * dc.z };
      rrect(g, bar.x, bar.y, bar.w, bar.h, Math.max(1, 4 * dc.z));
      g.fillStyle = active ? '#4b3f72' : '#8c86a3';
      g.fill();
      let right = bar.x + bar.w - 7 * dc.z;
      if (buttons && r.w > 150 * dc.z) {
        const d = Math.max(2, 3.6 * dc.z);
        for (const c of [SFC.a, SFC.b, SFC.x, SFC.y]) {
          g.fillStyle = active ? c : '#b8b3cc';
          g.beginPath();
          g.arc(right - d, bar.y + bar.h / 2, d, 0, Math.PI * 2);
          g.fill();
          right -= d * 2.8;
        }
      }
      text(dc, bar, title, PIXEL, 12.5, active ? '#f3f0ff' : '#e9e6f3', { w: 700, x: bar.x + 7 * dc.z, right });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#dcd6f0', '#5b4c96', false);
    },
  },
};

const gbaP: Palette = {
  bg: '#2a1f60', card: '#ffffff', panel: '#f3f3ec', line: '#b5b3c4',
  fg: '#23213a', dim: '#5d5a78', faint: '#96939f', accent: '#4a5fd8', ptr: '#d0457e', ret: '#23965a', wait: '#c08a00', err: '#d33a3a',
  param: '#3f52c4', cell: '#dde2fb', track: '#ffffff',
};
export const gbaTheme: Theme = {
  id: 'gba', name: 'Game Boy Advance', blurb: 'indigo plastic, a bright screen in a dark bezel',
  p: gbaP, ui: PIXEL, mono: MONO('"Share Tech Mono"'), radius: 4, spotlight: 'rgba(10,4,34,0.55)',
  pulseColor: 'rgba(74,95,216,0.9)',
  card: cardOf(4, '#4a5fd8'),
  background(dc) {
    backdrop(dc, 'gba', (g, W, H) => {
      const body = g.createLinearGradient(0, 0, W, H);
      body.addColorStop(0, '#4a3a9c');
      body.addColorStop(1, '#221855');
      g.fillStyle = body;
      g.fillRect(0, 0, W, H);
      // a translucent sheen across the plastic
      const sheen = g.createLinearGradient(0, 0, W, H * 0.6);
      sheen.addColorStop(0.2, 'rgba(255,255,255,0)');
      sheen.addColorStop(0.35, 'rgba(255,255,255,0.07)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, W, H);
      // the speaker grille, bottom right
      g.fillStyle = 'rgba(0,0,0,0.22)';
      for (let k = 0; k < 6; k++) for (let j = 0; j < 6 - k; j++) {
        g.beginPath();
        g.arc(W - 40 - j * 14 - k * 7, H - 40 - k * 12, 3, 0, Math.PI * 2);
        g.fill();
      }
    });
  },
  window: {
    border: 6, corner: 12, titleH: 24, face: '#f7f7f0', workspace: 'rgba(255,255,255,0.05)',
    frame(dc, r, active, face) {
      const g = dc.g;
      const rad = Math.max(3, 12 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      const body = g.createLinearGradient(0, r.y, 0, r.y + r.h);
      body.addColorStop(0, active ? '#6a58c8' : '#54479a');
      body.addColorStop(1, active ? '#3f3190' : '#342a74');
      g.fillStyle = body;
      g.fill();
      g.strokeStyle = active ? '#b9aeff' : 'rgba(185,174,255,0.3)';
      g.lineWidth = Math.max(1, 1.2 * dc.z);
      g.stroke();
      // the screen's dark bezel, then the bright screen
      const b = Math.max(2, 6 * dc.z);
      const th = 24 * dc.z;
      rrect(g, r.x + b, r.y + th, r.w - 2 * b, Math.max(0, r.h - th - b), Math.max(2, 5 * dc.z));
      g.fillStyle = '#1e1c26';
      g.fill();
      const k = Math.max(1.5, 3 * dc.z);
      rrect(g, r.x + b + k, r.y + th + k, r.w - 2 * b - 2 * k, Math.max(0, r.h - th - b - 2 * k), Math.max(1, 3 * dc.z));
      g.fillStyle = face;
      g.fill();
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      // the power light
      g.fillStyle = active ? '#58e070' : '#3a3560';
      g.beginPath();
      g.arc(r.x + 12 * dc.z, r.y + r.h / 2, Math.max(1.5, 2.8 * dc.z), 0, Math.PI * 2);
      g.fill();
      text(dc, r, title, PIXEL, 12.5, active ? '#f3f0ff' : '#bdb5ee', { w: 700, x: r.x + 22 * dc.z });
    },
    progress(dc, r, fill, anim) {
      bar(dc, r, fill, anim, '#dde2fb', '#4a5fd8', false);
    },
  },
};

export const ps1 = { ...makeSkin(ps1Theme), mode: 'dark' as const };
export const ps2 = makeSkin(ps2Theme);
export const ps3 = makeSkin(ps3Theme);
export const ps4 = makeSkin(ps4Theme);
export const ps5 = makeSkin(ps5Theme);
export const wii = { ...makeSkin(wiiTheme), mode: 'light' as const };
export const wiiDark = { ...makeSkin(wiiOf(true)), variantOf: 'wii', mode: 'dark' as const };
export const gamecube = makeSkin(gamecubeTheme);
export const n64 = makeSkin(n64Theme);
export const nswitch = { ...makeSkin(switchTheme), mode: 'light' as const };
export const nswitchDark = { ...makeSkin(switchOf(true)), variantOf: 'switch', mode: 'dark' as const };
export const snes = makeSkin(snesTheme);
export const gba = makeSkin(gbaTheme);
