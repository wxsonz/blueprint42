// "Minimal" — the calm baseline: dark cards, hairlines, one accent.
import type { Dc, IconKind, Rect, Skin } from './types';
import { arrowHead, baseName, beltMid, dirName, fitText, rrect, strokeLine, tailLines, Walk } from './util';
import { genericIcon } from './icons';
import { drawSprite, drawStrip, type SpritePalette } from './sprites';

const ACCENT = '#8ab4ff';
const PTR = '#ff8a7a';
const RET = '#7ee0a1';
const WAIT = '#e0b35a';
const ERR = '#ff6b6b';
const FG = '#ededed';
const DIM = '#8b909a';
const FAINT = '#555861';
const CARD = '#1c1d21';
const LINE = '#2e3036';
const UI = (px: number, w = 500) => `${w} ${px}px Inter, "DejaVu Sans", system-ui, sans-serif`;
const MONO = (px: number, w = 500) => `${w} ${px}px "JetBrains Mono", "DejaVu Sans Mono", monospace`;
const px = (dc: Dc, v: number, min = 1) => Math.max(min, v * dc.z);
const spritePalette: SpritePalette = { body: CARD, edge: LINE, track: '#111317', cell: '#303e54', text: FG, muted: DIM, accent: ACCENT, marker: RET, selection: ACCENT, font: (s) => MONO(s), radius: 5 };

function card(g: CanvasRenderingContext2D, r: Rect, rad: number, fill: string, stroke: string, lw = 1): void {
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = stroke;
  g.lineWidth = lw;
  g.stroke();
}

function outline(g: CanvasRenderingContext2D, r: Rect, rad: number, strong: boolean): void {
  rrect(g, r.x - 4, r.y - 4, r.w + 8, r.h + 8, rad + 4);
  g.strokeStyle = strong ? ACCENT : 'rgba(138,180,255,0.35)';
  g.lineWidth = strong ? 2 : 1;
  g.stroke();
}

export const minimal: Skin = {
  id: 'minimal',
  name: 'Minimal',
  blurb: 'quiet cards and hairlines',
  casing: '#131416',
  strip(dc, r, info) { drawStrip(dc, r, info, spritePalette); },
  sprite(dc, r, kind, info) { drawSprite(dc, r, kind, info, spritePalette); },

  background(dc, camX, camY) {
    const g = dc.g;
    g.fillStyle = '#131416';
    g.fillRect(0, 0, dc.vw, dc.vh);
    if (dc.cs < 14) return;
    g.fillStyle = 'rgba(255,255,255,0.07)';
    for (let x = Math.floor(camX); x < camX + dc.vw / dc.cs + 1; x++) {
      for (let y = Math.floor(camY); y < camY + dc.vh / dc.cs + 1; y++) {
        g.beginPath();
        g.arc((x - camX) * dc.cs, (y - camY) * dc.cs, 1, 0, Math.PI * 2);
        g.fill();
      }
    }
  },

  belt(dc, pts, o) {
    const g = dc.g;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected) strokeLine(g, pts, px(dc, 8, 5), 'rgba(138,180,255,0.18)');
    const col = o.live ? ACCENT : o.hovered || o.selected ? '#6a6e78' : '#3a3d44';
    strokeLine(g, pts, px(dc, 1.6, 1.2), col);
    if (o.live) strokeLine(g, pts, px(dc, 2.2, 1.6), ACCENT, [px(dc, 3), px(dc, 9)], -dc.time * 40 * dc.z * o.dir);
    const walk = new Walk(pts);
    const end = walk.at(walk.length);
    arrowHead(g, end.x, end.y, end.dx, end.dy, px(dc, 7, 5), col);
    if (o.count > 1) {
      const [mx, my] = beltMid(pts);
      const fs = px(dc, 10.5, 7);
      g.font = MONO(fs, 600);
      const t = `${o.count}`;
      const w = Math.max(g.measureText(t).width + px(dc, 10), fs + px(dc, 6));
      const h = fs + px(dc, 6);
      card(g, { x: mx - w / 2, y: my - h / 2, w, h }, h / 2, '#131416', col);
      g.fillStyle = o.live ? ACCENT : DIM;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, mx, my + 0.5);
    }
  },

  module(dc, r, m) {
    const g = dc.g;
    const rad = px(dc, 6, 3);
    const border = m.state === 'running' ? ACCENT : m.state === 'error' ? ERR : m.hovered ? '#44474f' : LINE;
    if (m.state === 'running' || m.state === 'error') {
      g.save();
      g.shadowColor = m.state === 'error' ? 'rgba(255,107,107,0.4)' : 'rgba(138,180,255,0.35)';
      g.shadowBlur = 18 * dc.z;
      card(g, r, rad, CARD, border, 1.5);
      g.restore();
    } else card(g, r, rad, CARD, border);
    // a second card edge behind: this block stands for a whole file
    rrect(g, r.x + px(dc, 4) + 0.5, r.y - px(dc, 4) + 0.5, r.w - px(dc, 4) - 1, px(dc, 4), [rad, rad, 0, 0]);
    g.strokeStyle = LINE;
    g.lineWidth = 1;
    g.stroke();
    const pad = px(dc, 12);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = MONO(px(dc, 10, 6));
    g.fillStyle = FAINT;
    const dir = dirName(m.name);
    if (dir) g.fillText(fitText(g, dir, MONO, px(dc, 10, 6), r.w - pad * 2, 6), r.x + pad, r.y + px(dc, 4));
    g.font = UI(px(dc, 14, 8), 600);
    g.fillStyle = FG;
    g.fillText(fitText(g, baseName(m.name), (s2) => UI(s2, 600), px(dc, 14, 8), r.w - pad * 2 - px(dc, 22), 6), r.x + pad, r.y + px(dc, 14));
    g.font = MONO(px(dc, 10.5, 7), 600);
    g.fillStyle = m.state === 'idle' ? FAINT : ACCENT;
    g.textAlign = 'right';
    g.fillText(m.depth > 1 ? `×${m.depth}` : String(m.fns), r.x + r.w - pad, r.y + px(dc, 15));
    const rowH = 0.55 * dc.cs;
    const top = r.y + px(dc, 40);
    g.textBaseline = 'middle';
    m.doors.forEach((d, i) => {
      const y = top + i * rowH + rowH / 2;
      g.fillStyle = d.live ? ACCENT : d.undeclared ? WAIT : FAINT;
      g.beginPath(); g.arc(r.x + pad + px(dc, 2), y, px(dc, 2.5, 1.5), 0, Math.PI * 2); g.fill();
      g.font = MONO(px(dc, 11, 7), d.live ? 600 : 500);
      g.fillStyle = d.live ? FG : DIM;
      g.textAlign = 'left';
      g.fillText(fitText(g, d.name, MONO, px(dc, 11, 7), r.w - pad * 2 - px(dc, 10), 6), r.x + pad + px(dc, 10), y);
    });
    if (m.more) {
      g.font = MONO(px(dc, 10, 6));
      g.fillStyle = FAINT;
      g.textAlign = 'left';
      g.fillText(`+${m.more} more`, r.x + pad + px(dc, 10), top + m.doors.length * rowH + rowH / 2);
    }
    if (m.state !== 'idle') {
      g.font = UI(px(dc, 11, 7));
      g.fillStyle = m.state === 'error' ? ERR : m.state === 'waiting' ? WAIT : ACCENT;
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
      const t = m.state === 'error' ? 'crashed' : `${m.state === 'waiting' ? 'waiting in' : 'running'} ${m.running ?? ''}`;
      g.fillText(fitText(g, t, (s2) => UI(s2), px(dc, 11, 7), r.w - pad * 2, 6), r.x + pad, r.y + r.h - px(dc, 8));
    }
    g.fillStyle = border;
    for (const [x, ys] of [[r.x, m.inPorts], [r.x + r.w, m.outPorts]] as [number, number[]][]) {
      for (const y of ys) {
        g.beginPath(); g.arc(x, y, px(dc, 3, 2), 0, Math.PI * 2); g.fill();
      }
    }
    if (m.selected || m.hovered) outline(g, r, rad, m.selected);
  },

  wall(dc, r, w) {
    const g = dc.g;
    const rad = px(dc, 10, 4);
    rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, rad);
    g.fillStyle = 'rgba(255,255,255,0.025)';
    g.fill();
    g.strokeStyle = w.live ? 'rgba(138,180,255,0.55)' : '#34373e';
    g.lineWidth = 1;
    g.setLineDash([px(dc, 5, 3), px(dc, 4, 2)]);
    g.stroke();
    g.setLineDash([]);
    const h = w.head;
    g.font = MONO(px(dc, 11, 7), 600);
    g.fillStyle = w.live ? ACCENT : DIM;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, w.name, MONO, px(dc, 11, 7), h.w - px(dc, 70), 6), h.x + px(dc, 14), h.y + h.h / 2);
    g.font = MONO(px(dc, 10, 6));
    g.fillStyle = FAINT;
    g.textAlign = 'right';
    g.fillText(`${w.fns} fn${w.fns === 1 ? '' : 's'}${w.pinned ? ' · pinned' : ''}`, h.x + h.w - px(dc, 14), h.y + h.h / 2);
    if (w.selected || w.hovered) outline(g, r, rad, w.selected);
  },

  door(dc, [x, y], vertical, live) {
    const g = dc.g;
    const L = px(dc, 12, 7);
    g.strokeStyle = live ? ACCENT : '#6a6e78';
    g.lineWidth = px(dc, 3, 2);
    g.lineCap = 'round';
    g.beginPath();
    if (vertical) (g.moveTo(x, y - L / 2), g.lineTo(x, y + L / 2));
    else (g.moveTo(x - L / 2, y), g.lineTo(x + L / 2, y));
    g.stroke();
  },

  node(dc, r, n) {
    const g = dc.g;
    const rad = px(dc, 6, 3);
    const border = n.state === 'running' ? ACCENT : n.state === 'error' ? ERR : n.hovered ? '#44474f' : LINE;
    if (n.state === 'running' || n.state === 'error') {
      g.save();
      g.shadowColor = n.state === 'error' ? 'rgba(255,107,107,0.4)' : 'rgba(138,180,255,0.35)';
      g.shadowBlur = 18 * dc.z;
      card(g, r, rad, CARD, border, 1.5);
      g.restore();
    } else card(g, r, rad, CARD, border);
    if (n.stale) g.globalAlpha = 0.5;
    const pad = px(dc, 12);
    g.font = UI(px(dc, 14, 8), 600);
    g.fillStyle = FG;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(fitText(g, n.name, (s) => UI(s, 600), px(dc, 14, 8), r.w - pad * 2 - px(dc, 18), 6), r.x + pad, r.y + pad);
    // state
    const col = n.stale ? FAINT : n.state === 'running' ? ACCENT : n.state === 'waiting' ? WAIT : n.state === 'error' ? ERR : FAINT;
    const sy = r.y + pad + px(dc, 26);
    g.fillStyle = col;
    g.beginPath(); g.arc(r.x + pad + px(dc, 3), sy + px(dc, 6), px(dc, 3, 2), 0, Math.PI * 2); g.fill();
    g.font = UI(px(dc, 12, 7));
    const status = n.stale ? 'stale' : n.state === 'waiting' ? `waiting on ${n.waitingOn ?? '…'}` : n.state;
    g.fillText(fitText(g, status, (s) => UI(s), px(dc, 12, 7), r.w - pad * 2 - px(dc, 12), 6), r.x + pad + px(dc, 12), sy);
    // meta
    g.font = MONO(px(dc, 10.5, 7));
    g.fillStyle = FAINT;
    g.textBaseline = 'alphabetic';
    const meta = [`${n.params} param${n.params === 1 ? '' : 's'}`, n.isStatic ? 'static' : '', n.pinned ? 'pinned' : ''].filter(Boolean).join(' · ');
    g.fillText(fitText(g, meta, MONO, px(dc, 10.5, 7), r.w - pad * 2, 6), r.x + pad, r.y + r.h - pad + px(dc, 2));
    if (n.frames > 1) {
      g.font = MONO(px(dc, 11, 7), 600);
      g.fillStyle = ACCENT;
      g.textAlign = 'right';
      g.textBaseline = 'top';
      g.fillText(`×${n.frames}`, r.x + r.w - pad, r.y + pad + px(dc, 1));
    }
    if (n.editing) {
      g.fillStyle = 'rgba(138,180,255,0.7)';
      g.fillRect(r.x + 1, r.y + rad, px(dc, 2.5, 2), r.h - rad * 2);
    }
    g.globalAlpha = 1;
    // ports, one per call
    g.fillStyle = border;
    for (const [x, ys] of [[r.x, n.inPorts], [r.x + r.w, n.outPorts]] as [number, number[]][]) {
      for (const y of ys) {
        g.beginPath(); g.arc(x, y, px(dc, 3, 2), 0, Math.PI * 2); g.fill();
      }
    }
    if (n.selected || n.hovered) outline(g, r, rad, n.selected);
  },

  frame(dc, r, f) {
    const g = dc.g;
    const rad = px(dc, 5, 2);
    for (let k = Math.min(f.stacked, 3); k > 0; k--) {
      const o = px(dc, 4) * k;
      card(g, { x: r.x + o, y: r.y + o, w: r.w, h: r.h }, rad, '#17181b', '#26282d');
    }
    card(g, r, rad, '#17181b', f.mode === 'live' ? '#33363d' : '#25272c');
    const alpha = f.mode === 'live' ? 1 : f.mode === 'returned' ? 0.6 : 0.35;
    g.globalAlpha = alpha;
    g.font = UI(px(dc, 9.5, 7), 600);
    g.fillStyle = f.mode === 'live' ? DIM : FAINT;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const pad = px(dc, 10);
    g.fillText(f.mode === 'live' ? 'FRAME' : f.mode === 'returned' ? 'RETURNED' : 'NO FRAME', r.x + pad, f.head.y + f.head.h / 2 + 1);
    for (const row of f.rows) {
      const rr = row.rect;
      if (row.recent || row.flash > 0) {
        g.fillStyle = `rgba(138,180,255,${row.recent ? 0.1 : 0.25 * row.flash})`;
        g.fillRect(r.x + 1, rr.y, r.w - 2, rr.h);
        if (row.recent) {
          g.fillStyle = ACCENT;
          g.fillRect(r.x + 1, rr.y + 3, px(dc, 2, 1.5), rr.h - 6);
        }
      }
      g.font = MONO(px(dc, 11.5, 7));
      g.fillStyle = row.param ? '#c9b8ff' : DIM;
      g.textAlign = 'left';
      g.fillText(fitText(g, row.name, MONO, px(dc, 11.5, 7), r.w * 0.5 - pad, 6), r.x + pad, rr.y + rr.h / 2 + 1);
      const v = row.value || '—';
      g.fillStyle =
        !row.value ? FAINT : row.kind === 'ptr' ? PTR : row.kind === 'dangling' ? ERR : row.kind === 'undef' || row.kind === 'null' ? FAINT : FG;
      g.textAlign = 'right';
      g.font = MONO(px(dc, 11.5, 7), 600);
      g.fillText(fitText(g, v, (s) => MONO(s, 600), px(dc, 11.5, 7), r.w * 0.5 - pad, 6), r.x + r.w - pad, rr.y + rr.h / 2 + 1);
    }
    g.globalAlpha = 1;
  },

  chest(dc, r, c) {
    const g = dc.g;
    const rad = px(dc, 4, 2);
    card(g, r, rad, CARD, c.flash > 0 ? ACCENT : c.recent ? ACCENT : c.value === null ? '#2a2c31' : '#44474f');
    if (c.flash > 0) {
      rrect(g, r.x, r.y, r.w, r.h, rad);
      g.fillStyle = `rgba(138,180,255,${0.3 * c.flash})`;
      g.fill();
    }
    g.fillStyle = c.value === null ? FAINT : FG;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, c.value ?? '—', (s) => MONO(s, 600), px(dc, 12, 7), r.w - 6, 6), r.x + r.w / 2, r.y + r.h / 2 + 1);
    g.font = MONO(px(dc, 11, 7));
    g.fillStyle = c.selected ? ACCENT : DIM;
    g.textAlign = 'left';
    g.fillText(c.name, r.x + r.w + px(dc, 6), r.y + r.h / 2 + 1);
    if (c.selected || c.hovered) outline(g, r, rad, c.selected);
  },

  proc(dc, r, p) {
    const g = dc.g;
    const rad = px(dc, 6, 3);
    card(g, r, rad, '#18191c', p.state === 'running' ? '#3d4048' : LINE);
    const pad = px(dc, 12);
    g.font = MONO(px(dc, 12, 7));
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = DIM;
    g.fillText('$ ./a.out', r.x + pad, r.y + pad);
    const out = tailLines(p.out, 2);
    g.font = MONO(px(dc, 10.5, 7));
    g.fillStyle = FG;
    out.forEach((l, i) => g.fillText(fitText(g, l, MONO, px(dc, 10.5, 7), r.w - pad * 2, 6), r.x + pad, r.y + pad + px(dc, 16) + i * px(dc, 13)));
    const dy = out.length ? px(dc, 13) * out.length - px(dc, 4) : 0;
    if (p.state === 'done' && p.exit !== null) {
      const big = out.length ? 16 : 22;
      g.font = MONO(px(dc, big, 9), 600);
      g.fillStyle = RET;
      g.fillText(fitText(g, `exit ${p.exit}`, (s) => MONO(s, 600), px(dc, big, 9), r.w - pad * 2, 8), r.x + pad, r.y + pad + px(dc, 26) + dy);
    } else if (p.state === 'crashed') {
      g.font = MONO(px(dc, 18, 9), 600);
      g.fillStyle = ERR;
      g.fillText('crashed', r.x + pad, r.y + pad + px(dc, 26) + dy);
    } else if (p.state === 'running' && Math.floor(dc.time * 2) % 2 === 0) {
      g.fillStyle = FG;
      g.fillRect(r.x + pad, r.y + pad + px(dc, 26), px(dc, 8), px(dc, 16));
    }
    g.font = UI(px(dc, 10, 7), 600);
    g.fillStyle = FAINT;
    g.textBaseline = 'alphabetic';
    g.fillText('PROCESS', r.x + pad, r.y + r.h - pad + px(dc, 2));
    if (p.selected || p.hovered) outline(g, r, rad, p.selected);
  },

  plate(dc, x, y, text, kind) {
    const g = dc.g;
    const fs = px(dc, 11.5, 7);
    g.font = MONO(fs, 600);
    const h = fs + px(dc, 8, 4);
    const w = Math.max(h, g.measureText(text).width + px(dc, 14, 8));
    const col = kind === 'ptr' ? PTR : kind === 'ret' ? RET : kind === 'void' ? FAINT : ACCENT;
    rrect(g, x - w / 2, y - h / 2, w, h, h / 2);
    g.fillStyle = '#23252a';
    g.fill();
    g.strokeStyle = col;
    g.lineWidth = 1.2;
    g.stroke();
    g.fillStyle = kind === 'void' ? DIM : FG;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y + 0.5);
  },

  wire(dc, pts, complete) {
    const g = dc.g;
    g.lineCap = 'round';
    strokeLine(g, pts, px(dc, 1.6, 1.2), PTR);
    g.fillStyle = PTR;
    g.beginPath(); g.arc(pts[0][0], pts[0][1], px(dc, 2.5, 2), 0, Math.PI * 2); g.fill();
    if (!complete) return;
    const [x, y] = pts[pts.length - 1];
    const [x0, y0] = pts[pts.length - 2];
    const l = Math.hypot(x - x0, y - y0) || 1;
    arrowHead(g, x, y, (x - x0) / l, (y - y0) / l, px(dc, 7, 5), PTR);
  },

  dangling(dc, [x, y]) {
    const L = 22 * dc.z;
    strokeLine(dc.g, [[x, y], [x + L, y + L * 0.4]], px(dc, 1.6, 1.2), ERR, [3, 3]);
  },

  pulse(dc, x, y) {
    const g = dc.g;
    const r = px(dc, 9, 5);
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2);
    grad.addColorStop(0, 'rgba(255,138,122,0.9)');
    grad.addColorStop(1, 'rgba(255,138,122,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r * 2, 0, Math.PI * 2); g.fill();
  },

  ghost(dc, r, label) {
    const g = dc.g;
    rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, px(dc, 6, 3));
    g.strokeStyle = '#3a3d44';
    g.setLineDash([4, 4]);
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash([]);
    g.font = UI(px(dc, 12, 7));
    g.fillStyle = FAINT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, label, (s) => UI(s), px(dc, 12, 7), r.w - 12, 6), r.x + r.w / 2, r.y + r.h / 2);
  },

  beltHandle(dc, [x, y]) {
    const g = dc.g;
    g.fillStyle = '#131416';
    g.beginPath(); g.arc(x, y, px(dc, 7, 5), 0, Math.PI * 2); g.fill();
    g.strokeStyle = ACCENT;
    g.lineWidth = 2;
    g.stroke();
  },

  icon(g, kind: IconKind, s) {
    const u = s / 24;
    switch (kind) {
      case 'node':
        card(g, { x: 3 * u, y: 5 * u, w: 18 * u, h: 14 * u }, 3 * u, CARD, ACCENT);
        g.fillStyle = FG; g.fillRect(6 * u, 9 * u, 9 * u, 2 * u);
        g.fillStyle = ACCENT; g.beginPath(); g.arc(7 * u, 14.5 * u, 1.4 * u, 0, 7); g.fill();
        return;
      case 'belt':
        strokeLine(g, [[3 * u, 12 * u], [18 * u, 12 * u]], 1.8 * u, ACCENT);
        arrowHead(g, 21 * u, 12 * u, 1, 0, 5 * u, ACCENT);
        return;
      case 'frame':
        card(g, { x: 4 * u, y: 4 * u, w: 16 * u, h: 16 * u }, 2 * u, '#17181b', '#44474f');
        g.fillStyle = DIM; g.fillRect(7 * u, 9 * u, 5 * u, 1.5 * u); g.fillRect(7 * u, 14 * u, 5 * u, 1.5 * u);
        g.fillStyle = FG; g.fillRect(14 * u, 9 * u, 3 * u, 1.5 * u); g.fillRect(14 * u, 14 * u, 3 * u, 1.5 * u);
        return;
      case 'wire':
        g.strokeStyle = PTR; g.lineWidth = 1.8 * u;
        g.beginPath(); g.moveTo(4 * u, 7 * u); g.bezierCurveTo(8 * u, 21 * u, 16 * u, 21 * u, 20 * u, 8 * u); g.stroke();
        return;
      case 'chest':
        card(g, { x: 6 * u, y: 6 * u, w: 12 * u, h: 12 * u }, 2 * u, CARD, '#6a6e78');
        return;
      default:
        genericIcon(g, kind, s, DIM, '#131416');
    }
  },
};
