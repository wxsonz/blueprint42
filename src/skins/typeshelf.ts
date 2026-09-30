// The types shelf (docs/VISUALS.md, "The types shelf"): the types and
// constants the files define, on the grid left of the machines: a struct's
// or union's fields, an enum's members with their values, a typedef, a
// file's #defines (with the value the run really used when -D set it). One
// drawing, coloured by the skin (prototyped in Minimal and Barebone).
import type { Dc, Rect, TypeCardInfo } from './types';
import { fitText, rrect } from './util';

export interface TypeShelfPalette {
  card: string;
  head: string; // the card's title band
  edge: string | null; // null: no border, a shade only (Barebone)
  text: string;
  muted: string;
  faint: string;
  name: string; // member names
  accent: string; // a value set by -D; a type in use now
  ui: (px: number, w?: number) => string;
  mono: (px: number, w?: number) => string;
  radius: number;
}

// geometry in grid cells, shared with the engine's layout
export const TYPE_CARD = { w: 7, head: 0.7, row: 0.45, pad: 0.25, gap: 0.4 };
export const typeCardH = (rows: number) => TYPE_CARD.head + rows * TYPE_CARD.row + TYPE_CARD.pad;

const px = (dc: Dc, v: number, min = 1) => Math.max(min, v * dc.z);

export function drawTypeCard(dc: Dc, r: Rect, t: TypeCardInfo, p: TypeShelfPalette): void {
  const g = dc.g;
  const rad = p.radius ? px(dc, p.radius, 2) : 0;
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  g.fillStyle = p.card;
  g.fill();
  if (p.edge) {
    g.strokeStyle = t.inUse ? p.accent : p.edge;
    g.lineWidth = 1;
    g.stroke();
  }
  const cs = dc.cs;
  const headH = TYPE_CARD.head * cs;
  g.save();
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  g.clip();
  g.fillStyle = p.head;
  g.fillRect(r.x, r.y, r.w, headH);
  if (!p.edge && t.inUse) ((g.fillStyle = p.accent), g.fillRect(r.x, r.y, px(dc, 2, 1.5), r.h));
  g.restore();
  const pad = px(dc, 8);
  const inner = r.w - pad * 2;
  g.textBaseline = 'middle';
  // head: what it is (`struct s_reader`), its typedef name, where it's from
  let y = r.y + headH / 2;
  g.textAlign = 'right';
  g.font = p.mono(px(dc, 10, 6));
  g.fillStyle = p.faint;
  const right = [t.alias ? `→ ${t.alias}` : '', t.file].filter(Boolean).join(' · ');
  const rw = right ? g.measureText(right).width + px(dc, 6) : 0;
  if (right) g.fillText(fitText(g, right, (s) => p.mono(s), px(dc, 10, 6), inner * 0.55, 5), r.x + r.w - pad, y);
  g.textAlign = 'left';
  g.font = p.mono(px(dc, 11.5, 6), 700);
  g.fillStyle = p.text;
  g.fillText(fitText(g, t.name, (s) => p.mono(s, 700), px(dc, 11.5, 6), inner - Math.min(rw, inner * 0.55), 5), r.x + pad, y);
  // rows: a member and its type, or a constant and its value
  y = r.y + headH + (TYPE_CARD.row * cs) / 2 + px(dc, 2);
  for (const m of t.members) {
    g.textAlign = 'left';
    g.font = p.mono(px(dc, 10.5, 6));
    g.fillStyle = p.name;
    const nameW = Math.min(inner * 0.5, g.measureText(m.name).width + px(dc, 8));
    g.fillText(fitText(g, m.name, (s) => p.mono(s), px(dc, 10.5, 6), nameW - px(dc, 4), 5), r.x + pad, y);
    g.textAlign = 'right';
    g.fillStyle = m.set ? p.accent : p.muted;
    const text = m.note ? `${m.text}  ${m.note}` : m.text;
    g.fillText(fitText(g, text, (s) => p.mono(s), px(dc, 10.5, 6), inner - nameW, 5), r.x + r.w - pad, y);
    y += TYPE_CARD.row * cs;
  }
  if (t.more) {
    g.textAlign = 'left';
    g.font = p.mono(px(dc, 10, 6));
    g.fillStyle = p.faint;
    g.fillText(`+${t.more} more`, r.x + pad, y);
  }
}
