import type { CapInfo, Dc, PlateRole, Pt, Rect } from './types';

export function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number | [number, number, number, number]): void {
  const [a, b, c, d] = typeof r === 'number' ? [r, r, r, r] : r;
  g.beginPath();
  g.moveTo(x + a, y);
  g.lineTo(x + w - b, y);
  g.arcTo(x + w, y, x + w, y + b, b);
  g.lineTo(x + w, y + h - c);
  g.arcTo(x + w, y + h, x + w - c, y + h, c);
  g.lineTo(x + d, y + h);
  g.arcTo(x, y + h, x, y + h - d, d);
  g.lineTo(x, y + a);
  g.arcTo(x, y, x + a, y, a);
  g.closePath();
}

export function polyline(g: CanvasRenderingContext2D, pts: Pt[]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
}

export function strokeLine(g: CanvasRenderingContext2D, pts: Pt[], w: number, color: string, dash?: number[], offset = 0): void {
  polyline(g, pts);
  g.lineWidth = w;
  g.strokeStyle = color;
  g.setLineDash(dash ?? []);
  g.lineDashOffset = offset;
  g.stroke();
  g.setLineDash([]);
}

// Text that shrinks to fit a width (down to a floor), then ellipsises.
// Measuring is the expensive part and the same labels come back every
// frame, so results (and the font they settled on) are remembered.
const fitMemo = new Map<string, { text: string; font: string }>();
export function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number, minPx = 7): string {
  // sizes in half pixels (as the grid draws them): a zoom then hits the memo
  px = Math.round(px * 2) / 2;
  const key = `${font(px)}|${Math.round(maxW * 2)}|${minPx}|${text}`;
  const hit = fitMemo.get(key);
  if (hit) {
    g.font = hit.font;
    return hit.text;
  }
  const out = fitTextSlow(g, text, font, px, maxW, minPx);
  if (fitMemo.size > 6000) fitMemo.clear();
  fitMemo.set(key, { text: out, font: g.font });
  return out;
}

function fitTextSlow(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number, minPx: number): string {
  let size = px;
  g.font = font(size);
  while (g.measureText(text).width > maxW && size > minPx) {
    size -= 0.5;
    g.font = font(size);
  }
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

// Arc-length walker over a polyline, for chevrons, dots and arrowheads.
// Opt-in: the same polyline with every bend replaced by a circular fillet of
// radius `r` (shrunk so neighbouring bends never overlap: at most half of
// either adjacent segment). Arcs are sampled every ~7 degrees, so a `Walk`
// over the result turns smoothly, and a belt stroked from it matches its
// riders. The result is cached per input array and radius.
const filleted = new WeakMap<Pt[], { r: number; out: Pt[] }>();
export function roundPts(pts: Pt[], r: number): Pt[] {
  if (r < 0.5 || pts.length < 3) return pts;
  const hit = filleted.get(pts);
  if (hit && hit.r === r) return hit.out;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i + 1 < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const ax = (px - x) / l1, ay = (py - y) / l1; // toward the previous point
    const bx = (nx - x) / l2, by = (ny - y) / l2; // toward the next
    const cos = Math.max(-1, Math.min(1, ax * bx + ay * by));
    const ang = Math.acos(cos); // interior angle: PI is straight, 0 a U-turn
    if (ang > Math.PI - 0.02 || ang < 0.02) {
      out.push(pts[i]);
      continue;
    }
    const half = ang / 2;
    const t = Math.min(r / Math.tan(half), l1 / 2, l2 / 2); // tangent length
    const rad = t * Math.tan(half);
    const p0x = x + ax * t, p0y = y + ay * t;
    const p1x = x + bx * t, p1y = y + by * t;
    // Circle centre lies on the bisector, rad / sin(half) from the corner.
    let mx = ax + bx, my = ay + by;
    const ml = Math.hypot(mx, my) || 1;
    mx /= ml;
    my /= ml;
    const cx = x + mx * (rad / Math.sin(half)), cy = y + my * (rad / Math.sin(half));
    let a0 = Math.atan2(p0y - cy, p0x - cx);
    let a1 = Math.atan2(p1y - cy, p1x - cx);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const n = Math.max(2, Math.ceil(Math.abs(da) / 0.125));
    for (let k = 0; k <= n; k++) {
      const a = a0 + (da * k) / n;
      out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
  }
  out.push(pts[pts.length - 1]);
  filleted.set(pts, { r, out });
  return out;
}

export class Walk {
  segs: { x: number; y: number; dx: number; dy: number; len: number; at: number }[] = [];
  length = 0;
  // `round` (px, optional): fillet the bends with that radius (see roundPts).
  constructor(pts: Pt[], round = 0) {
    if (round > 0) pts = roundPts(pts, round);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x, y] = pts[i];
      const [x2, y2] = pts[i + 1];
      const len = Math.hypot(x2 - x, y2 - y);
      if (len < 1e-6) continue;
      this.segs.push({ x, y, dx: (x2 - x) / len, dy: (y2 - y) / len, len, at: this.length });
      this.length += len;
    }
  }
  at(d: number): { x: number; y: number; dx: number; dy: number } {
    d = Math.max(0, Math.min(d, this.length));
    for (const s of this.segs) {
      if (d <= s.at + s.len) {
        const u = d - s.at;
        return { x: s.x + s.dx * u, y: s.y + s.dy * u, dx: s.dx, dy: s.dy };
      }
    }
    const s = this.segs[this.segs.length - 1] ?? { x: 0, y: 0, dx: 1, dy: 0, len: 0, at: 0 };
    return { x: s.x + s.dx * s.len, y: s.y + s.dy * s.len, dx: s.dx, dy: s.dy };
  }
}

export function arrowHead(g: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, size: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - dx * size - dy * size * 0.6, y - dy * size + dx * size * 0.6);
  g.lineTo(x - dx * size + dy * size * 0.6, y - dy * size - dx * size * 0.6);
  g.closePath();
  g.fill();
}

// Classic 3D bevel: light on top/left, dark on bottom/right.
export function bevel(g: CanvasRenderingContext2D, r: Rect, outerLight: string, outerDark: string, innerLight?: string, innerDark?: string): void {
  const { x, y, w, h } = r;
  const edge = (c: string, o: number, topLeft: boolean) => {
    g.fillStyle = c;
    if (topLeft) {
      g.fillRect(x + o, y + o, w - 2 * o - 1, 1);
      g.fillRect(x + o, y + o, 1, h - 2 * o - 1);
    } else {
      g.fillRect(x + o, y + h - o - 1, w - 2 * o, 1);
      g.fillRect(x + w - o - 1, y + o, 1, h - 2 * o);
    }
  };
  edge(outerLight, 0, true);
  edge(outerDark, 0, false);
  if (innerLight) edge(innerLight, 1, true);
  if (innerDark) edge(innerDark, 1, false);
}

export const snap = (v: number) => Math.round(v) + 0.5;

export function snapRect(r: Rect): Rect {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y };
}

// Stable pseudo-random in [0,1) from an integer, for spectrum bars etc.
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function scale(dc: Dc, px: number, min = 0): number {
  return Math.max(min, px * dc.z);
}

// Last few lines a program printed, for the process terminal.
// The program's command line as a shell would echo it: `a.out 200 "two words"`.
export function argLine(args: string[] | undefined, prog = 'a.out'): string {
  const q = (a: string) => (a === '' || /[\s"'\\$`]/.test(a) ? `"${a.replace(/(["\\$`])/g, '\\$1')}"` : a);
  return [prog, ...(args ?? []).map(q)].join(' ');
}

// How many lines of output there are before the last n (0 if they all fit).
export function hiddenLines(out: string | undefined, n: number): number {
  if (!out) return 0;
  const lines = out.replace(/\n$/, '').split('\n');
  return Math.max(0, lines.length - n);
}

export function tailLines(out: string | undefined, n: number): string[] {
  if (!out) return [];
  const lines = out.replace(/\n$/, '').split('\n');
  return lines.slice(-n);
}

// Middle of a belt's middle leg: where a trunk shows how many calls it carries.
export function beltMid(pts: Pt[]): Pt {
  const w = new Walk(pts);
  const p = w.at(w.length / 2);
  return [p.x, p.y];
}

// The last path segment of a project-relative file name, for tight labels.
export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
export const dirName = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

// Corner brackets around a rect, pushed out by `out` px: the focus-mode mark.
export function brackets(g: CanvasRenderingContext2D, r: Rect, out: number, len: number): void {
  const x0 = r.x - out, y0 = r.y - out, x1 = r.x + r.w + out, y1 = r.y + r.h + out;
  g.beginPath();
  g.moveTo(x0, y0 + len); g.lineTo(x0, y0); g.lineTo(x0 + len, y0);
  g.moveTo(x1 - len, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + len);
  g.moveTo(x1, y1 - len); g.lineTo(x1, y1); g.lineTo(x1 - len, y1);
  g.moveTo(x0 + len, y1); g.lineTo(x0, y1); g.lineTo(x0, y1 - len);
  g.stroke();
}

// Text cut to a width at the current font (never shrunk), remembered.
const cutMemo = new Map<string, string>();
export function cutText(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (maxW <= 0) return '';
  const key = `${g.font}|${Math.round(maxW)}|${text}`;
  const hit = cutMemo.get(key);
  if (hit !== undefined) return hit;
  let t = text;
  if (g.measureText(t).width > maxW) {
    while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    t += '…';
  }
  if (cutMemo.size > 6000) cutMemo.clear();
  cutMemo.set(key, t);
  return t;
}

// A storage row's past values, right-aligned so they end just before its
// current value (at xRight), newest nearest: "? → 4 → " then the value. Drops
// the oldest ones that don't fit in maxW. The caller sets the colour.
export function pastText(g: CanvasRenderingContext2D, past: string[] | undefined, maxW: number): string {
  if (!past?.length || maxW < 16) return '';
  let text = '';
  for (let k = past.length - 1; k >= 0; k--) {
    const next = `${past[k]} → ${text}`;
    if (g.measureText(next).width > maxW) break;
    text = next;
  }
  return text;
}
// How a skin draws the bar of a capacity: its width and height for a text
// size, and the drawing (centred on y). Skins without one get the plain bar.
export interface CapLook {
  w?: (size: number, c: CapInfo) => number;
  h?: (size: number) => number;
  draw: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: CapInfo, col: string, track: string) => void;
}
const plainBar: CapLook['draw'] = (g, x, y, w, h, c, col, track) => {
  g.fillStyle = track;
  g.fillRect(x, y - h / 2, w, h);
  g.fillStyle = col;
  g.fillRect(x, y - h / 2, w * Math.min(1, c.used / c.max), h);
};

// A Norm limit: `3/5` (and its unit) with a small bar under it, right-
// aligned at xRight, centred on y. Faint while there's room, `full` at the
// limit, `over` past it (norminette would reject it). Returns its width.
export function drawCap(g: CanvasRenderingContext2D, c: CapInfo, xRight: number, y: number, o: { font: (px: number) => string; size: number; faint: string; full: string; over: string; track: string; look?: CapLook }): number {
  const col = c.used > c.max ? o.over : c.used === c.max ? o.full : o.faint;
  g.font = o.font(o.size);
  const text = `${c.used}/${c.max}${c.unit ? ` ${c.unit}` : ''}`;
  const tw = g.measureText(text).width;
  const bw = o.look?.w?.(o.size, c) ?? Math.max(14, o.size * 2.2);
  const bh = o.look?.h?.(o.size) ?? Math.max(2, o.size * 0.22);
  const gap = o.size * 0.5;
  const align = g.textAlign;
  const base = g.textBaseline;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillStyle = col;
  g.fillText(text, xRight, y);
  (o.look?.draw ?? plainBar)(g, xRight - tw - gap - bw, y, bw, bh, c, col, o.track);
  g.textAlign = align;
  g.textBaseline = base;
  return tw + gap + bw;
}

// A plate's outline by role: an argument is a hexagon (pointed ends), a
// return value the reverse (notched ends), anything else a pill. Neither
// points a way: a belt can run in any direction.
export function platePath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, role: PlateRole | undefined, radius = h / 2): void {
  const l = x - w / 2, r = x + w / 2, t = y - h / 2, b = y + h / 2, k = h * (role === 'ret' ? 0.3 : 0.42);
  g.beginPath();
  if (role === 'arg') {
    g.moveTo(l + k, t); g.lineTo(r - k, t); g.lineTo(r, y); g.lineTo(r - k, b); g.lineTo(l + k, b); g.lineTo(l, y);
  } else if (role === 'ret') {
    g.moveTo(l, t); g.lineTo(r, t); g.lineTo(r - k, y); g.lineTo(r, b); g.lineTo(l, b); g.lineTo(l + k, y);
  } else return rrect(g, l, t, w, h, radius);
  g.closePath();
}

// How a skin draws a pointer's address tag: the room it leaves for the text
// on each side, and the plate and marker (the text is drawn over it, in the
// colour it returns, else `col`). Skins without one get the plain tag.
export interface TagLook {
  padL: (h: number) => number;
  padR: (h: number) => number;
  draw: (g: CanvasRenderingContext2D, x: number, top: number, w: number, h: number, col: string, o: { radius: number; fill: string | null }) => string | void;
}
const plainTag: TagLook = {
  padL: (h) => h * 0.7 + h * 0.32,
  padR: (h) => h * 0.35,
  draw(g, x, top, w, h, col, o) {
    const padX = h * 0.35;
    const dot = h * 0.16;
    rrect(g, x + 0.5, top + 0.5, w - 1, h - 1, Math.min(o.radius, h / 2));
    if (o.fill) {
      g.fillStyle = o.fill;
      g.fill();
    } else {
      g.strokeStyle = col;
      g.lineWidth = 1;
      g.stroke();
    }
    g.fillStyle = col;
    g.beginPath();
    g.arc(x + padX + dot, top + h / 2, dot, 0, Math.PI * 2);
    g.fill();
  },
};

// A pointer's address tag, right-aligned at x (left-aligned with `left`), centred on y: a
// small plate with a socket dot (an address, not a value) and what lives
// there. Returns its width. `fill` null: an outline in `col`; else a shade.
export function drawTag(g: CanvasRenderingContext2D, text: string, xAt: number, y: number, maxW: number, o: { font: (px: number) => string; size: number; col: string; fill: string | null; h: number; radius: number; left?: boolean; look?: TagLook }): number {
  const look = o.look ?? plainTag;
  const padL = look.padL(o.h);
  const padR = look.padR(o.h);
  const t = fitText(g, text, o.font, o.size, maxW - padL - padR, 6);
  const w = g.measureText(t).width + padL + padR;
  const x = o.left ? xAt : xAt - w;
  const top = y - o.h / 2;
  g.save();
  const ink = look.draw(g, x, top, w, o.h, o.col, { radius: o.radius, fill: o.fill });
  g.restore();
  g.fillStyle = ink || o.col;
  const align = g.textAlign;
  const base = g.textBaseline;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(t, x + padL, y + 1);
  g.textAlign = align;
  g.textBaseline = base;
  return w;
}

export function drawPast(g: CanvasRenderingContext2D, past: string[] | undefined, xRight: number, y: number, maxW: number): void {
  const text = pastText(g, past, maxW);
  if (!text) return;
  g.save();
  g.textAlign = 'right';
  g.fillText(text, xRight, y);
  g.restore();
}
