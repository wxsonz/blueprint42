import type { Dc, Pt, Rect } from './types';

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
export function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, px: number, maxW: number, minPx = 7): string {
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
export class Walk {
  segs: { x: number; y: number; dx: number; dy: number; len: number; at: number }[] = [];
  length = 0;
  constructor(pts: Pt[]) {
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
