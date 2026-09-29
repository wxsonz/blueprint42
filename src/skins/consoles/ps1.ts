import { backdrop, makeSkin, softShadow, type Palette, type Theme } from '../kit';
import { hash, rrect } from '../util';
import { cardOf, client, MONO, plastic, PS_SYM, psSymbol, RUBIK, text } from './common';

// ---------------- PlayStation ----------------

// The PlayStation (1994), from its own visual language: Teiyu Goto's plain
// light-grey console, Manabu Sakamoto's logo (a red P over an S in yellow,
// green and blue), the controller's four symbols (△ green: a viewpoint;
// ○ red and ✕ blue: yes and no; □ pink: a sheet of paper), black jewel
// cases with ridged spines, and the black boot screen.
const PS_LOGO = ['#e4002b', '#f9b51b', '#00a651', '#0072ce'];

// The PS1's look: 15-bit colour (5 bits a channel) with a 4×4 ordered
// (Bayer) dither. Applied once to a cached canvas, never per frame.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function psDither(g: CanvasRenderingContext2D): void {
  const { width: w, height: h } = g.canvas;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = (BAYER4[((y >> 1) & 3) * 4 + ((x >> 1) & 3)] / 16 - 0.5) * 8;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = Math.max(0, Math.min(255, d[o + c] + t)) & 0xf8;
    }
  }
  g.putImageData(img, 0, 0);
}

// the logo's four colours as a thin stripe
function logoStripe(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const q = w / 4;
  PS_LOGO.forEach((c, k) => {
    g.fillStyle = c;
    g.fillRect(x + k * q, y, q + 0.5, h);
  });
}


const ps1P: Palette = {
  bg: '#000000', card: '#f1f0ec', panel: '#e4e3de', line: '#9b9a95',
  fg: '#1c1c20', dim: '#55555c', faint: '#8d8b85', accent: '#0072ce', ptr: '#c9337a', ret: '#00864a', wait: '#c77d00', err: '#d9303f',
  param: '#0063b3', cell: '#d2dcf0', track: '#ffffff',
};
export const ps1Theme: Theme = {
  id: 'ps1', name: 'PlayStation', blurb: 'the grey console, the black boot screen, the four colours and △○✕□',
  p: ps1P, ui: RUBIK, mono: MONO('"Share Tech Mono"'), radius: 3, spotlight: 'rgba(0,0,0,0.65)',
  pulseColor: 'rgba(106,168,255,0.85)',
  card: cardOf(3, PS_SYM.cross),
  // storage and stations as the windows are built: bevelled grey plastic under
  // a dark title bar (the logo's colours are kept for the active window)
  panel(dc, r, head, title, live) {
    const g = dc.g;
    plastic(dc, r, Math.max(1, 3 * dc.z), '#e4e3de', '#f6f5f1', '#8f8e89');
    const bar = { x: r.x + 2 * dc.z, y: r.y + 2 * dc.z, w: r.w - 4 * dc.z, h: Math.max(6, head.h - 2 * dc.z) };
    g.fillStyle = live ? '#26262b' : '#6f6e72';
    g.fillRect(bar.x, bar.y, bar.w, bar.h);
    text(dc, bar, title.toUpperCase(), RUBIK, 10, live ? '#f2f2f2' : '#d6d6d9', { w: 600, x: bar.x + 6 * dc.z });
  },
  // the PAL BIOS: a grey blocked background, each block bevelled, then
  // quantised to 15-bit colour with the PS1's 4×4 ordered dither (once, cached)
  background(dc) {
    backdrop(dc, 'ps1-bios', (g, W, H) => {
      g.fillStyle = '#9c9b96';
      g.fillRect(0, 0, W, H);
      const T = 48;
      for (let y = 0, j = 0; y < H; y += T, j++) {
        for (let x = 0, i = 0; x < W; x += T, i++) {
          const v = 150 + Math.round(18 * hash(i * 31 + j * 17 + 5));
          const face = g.createLinearGradient(x, y, x + T, y + T);
          face.addColorStop(0, `rgb(${v + 12},${v + 12},${v + 8})`);
          face.addColorStop(1, `rgb(${v - 16},${v - 16},${v - 20})`);
          g.fillStyle = face;
          g.fillRect(x + 1, y + 1, T - 2, T - 2);
          g.fillStyle = 'rgba(255,255,255,0.45)';
          g.fillRect(x + 1, y + 1, T - 2, 1);
          g.fillRect(x + 1, y + 1, 1, T - 2);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x + 1, y + T - 2, T - 2, 1);
          g.fillRect(x + T - 2, y + 1, 1, T - 2);
        }
      }
      psDither(g);
    });
  },
  window: {
    border: 5, corner: 4, titleH: 24, face: '#f1f0ec', workspace: 'rgba(255,255,255,0.04)',
    // the console's grey plastic, bevelled, with the logo's colours under a dark title bar
    frame(dc, r, active, face, kind) {
      softShadow(dc, r, 4, 8, 'rgba(0,0,0,0.7)', 3 * dc.z);
      plastic(dc, r, Math.max(1, 4 * dc.z), active ? '#c8c7c2' : '#b0afaa', '#eeede8', '#6f6e69');
      client(dc, r, Math.max(2, 5 * dc.z), 24 * dc.z, face, 0, '#8f8e89');
      // a machine is the console's top: its vent grille down the left side
      if (kind === 'machine' && r.h > 60 * dc.z) {
        const g = dc.g;
        const x = r.x + 7 * dc.z;
        const w = Math.max(3, 6 * dc.z);
        const top = r.y + 34 * dc.z;
        const bottom = r.y + r.h - 12 * dc.z;
        const step = Math.max(3, 5 * dc.z);
        g.fillStyle = 'rgba(0,0,0,0.05)';
        g.fillRect(x - 1, top - 1, w + 2, bottom - top + 2);
        for (let y = top; y < bottom; y += step) {
          g.fillStyle = 'rgba(70,70,66,0.45)';
          g.fillRect(x, y, w, Math.max(1, step * 0.35));
          g.fillStyle = 'rgba(255,255,255,0.55)';
          g.fillRect(x, y + Math.max(1, step * 0.35), w, Math.max(0.5, step * 0.15));
        }
      }
    },
    titleBar(dc, r, title, active, buttons) {
      const g = dc.g;
      const bar = { x: r.x + 3 * dc.z, y: r.y + 3 * dc.z, w: r.w - 6 * dc.z, h: r.h - 8 * dc.z };
      g.fillStyle = active ? '#26262b' : '#57575c';
      g.fillRect(bar.x, bar.y, bar.w, bar.h);
      // the logo's four colours along its lower edge, only on the active
      // window so they mark focus instead of decorating everything
      const k = Math.max(1, 2.5 * dc.z);
      if (active) logoStripe(g, bar.x, bar.y + bar.h - k, bar.w, k);
      else (g.fillStyle = '#77767a'), g.fillRect(bar.x, bar.y + bar.h - k, bar.w, k);
      let right = bar.x + bar.w - 6 * dc.z;
      if (buttons && r.w > 110 * dc.z) {
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
    // an old PC case's front panel: a green power light, an amber disk
    // light that flickers while it works, and a segmented load meter
    progress(dc, r, fill, anim) {
      const g = dc.g;
      rrect(g, r.x, r.y, r.w, r.h, Math.max(1, 2 * dc.z));
      g.fillStyle = '#2b2b30';
      g.fill();
      g.strokeStyle = '#6f6e69';
      g.lineWidth = 1;
      g.stroke();
      const cy = r.y + r.h / 2;
      const d = Math.max(1.5, r.h * 0.2);
      const led = (x: number, on: boolean, c: string) => {
        if (on) {
          g.fillStyle = c + '55';
          g.beginPath(); g.arc(x, cy, d * 2, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = on ? c : '#4a4a50';
        g.beginPath(); g.arc(x, cy, d, 0, Math.PI * 2); g.fill();
      };
      const pad = r.h * 0.5;
      led(r.x + pad, true, '#3dff6a');
      const disk = anim && hash(Math.floor(dc.time * 14)) > 0.35;
      led(r.x + pad + d * 5, disk || (!anim && fill > 0 && fill < 1), '#ffb020');
      // the load meter
      const x0 = r.x + pad + d * 9;
      const w = r.x + r.w - pad * 0.6 - x0;
      const n = Math.max(4, Math.floor(w / Math.max(3, 6 * dc.z)));
      const seg = w / n;
      const level = anim ? 0.35 + 0.5 * Math.abs(Math.sin(dc.time * 2.3)) + 0.1 * hash(Math.floor(dc.time * 9)) : fill;
      const lit = Math.round(n * Math.min(1, level));
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1);
        const c = u < 0.6 ? '#3dff6a' : u < 0.85 ? '#ffb020' : '#ff4040';
        g.fillStyle = k < lit ? c : '#3c3c42';
        g.fillRect(x0 + k * seg + 1, r.y + r.h * 0.28, Math.max(1, seg - 2), r.h * 0.44);
      }
    },
  },
};

export const ps1 = { ...makeSkin(ps1Theme), mode: 'dark' as const };
