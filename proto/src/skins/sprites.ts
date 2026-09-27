import type { SpriteKind } from '../blueprint';
import type { Dc, Rect, SpriteInfo, StripInfo } from './types';
import { fitText, rrect } from './util';

export interface SpritePalette {
  body: string;
  edge: string;
  track: string;
  cell: string;
  text: string;
  muted: string;
  accent: string;
  marker: string;
  selection: string;
  font: (size: number) => string;
  radius: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const box = (g: CanvasRenderingContext2D, r: Rect, radius: number, fill: string, stroke: string) => {
  rrect(g, r.x, r.y, r.w, r.h, radius);
  g.fillStyle = fill; g.fill();
  g.strokeStyle = stroke; g.lineWidth = 1; g.stroke();
};
const caption = (g: CanvasRenderingContext2D, s: string, x: number, y: number, max: number, p: SpritePalette, size: number) => {
  g.font = p.font(size);
  g.fillText(fitText(g, s, p.font, size, Math.max(1, max), 6), x, y);
};
const byteText = (n: number) => {
  const b = n & 255;
  return b >= 32 && b < 127 ? String.fromCharCode(b) : b.toString(16).padStart(2, '0').toUpperCase();
};

export function drawStrip(dc: Dc, r: Rect, i: StripInfo, p: SpritePalette): void {
  const g = dc.g;
  const z = dc.z;
  const pad = Math.max(4, 7 * z);
  g.save();
  if (!i.bound) g.globalAlpha *= 0.46;
  box(g, r, p.radius * z, p.body, i.selected ? p.selection : p.edge);
  if (i.selected || i.hovered) {
    g.strokeStyle = i.selected ? p.selection : p.accent;
    g.lineWidth = i.selected ? 2 : 1;
    g.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  }
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillStyle = p.text;
  caption(g, i.label, r.x + pad, r.y + Math.max(9, 13 * z), r.w * 0.53, p, Math.max(7, 11 * z));
  g.textAlign = 'right';
  g.fillStyle = i.bound ? p.accent : p.muted;
  const status = i.error ? 'error' : !i.bound ? 'UNBOUND' : i.length === null ? 'length ?' : `${i.length} slots`;
  caption(g, status, r.x + r.w - pad, r.y + Math.max(9, 13 * z), r.w * 0.42, p, Math.max(6, 9 * z));
  const track: Rect = { x: r.x + pad, y: r.y + r.h * 0.31, w: r.w - pad * 2, h: Math.max(11, r.h * 0.27) };
  box(g, track, Math.max(1, p.radius * 0.45 * z), p.track, p.edge);
  const capacity = i.bound && i.length !== null && i.length > 0 ? i.length : 0;
  const shown = Math.min(capacity, 24);
  const visible = capacity > shown ? shown - 1 : shown;
  if (shown > 0) {
    const cw = track.w / shown;
    for (let n = 0; n < visible; n++) {
      const x = track.x + n * cw;
      // Zero bytes stay empty so the data stands out from unused capacity.
      if (n < i.bytes.length && i.bytes[n] !== 0) {
        g.fillStyle = p.cell;
        g.fillRect(x + 1, track.y + 1, Math.max(1, cw - 2), track.h - 2);
        if (cw > 13) {
          g.fillStyle = p.text;
          g.textAlign = 'center';
          caption(g, byteText(i.bytes[n]), x + cw / 2, track.y + track.h / 2, cw - 2, p, Math.max(6, 9 * z));
        }
      }
      if (n) { g.strokeStyle = p.edge; g.beginPath(); g.moveTo(x, track.y + 2); g.lineTo(x, track.y + track.h - 2); g.stroke(); }
    }
    if (capacity > shown) {
      g.fillStyle = p.text; g.textAlign = 'right';
      caption(g, `+${capacity - visible}`, track.x + track.w - 3, track.y + track.h / 2, cw - 4, p, Math.max(6, 8 * z));
    }
  }
  if (i.bound && capacity > 0) {
    // Label rows share whatever height is left under the track, so they
    // never spill out of the box when zoomed out.
    const lane = track.y + track.h + 7 * z;
    const rows = Math.min(3, Math.max(1, i.markers.length));
    const step = Math.max(1, (r.y + r.h - 3 - lane) / rows);
    const labelSize = Math.max(5, Math.min(9 * z, step * 0.95));
    i.markers.forEach((m, n) => {
      if (!Number.isFinite(m.index)) return;
      const out = m.index < 0 || m.index > capacity;
      const offscreen = m.index >= visible && capacity > shown;
      const x = track.x + clamp(m.index / shown, 0, 1) * track.w;
      const row = n % rows;
      const y = lane + row * step + step / 2;
      g.fillStyle = out ? '#ef5b50' : p.marker;
      g.beginPath(); g.moveTo(x, track.y + track.h - 1); g.lineTo(x - 4 * z, track.y + track.h + 6 * z); g.lineTo(x + 4 * z, track.y + track.h + 6 * z); g.closePath(); g.fill();
      g.textAlign = x > track.x + track.w * 0.7 ? 'right' : 'left';
      if (labelSize >= 5.5) caption(g, `${m.label} ${m.sampledIndex}${offscreen ? ' →' : ''}`, x + (g.textAlign === 'right' ? -3 : 3) * z, y, Math.max(40, track.w * 0.32), p, labelSize);
    });
  } else {
    g.fillStyle = p.muted; g.textAlign = 'center';
    caption(g, i.error ? 'VALUE UNAVAILABLE' : 'NO SAMPLED BYTES', r.x + r.w / 2, track.y + track.h / 2, track.w - 8, p, Math.max(7, 9 * z));
  }
  g.restore();
}

export function drawSprite(dc: Dc, r: Rect, kind: Exclude<SpriteKind, 'strip'>, i: SpriteInfo, p: SpritePalette): void {
  const g = dc.g;
  const z = dc.z;
  const pad = Math.max(5, 8 * z);
  g.save();
  if (!i.bound) g.globalAlpha *= 0.46;
  box(g, r, p.radius * z, p.body, i.selected ? p.selection : p.edge);
  const ix = r.x + pad + 10 * z, iy = r.y + r.h / 2;
  g.strokeStyle = p.accent; g.fillStyle = p.accent; g.lineWidth = Math.max(1, 2 * z);
  if (kind === 'marker') {
    g.beginPath(); g.moveTo(ix, iy - 11 * z); g.lineTo(ix - 7 * z, iy); g.lineTo(ix + 7 * z, iy); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix, iy + 11 * z); g.stroke();
  } else if (kind === 'drill') {
    g.beginPath(); g.moveTo(ix - 7 * z, iy - 7 * z); g.lineTo(ix + 7 * z, iy - 7 * z); g.lineTo(ix + 2 * z, iy + 6 * z); g.lineTo(ix, iy + 10 * z); g.lineTo(ix - 2 * z, iy + 6 * z); g.closePath(); g.stroke();
  } else if (kind === 'copy') {
    // inserter: a page handing bytes to the next one
    g.strokeRect(ix - 9 * z, iy - 8 * z, 10 * z, 12 * z);
    g.strokeRect(ix - 1 * z, iy - 4 * z, 10 * z, 12 * z);
    g.beginPath(); g.moveTo(ix - 5 * z, iy + 7 * z); g.lineTo(ix - 5 * z, iy + 11 * z); g.lineTo(ix + 1 * z, iy + 11 * z); g.stroke();
  } else if (kind === 'stack') {
    for (let n = 0; n < 3; n++) g.strokeRect(ix - 8 * z, iy + (n - 1) * 6 * z, 16 * z, 5 * z);
  } else if (kind === 'train') {
    for (let n = 0; n < 3; n++) { g.strokeRect(ix - 13 * z + n * 10 * z, iy - 5 * z, 8 * z, 10 * z); if (n < 2) { g.beginPath(); g.moveTo(ix - 5 * z + n * 10 * z, iy); g.lineTo(ix - 3 * z + n * 10 * z, iy); g.stroke(); } }
  } else {
    g.strokeRect(ix - 8 * z, iy - 8 * z, 16 * z, 16 * z);
    g.fillRect(ix - 5 * z, iy - 3 * z, 10 * z, 3 * z);
  }
  const tx = r.x + pad + 27 * z;
  g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = p.text;
  caption(g, i.label, tx, r.y + r.h * 0.36, r.w - (tx - r.x) - pad, p, Math.max(8, 11 * z));
  g.fillStyle = i.bound ? p.accent : p.muted;
  caption(g, i.error ? 'unavailable' : !i.bound ? 'unbound' : i.value ?? 'bound', tx, r.y + r.h * 0.68, r.w - (tx - r.x) - pad, p, Math.max(7, 10 * z));
  if (i.selected || i.hovered) {
    g.strokeStyle = i.selected ? p.selection : p.accent; g.lineWidth = i.selected ? 2 : 1;
    g.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
  }
  g.restore();
}
