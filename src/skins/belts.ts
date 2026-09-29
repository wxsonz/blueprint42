// Helpers the skins' own belts share: walking a polyline in the data's
// direction, stroking part of it, small sprites riding it. Nothing here has
// a look of its own.
import type { Dc, Pt } from './types';
import { Walk, roundPts } from './util';

export interface Flow {
  live: boolean;
  dir: number;
}

// Stroke the part of a walked polyline between two arc lengths.
export function span(g: CanvasRenderingContext2D, w: Walk, a: number, b: number): void {
  a = Math.max(0, a);
  b = Math.min(w.length, b);
  if (b - a < 0.5) return;
  const p = w.at(a);
  g.beginPath();
  g.moveTo(p.x, p.y);
  for (const s of w.segs) if (s.at > a && s.at < b) g.lineTo(s.x, s.y);
  const q = w.at(b);
  g.lineTo(q.x, q.y);
  g.stroke();
}

// Ride markers along the belt, one every `gap` px, moving `speed` px/s the
// data's way. `fn` gets the place and the direction of travel (unit vector).
// `phase` staggers a group of riders (in px, along the way).
export function ride(dc: Dc, w: Walk, o: Flow, speed: number, gap: number, fn: (x: number, y: number, dx: number, dy: number, i: number) => void, phase = 0, margin = 0): void {
  if (!o.live || w.length < 1) return;
  const run = (((dc.time * speed - phase) % gap) + gap) % gap;
  let i = 0;
  for (let d = run; d < w.length; d += gap, i++) {
    if (d < margin || d > w.length - margin) continue;
    const q = w.at(o.dir < 0 ? w.length - d : d);
    const s = o.dir < 0 ? -1 : 1;
    fn(q.x, q.y, q.dx * s, q.dy * s, i);
  }
}

// The arc-length position of a `head` that moves the data's way, for stroking
// `span` pieces: a piece from a to b (measured from the start of travel)
// becomes the right stretch of the polyline for either direction.
export function along(w: Walk, dir: number, a: number, b: number): [number, number] {
  return dir < 0 ? [w.length - b, w.length - a] : [a, b];
}

// Where the arrow of a belt goes, and which way it points.
export function tip(w: Walk): { x: number; y: number; dx: number; dy: number } {
  return w.at(w.length);
}

// Stroke a polyline as layers, widest first: [width, colour] pairs.
export function layers(g: CanvasRenderingContext2D, pts: Pt[], ls: [number, string][], offset: Pt = [0, 0]): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x + offset[0], y + offset[1]) : g.moveTo(x + offset[0], y + offset[1])));
  for (const [lw, c] of ls) {
    g.lineWidth = lw;
    g.strokeStyle = c;
    g.stroke();
  }
}

// Open chevron ">" at a point, pointing along (dx, dy).
export function chevron(g: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, s: number): void {
  g.beginPath();
  g.moveTo(x - dx * s - dy * s, y - dy * s + dx * s);
  g.lineTo(x, y);
  g.lineTo(x - dx * s + dy * s, y - dy * s - dx * s);
  g.stroke();
}

// A filled triangle whose tip is at (x, y).
export function tri(g: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, len: number, half: number): void {
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - dx * len - dy * half, y - dy * len + dx * half);
  g.lineTo(x - dx * len + dy * half, y - dy * len - dx * half);
  g.closePath();
}

// A barber pole: slanted stripes of half-height `h`, `sw` wide every `gap`,
// running the data's way (the Mac progress bar). Fill style is the caller's.
export function barberPole(dc: Dc, w: Walk, o: Flow, h: number, sw: number, gap: number, speed: number, margin = 0): void {
  const g = dc.g;
  ride(dc, w, o, speed, gap, (x, y, dx, dy) => {
    const nx = -dy, ny = dx, k = h * 0.9;
    g.beginPath();
    g.moveTo(x + nx * h + dx * k, y + ny * h + dy * k);
    g.lineTo(x + nx * h + dx * (k + sw), y + ny * h + dy * (k + sw));
    g.lineTo(x - nx * h + dx * (sw - k), y - ny * h + dy * (sw - k));
    g.lineTo(x - nx * h - dx * k, y - ny * h - dy * k);
    g.closePath();
    g.fill();
  }, 0, margin);
}

// The belt's corners as fillets, for skins whose riders (and strokes) should
// turn smoothly instead of snapping 90 degrees at a bend. Use the result for
// both the strokes and the Walk. Cached per pts array; cheap.
export function smooth(dc: Dc, pts: Pt[]): Pt[] {
  return roundPts(pts, 10 * dc.z);
}
