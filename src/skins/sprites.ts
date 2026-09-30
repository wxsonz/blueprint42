import type { SpriteKind } from '../blueprint';
import type { CrateInfo, Dc, InteriorInfo, Pt, Rect, SpriteInfo, StripInfo } from './types';
import { cutText, fitText, rrect, drawCap, type CapLook } from './util';

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
  full?: string; // a Norm limit reached (capacity), and past it
  over?: string;
  capLook?: CapLook;
  // a skin's own panel (body and titled head), used instead of the default look
  panel?: (dc: Dc, r: Rect, head: Rect, title: string, live: boolean) => void;
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
  const status = i.violation ? `✗ ${i.violation}` : i.error ? 'error' : !i.bound ? 'UNBOUND' : i.length === null ? 'length ?' : `${i.length} slots`;
  if (i.violation) g.fillStyle = VIOLATION;
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
        // the byte itself, as long as a glyph fits (a 16-byte buffer at 0.8×)
        if (cw > 8) {
          g.fillStyle = p.text;
          g.textAlign = 'center';
          caption(g, byteText(i.bytes[n]), x + cw / 2, track.y + track.h / 2, cw - 2, p, Math.max(6, Math.min(9 * z, cw * 0.8)));
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
  if (i.violation) violationFrame(g, r, z);
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
  if (i.violation) {
    violationFrame(g, r, z);
    g.fillStyle = VIOLATION; g.textAlign = 'left';
    caption(g, `✗ ${i.violation}`, r.x, r.y - Math.max(6, 8 * z), Math.max(60, r.w * 1.6), p, Math.max(7, 10 * z));
  }
  g.restore();
}

// A broken invariant reads the same in every skin: a red, dashed double frame.
const VIOLATION = '#ef5b50';
function violationFrame(g: CanvasRenderingContext2D, r: Rect, z: number): void {
  g.save();
  g.globalAlpha = 1;
  g.strokeStyle = VIOLATION;
  g.lineWidth = Math.max(2, 2.5 * z);
  g.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
  g.setLineDash([4, 3]);
  g.lineWidth = 1;
  g.strokeRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
  g.restore();
}

// A struct in transit: a small labelled crate, field names left, values right.
export function drawCrate(dc: Dc, x: number, y: number, c: CrateInfo, p: SpritePalette): void {
  const g = dc.g;
  const z = dc.z;
  const fs = Math.max(8, 10.5 * z);
  const lh = fs * 1.35;
  const pad = Math.max(3, 6 * z);
  g.save();
  g.font = p.font(fs);
  const rows = c.rows.map((r) => ({ name: /^\w+$/.test(r.name) ? `.${r.name}` : r.name, value: r.value }));
  const nameW = Math.max(0, ...rows.map((r) => g.measureText(r.name).width));
  const valW = Math.min(150 * z, Math.max(0, ...rows.map((r) => g.measureText(r.value).width)));
  const title = c.via ? `${c.title} @ ${c.via}` : c.title;
  const w = clamp(Math.max(pad * 3 + nameW + valW, g.measureText(title).width + pad * 2), 70 * z, 240 * z);
  const lines = 1 + rows.length + (c.more ? 1 : 0);
  const h = lines * lh + pad;
  const r = { x: Math.round(x - w / 2), y: Math.round(y - h / 2), w: Math.round(w), h: Math.round(h) };
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 8 * z;
  g.shadowOffsetY = 2 * z;
  box(g, r, p.radius * z, p.body, c.kind === 'ret' ? p.marker : p.accent);
  g.shadowColor = 'transparent';
  // title band: the type, and where the struct lives
  rrect(g, r.x + 1, r.y + 1, r.w - 2, lh, [p.radius * z, p.radius * z, 0, 0]);
  g.fillStyle = c.kind === 'ret' ? p.marker : p.accent;
  g.globalAlpha *= 0.22;
  g.fill();
  g.globalAlpha /= 0.22;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = p.text;
  caption(g, title, r.x + pad, r.y + 1 + lh / 2, r.w - pad * 2, p, fs);
  rows.forEach((row, i) => {
    const cy = r.y + 1 + lh * (i + 1.5);
    g.textAlign = 'left';
    g.fillStyle = p.muted;
    caption(g, row.name, r.x + pad, cy, r.w * 0.45, p, fs);
    g.textAlign = 'right';
    g.fillStyle = row.value.startsWith('"') ? p.marker : row.value.startsWith('→') || row.value === 'NULL' ? p.accent : p.text;
    caption(g, row.value, r.x + r.w - pad, cy, r.w - pad * 3 - Math.min(nameW, r.w * 0.45), p, fs);
  });
  if (c.more) {
    g.textAlign = 'left';
    g.fillStyle = p.muted;
    caption(g, `+${c.more} more`, r.x + pad, r.y + 1 + lh * (rows.length + 1.5), r.w - pad * 2, p, fs);
  }
  g.restore();
}

// M5.5: inside a machine. Tracks first, then stops, code and readouts, then
// the token on the running line. Text is cut, never shrunk.
export function drawInterior(dc: Dc, r: Rect, i: InteriorInfo, p: SpritePalette): void {
  const g = dc.g;
  const z = dc.z;
  const fs = Math.max(7, 11 * z);
  const right = r.x + r.w - Math.max(3, 6 * z);
  const cut = (s: string, max: number) => cutText(g, s, max);
  g.save();
  if (p.panel) p.panel(dc, r, i.head, i.title, i.mode === 'live');
  else {
    box(g, r, p.radius * z, p.body, p.edge);
    g.save();
    rrect(g, i.head.x + 1, i.head.y + 1, i.head.w - 2, i.head.h - 1, [p.radius * z, p.radius * z, 0, 0]);
    g.fillStyle = i.mode === 'live' ? p.accent : p.muted;
    g.globalAlpha *= 0.2;
    g.fill();
    g.restore();
    g.font = p.font(fs);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = i.mode === 'none' ? p.muted : p.text;
    g.fillText(cut(i.title, i.head.w - 12 * z), i.head.x + 6 * z, i.head.y + i.head.h / 2);
  }
  if (i.cap) drawCap(g, i.cap, i.head.x + i.head.w - 6 * z, i.head.y + i.head.h / 2, { font: p.font, size: Math.max(7, 10 * z), faint: p.muted, full: p.full ?? p.muted, over: p.over ?? p.accent, track: p.edge, look: p.capLook });
  if (i.mode !== 'live') g.globalAlpha *= 0.75;

  // tracks: the way taken is lit
  const line = (pts: Pt[]) => {
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const lit of [false, true]) {
    for (const t of i.tracks) {
      if (t.lit !== lit) continue;
      g.strokeStyle = lit ? p.accent : p.muted;
      g.globalAlpha = (i.mode !== 'live' ? 0.75 : 1) * (lit ? 1 : 0.4);
      g.lineWidth = Math.max(1, (lit ? 2.4 : 1.6) * z);
      g.setLineDash(t.back && !lit ? [3 * z, 3 * z] : []);
      line(t.pts);
      if (t.back && t.pts.length > 1) {
        // arrowhead where the loop comes back in
        const [x1, y1] = t.pts[t.pts.length - 1];
        const [x0, y0] = t.pts[t.pts.length - 2];
        const a = Math.atan2(y1 - y0, x1 - x0);
        const s = 4 * z;
        g.setLineDash([]);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x1 - s * Math.cos(a - 0.5), y1 - s * Math.sin(a - 0.5));
        g.lineTo(x1 - s * Math.cos(a + 0.5), y1 - s * Math.sin(a + 0.5));
        g.closePath();
        g.fillStyle = g.strokeStyle;
        g.fill();
      }
    }
  }
  g.setLineDash([]);
  g.globalAlpha = i.mode !== 'live' ? 0.75 : 1;

  // stops, code, readouts
  const u = Math.max(2, 3.2 * z);
  const dead = p.over ?? p.marker;
  i.stations.forEach((s, k) => {
    const on = s.state !== 'idle';
    const died = i.died?.station === k;
    const cur = s.state === 'current';
    const hi = died ? dead : p.accent;
    const fill = cur ? hi : on ? p.text : p.body;
    g.fillStyle = fill;
    g.strokeStyle = cur ? hi : on ? p.text : p.muted;
    g.lineWidth = Math.max(1, 1.2 * z);
    g.beginPath();
    if (s.kind === 'if' || s.kind === 'loop') {
      // a switch: a diamond
      g.moveTo(s.x, s.y - u * 1.35); g.lineTo(s.x + u * 1.35, s.y); g.lineTo(s.x, s.y + u * 1.35); g.lineTo(s.x - u * 1.35, s.y); g.closePath();
    } else if (s.kind === 'ret' || s.kind === 'end') {
      g.rect(s.x - u, s.y - u, u * 2, u * 2);
    } else if (s.kind === 'else') {
      g.rect(s.x - u * 0.7, s.y - u * 0.7, u * 1.4, u * 1.4);
    } else g.arc(s.x, s.y, u * 0.85, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (s.kind === 'ret') {
      g.strokeStyle = p.marker;
      g.stroke();
    }
    if (died) {
      // a cross through its stop: it never finished
      g.strokeStyle = dead;
      g.lineWidth = Math.max(1.5, 2 * z);
      const c = u * 1.9;
      g.beginPath();
      g.moveTo(s.x - c, s.y - c); g.lineTo(s.x + c, s.y + c);
      g.moveTo(s.x + c, s.y - c); g.lineTo(s.x - c, s.y + c);
      g.stroke();
    }
    g.font = p.font(fs);
    g.fillStyle = died ? dead : s.hot ? p.accent : cur ? p.text : on ? p.text : p.muted;
    g.globalAlpha = (i.mode !== 'live' ? 0.75 : 1) * (on ? 1 : 0.7);
    const badge = died ? `✕ ${i.died!.msg.split(':')[0] || 'died'}` : s.count !== null ? `×${s.count}` : '';
    const bw = badge ? g.measureText(badge).width + 6 * z : 0;
    g.fillText(cut(s.text, right - s.textX - bw), s.textX, s.y);
    if (badge) {
      g.textAlign = 'right';
      g.fillStyle = died ? dead : s.count ? p.accent : p.muted;
      g.fillText(badge, right, s.y);
      g.textAlign = 'left';
    }
    if (s.readout) {
      const ry = s.y + i.row;
      const res = s.readout.result;
      g.font = p.font(fs * 0.95);
      g.fillStyle = res === null ? p.muted : res ? p.accent : p.marker;
      g.fillText(cut(s.readout.text, right - s.textX - 4 * z), s.textX + 4 * z, ry);
    }
    g.globalAlpha = i.mode !== 'live' ? 0.75 : 1;
  });

  // the token: where the frame is now (not on a statement it died in: the cross is there)
  if (i.token && !i.died) {
    const [x, y] = i.token;
    const pulse = 0.5 + 0.5 * Math.sin(dc.time * 6);
    g.globalAlpha = 1;
    g.fillStyle = p.accent;
    g.globalAlpha = 0.25 + 0.2 * pulse;
    g.beginPath();
    g.arc(x, y, u * (2.4 + pulse * 0.8), 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(x, y, u * 1.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = p.edge;
    g.lineWidth = Math.max(1, z);
    g.stroke();
  }
  g.restore();
}
