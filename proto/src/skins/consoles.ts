// Console skins: PlayStation 1–5, Wii, GameCube, Nintendo 64, Switch, SNES
// and Game Boy Advance. Each is a theme for the kit (`makeSkin`): a
// wallpaper drawn once per size, window chrome in the console's own style,
// and a palette. Geometry is the engine's; only the look changes.
import { backdrop, makeSkin, plainCard, softShadow, type Palette, type Theme } from './kit';
import type { Dc, Rect } from './types';
import { fitText, hash, rrect } from './util';

const F = (family: string) => (px: number, w = 400) => `${w} ${px}px ${family}`;
const RUBIK = F('Rubik, "Open Sans", sans-serif');
const EXO = F('"Exo 2", "Open Sans", sans-serif');
const NUNITO = F('Nunito, "Open Sans", sans-serif');
const JOST = F('Jost, "Open Sans", sans-serif');
const CHAKRA = F('"Chakra Petch", "Open Sans", sans-serif');
const PIXEL = F('"Pixelify Sans", "Open Sans", sans-serif');
const RODIN = F('"M PLUS 1p", "Open Sans", sans-serif'); // the Wii's FOT-Rodin
const SST = F('"Source Sans 3", "Open Sans", sans-serif'); // PlayStation's SST
const RODIN_R = F('"M PLUS Rounded 1c", "Open Sans", sans-serif'); // the PS3's SCE Rodin
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
  id: 'ps1', name: 'PlayStation', blurb: 'the BIOS menu: the purple sphere, grey memory-card panels, △○✕□',
  p: ps1P, ui: RUBIK, mono: MONO('"Share Tech Mono"'), radius: 3, spotlight: 'rgba(0,0,8,0.62)',
  pulseColor: 'rgba(106,168,255,0.85)',
  card: cardOf(3, PS_SYM.cross),
  background(dc) {
    // the BIOS menu: a big glowing purple-blue sphere behind everything, on near-black
    backdrop(dc, 'ps1', (g, W, H) => {
      g.fillStyle = '#05050b';
      g.fillRect(0, 0, W, H);
      const cx = W * 0.5;
      const cy = H * 0.52;
      const R = Math.min(W, H) * 0.46;
      const halo = g.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.5);
      halo.addColorStop(0, 'rgba(90,70,200,0.25)');
      halo.addColorStop(1, 'rgba(90,70,200,0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);
      const ball = g.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
      ball.addColorStop(0, '#b9a8ff');
      ball.addColorStop(0.25, '#6a54d6');
      ball.addColorStop(0.7, '#2a2390');
      ball.addColorStop(1, '#120f45');
      g.fillStyle = ball;
      g.beginPath();
      g.arc(cx, cy, R, 0, Math.PI * 2);
      g.fill();
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

// PS3, the XrossMediaBar: the backdrop's colour follows the month (walking
// from one month's colour to the next, as the console does), a ribbon of
// thin light waves across it, items with no window chrome at all: white
// rounded Rodin type on soft dark panels, the selected one on a soft white
// highlight band.
export const XMB_MONTHS = ['#b8bcc4', '#c9a634', '#69a83a', '#e083b0', '#2f9e4e', '#8a5cc2', '#23a4a8', '#2f7fd0', '#b0409f', '#e39a22', '#8a5a34', '#c22e2e'];
function mix(hex: string, to: number, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(v + (to - v) * f);
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
export function xmbColour(d = new Date()): { top: string; mid: string; bot: string } {
  const m = d.getMonth();
  const days = new Date(d.getFullYear(), m + 1, 0).getDate();
  const f = (d.getDate() - 1) / days; // part of the way to next month's colour
  const a = parseInt(XMB_MONTHS[m].slice(1), 16);
  const b = parseInt(XMB_MONTHS[(m + 1) % 12].slice(1), 16);
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - f) + ((b >> sh) & 255) * f);
  const hex = `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  return { top: mix(hex, 255, 0.12), mid: hex, bot: mix(hex, 0, 0.62) };
}
const ps3P: Palette = {
  bg: '#2f7fd0', card: 'rgba(0,0,0,0.3)', panel: 'rgba(0,0,0,0.42)', line: 'rgba(255,255,255,0.22)',
  fg: '#ffffff', dim: 'rgba(255,255,255,0.72)', faint: 'rgba(255,255,255,0.45)', accent: '#ffffff', ptr: '#ffe08a', ret: '#b8ffb0', wait: '#ffe08a', err: '#ff9a9a',
  param: '#e6f2ff', cell: 'rgba(255,255,255,0.16)', track: 'rgba(0,0,0,0.3)',
};
export const ps3Theme: Theme = {
  id: 'ps3', name: 'PlayStation 3', blurb: "the XMB: this month's colour, the wave, white type on nothing",
  p: ps3P, ui: RODIN_R, mono: MONO('"JetBrains Mono"'), radius: 6, spotlight: 'rgba(0,0,0,0.45)',
  pulseColor: 'rgba(255,255,255,0.95)',
  card(dc, r, o) {
    const g = dc.g;
    rrect(g, r.x, r.y, r.w, r.h, Math.max(2, 6 * dc.z));
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(0,0,0,0.12)' : o.kind === 'frame' || o.kind === 'plate' ? ps3P.panel : ps3P.card;
      g.fill();
    }
    if (o.glow) {
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = Math.max(1.5, 2 * dc.z);
      g.stroke();
    }
  },
  background(dc) {
    const c = xmbColour();
    backdrop(dc, `ps3-${c.mid}`, (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, c.top);
      sky.addColorStop(0.45, c.mid);
      sky.addColorStop(1, c.bot);
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      // the ribbon: a bundle of thin light waves, brighter where they gather
      const band = g.createLinearGradient(0, H * 0.4, 0, H * 0.72);
      band.addColorStop(0, 'rgba(255,255,255,0)');
      band.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      band.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = band;
      g.fillRect(0, H * 0.4, W, H * 0.32);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(255,255,255,${0.05 + 0.2 * hash(k * 7 + 3)})`;
        g.lineWidth = 0.6 + 1.4 * hash(k * 11 + 1);
        g.beginPath();
        for (let x = -10; x <= W + 10; x += 10) {
          const u = x / W;
          const y = H * 0.56 + Math.sin(u * Math.PI * 2 * 0.85 + k * 0.16) * H * (0.06 + k * 0.0035) + Math.sin(u * Math.PI * 4.5 + k * 0.35) * H * 0.018;
          if (x < 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    });
  },
  window: {
    border: 0, corner: 6, titleH: 28, face: 'rgba(0,0,0,0.32)', workspace: 'rgba(0,0,0,0.08)',
    frame(dc, r, active, face) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(2, 6 * dc.z));
      g.fillStyle = face;
      g.fill();
    },
    titleBar(dc, r, title, active) {
      const g = dc.g;
      if (active) {
        // the XMB's highlight: a soft white band behind the selected item
        const hl = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
        hl.addColorStop(0, 'rgba(255,255,255,0.32)');
        hl.addColorStop(0.55, 'rgba(255,255,255,0.12)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = hl;
        g.fillRect(r.x, r.y + r.h * 0.12, r.w, r.h * 0.76);
      }
      text(dc, r, title, RODIN_R, active ? 15 : 13.5, active ? '#ffffff' : 'rgba(255,255,255,0.72)', { w: 400, x: r.x + 10 * dc.z, halo: active ? 'rgba(255,255,255,0.22)' : undefined });
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      g.fillStyle = 'rgba(255,255,255,0.28)';
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

// PS4, after a recreation's measured CSS (d4v1-sudo/Ps4-UI): the bright
// #0e6cc4 blue of the default theme with soft light waves and dust, square
// content tiles, the focused one in a 3px white border, titles on a
// translucent white strip (rgba(255,255,255,.2)), SST at light weights.
const ps4P: Palette = {
  bg: '#0e6cc4', card: 'rgba(4,34,84,0.55)', panel: 'rgba(3,28,70,0.72)', line: 'rgba(255,255,255,0.28)',
  fg: '#ffffff', dim: '#cfe0f5', faint: '#8fb0d8', accent: '#ffffff', ptr: '#ffd27a', ret: '#8ef0b8', wait: '#ffd166', err: '#ff8080',
  param: '#bfe0ff', cell: 'rgba(255,255,255,0.18)', track: 'rgba(0,20,60,0.45)',
};
export const ps4Theme: Theme = {
  id: 'ps4', name: 'PlayStation 4', blurb: 'the home screen: bright blue, square tiles, a white frame on focus',
  p: ps4P, ui: SST, mono: MONO('"JetBrains Mono"'), radius: 1, spotlight: 'rgba(0,20,60,0.5)',
  pulseColor: 'rgba(255,255,255,0.9)',
  card(dc, r, o) {
    const g = dc.g;
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(255,255,255,0.05)' : o.kind === 'frame' || o.kind === 'plate' ? ps4P.panel : ps4P.card;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    g.strokeStyle = o.glow ? '#ffffff' : 'rgba(255,255,255,0.22)';
    g.lineWidth = o.glow ? Math.max(2, 3 * dc.z) : 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  },
  background(dc) {
    backdrop(dc, 'ps4', (g, W, H) => {
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#1b86e0');
      sky.addColorStop(0.55, '#0e6cc4');
      sky.addColorStop(1, '#0a4e98');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      // soft bands of light drifting across, then specks of dust
      for (let k = 0; k < 5; k++) {
        const y0 = H * (0.35 + k * 0.08);
        const band = g.createLinearGradient(0, y0 - H * 0.08, 0, y0 + H * 0.08);
        band.addColorStop(0, 'rgba(255,255,255,0)');
        band.addColorStop(0.5, `rgba(255,255,255,${0.05 + 0.02 * k})`);
        band.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = band;
        g.beginPath();
        g.moveTo(0, y0);
        for (let x = 0; x <= W; x += W / 30) g.lineTo(x, y0 + Math.sin((x / W) * Math.PI * 2 + k) * H * 0.05);
        g.lineTo(W, y0 + H * 0.1);
        g.lineTo(0, y0 + H * 0.1);
        g.closePath();
        g.fill();
      }
      for (let k = 0; k < 90; k++) {
        g.fillStyle = `rgba(255,255,255,${0.15 + 0.35 * hash(k * 3 + 1)})`;
        const s = 1 + 1.5 * hash(k * 7 + 2);
        g.fillRect(W * hash(k * 11 + 5), H * hash(k * 17 + 3), s, s);
      }
    });
  },
  window: {
    border: 0, corner: 0, titleH: 28, face: 'rgba(3,30,76,0.8)', workspace: 'rgba(255,255,255,0.05)',
    frame(dc, r, active, face) {
      const g = dc.g;
      softShadow(dc, r, 1, 10, 'rgba(0,15,50,0.45)', 3 * dc.z);
      g.fillStyle = face;
      g.fillRect(r.x, r.y, r.w, r.h);
      // the title strip: translucent white, as under a focused tile
      g.fillStyle = active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';
      g.fillRect(r.x, r.y, r.w, 28 * dc.z);
      if (active) {
        g.strokeStyle = 'rgba(255,255,255,0.25)';
        g.lineWidth = Math.max(3, 8 * dc.z);
        g.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
        g.strokeStyle = '#ffffff';
        g.lineWidth = Math.max(2, 3 * dc.z);
        g.strokeRect(r.x, r.y, r.w, r.h);
      }
    },
    titleBar(dc, r, title, active) {
      text(dc, r, title, SST, 14, active ? '#ffffff' : '#cfe0f5', { w: active ? 400 : 300, x: r.x + 10 * dc.z });
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      const h = Math.max(2, Math.min(r.h, 5 * dc.z));
      const y = r.y + (r.h - h) / 2;
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(r.x, y, r.w, h);
      const x = anim ? r.x + r.w * (((dc.time * 0.5) % 1.3) - 0.3) : r.x;
      const w = anim ? r.w * 0.3 : r.w * fill;
      const a = Math.max(r.x, x);
      const e = Math.min(r.x + r.w, x + w);
      if (e > a) (g.fillStyle = '#ffffff'), g.fillRect(a, y, e - a, h);
    },
  },
};

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

// ---------------- Nintendo ----------------

// The Wii Menu, after a recreation's measured tokens (zuvv/WiiMenu): a light
// blue desktop of fine lines, channels as glossy white 4:3 bezels (14px
// corners, #ccd5da edge) around a recessed "screen", grey #55636b labels,
// the Wii blue #35b4e5 ring on the one you point at.
function wiiOf(dark: boolean): Theme {
  const WII = '#35b4e5';
  const p: Palette = dark ? {
    bg: '#1a2024', card: '#2b3238', panel: '#252b30', line: '#46515a',
    fg: '#e8eef1', dim: '#a3b0b8', faint: '#6d7a83', accent: WII, ptr: '#ff9f43', ret: '#6bbf3a', wait: '#ffc94d', err: '#ff6464',
    param: '#7fd6f2', cell: '#1d3f4d', track: '#1f2529',
  } : {
    bg: '#dcecf3', card: '#ffffff', panel: '#f6f8f9', line: '#ccd5da',
    fg: '#3f4a51', dim: '#6b7980', faint: '#8a969c', accent: '#189fd6', ptr: '#e0782b', ret: '#4f9e22', wait: '#d69a00', err: '#e04848',
    param: '#0b6a9c', cell: '#d8f0fa', track: '#eef1f3',
  };
  const bezelTop = dark ? '#3a434a' : '#ffffff';
  const bezelBot = dark ? '#2c3439' : '#f2f5f7';
  const edge = dark ? '#4c5861' : '#ccd5da';
  return {
    id: dark ? 'wii-dark' : 'wii', name: 'Wii', blurb: dark ? 'the Wii Menu after dark' : 'the Wii Menu: glossy channels on fine blue lines',
    p, ui: RODIN, mono: MONO('"JetBrains Mono"'), radius: 10, spotlight: dark ? 'rgba(0,0,0,0.55)' : 'rgba(200,222,232,0.6)',
    pulseColor: 'rgba(53,180,229,0.9)',
    card(dc, r, o) {
      const g = dc.g;
      const rad = Math.max(2, 9 * dc.z);
      rrect(g, r.x, r.y, r.w, r.h, rad);
      if (o.fill !== 'transparent') {
        const gl = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        gl.addColorStop(0, bezelTop);
        gl.addColorStop(1, bezelBot);
        g.fillStyle = o.kind === 'wall' ? (dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.35)') : gl;
        g.fill();
      }
      g.strokeStyle = o.glow ? WII : edge;
      g.lineWidth = o.glow ? Math.max(1.5, 2 * dc.z) : 1;
      g.stroke();
    },
    background(dc) {
      backdrop(dc, dark ? 'wii-dark' : 'wii', (g, W, H) => {
        const bg = g.createLinearGradient(0, 0, 0, H);
        if (dark) (bg.addColorStop(0, '#20282d'), bg.addColorStop(1, '#141a1e'));
        else (bg.addColorStop(0, '#eef7fa'), bg.addColorStop(0.5, '#dcecf3'), bg.addColorStop(1, '#c9e2ec'));
        g.fillStyle = bg;
        g.fillRect(0, 0, W, H);
        // the fine horizontal lines of the Wii desktop
        g.fillStyle = dark ? 'rgba(120,170,190,0.07)' : 'rgba(188,215,226,0.45)';
        for (let y = 0; y < H; y += 5) g.fillRect(0, y, W, 1);
      });
    },
    window: {
      border: 5, corner: 14, titleH: 26, face: dark ? '#20262b' : '#fbfcfd', workspace: dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.4)',
      frame(dc, r, active, face) {
        const g = dc.g;
        const rad = Math.max(3, 14 * dc.z);
        softShadow(dc, r, 14, 9, dark ? 'rgba(0,0,0,0.55)' : 'rgba(55,95,125,0.35)', 3 * dc.z);
        // the glossy bezel
        rrect(g, r.x, r.y, r.w, r.h, rad);
        const gl = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        gl.addColorStop(0, bezelTop);
        gl.addColorStop(0.6, dark ? '#343c42' : '#ffffff');
        gl.addColorStop(1, bezelBot);
        g.fillStyle = gl;
        g.fill();
        g.strokeStyle = edge;
        g.lineWidth = 1;
        g.stroke();
        // the recessed "screen" set into it
        const b = Math.max(2, 5 * dc.z);
        const th = 26 * dc.z;
        const sc = { x: r.x + b, y: r.y + th, w: r.w - 2 * b, h: Math.max(0, r.h - th - b) };
        rrect(g, sc.x, sc.y, sc.w, sc.h, Math.max(2, 9 * dc.z));
        g.fillStyle = face;
        g.fill();
        g.strokeStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(30,60,80,0.12)';
        g.stroke();
        const inset = g.createLinearGradient(0, sc.y, 0, sc.y + Math.min(sc.h, 10 * dc.z));
        inset.addColorStop(0, dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.07)');
        inset.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = inset;
        g.fill();
        if (active) {
          // pointed at: the Wii-blue ring, lifted
          rrect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, rad + 2);
          g.strokeStyle = dark ? WII : '#8ad3ef';
          g.lineWidth = Math.max(2, 2.5 * dc.z);
          g.stroke();
        }
      },
      titleBar(dc, r, title, active) {
        // the channel's label: grey, centred
        text(dc, r, title, RODIN, 12.5, active ? (dark ? '#ffffff' : '#3f4a51') : dark ? '#a3b0b8' : '#55636b', { w: 700, align: 'center' });
      },
      progress(dc, r, fill, anim) {
        const g = dc.g;
        rrect(g, r.x, r.y, r.w, r.h, r.h / 2);
        g.fillStyle = dark ? '#1b2125' : '#e3e9ed';
        g.fill();
        g.strokeStyle = dark ? '#3a444b' : '#ccd4d9';
        g.lineWidth = 1;
        g.stroke();
        const x = anim ? r.x + r.w * (((dc.time * 0.45) % 1.3) - 0.3) : r.x;
        const w = anim ? r.w * 0.3 : r.w * fill;
        const a = Math.max(r.x, x);
        const e = Math.min(r.x + r.w, x + w);
        if (e - a < 2) return;
        rrect(g, a, r.y + 1, e - a, r.h - 2, (r.h - 2) / 2);
        const blue = g.createLinearGradient(0, r.y, 0, r.y + r.h);
        blue.addColorStop(0, '#4fd0ff');
        blue.addColorStop(0.5, WII);
        blue.addColorStop(1, '#189fd6');
        g.fillStyle = blue;
        g.fill();
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
  id: 'gamecube', name: 'GameCube', blurb: 'the IPL menu: black, the violet cube, glassy purple panels',
  p: gcP, ui: JOST, mono: MONO('"JetBrains Mono"'), radius: 8, spotlight: 'rgba(8,2,30,0.58)',
  pulseColor: 'rgba(163,147,255,0.9)',
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
