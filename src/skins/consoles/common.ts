import { plainCard, type Theme } from '../kit';
import type { Dc, Rect } from '../types';
import { fitText, rrect } from '../util';

export const F = (family: string) => (px: number, w = 400) => `${w} ${px}px ${family}`;
export const RUBIK = F('Rubik, "Open Sans", sans-serif');
export const EXO = F('"Exo 2", "Open Sans", sans-serif');
export const NUNITO = F('Nunito, "Open Sans", sans-serif');
export const JOST = F('Jost, "Open Sans", sans-serif');
export const RODIN = F('"M PLUS 1p", "Open Sans", sans-serif'); // the Wii's FOT-Rodin
export const SST = F('"Source Sans 3", "Open Sans", sans-serif'); // PlayStation's SST
export const RODIN_R = F('"M PLUS Rounded 1c", "Open Sans", sans-serif'); // the PS3's SCE Rodin
export const MONO = (family: string) => (px: number, w = 400) => `${w >= 600 ? 700 : 400} ${px}px ${family}, "DejaVu Sans Mono", monospace`;


export function text(dc: Dc, r: Rect, s: string, font: (px: number, w?: number) => string, px: number, color: string, opts: { w?: number; align?: CanvasTextAlign; x?: number; right?: number; halo?: string } = {}): void {
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
export function plastic(dc: Dc, r: Rect, rad: number, face: string, light: string, dark: string): void {
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

export function client(dc: Dc, r: Rect, b: number, th: number, face: string, rad = 0, edge?: string): Rect {
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

export function bar(dc: Dc, r: Rect, fill: number, anim: boolean, track: string, color: string, round = true): void {
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
export function cardOf(radius: number, ring: string) {
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


export const PS_SYM = { tri: '#3ed6a0', circ: '#ff4d5e', cross: '#6aa8ff', sq: '#ff85c0' };
export function psSymbol(g: CanvasRenderingContext2D, kind: keyof typeof PS_SYM, x: number, y: number, s: number): void {
  g.beginPath();
  if (kind === 'tri') (g.moveTo(x, y - s), g.lineTo(x + s * 0.95, y + s * 0.7), g.lineTo(x - s * 0.95, y + s * 0.7), g.closePath());
  else if (kind === 'circ') g.arc(x, y, s, 0, Math.PI * 2);
  else if (kind === 'cross') (g.moveTo(x - s, y - s), g.lineTo(x + s, y + s), g.moveTo(x + s, y - s), g.lineTo(x - s, y + s));
  else g.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
  g.stroke();
}
export const ps2Still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export type Rgb = [number, number, number];
export const toward = (c: Rgb, to: number, f: number): Rgb => c.map((v) => v + (to - v) * f) as Rgb;
