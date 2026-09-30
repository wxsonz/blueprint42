// The heap bar (docs/VISUALS.md, "The heap bar"): fixed to the screen, bottom
// left, one card per live malloc block: its size, where it was malloc'd, its
// first bytes, the pointers holding its address. malloc drops a card in, free
// takes it out, blocks still there at exit stay in red. One drawing, coloured
// by the skin (prototyped in Minimal and Barebone).
import type { Dc, HeapBarInfo, HeapCardInfo, Rect } from './types';
import { fitText, rrect } from './util';

export interface HeapBarPalette {
  bar: string; // the bar's body
  card: string;
  edge: string | null; // null: no border, a shade only (Barebone)
  text: string;
  muted: string;
  faint: string;
  flow: string; // new, just written
  ptr: string;
  err: string;
  cell: string; // a byte's cell
  ui: (px: number, w?: number) => string;
  mono: (px: number, w?: number) => string;
  radius: number;
}

// sizes in screen pixels: the bar doesn't zoom with the grid
export const HEAP_CARD = { w: 172, h: 88, gap: 8, head: 24, pad: 8 };

const byteGlyph = (b: number) => (b >= 33 && b < 127 ? String.fromCharCode(b) : b === 32 ? '␣' : b === 10 ? '↵' : b === 9 ? '⇥' : '·');

export function drawHeapBar(dc: Dc, r: Rect, b: HeapBarInfo, p: HeapBarPalette): void {
  const g = dc.g;
  const rad = p.radius;
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  g.fillStyle = p.bar;
  g.fill();
  if (p.edge) {
    g.strokeStyle = b.leaks ? p.err : p.edge;
    g.lineWidth = 1;
    g.stroke();
  }
  const y = r.y + HEAP_CARD.head / 2;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = p.ui(10, 700);
  g.fillStyle = p.muted;
  const title = `${b.folded ? '▸' : '▾'} HEAP`;
  g.fillText(title, r.x + 10, y);
  let x = r.x + 10 + g.measureText(title).width + 10;
  g.font = p.mono(10);
  g.fillStyle = p.faint;
  const what = b.count ? `${b.count} block${b.count === 1 ? '' : 's'} · ${b.bytes} B${b.more ? ` · ${b.more} without a card` : ''}` : b.empty === 'none' ? 'no malloc in this run' : b.empty === 'now' ? 'nothing allocated now' : 'nothing allocated yet';
  const room = r.x + r.w - 10 - x;
  g.fillText(fitText(g, what, (s) => p.mono(s), 10, room, 7), x, y);
  x += g.measureText(fitText(g, what, (s) => p.mono(s), 10, room, 7)).width + 10;
  if (b.leaks) {
    g.font = p.mono(10, 700);
    g.fillStyle = p.err;
    g.fillText(`${b.leaks} never freed`, x, y);
  }
}

export function drawHeapCard(dc: Dc, r: Rect, c: HeapCardInfo, p: HeapBarPalette): void {
  const g = dc.g;
  g.save();
  // malloc drops it in from above; free takes it out, down and away
  const e = c.t * c.t * (3 - 2 * c.t);
  if (c.state === 'new') (g.globalAlpha *= e), g.translate(0, -(1 - e) * 18);
  if (c.state === 'freeing') (g.globalAlpha *= 1 - e), g.translate(0, e * 18);
  const col = c.state === 'leak' || c.state === 'lost' ? p.err : c.state === 'new' || c.recent ? p.flow : p.edge;
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, p.radius);
  g.fillStyle = p.card;
  g.fill();
  if (col) {
    g.strokeStyle = col;
    g.lineWidth = c.state === 'leak' || c.state === 'lost' || c.state === 'new' ? 1.5 : 1;
    if (c.state === 'leak' || c.state === 'lost') g.setLineDash([4, 3]);
    g.stroke();
    g.setLineDash([]);
  }
  if (!p.edge && col) ((g.fillStyle = col), g.fillRect(r.x, r.y, 2, r.h)); // shade-only skins: a mark on the left
  const pad = HEAP_CARD.pad;
  const inner = r.w - pad * 2;
  g.textBaseline = 'middle';
  // head: its name and size; LEAK when the run ended with it still there
  let y = r.y + 12;
  g.textAlign = 'right';
  g.font = p.mono(10, 700);
  g.fillStyle = c.state === 'leak' || c.state === 'lost' ? p.err : p.muted;
  if (c.watch?.gone) g.globalAlpha *= 0.55;
  const right = c.watch ? 'watch' : c.state === 'leak' ? `LEAK · ${c.size} B` : c.state === 'lost' ? `LOST · ${c.size} B` : c.state === 'freeing' ? `free · ${c.size} B` : `${c.size} B`;
  g.fillText(right, r.x + r.w - pad, y);
  const rw = g.measureText(right).width;
  g.textAlign = 'left';
  g.font = p.mono(11, 700);
  g.fillStyle = p.text;
  g.fillText(fitText(g, c.name, (s) => p.mono(s, 700), 11, inner - rw - 6, 7), r.x + pad, y);
  y += 15;
  g.font = p.ui(9.5);
  g.fillStyle = p.faint;
  g.fillText(fitText(g, c.watch ? c.watch.where : c.site ? `malloc ${c.site}` : 'malloc', (s) => p.ui(s), 9.5, inner, 6), r.x + pad, y);
  // a struct (read through a typed pointer): its fields; else its first
  // bytes, one cell each (zero bytes stay empty, as on a strip)
  y += 16;
  if (c.watch?.gone) {
    g.textAlign = 'left';
    g.font = p.mono(10);
    g.fillStyle = p.faint;
    g.fillText(fitText(g, 'gone: its frame returned', (s) => p.mono(s), 10, inner, 6), r.x + pad, y);
  } else if (c.fields?.length) {
    g.textAlign = 'left';
    g.font = p.mono(10);
    let x = r.x + pad;
    for (const [k, f] of c.fields.entries()) {
      const room = r.x + r.w - pad - x;
      if (room < 14) break;
      g.fillStyle = p.muted;
      g.fillText(fitText(g, f.name, (s) => p.mono(s), 10, room, 6), x, y);
      const nw = g.measureText(`${f.name} `).width;
      g.fillStyle = p.text;
      const v = fitText(g, f.value + (k < c.fields.length - 1 ? ' ·' : ''), (s) => p.mono(s), 10, Math.max(8, room - nw), 6);
      if (room - nw > 8) g.fillText(v, x + nw, y);
      x += nw + g.measureText(v + ' ').width;
    }
  } else {
  const n = Math.min(16, Math.max(c.bytes.length, 1), c.size || 16);
  const cw = inner / n;
  for (let i = 0; i < n; i++) {
    const bx = r.x + pad + i * cw;
    const v = c.bytes[i];
    g.fillStyle = v ? p.cell : 'transparent';
    if (v) g.fillRect(bx + 0.5, y - 7, cw - 1, 14);
    if (v) {
      g.fillStyle = p.text;
      g.textAlign = 'center';
      g.font = p.mono(Math.min(9, cw * 0.85));
      const glyph = v >= 32 && v < 127 ? byteGlyph(v) : cw >= 14 ? v.toString(16).padStart(2, '0') : byteGlyph(v); // not printable: hex, room allowing
      g.fillText(glyph, bx + cw / 2, y + 0.5);
    }
  }
  g.strokeStyle = p.faint;
  g.globalAlpha *= 0.35;
  g.lineWidth = 1;
  g.strokeRect(r.x + pad + 0.5, y - 7.5, inner - 1, 15);
  g.globalAlpha /= 0.35;
  if (c.size > n) {
    g.textAlign = 'right';
    g.font = p.mono(8);
    g.fillStyle = p.faint;
    g.fillText(`+${c.size - n}`, r.x + r.w - pad, y - 12);
  }
  }
  // who holds its address
  y += 17;
  g.textAlign = 'left';
  g.font = p.mono(9.5);
  if (c.watch && !c.refs.length) {
    // a watched struct: nothing to say when no pointer holds it
  } else if (c.note) {
    // lost: why nothing can free it now
    g.fillStyle = p.err;
    g.fillText(fitText(g, c.note, (s) => p.mono(s), 9.5, inner, 6), r.x + pad, y);
  } else if (!c.refs.length) {
    g.fillStyle = p.faint;
    g.fillText(fitText(g, 'no stack or static pointer to it', (s) => p.mono(s), 9.5, inner, 6), r.x + pad, y);
  } else {
    let x = r.x + pad;
    const base = g.globalAlpha;
    g.fillStyle = p.ptr;
    g.fillText('←', x, y);
    x += g.measureText('← ').width;
    for (const [k, ref] of c.refs.entries()) {
      const room = r.x + r.w - pad - x;
      const text = `${ref.name}${k < c.refs.length - 1 ? ',' : ''}`;
      const left = c.refs.length - k;
      // keep room to count the rest: never drop a name silently
      const reserve = k < c.refs.length - 1 ? g.measureText(` +${left - 1}`).width : 0;
      if (g.measureText(text).width + reserve > room) {
        g.fillStyle = p.muted;
        g.fillText(fitText(g, `+${left}`, (s) => p.mono(s), 9.5, room, 6), x, y);
        break;
      }
      g.globalAlpha = base * (ref.top ? 1 : 0.7);
      g.fillStyle = p.ptr;
      g.fillText(text, x, y);
      g.globalAlpha = base;
      x += g.measureText(text + ' ').width;
    }
  }
  g.restore();
}
