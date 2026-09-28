// A theme kit: one implementation of every skin hook, driven by a spec
// (palette, fonts, how a card and the floor look, flourishes). The four
// "fun" themes (Blueprint, Factory floor, Game Boy, Synthwave) are specs; the
// original four skins keep their own hand-written files.
import { genericIcon } from './icons';
import { drawCrate, drawInterior, drawSprite, drawStrip, type SpritePalette } from './sprites';
import type { BeltOpts } from './kit-types';
import type { Dc, IconKind, NodeInfo, Pt, Rect, Skin } from './types';
import { arrowHead, baseName, beltMid, brackets, dirName, fitText, rrect, strokeLine, tailLines, Walk } from './util';

export interface Palette {
  bg: string; // the floor
  card: string; // machines, panels
  panel: string; // frame panels, plates
  line: string; // card edges
  fg: string;
  dim: string;
  faint: string;
  accent: string; // running, calls
  ptr: string; // pointers
  ret: string; // returns, results
  wait: string;
  err: string;
  param: string; // parameter names in frames
  cell: string; // a byte in memory
  track: string; // the memory strip's track
}

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  p: Palette;
  ui: (px: number, weight?: number) => string; // labels
  mono: (px: number, weight?: number) => string; // code and values
  radius: number; // corner radius at zoom 1 (0 = square)
  upper?: boolean; // titles in capitals
  spotlight: string;
  pixel?: boolean; // snap every rect to whole pixels (Game Boy)
  // how the theme draws a card (machine motor, module, frame…)
  card(dc: Dc, r: Rect, o: { fill: string; stroke: string; lw: number; glow: string | null; kind: 'node' | 'module' | 'frame' | 'proc' | 'chest' | 'plate' | 'wall' }): void;
  background(dc: Dc, camX: number, camY: number): void;
  // optional: the theme's own belt, and extra touches on top of the defaults
  belt?(dc: Dc, pts: Pt[], o: BeltOpts, t: Theme): void;
  nodeDecor?(dc: Dc, r: Rect, n: NodeInfo, t: Theme): void;
  wallDecor?(dc: Dc, r: Rect, head: Rect, live: boolean, t: Theme): void;
  pulseColor?: string;
  // desktop themes: machines and files are windows
  window?: WindowStyle;
}

export interface WindowStyle {
  border: number; // frame thickness, px at zoom 1
  corner: number; // window corner radius, px at zoom 1
  squareBottom?: boolean; // rounded only at the top (XP)
  flushTitle?: boolean; // the title bar is the top edge itself (XP): the frame runs down the sides and along the bottom
  titleH: number; // title bar height, px at zoom 1
  face: string; // a machine's client area
  workspace: string; // a file's client area (behind its machines)
  frame(dc: Dc, r: Rect, active: boolean, client: string): void; // the whole window: frame and client fill
  titleBar(dc: Dc, r: Rect, title: string, active: boolean, buttons: boolean): void;
  progress(dc: Dc, r: Rect, fill: number, anim: boolean): void;
}

const px = (dc: Dc, v: number, min = 1) => Math.max(min, v * dc.z);

export function makeSkin(t: Theme): Skin {
  const { p } = t;
  const sprite: SpritePalette = { body: p.card, edge: p.line, track: p.track, cell: p.cell, text: p.fg, muted: p.dim, accent: p.accent, marker: p.ret, selection: p.accent, font: (s) => t.mono(s), radius: t.radius };
  const cap = (s: string) => (t.upper ? s.toUpperCase() : s);
  const R = (dc: Dc) => px(dc, t.radius, t.radius ? 1 : 0);
  const snapR = (r: Rect): Rect => (t.pixel ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } : r);
  const outline = (dc: Dc, r: Rect, strong: boolean) => {
    const g = dc.g;
    rrect(g, r.x - 4, r.y - 4, r.w + 8, r.h + 8, R(dc) + 4);
    g.strokeStyle = strong ? p.accent : p.dim;
    g.lineWidth = strong ? 2 : 1;
    g.setLineDash(strong ? [] : [4, 3]);
    g.stroke();
    g.setLineDash([]);
  };
  const ports = (dc: Dc, r: Rect, ins: number[], outs: number[], col: string) => {
    const g = dc.g;
    g.fillStyle = col;
    for (const [x, ys] of [[r.x, ins], [r.x + r.w, outs]] as [number, number[]][]) {
      for (const y of ys) {
        if (t.pixel) g.fillRect(Math.round(x - 3), Math.round(y - 3), 6, 6);
        else (g.beginPath(), g.arc(x, y, px(dc, 3, 2), 0, Math.PI * 2), g.fill());
      }
    }
  };
  const stateCol = (s: string, stale = false) => (stale ? p.faint : s === 'running' ? p.accent : s === 'waiting' ? p.wait : s === 'error' ? p.err : p.faint);
  const glowOf = (s: string) => (s === 'running' ? p.accent : s === 'error' ? p.err : null);

  const skin: Skin = {
    id: t.id,
    name: t.name,
    blurb: t.blurb,
    casing: p.bg,
    spotlight: t.spotlight,
    solidMachines: !!t.window,
    strip(dc, r, info) { drawStrip(dc, r, info, sprite); },
    sprite(dc, r, kind, info) { drawSprite(dc, r, kind, info, sprite); },
    crate(dc, x, y, c) { drawCrate(dc, x, y, c, sprite); },
    interior(dc, r, i) { drawInterior(dc, r, i, sprite); },
    background(dc, camX, camY) { t.background(dc, camX, camY); },

    belt(dc, pts, o) {
      if (t.belt) return t.belt(dc, pts, o, t);
      const g = dc.g;
      g.lineCap = t.pixel ? 'square' : 'round';
      g.lineJoin = t.pixel ? 'miter' : 'round';
      const col = o.live ? p.accent : o.hovered || o.selected ? p.dim : p.faint;
      if (o.selected) strokeLine(g, pts, px(dc, 8, 5), p.faint);
      strokeLine(g, pts, px(dc, 2, 1.4), col);
      if (o.live) strokeLine(g, pts, px(dc, 2.6, 1.8), p.accent, [px(dc, 4), px(dc, 9)], -dc.time * 40 * dc.z * o.dir);
      const w = new Walk(pts);
      const end = w.at(w.length);
      arrowHead(g, end.x, end.y, end.dx, end.dy, px(dc, 7, 5), col);
      countBadge(dc, pts, o, t);
    },

    module(dc, r0, m) {
      const g = dc.g;
      const r = snapR(r0);
      t.card(dc, r, { fill: p.card, stroke: m.state === 'running' ? p.accent : m.state === 'error' ? p.err : m.hovered ? p.dim : p.line, lw: 1.5, glow: glowOf(m.state), kind: 'module' });
      const pad = px(dc, 12);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      const dir = dirName(m.name);
      g.fillStyle = p.faint;
      if (dir) g.fillText(fitText(g, dir, t.mono, px(dc, 10, 6), r.w - pad * 2, 6), r.x + pad, r.y + px(dc, 4));
      g.fillStyle = p.fg;
      g.fillText(fitText(g, cap(baseName(m.name)), (s) => t.ui(s, 700), px(dc, 14, 8), r.w - pad * 2 - px(dc, 22), 6), r.x + pad, r.y + px(dc, 14));
      g.fillStyle = m.state === 'idle' ? p.faint : p.accent;
      g.textAlign = 'right';
      g.font = t.mono(px(dc, 10.5, 7), 600);
      g.fillText(m.depth > 1 ? `×${m.depth}` : String(m.fns), r.x + r.w - pad, r.y + px(dc, 15));
      const rowH = 0.55 * dc.cs;
      const top = r.y + px(dc, 40);
      g.textBaseline = 'middle';
      m.doors.forEach((d, i) => {
        const y = top + i * rowH + rowH / 2;
        g.fillStyle = d.live ? p.accent : d.undeclared ? p.wait : p.faint;
        g.fillRect(r.x + pad, y - px(dc, 2.5), px(dc, 5, 3), px(dc, 5, 3));
        g.fillStyle = d.live ? p.fg : p.dim;
        g.textAlign = 'left';
        g.fillText(fitText(g, d.name, (s) => t.mono(s, d.live ? 700 : 400), px(dc, 11, 7), r.w - pad * 2 - px(dc, 10), 6), r.x + pad + px(dc, 10), y);
      });
      if (m.more) {
        g.fillStyle = p.faint;
        g.font = t.mono(px(dc, 10, 6));
        g.fillText(`+${m.more} more`, r.x + pad + px(dc, 10), top + m.doors.length * rowH + rowH / 2);
      }
      if (m.state !== 'idle') {
        g.fillStyle = stateCol(m.state);
        g.textBaseline = 'alphabetic';
        const s = m.state === 'error' ? 'crashed' : `${m.state === 'waiting' ? 'waiting in' : 'running'} ${m.running ?? ''}`;
        g.fillText(fitText(g, cap(s), (x) => t.ui(x), px(dc, 11, 7), r.w - pad * 2, 6), r.x + pad, r.y + r.h - px(dc, 8));
      }
      ports(dc, r, m.inPorts, m.outPorts, p.line);
      if (m.selected || m.hovered) outline(dc, r, m.selected);
    },

    wall(dc, r0, w) {
      const g = dc.g;
      const r = snapR(r0);
      if (t.window) {
        const W = t.window;
        const b = Math.max(1, W.border * dc.z);
        // on a desktop, the selected window is simply the active one: no box around it
        const active = w.live || w.selected;
        W.frame(dc, r, active, w.kind === 'module' ? W.workspace : W.face);
        if (w.head.h <= 0) return;
        const th = Math.max(8, Math.min(w.head.h - b, W.titleH * dc.z));
        const note = w.note ? ` - ${w.note[0].toUpperCase()}${w.note.slice(1)}` : '';
        W.titleBar(dc, titleRect(r, b, th, W), `${w.name}${note}${w.pinned ? ' (pinned)' : ''}`, active, true);
        return;
      }
      t.card(dc, r, { fill: 'transparent', stroke: w.live ? p.accent : p.line, lw: 1.2, glow: w.live ? p.accent : null, kind: 'wall' });
      const h = w.head;
      t.wallDecor?.(dc, r, h, w.live, t);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillStyle = w.live ? p.accent : p.dim;
      g.fillText(fitText(g, cap(w.name), (s) => t.ui(s, 700), px(dc, 11.5, 7), h.w - px(dc, 110), 6), h.x + px(dc, 12), h.y + h.h / 2);
      g.textAlign = 'right';
      g.fillStyle = p.faint;
      g.font = t.mono(px(dc, 10, 6));
      g.fillText(cap(`${w.note ?? `${w.fns} fn${w.fns === 1 ? '' : 's'}`}${w.pinned ? ' · pinned' : ''}`), h.x + h.w - px(dc, 12), h.y + h.h / 2);
      if (w.selected || w.hovered) outline(dc, r, w.selected);
    },

    attention(dc, r, a) {
      const g = dc.g;
      if (t.window) {
        // a window that wants attention: its title bar flashes, and a soft
        // ring follows its own corners (no square brackets on a desktop)
        const W = t.window;
        const b = Math.max(1, W.border * dc.z);
        const c = W.corner * dc.z;
        g.save();
        const tr = titleRect(r, b, Math.min(r.h - 2 * b, W.titleH * dc.z), W);
        const tc = W.flushTitle ? c : Math.max(0, c - b);
        rrect(g, tr.x, tr.y, tr.w, tr.h, [tc, tc, 0, 0]);
        g.fillStyle = p.accent;
        g.globalAlpha = 0.35 * a;
        g.fill();
        rrect(g, r.x - 2, r.y - 2, r.w + 4, r.h + 4, W.squareBottom ? [c + 2, c + 2, 0, 0] : c + 2);
        g.strokeStyle = p.accent;
        g.globalAlpha = 0.2 * a;
        g.lineWidth = Math.max(4, 7 * dc.z);
        g.stroke();
        g.globalAlpha = 0.7 * a;
        g.lineWidth = Math.max(1, 1.5 * dc.z);
        g.stroke();
        g.restore();
        return;
      }
      g.save();
      g.strokeStyle = p.accent;
      // a wide faint halo, then the corners (a blur here is too costly to paint)
      g.globalAlpha = Math.min(1, a * 1.2) * 0.25;
      g.lineWidth = Math.max(6, 10 * dc.z);
      brackets(g, r, 5 + 12 * (1 - a), Math.max(8, 14 * dc.z));
      g.globalAlpha = Math.min(1, a * 1.2);
      g.lineWidth = Math.max(1.5, 2.5 * dc.z);
      brackets(g, r, 5 + 12 * (1 - a), Math.max(8, 14 * dc.z));
      g.restore();
    },

    door(dc, [x, y], vertical, live) {
      const g = dc.g;
      const L = px(dc, 12, 7);
      g.strokeStyle = live ? p.accent : p.dim;
      g.lineWidth = px(dc, 3, 2);
      g.lineCap = t.pixel ? 'square' : 'round';
      g.beginPath();
      if (vertical) (g.moveTo(x, y - L / 2), g.lineTo(x, y + L / 2));
      else (g.moveTo(x - L / 2, y), g.lineTo(x + L / 2, y));
      g.stroke();
    },

    node(dc, r0, n) {
      const g = dc.g;
      const r = snapR(r0);
      if (t.window) {
        const W = t.window;
        const active = n.state === 'running' || n.state === 'error' || n.selected;
        const b = Math.max(1, W.border * dc.z);
        W.frame(dc, r, active, W.face);
        const th = Math.max(8, W.titleH * dc.z);
        W.titleBar(dc, titleRect(r, b, th, W), n.stale ? `${n.name} (Not Responding)` : n.name, active, true);
        const pad = px(dc, 8, 3);
        let cy = r.y + b + th + px(dc, 7);
        const status = n.stale ? 'Not responding' : n.state === 'running' ? 'Running…' : n.state === 'waiting' ? `Waiting for ${n.waitingOn ?? '…'}` : n.state === 'error' ? 'Stopped working' : 'Ready';
        g.fillStyle = n.state === 'error' ? p.err : p.fg;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillText(fitText(g, status, (x) => t.ui(x), px(dc, 11, 7), r.w - pad * 2 - b * 2, 6), r.x + b + pad, cy);
        cy += px(dc, 18, 9);
        W.progress(dc, { x: r.x + b + pad, y: cy, w: r.w - 2 * (b + pad), h: px(dc, 14, 6) }, n.state === 'waiting' ? 0.45 : n.state === 'running' ? 1 : 0, n.state === 'running');
        g.fillStyle = p.dim;
        g.textBaseline = 'alphabetic';
        const meta = [`${n.params} param${n.params === 1 ? '' : 's'}`, n.isStatic ? 'static' : '', n.frames > 1 ? `×${n.frames}` : '', n.pinned ? 'pinned' : ''].filter(Boolean).join(' · ');
        g.fillText(fitText(g, meta, (x) => t.ui(x), px(dc, 10, 6), r.w - pad * 2 - b * 2, 6), r.x + b + pad, r.y + r.h - b - px(dc, 5));
        if (n.editing) (g.fillStyle = p.accent), g.fillRect(r.x + b, r.y + b + th, px(dc, 3, 2), r.h - th - 2 * b);
        t.nodeDecor?.(dc, r, n, t);
        ports(dc, r, n.inPorts, n.outPorts, active ? p.accent : p.line);
        return;
      }
      t.card(dc, r, { fill: p.card, stroke: n.state === 'running' ? p.accent : n.state === 'error' ? p.err : n.hovered ? p.dim : p.line, lw: n.state === 'running' ? 2 : 1.2, glow: glowOf(n.state), kind: 'node' });
      if (n.stale) g.globalAlpha = 0.5;
      const pad = px(dc, 11);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = p.fg;
      g.fillText(fitText(g, cap(n.name), (s) => t.ui(s, 700), px(dc, 14, 8), r.w - pad * 2 - px(dc, 18), 6), r.x + pad, r.y + pad);
      const col = stateCol(n.state, n.stale);
      const sy = r.y + pad + px(dc, 26);
      g.fillStyle = col;
      g.fillRect(r.x + pad, sy + px(dc, 3), px(dc, 6, 3), px(dc, 6, 3));
      const status = n.stale ? 'stale' : n.state === 'waiting' ? `waiting on ${n.waitingOn ?? '…'}` : n.state;
      g.fillText(fitText(g, cap(status), (s) => t.ui(s), px(dc, 12, 7), r.w - pad * 2 - px(dc, 12), 6), r.x + pad + px(dc, 12), sy);
      g.fillStyle = p.faint;
      g.textBaseline = 'alphabetic';
      const meta = [`${n.params} param${n.params === 1 ? '' : 's'}`, n.isStatic ? 'static' : '', n.pinned ? 'pinned' : ''].filter(Boolean).join(' · ');
      g.fillText(fitText(g, cap(meta), t.mono, px(dc, 10.5, 7), r.w - pad * 2, 6), r.x + pad, r.y + r.h - pad + px(dc, 2));
      if (n.frames > 1) {
        g.fillStyle = p.accent;
        g.textAlign = 'right';
        g.textBaseline = 'top';
        g.font = t.mono(px(dc, 11, 7), 700);
        g.fillText(`×${n.frames}`, r.x + r.w - pad, r.y + pad);
      }
      if (n.editing) {
        g.fillStyle = p.accent;
        g.fillRect(r.x + 1, r.y + px(dc, 6), px(dc, 3, 2), r.h - px(dc, 12));
      }
      g.globalAlpha = 1;
      t.nodeDecor?.(dc, r, n, t);
      ports(dc, r, n.inPorts, n.outPorts, n.state === 'running' ? p.accent : p.line);
      if (n.selected || n.hovered) outline(dc, r, n.selected);
    },

    frame(dc, r0, f) {
      const g = dc.g;
      const r = snapR(r0);
      for (let k = Math.min(f.stacked, 3); k > 0; k--) {
        const o = px(dc, 4) * k;
        t.card(dc, { x: r.x + o, y: r.y + o, w: r.w, h: r.h }, { fill: p.panel, stroke: p.line, lw: 1, glow: null, kind: 'frame' });
      }
      t.card(dc, r, { fill: p.panel, stroke: f.mode === 'live' ? p.line : p.faint, lw: 1, glow: null, kind: 'frame' });
      g.globalAlpha = f.mode === 'live' ? 1 : f.mode === 'returned' ? 0.65 : 0.4;
      const pad = px(dc, 9);
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = f.mode === 'live' ? p.dim : p.faint;
      g.font = t.ui(px(dc, 9.5, 7), 700);
      g.fillText(f.mode === 'live' ? 'STORAGE' : f.mode === 'returned' ? 'LAST RUN' : 'NOT RUNNING', r.x + pad, f.head.y + f.head.h / 2 + 1);
      for (const row of f.rows) {
        const rr = row.rect;
        if (row.recent || row.flash > 0) {
          g.save();
          g.globalAlpha *= row.recent ? 0.22 : 0.4 * row.flash;
          g.fillStyle = p.accent;
          g.fillRect(r.x + 1, rr.y, r.w - 2, rr.h);
          g.restore();
          if (row.recent) (g.fillStyle = p.accent), g.fillRect(r.x + 1, rr.y + 3, px(dc, 2.5, 2), rr.h - 6);
        }
        g.textAlign = 'left';
        g.fillStyle = row.depth ? p.faint : row.param ? p.param : p.dim;
        g.fillText(fitText(g, row.name, t.mono, px(dc, 11.5, 7), r.w * 0.5 - pad, 6), r.x + pad, rr.y + rr.h / 2 + 1);
        const v = row.value || '—';
        g.fillStyle = !row.value ? p.faint : row.kind === 'ptr' ? p.ptr : row.kind === 'dangling' ? p.err : row.kind === 'undef' || row.kind === 'null' ? p.faint : p.fg;
        g.textAlign = 'right';
        g.fillText(fitText(g, v, (s) => t.mono(s, 700), px(dc, 11.5, 7), r.w * 0.5 - pad, 6), r.x + r.w - pad, rr.y + rr.h / 2 + 1);
      }
      g.globalAlpha = 1;
    },

    chest(dc, r, c) {
      const g = dc.g;
      t.card(dc, r, { fill: p.card, stroke: c.flash > 0 || c.recent ? p.accent : p.line, lw: 1.2, glow: c.flash > 0 ? p.accent : null, kind: 'chest' });
      g.fillStyle = c.value === null ? p.faint : p.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(fitText(g, c.value ?? '—', (s) => t.mono(s, 700), px(dc, 12, 7), r.w - 6, 6), r.x + r.w / 2, r.y + r.h / 2 + 1);
      g.fillStyle = c.selected ? p.accent : p.dim;
      g.textAlign = 'left';
      g.font = t.mono(px(dc, 11, 7));
      g.fillText(c.name, r.x + r.w + px(dc, 6), r.y + r.h / 2 + 1);
      if (c.selected || c.hovered) outline(dc, r, c.selected);
    },

    proc(dc, r0, pr) {
      const g = dc.g;
      const r = snapR(r0);
      t.card(dc, r, { fill: p.panel, stroke: pr.state === 'running' ? p.accent : p.line, lw: 1.5, glow: pr.state === 'running' ? p.accent : null, kind: 'proc' });
      const pad = px(dc, 11);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillStyle = p.dim;
      g.font = t.mono(px(dc, 12, 7));
      g.fillText('$ ./a.out', r.x + pad, r.y + pad);
      const out = tailLines(pr.out, 2);
      g.fillStyle = p.fg;
      out.forEach((l, i) => g.fillText(fitText(g, l, t.mono, px(dc, 10.5, 7), r.w - pad * 2, 6), r.x + pad, r.y + pad + px(dc, 16) + i * px(dc, 13)));
      const dy = out.length ? px(dc, 13) * out.length - px(dc, 4) : 0;
      if (pr.state === 'done' && pr.exit !== null) {
        g.fillStyle = p.ret;
        g.fillText(fitText(g, cap(`exit ${pr.exit}`), (s) => t.mono(s, 700), px(dc, out.length ? 16 : 22, 9), r.w - pad * 2, 8), r.x + pad, r.y + pad + px(dc, 26) + dy);
      } else if (pr.state === 'crashed') {
        g.fillStyle = p.err;
        g.font = t.mono(px(dc, 18, 9), 700);
        g.fillText(cap('crashed'), r.x + pad, r.y + pad + px(dc, 26) + dy);
      } else if (pr.state === 'running' && Math.floor(dc.time * 2) % 2 === 0) {
        g.fillStyle = p.fg;
        g.fillRect(r.x + pad, r.y + pad + px(dc, 26), px(dc, 8), px(dc, 16));
      }
      g.fillStyle = p.faint;
      g.textBaseline = 'alphabetic';
      g.font = t.ui(px(dc, 10, 7), 700);
      g.fillText('PROCESS', r.x + pad, r.y + r.h - pad + px(dc, 2));
      if (pr.selected || pr.hovered) outline(dc, r, pr.selected);
    },

    plate(dc, x, y, text, kind) {
      const g = dc.g;
      const fs = px(dc, 11.5, 7);
      g.font = t.mono(fs, 700);
      const h = fs + px(dc, 8, 4);
      const w = Math.max(h, g.measureText(text).width + px(dc, 14, 8));
      const col = kind === 'ptr' ? p.ptr : kind === 'ret' ? p.ret : kind === 'void' ? p.faint : p.accent;
      t.card(dc, snapR({ x: x - w / 2, y: y - h / 2, w, h }), { fill: p.panel, stroke: col, lw: 1.3, glow: kind === 'void' ? null : col, kind: 'plate' });
      g.fillStyle = kind === 'void' ? p.dim : p.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = t.mono(fs, 700);
      g.fillText(text, x, y + 0.5);
    },

    wire(dc, pts, complete) {
      const g = dc.g;
      g.lineCap = 'round';
      strokeLine(g, pts, px(dc, 1.8, 1.2), p.ptr);
      g.fillStyle = p.ptr;
      g.beginPath(); g.arc(pts[0][0], pts[0][1], px(dc, 2.5, 2), 0, Math.PI * 2); g.fill();
      if (!complete) return;
      const [x, y] = pts[pts.length - 1];
      const [x0, y0] = pts[pts.length - 2];
      const l = Math.hypot(x - x0, y - y0) || 1;
      arrowHead(g, x, y, (x - x0) / l, (y - y0) / l, px(dc, 7, 5), p.ptr);
    },

    dangling(dc, [x, y]) {
      const L = 22 * dc.z;
      strokeLine(dc.g, [[x, y], [x + L, y + L * 0.4]], px(dc, 1.6, 1.2), p.err, [3, 3]);
    },

    pulse(dc, x, y) {
      const g = dc.g;
      const r = px(dc, 9, 5);
      const c = t.pulseColor ?? p.ptr;
      if (/^#[0-9a-f]{6}$/i.test(c)) {
        // a plain dot (Barebone): no gradient to fill
        g.fillStyle = c;
        g.beginPath(); g.arc(x, y, r * 0.5, 0, Math.PI * 2); g.fill();
        return;
      }
      g.save();
      g.globalAlpha = 0.85;
      const grad = g.createRadialGradient(x, y, 0, x, y, r * 2);
      grad.addColorStop(0, c);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r * 2, 0, Math.PI * 2); g.fill();
      g.restore();
    },

    ghost(dc, r, label) {
      const g = dc.g;
      rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, R(dc));
      g.strokeStyle = p.faint;
      g.setLineDash([4, 4]);
      g.lineWidth = 1;
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = p.faint;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(fitText(g, cap(label), (s) => t.ui(s), px(dc, 12, 7), r.w - 12, 6), r.x + r.w / 2, r.y + r.h / 2);
    },

    beltHandle(dc, [x, y]) {
      const g = dc.g;
      g.fillStyle = p.bg;
      g.beginPath(); g.arc(x, y, px(dc, 7, 5), 0, Math.PI * 2); g.fill();
      g.strokeStyle = p.accent;
      g.lineWidth = 2;
      g.stroke();
    },

    icon(g, kind: IconKind, s) {
      const u = s / 24;
      const dc: Dc = { g, z: u, cs: 40 * u, time: 0, vw: s, vh: s };
      switch (kind) {
        case 'node':
          t.card(dc, { x: 3 * u, y: 5 * u, w: 18 * u, h: 14 * u }, { fill: p.card, stroke: p.accent, lw: 1.5, glow: null, kind: 'node' });
          g.fillStyle = p.fg; g.fillRect(6 * u, 9 * u, 9 * u, 2 * u);
          g.fillStyle = p.accent; g.fillRect(6 * u, 13.5 * u, 3 * u, 3 * u);
          return;
        case 'belt':
          strokeLine(g, [[3 * u, 12 * u], [18 * u, 12 * u]], 2 * u, p.accent);
          arrowHead(g, 21 * u, 12 * u, 1, 0, 5 * u, p.accent);
          return;
        case 'frame':
          t.card(dc, { x: 4 * u, y: 4 * u, w: 16 * u, h: 16 * u }, { fill: p.panel, stroke: p.dim, lw: 1, glow: null, kind: 'frame' });
          g.fillStyle = p.dim; g.fillRect(7 * u, 9 * u, 5 * u, 1.5 * u); g.fillRect(7 * u, 14 * u, 5 * u, 1.5 * u);
          g.fillStyle = p.fg; g.fillRect(14 * u, 9 * u, 3 * u, 1.5 * u); g.fillRect(14 * u, 14 * u, 3 * u, 1.5 * u);
          return;
        case 'wire':
          g.strokeStyle = p.ptr; g.lineWidth = 1.8 * u;
          g.beginPath(); g.moveTo(4 * u, 7 * u); g.bezierCurveTo(8 * u, 21 * u, 16 * u, 21 * u, 20 * u, 8 * u); g.stroke();
          return;
        case 'chest':
          t.card(dc, { x: 6 * u, y: 6 * u, w: 12 * u, h: 12 * u }, { fill: p.card, stroke: p.dim, lw: 1, glow: null, kind: 'chest' });
          return;
        default:
          genericIcon(g, kind, s, p.dim, p.bg);
      }
    },
  };
  return skin;
}

// Where a window's title bar goes: inside the frame, or (XP) as the frame's top edge.
function titleRect(r: Rect, b: number, th: number, W: WindowStyle): Rect {
  return W.flushTitle ? { x: r.x, y: r.y, w: r.w, h: th } : { x: r.x + b, y: r.y + b, w: r.w - 2 * b, h: th };
}

// How many calls a trunk carries, on its middle leg.
export function countBadge(dc: Dc, pts: Pt[], o: BeltOpts, t: Theme): void {
  if (o.count <= 1) return;
  const g = dc.g;
  const [mx, my] = beltMid(pts);
  const fs = px(dc, 10.5, 7);
  g.font = t.mono(fs, 700);
  const txt = `${o.count}`;
  const w = Math.max(g.measureText(txt).width + px(dc, 10), fs + px(dc, 6));
  const h = fs + px(dc, 6);
  t.card(dc, { x: mx - w / 2, y: my - h / 2, w, h }, { fill: t.p.bg, stroke: o.live ? t.p.accent : t.p.dim, lw: 1.2, glow: null, kind: 'plate' });
  g.fillStyle = o.live ? t.p.accent : t.p.dim;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = t.mono(fs, 700);
  g.fillText(txt, mx, my + 0.5);
}

// A plain card: rounded (or square) fill and edge, with an optional glow.
export function plainCard(dc: Dc, r: Rect, radius: number, o: { fill: string; stroke: string; lw: number; glow: string | null }): void {
  const g = dc.g;
  g.save();
  if (o.glow) {
    g.shadowColor = o.glow;
    g.shadowBlur = 16 * dc.z;
  }
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, Math.max(0, radius * dc.z));
  if (o.fill !== 'transparent') {
    g.fillStyle = o.fill;
    g.fill();
  }
  g.shadowBlur = 0;
  g.strokeStyle = o.stroke;
  g.lineWidth = o.lw;
  g.stroke();
  g.restore();
}

// A screen-sized backdrop (a wallpaper) painted once per size and pixel
// ratio, then copied each frame: gradients over the whole canvas are costly.
const backdrops = new Map<string, HTMLCanvasElement>();
export function backdrop(dc: Dc, id: string, paint: (g: CanvasRenderingContext2D, W: number, H: number) => void): void {
  const g = dc.g;
  const dpr = g.getTransform().a || 1;
  const key = `${id}|${Math.round(dc.vw)}x${Math.round(dc.vh)}@${dpr}`;
  let c = backdrops.get(key);
  if (!c) {
    if (backdrops.size > 8) backdrops.clear();
    c = document.createElement('canvas');
    c.width = Math.round(dc.vw * dpr);
    c.height = Math.round(dc.vh * dpr);
    const cg = c.getContext('2d')!;
    cg.scale(dpr, dpr);
    paint(cg, dc.vw, dc.vh);
    backdrops.set(key, c);
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(c, 0, 0);
  g.restore();
}
