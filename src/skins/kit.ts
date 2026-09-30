// A theme kit: one implementation of every skin hook, driven by a spec
// (palette, fonts, how a card and the floor look, flourishes). The four
// "fun" themes (Blueprint, Factory floor, Game Boy, Synthwave) are specs; the
// original four skins keep their own hand-written files.
import { genericIcon } from './icons';
import { drawCrate, drawInterior, drawSprite, drawStrip, type SpritePalette } from './sprites';
import type { BeltOpts } from './kit-types';
import type { Dc, DockInfo, IconKind, NodeInfo, PlateKind, PlateRole, Pt, Rect, RowInfo, Skin } from './types';
import { INV_HEAD_PX, SLOT_PX } from '../machine';
import { cLiteral } from './stdbuf';
import { argLine, arrowHead, baseName, beltMid, brackets, dirName, drawCap, drawPast, drawRuns, drawTag, platePath, fitText, hiddenLines, rrect, strokeLine, tailLines, tailRuns, Walk, type CapLook, type TagLook } from './util';

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

// A skin's own drawing of the engine's newer pictures (docs/VISUALS.md),
// made from the parts it already has (its progress bar, its plates, its
// panels and lights), so each belongs to its skin: the capacity bar, the
// pointer address tag, the plate shapes, and the IN dock.
export interface Look {
  cap?: CapLook;
  tag?: TagLook;
  // an argument's or a return value's plate: its shape (hexagon, notched) filled and edged, in `col`
  plate?: (dc: Dc, x: number, y: number, w: number, h: number, role: PlateRole, col: string, kind: PlateKind) => void;
  dock?: KitDock;
}

// The IN dock as one of the skin's own storage panels (the same panel, rows,
// tags and capacity as PARAMETERS and LOCALS under it), titled IN and its
// state. The skin marks the state its own way (a light, a stripe, a halo):
// `lamp` draws it, in the state's colour, over the panel.
export interface KitDock {
  lamp(dc: Dc, r: Rect, head: Rect, s: { col: string; state: DockInfo['state']; stale: boolean }): void;
  inset?: number; // room at the head's left for the lamp, px at zoom 1
  run?: string; // the running colour, when it isn't the accent
}

export interface Theme {
  id: string;
  name: string;
  blurb: string;
  p: Palette;
  ui: (px: number, weight?: number) => string; // labels
  mono: (px: number, weight?: number) => string; // code and values
  radius: number; // corner radius at zoom 1 (0 = square)
  ptrTags?: boolean; // pointer rows show an address tag, not a value (prototyped in Barebone)
  capacity?: boolean; // draws the Norm's limits (prototyped in Barebone)
  stderr?: boolean; // its terminal tells stderr's text apart, in the error colour (prototyped in Barebone)
  plateShapes?: boolean; // a belt's arguments and return values differ in shape (prototyped in Barebone)
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
  // optional: the skin's own panel for a machine's storage and stations
  // (body and titled head); without it, the kit's plain card and caption
  panel?(dc: Dc, r: Rect, head: Rect, title: string, live: boolean): void;
  trail?(dc: Dc, pts: Pt[], kind: 'arg' | 'ret'): void; // Skin.trail
  flow?: string; // data in motion (live belts, argument plates) when it isn't the accent
  // desktop themes: machines and files are windows
  window?: WindowStyle;
  look?: Look;
}

export interface WindowStyle {
  border: number; // frame thickness, px at zoom 1
  corner: number; // window corner radius, px at zoom 1
  squareBottom?: boolean; // rounded only at the top (XP)
  flushTitle?: boolean; // the title bar is the top edge itself (XP): the frame runs down the sides and along the bottom
  titleH: number; // title bar height, px at zoom 1
  face: string; // a machine's client area
  workspace: string; // a file's client area (behind its machines)
  frame(dc: Dc, r: Rect, active: boolean, client: string, kind?: 'machine' | 'module' | 'node'): void; // the whole window: frame and client fill
  titleBar(dc: Dc, r: Rect, title: string, active: boolean, buttons: boolean): void;
  progress(dc: Dc, r: Rect, fill: number, anim: boolean): void;
}

const px = (dc: Dc, v: number, min = 1) => Math.max(min, v * dc.z);

export function makeSkin(t: Theme): Skin {
  const { p } = t;
  // read live from the palette: a theme may change its colours (PS3's tints)
  const sprite: SpritePalette = {
    get body() { return p.card; }, get edge() { return p.line; }, get track() { return p.track; }, get cell() { return p.cell; },
    get text() { return p.fg; }, get muted() { return p.dim; }, get accent() { return p.accent; }, get marker() { return p.ret; }, get selection() { return p.accent; },
    font: (s) => t.mono(s), radius: t.radius, get full() { return p.wait; }, get over() { return p.err; }, get capLook() { return t.look?.cap; }, panel: t.panel ? (dc, r, head, title, live) => t.panel!(dc, r, head, title, live) : undefined,
  };
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
    capacity: t.capacity,
    name: t.name,
    blurb: t.blurb,
    get casing() { return p.bg; }, // live: a theme may change its colours
    spotlight: t.spotlight,
    solidMachines: !!t.window,
    strip(dc, r, info) { drawStrip(dc, r, info, sprite); },
    sprite(dc, r, kind, info) { drawSprite(dc, r, kind, info, sprite); },
    crate(dc, x, y, c) { drawCrate(dc, x, y, c, sprite); },
    interior(dc, r, i) { drawInterior(dc, r, i, sprite); },
    background(dc, camX, camY) { t.background(dc, camX, camY); },
    trail: t.trail,

    belt(dc, pts, o) {
      if (t.belt) return t.belt(dc, pts, o, t);
      const g = dc.g;
      g.lineCap = t.pixel ? 'square' : 'round';
      g.lineJoin = t.pixel ? 'miter' : 'round';
      const flow = t.flow ?? p.accent;
      const col = o.live ? flow : o.hovered || o.selected ? p.dim : p.faint;
      if (o.selected) strokeLine(g, pts, px(dc, 8, 5), p.faint);
      strokeLine(g, pts, px(dc, 2, 1.4), col);
      if (o.live) strokeLine(g, pts, px(dc, 2.6, 1.8), flow, [px(dc, 4), px(dc, 9)], -dc.time * 40 * dc.z * o.dir);
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
      // with capacity, the Norm's 5 definitions up here, and the depth goes with the state below
      if (m.cap) drawCap(g, { ...m.cap, unit: cap('fns') }, r.x + r.w - pad, r.y + px(dc, 22), { font: t.mono, size: px(dc, 10, 6), faint: p.faint, full: p.wait, over: p.err, track: p.cell, look: t.look?.cap });
      else g.fillText(m.depth > 1 ? `×${m.depth}` : String(m.fns), r.x + r.w - pad, r.y + px(dc, 15));
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
        const s = (m.state === 'error' ? 'crashed' : `${m.state === 'waiting' ? 'waiting in' : 'running'} ${m.running ?? ''}`) + (m.cap && m.depth > 1 ? ` ×${m.depth}` : '');
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
        W.frame(dc, r, active, w.kind === 'module' ? W.workspace : W.face, w.kind === 'module' ? 'module' : 'machine');
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
      if (w.cap) drawCap(g, { ...w.cap, unit: cap('functions') }, h.x + h.w - px(dc, 12), h.y + h.h / 2, { font: t.mono, size: px(dc, 10, 6), faint: p.faint, full: p.wait, over: p.err, track: p.cell, look: t.look?.cap });
      else g.fillText(cap(`${w.note ?? `${w.fns} fn${w.fns === 1 ? '' : 's'}`}${w.pinned ? ' · pinned' : ''}`), h.x + h.w - px(dc, 12), h.y + h.h / 2);
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
        W.frame(dc, r, active, W.face, 'node');
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
      const label = f.title ? (f.mode === 'returned' ? `${f.title} · LAST RUN` : f.title) : f.mode === 'live' ? 'STORAGE' : f.mode === 'returned' ? 'LAST RUN' : 'NOT RUNNING';
      const pad = px(dc, 9);
      if (t.panel) {
        t.panel(dc, r, f.head, label, f.mode === 'live');
        g.globalAlpha = f.mode === 'live' ? 1 : f.mode === 'returned' ? 0.65 : 0.4;
      } else {
        t.card(dc, r, { fill: p.panel, stroke: f.mode === 'live' ? p.line : p.faint, lw: 1, glow: null, kind: 'frame' });
        g.globalAlpha = f.mode === 'live' ? 1 : f.mode === 'returned' ? 0.65 : 0.4;
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.fillStyle = f.mode === 'live' ? p.dim : p.faint;
        g.font = t.ui(px(dc, 9.5, 7), 700);
        g.fillText(label, r.x + pad, f.head.y + f.head.h / 2 + 1);
      }
      if (f.cap) drawCap(g, f.cap, r.x + r.w - pad, f.head.y + f.head.h / 2 + 1, { font: t.mono, size: px(dc, 9.5, 7), faint: p.faint, full: p.wait, over: p.err, track: p.cell, look: t.look?.cap });
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
        let vw: number;
        if (row.tag && t.ptrTags) vw = drawTag(g, row.tag, r.x + r.w - pad, rr.y + rr.h / 2, r.w * 0.5 - pad, { font: (s) => t.mono(s, 700), size: px(dc, 11, 7), col: row.kind === 'dangling' ? p.err : p.ptr, fill: p.cell, h: rr.h - px(dc, 5, 2), radius: px(dc, t.radius, 0), look: t.look?.tag });
        else {
          const vt = fitText(g, v, (s) => t.mono(s, 700), px(dc, 11.5, 7), r.w * 0.5 - pad, 6);
          g.fillText(vt, r.x + r.w - pad, rr.y + rr.h / 2 + 1);
          vw = g.measureText(vt).width;
        }
        if (row.past?.length) {
          g.font = t.mono(px(dc, 10, 6));
          g.fillStyle = p.faint;
          drawPast(g, row.past, r.x + r.w - pad - vw - px(dc, 4), rr.y + rr.h / 2 + 1, r.w * 0.5 - pad - vw - px(dc, 4));
        }
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
      const room = pr.lines ?? 2;
      const more = hiddenLines(pr.out, room);
      // the command as it ran; if the output is longer than fits, how many lines are above
      const moreText = more ? `+${more} ↑` : '';
      const moreW = more ? g.measureText(moreText).width + px(dc, 6) : 0;
      g.fillText(fitText(g, `$ ./${argLine(pr.args)}`, t.mono, px(dc, 12, 7), r.w - pad * 2 - moreW, 6), r.x + pad, r.y + pad);
      if (more) (g.textAlign = 'right'), g.fillText(moreText, r.x + r.w - pad, r.y + pad), (g.textAlign = 'left');
      const out = tailLines(pr.out, room);
      g.fillStyle = p.fg;
      if (t.stderr && pr.errSpans?.length) tailRuns(pr.out, pr.errSpans, room).forEach((l, i) => ((g.font = t.mono(px(dc, 10.5, 7))), drawRuns(g, l, r.x + pad, r.y + pad + px(dc, 16) + i * px(dc, 13), r.w - pad * 2, p.fg, p.err)));
      else out.forEach((l, i) => g.fillText(fitText(g, l, t.mono, px(dc, 10.5, 7), r.w - pad * 2, 6), r.x + pad, r.y + pad + px(dc, 16) + i * px(dc, 13)));
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

    plate(dc, x, y, text, kind, role) {
      const g = dc.g;
      const fs = px(dc, 11.5, 7);
      g.font = t.mono(fs, 700);
      const h = fs + px(dc, 8, 4);
      const shaped = !!role && t.plateShapes;
      const w = Math.max(h, g.measureText(text).width + px(dc, 14, 8) + (shaped ? h * 0.5 : 0));
      const col = kind === 'ptr' ? p.ptr : kind === 'ret' ? p.ret : kind === 'void' ? p.faint : t.flow ?? p.accent;
      if (shaped) {
        // a belt's argument or return value: its role in its outline
        if (t.look?.plate) t.look.plate(dc, x, y, w, h, role!, col, kind);
        else {
          platePath(g, x, y, w, h, role);
          g.fillStyle = p.panel;
          g.fill();
          g.strokeStyle = col;
          g.lineWidth = 1.3;
          g.stroke();
        }
      } else t.card(dc, snapR({ x: x - w / 2, y: y - h / 2, w, h }), { fill: p.panel, stroke: col, lw: 1.3, glow: kind === 'void' ? null : col, kind: 'plate' });
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
  if (t.look?.dock) {
    const L = t.look.dock;
    skin.dock = (dc, r, d) => {
      const g = dc.g;
      const col = d.state === 'running' && !d.stale && L.run ? L.run : stateCol(d.state, d.stale);
      const live = d.state !== 'idle';
      const word = d.state === 'running' ? 'running' : d.state === 'waiting' ? `waiting on ${d.waitingOn ?? '…'}` : d.state === 'error' ? 'crashed' : '';
      const title = cap(`IN${d.frames > 1 ? ` ×${d.frames}` : ''}`);
      const rowH = SLOT_PX * dc.z;
      const top = r.y + INV_HEAD_PX * dc.z;
      const rows: RowInfo[] = [];
      const row = (name: string, value: string, kind: RowInfo['kind'], o: Partial<RowInfo> = {}) => {
        const y = top + rows.length * rowH;
        if (y + rowH <= r.y + r.h) rows.push({ name, value, kind, param: false, recent: false, flash: 0, rect: { x: r.x, y, w: r.w, h: rowH }, depth: 0, fold: null, ...o });
      };
      if (word) row('state', word, d.state === 'error' ? 'dangling' : 'int');
      if (d.state === 'error' && d.crash) row(`died at line ${d.crash.line}`, d.crash.msg || ' ', 'dangling');
      if (d.before !== null) row(`called before step ${d.before.toLocaleString('en-US')}`, 'not traced', 'none');
      else if (!d.args) row('not called', ' ', 'none');
      else if (!d.args.length) row('no arguments', ' ', 'none');
      else {
        // no room for the rest: say how many, never drop them silently
        const room = Math.floor((r.y + r.h - top) / rowH) - rows.length;
        const fit = d.args.length > room ? Math.max(0, room - 1) : d.args.length;
        for (const a of d.args.slice(0, fit)) row(a.name, a.text, a.tag ? 'ptr' : 'int', { param: true, tag: a.tag });
        if (fit < d.args.length) row(`+${d.args.length - fit} more`, 'arguments', 'none');
      }
      // where the call came from, and which call it is, where there's room
      if (d.from) row('from', `${d.from.fn}${d.from.line !== null ? `:${d.from.line}` : ''}${d.from.nth[1] > 1 ? ` · ${d.from.nth[0]} of ${d.from.nth[1]}` : ''}`, 'none');
      if (d.stale) g.globalAlpha *= 0.5;
      const inset = px(dc, L.inset ?? 0, 0);
      skin.frame(dc, r, { title, mode: d.stale ? 'none' : live ? 'live' : d.last ? 'returned' : 'none', stacked: 0, rows, head: { x: r.x + inset, y: r.y, w: r.w - inset, h: INV_HEAD_PX * dc.z }, cap: d.cap });
      L.lamp(dc, r, { x: r.x, y: r.y, w: r.w, h: INV_HEAD_PX * dc.z }, { col, state: d.state, stale: d.stale });
      g.globalAlpha = 1;
      if (d.editing) {
        g.fillStyle = p.accent;
        g.globalAlpha = 0.7;
        g.fillRect(r.x + r.w - px(dc, 3, 2), r.y, px(dc, 2, 1.5), r.h);
        g.globalAlpha = 1;
      }
      ports(dc, r, d.inPorts, [], live ? col : p.line);
    };
    // printf's buffer, from the same parts: the skin's storage panel (its
    // head's capacity is how full the buffer is), the flush rule and what it
    // holds as rows, and the dock's lamp, lit while bytes wait
    skin.stdbuf = (dc, r, b) => {
      const rowH = SLOT_PX * dc.z;
      const top = r.y + INV_HEAD_PX * dc.z;
      const rows: RowInfo[] = [];
      const row = (name: string, value: string, kind: RowInfo['kind'], o: Partial<RowInfo> = {}) => {
        const y = top + rows.length * rowH;
        if (y + rowH <= r.y + r.h) rows.push({ name, value, kind, param: false, recent: false, flash: 0, rect: { x: r.x, y, w: r.w, h: rowH }, depth: 0, fold: null, ...o });
      };
      row(b.mode === 'terminal' ? 'to a terminal' : 'to a pipe', b.mode === 'terminal' ? 'flushed at \\n' : 'flushed when full', 'none');
      if (b.n) row('waiting', cLiteral(b.text), 'int');
      else if (b.flushed) row('→ terminal', cLiteral(b.flushed), 'int', { recent: true, flash: 1 });
      else row('holds', 'nothing', 'none');
      const inset = px(dc, L.inset ?? 0, 0);
      skin.frame(dc, r, { title: cap('printf'), mode: b.n ? 'live' : 'none', stacked: 0, rows, head: { x: r.x + inset, y: r.y, w: r.w - inset, h: INV_HEAD_PX * dc.z }, cap: { used: b.n, max: b.cap } });
      L.lamp(dc, r, { x: r.x, y: r.y, w: r.w, h: INV_HEAD_PX * dc.z }, { col: b.n ? stateCol('waiting') : stateCol('idle'), state: b.n ? 'waiting' : 'idle', stale: false });
    };
  }
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
  lastBackdrop = c;
}

// A window's drop shadow from a pre-rendered nine-slice texture, as desktop
// themes ship it: blurred once, its inside cut away (so it never darkens
// glass), corners drawn as they are and edges stretched: eight image draws,
// no blur per frame. rad and spread are px at zoom 1.
const shadowTex = new Map<string, HTMLCanvasElement>();
export function softShadow(dc: Dc, r: Rect, rad: number, spread: number, color: string, dy = 0): void {
  const Q = 2; // texture pixels per px at zoom 1
  const key = `${rad}|${spread}|${color}`;
  let c = shadowTex.get(key);
  const K = rad + spread; // corner slice, px at zoom 1
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = (2 * K + 2) * Q;
    const cg = c.getContext('2d')!;
    const off = 10000;
    cg.shadowColor = color;
    cg.shadowBlur = spread * Q;
    cg.shadowOffsetX = off;
    rrect(cg, spread * Q - off, spread * Q, (2 * rad + 2) * Q, (2 * rad + 2) * Q, rad * Q);
    cg.fillStyle = '#000';
    cg.fill();
    cg.shadowColor = 'transparent';
    cg.globalCompositeOperation = 'destination-out';
    rrect(cg, spread * Q, spread * Q, (2 * rad + 2) * Q, (2 * rad + 2) * Q, rad * Q);
    cg.fill();
    shadowTex.set(key, c);
  }
  const g = dc.g;
  const z = dc.z;
  const k = K * z; // corner, on screen
  const X = r.x - spread * z;
  const Y = r.y - spread * z + dy;
  const W = r.w + 2 * spread * z;
  const H = r.h + 2 * spread * z;
  if (W < 2 * k || H < 2 * k) return;
  const s = K * Q; // corner, in the texture
  const m = 2 * Q; // the middle strip, stretched
  g.drawImage(c, 0, 0, s, s, X, Y, k, k);
  g.drawImage(c, s + m, 0, s, s, X + W - k, Y, k, k);
  g.drawImage(c, 0, s + m, s, s, X, Y + H - k, k, k);
  g.drawImage(c, s + m, s + m, s, s, X + W - k, Y + H - k, k, k);
  g.drawImage(c, s, 0, m, s, X + k, Y, W - 2 * k, k);
  g.drawImage(c, s, s + m, m, s, X + k, Y + H - k, W - 2 * k, k);
  g.drawImage(c, 0, s, s, m, X, Y + k, k, H - 2 * k);
  g.drawImage(c, s + m, s, s, m, X + W - k, Y + k, k, H - 2 * k);
}

// Glass: the wallpaper seen through a window, blurred (Aero) and, with
// lens > 1, magnified about the window's centre (Liquid Glass bends what's
// behind it). The wallpaper is fixed to the screen, so what lies behind a
// window is the same pixels of the cached backdrop; its blurred copy is made
// once per size, and each window is one clipped image draw.
let lastBackdrop: HTMLCanvasElement | null = null;
const blurredOf = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();
// hole: a rect inside r that something opaque will cover anyway (a window's
// client area); the glass skips it, which saves most of the pixels.
// bake: paint laid on the blurred copy once (a tint, streaks fixed to the
// screen, as Aero's reflection texture is), so each window is one draw.
export function glassBehind(dc: Dc, r: Rect, rad: number | [number, number, number, number], blur: number, lens = 1, hole?: Rect, bake?: { key: string; paint: (g: CanvasRenderingContext2D, W: number, H: number) => void }): boolean {
  const src = lastBackdrop;
  if (!src) return false;
  const g = dc.g;
  const t = g.getTransform();
  let byKey = blurredOf.get(src);
  if (!byKey) blurredOf.set(src, (byKey = new Map()));
  const key = `${blur}|${bake?.key ?? ''}`;
  let b = byKey.get(key);
  if (!b) {
    const dpr = t.a || 1;
    b = document.createElement('canvas');
    b.width = src.width;
    b.height = src.height;
    const bg = b.getContext('2d')!;
    bg.drawImage(src, 0, 0); // under the blur, so the edges don't fade to nothing
    bg.filter = `blur(${Math.round(blur * dpr)}px)`;
    bg.drawImage(src, 0, 0);
    bg.filter = 'none';
    if (bake) {
      bg.scale(dpr, dpr);
      bake.paint(bg, src.width / dpr, src.height / dpr);
    }
    byKey.set(key, b);
  }
  g.save();
  rrect(g, r.x, r.y, r.w, r.h, rad);
  if (hole) g.rect(hole.x, hole.y, hole.w, hole.h);
  g.clip(hole ? 'evenodd' : 'nonzero');
  g.setTransform(1, 0, 0, 1, 0, 0);
  // only the window's own rectangle (in device pixels, on the canvas): a
  // clipped full-screen draw costs the whole screen, for every window
  const x0 = Math.max(0, Math.floor(t.a * r.x + t.e));
  const y0 = Math.max(0, Math.floor(t.d * r.y + t.f));
  const x1 = Math.min(b.width, Math.ceil(t.a * (r.x + r.w) + t.e));
  const y1 = Math.min(b.height, Math.ceil(t.d * (r.y + r.h) + t.f));
  if (x1 > x0 && y1 > y0) {
    // with a lens, each destination pixel shows the source nearer the centre
    const cx = t.a * (r.x + r.w / 2) + t.e;
    const cy = t.d * (r.y + r.h / 2) + t.f;
    const sx0 = cx + (x0 - cx) / lens;
    const sy0 = cy + (y0 - cy) / lens;
    g.drawImage(b, sx0, sy0, (x1 - x0) / lens, (y1 - y0) / lens, x0, y0, x1 - x0, y1 - y0);
  }
  g.restore();
  return true;
}
