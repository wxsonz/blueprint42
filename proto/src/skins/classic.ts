// "Classic" — a late-90s desktop. Functions are windows: the running one has
// the active (navy) title bar, everything else is inactive grey. Statics are
// floppy disks, pointers are links, stale code is "(Not Responding)".
import type { Dc, IconKind, Pt, Rect, Skin } from './types';
import { arrowHead, bevel, fitText, snapRect, strokeLine, tailLines, Walk } from './util';
import { genericIcon } from './icons';
import { drawSprite, drawStrip, type SpritePalette } from './sprites';

const FACE = '#c0c0c0';
const HI = '#ffffff';
const LIGHT = '#dfdfdf';
const SHADOW = '#808080';
const DARK = '#000000';
const NAVY = '#000080';
const TEAL = '#008080';
const UI = (px: number, bold = false) => `${bold ? '700 ' : ''}${px}px Tahoma, "DejaVu Sans", Verdana, sans-serif`;
const MONO = (px: number) => `${px}px Cousine, "Liberation Mono", "Courier New", monospace`;

const px = (dc: Dc, v: number, min = 1) => Math.max(min, Math.round(v * dc.z));
const spritePalette: SpritePalette = { body: FACE, edge: DARK, track: HI, cell: '#c8d8fc', text: DARK, muted: SHADOW, accent: NAVY, marker: '#b02020', selection: NAVY, font: (s) => MONO(s), radius: 0 };

function raised(g: CanvasRenderingContext2D, r: Rect): void {
  g.fillStyle = FACE;
  g.fillRect(r.x, r.y, r.w, r.h);
  bevel(g, r, HI, DARK, LIGHT, SHADOW);
}

function sunken(g: CanvasRenderingContext2D, r: Rect, fill: string): void {
  g.fillStyle = fill;
  g.fillRect(r.x, r.y, r.w, r.h);
  bevel(g, r, SHADOW, HI, DARK, LIGHT);
}

function titleBar(dc: Dc, r: Rect, text: string, active: boolean, buttons: boolean): Rect {
  const g = dc.g;
  const grad = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
  grad.addColorStop(0, active ? NAVY : SHADOW);
  grad.addColorStop(1, active ? '#1084d0' : '#b5b5b5');
  g.fillStyle = grad;
  g.fillRect(r.x, r.y, r.w, r.h);
  // program icon
  const is = Math.min(r.h - 4, px(dc, 14));
  const ix = r.x + 2;
  const iy = r.y + (r.h - is) / 2;
  g.fillStyle = HI;
  g.fillRect(ix, iy, is, is);
  g.fillStyle = NAVY;
  g.fillRect(ix, iy, is, Math.max(2, is * 0.25));
  g.strokeStyle = DARK;
  g.lineWidth = 1;
  g.strokeRect(ix + 0.5, iy + 0.5, is - 1, is - 1);
  // buttons
  const bw = px(dc, 16, 8);
  const bh = r.h - 4;
  let right = r.x + r.w - 2;
  if (buttons && r.w > bw * 4) {
    const close = { x: right - bw, y: r.y + 2, w: bw, h: bh };
    raised(g, close);
    g.strokeStyle = DARK;
    g.lineWidth = Math.max(1, 1.5 * dc.z);
    const c = { x: close.x + close.w / 2, y: close.y + close.h / 2 };
    const d = Math.min(bw, bh) * 0.22;
    g.beginPath();
    g.moveTo(c.x - d, c.y - d); g.lineTo(c.x + d, c.y + d);
    g.moveTo(c.x + d, c.y - d); g.lineTo(c.x - d, c.y + d);
    g.stroke();
    right = close.x - 2;
    if (r.w > bw * 7) {
      const min = { x: right - bw, y: r.y + 2, w: bw, h: bh };
      raised(g, min);
      g.fillStyle = DARK;
      g.fillRect(min.x + bw * 0.28, min.y + bh * 0.68, bw * 0.4, Math.max(1, 2 * dc.z));
      right = min.x - 2;
    }
  }
  const tx = ix + is + 4;
  const t = fitText(g, text, (s) => UI(s, true), px(dc, 11, 7), right - tx - 2);
  g.fillStyle = active ? HI : FACE;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText(t, tx, r.y + r.h / 2 + 0.5);
  return { x: tx, y: r.y, w: right - tx, h: r.h };
}

function handles(g: CanvasRenderingContext2D, r: Rect, s: number): void {
  const pts: Pt[] = [
    [r.x, r.y], [r.x + r.w / 2, r.y], [r.x + r.w, r.y],
    [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2],
    [r.x, r.y + r.h], [r.x + r.w / 2, r.y + r.h], [r.x + r.w, r.y + r.h],
  ];
  for (const [x, y] of pts) {
    g.fillStyle = NAVY;
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  }
}

function focusRect(g: CanvasRenderingContext2D, r: Rect, color = DARK): void {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.setLineDash([1, 1]);
  g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
  g.restore();
}

function progress(dc: Dc, r: Rect, fill: number, anim: boolean): void {
  const g = dc.g;
  sunken(g, r, FACE);
  const bw = px(dc, 8, 3);
  const gap = Math.max(1, px(dc, 2));
  const inner = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: r.h - 6 };
  const n = Math.floor((inner.w + gap) / (bw + gap));
  let count = Math.round(n * fill);
  if (anim) count = Math.floor((dc.time * 7) % (n + 3));
  g.fillStyle = NAVY;
  for (let i = 0; i < Math.min(count, n); i++) g.fillRect(inner.x + i * (bw + gap), inner.y, bw, inner.h);
}

function floppy(g: CanvasRenderingContext2D, r: Rect, value: string | null, z: number): void {
  const { x, y, w, h } = snapRect(r);
  const cut = w * 0.14;
  g.fillStyle = '#1c1c3c';
  g.beginPath();
  g.moveTo(x, y); g.lineTo(x + w - cut, y); g.lineTo(x + w, y + cut); g.lineTo(x + w, y + h); g.lineTo(x, y + h);
  g.closePath();
  g.fill();
  g.strokeStyle = DARK;
  g.lineWidth = 1;
  g.stroke();
  // shutter
  g.fillStyle = '#a8a8b0';
  g.fillRect(x + w * 0.24, y, w * 0.5, h * 0.34);
  g.fillStyle = '#1c1c3c';
  g.fillRect(x + w * 0.52, y + h * 0.05, w * 0.12, h * 0.24);
  // label
  g.fillStyle = value === null ? '#b8b8b8' : '#f4f4ec';
  g.fillRect(x + w * 0.12, y + h * 0.46, w * 0.76, h * 0.5);
  if (value !== null) {
    g.fillStyle = DARK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const t = fitText(g, value, (s) => UI(s, true), Math.max(7, 11 * z), w * 0.72, 6);
    g.fillText(t, x + w / 2, y + h * 0.72);
  }
}

export const classic: Skin = {
  id: 'classic',
  name: 'Classic',
  blurb: 'a 90s desktop: windows, floppies, marching ants',
  casing: TEAL,
  strip(dc, r, info) { drawStrip(dc, r, info, spritePalette); },
  sprite(dc, r, kind, info) { drawSprite(dc, r, kind, info, spritePalette); },

  background(dc, camX, camY) {
    const g = dc.g;
    g.fillStyle = TEAL;
    g.fillRect(0, 0, dc.vw, dc.vh);
    if (dc.cs < 16) return;
    // form-designer dot grid
    g.fillStyle = 'rgba(0,0,0,0.28)';
    const x0 = Math.floor(camX);
    const y0 = Math.floor(camY);
    for (let x = x0; x < camX + dc.vw / dc.cs + 1; x++) {
      for (let y = y0; y < camY + dc.vh / dc.cs + 1; y++) {
        g.fillRect(Math.round((x - camX) * dc.cs), Math.round((y - camY) * dc.cs), 1, 1);
      }
    }
  },

  belt(dc, pts, o) {
    const g = dc.g;
    const w = Math.max(2, 2.5 * dc.z);
    if (o.selected) strokeLine(g, pts, w + 6, 'rgba(0,0,128,0.35)');
    const shadow = pts.map(([x, y]) => [x + 1, y + 1] as Pt);
    strokeLine(g, shadow, w, '#004040');
    strokeLine(g, pts, w, o.hovered || o.selected ? '#ffffe1' : HI);
    if (o.live) strokeLine(g, pts, w, DARK, [4, 4], -dc.time * 24 * o.dir);
    const walk = new Walk(pts);
    const end = walk.at(walk.length);
    arrowHead(g, end.x, end.y, end.dx, end.dy, Math.max(5, 8 * dc.z), DARK);
  },

  node(dc, r0, n) {
    const g = dc.g;
    const r = snapRect(r0);
    raised(g, r);
    const tb = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: px(dc, 18, 9) };
    const title = n.stale ? `${n.name} (Not Responding)` : n.name;
    const tRect = titleBar(dc, tb, title, n.state === 'running' || n.state === 'error', true);
    if (n.editing) focusRect(g, { x: tRect.x - 2, y: tb.y + 1, w: Math.min(tRect.w, g.measureText(title).width + 4), h: tb.h - 2 }, '#ffff00');

    const pad = px(dc, 7, 3);
    const cx = r.x + pad;
    let cy = tb.y + tb.h + px(dc, 7);
    const fs = px(dc, 11, 7);
    g.font = UI(fs);
    g.fillStyle = n.stale ? SHADOW : DARK;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    const status =
      n.stale ? 'Not responding' :
      n.state === 'running' ? 'Running...' :
      n.state === 'waiting' ? `Waiting for ${n.waitingOn ?? '...'}` :
      n.state === 'error' ? 'Illegal operation' : 'Ready';
    let sx = cx;
    if (n.state === 'error') {
      const ir = fs * 0.6;
      g.fillStyle = '#ff0000';
      g.beginPath(); g.arc(cx + ir, cy + ir, ir, 0, Math.PI * 2); g.fill();
      g.strokeStyle = HI;
      g.lineWidth = Math.max(1, 1.4 * dc.z);
      g.beginPath();
      g.moveTo(cx + ir * 0.55, cy + ir * 0.55); g.lineTo(cx + ir * 1.45, cy + ir * 1.45);
      g.moveTo(cx + ir * 1.45, cy + ir * 0.55); g.lineTo(cx + ir * 0.55, cy + ir * 1.45);
      g.stroke();
      sx += ir * 2 + 4;
      g.fillStyle = DARK;
    }
    g.fillText(fitText(g, status, (s) => UI(s), fs, r.x + r.w - pad - sx), sx, cy);
    cy += fs + px(dc, 6);
    progress(dc, { x: cx, y: cy, w: r.w - pad * 2, h: px(dc, 16, 7) }, n.state === 'waiting' ? 0.45 : 0, n.state === 'running');

    // status bar
    const sh = px(dc, 17, 8);
    const sy = r.y + r.h - sh - 3;
    const leftW = (r.w - 6) * 0.62;
    const f1 = { x: r.x + 3, y: sy, w: leftW - 2, h: sh };
    const f2 = { x: r.x + 3 + leftW, y: sy, w: r.w - 6 - leftW, h: sh };
    for (const f of [f1, f2]) bevel(g, f, SHADOW, HI);
    g.font = UI(px(dc, 10, 6));
    g.fillStyle = DARK;
    g.textBaseline = 'middle';
    const left = `${n.params} param${n.params === 1 ? '' : 's'}${n.isStatic ? ' · static' : ''}`;
    g.fillText(fitText(g, left, (s) => UI(s), px(dc, 10, 6), f1.w - 6), f1.x + 3, f1.y + sh / 2 + 0.5);
    const right = n.frames > 1 ? `×${n.frames}` : n.pinned ? 'pinned' : '';
    if (right) g.fillText(fitText(g, right, (s) => UI(s), px(dc, 10, 6), f2.w - 6), f2.x + 3, f2.y + sh / 2 + 0.5);

    // ports, one per call
    const pw = px(dc, 4, 2);
    const ph = (ys: number[]) => Math.min(px(dc, 12, 5), ys.length > 1 ? (ys[1] - ys[0]) * 0.7 : 99);
    for (const y of n.inPorts) raised(g, { x: r.x - pw, y: Math.round(y - ph(n.inPorts) / 2), w: pw, h: Math.round(ph(n.inPorts)) });
    for (const y of n.outPorts) raised(g, { x: r.x + r.w, y: Math.round(y - ph(n.outPorts) / 2), w: pw, h: Math.round(ph(n.outPorts)) });

    if (n.stale) {
      g.fillStyle = 'rgba(192,192,192,0.45)';
      g.fillRect(r.x + 3, tb.y + tb.h, r.w - 6, r.h - tb.h - 6);
    }
    if (n.hovered && !n.selected) focusRect(g, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
    if (n.selected) handles(g, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, px(dc, 6, 4));
  },

  frame(dc, r0, f) {
    const g = dc.g;
    const r = snapRect(r0);
    for (let k = Math.min(f.stacked, 3); k > 0; k--) {
      const o = px(dc, 4) * k;
      raised(g, { x: r.x + o, y: r.y + o, w: r.w, h: r.h });
    }
    sunken(g, r, f.mode === 'none' ? FACE : HI);
    const head = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: Math.round(f.head.h) - 2 };
    const c1 = Math.round(head.w * 0.5);
    raised(g, { x: head.x, y: head.y, w: c1, h: head.h });
    raised(g, { x: head.x + c1, y: head.y, w: head.w - c1, h: head.h });
    const fs = px(dc, 11, 7);
    g.font = UI(fs);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillStyle = f.mode === 'none' ? SHADOW : DARK;
    g.fillText('Name', head.x + 5, head.y + head.h / 2 + 0.5);
    g.fillText(fitText(g, f.mode === 'returned' ? 'Last value' : 'Value', (s) => UI(s), fs, head.w - c1 - 8), head.x + c1 + 5, head.y + head.h / 2 + 0.5);

    for (const row of f.rows) {
      const rr = { x: r.x + 2, y: Math.round(row.rect.y), w: r.w - 4, h: Math.round(row.rect.h) };
      const sel = row.recent || row.flash > 0.5;
      if (sel) {
        g.fillStyle = NAVY;
        g.fillRect(rr.x, rr.y, rr.w, rr.h);
      } else if (row.flash > 0) {
        g.fillStyle = `rgba(0,0,128,${row.flash})`;
        g.fillRect(rr.x, rr.y, rr.w, rr.h);
      }
      // tiny icon: param = key, local = document
      const is = Math.max(4, rr.h * 0.42);
      const ix = rr.x + 4;
      const iy = rr.y + (rr.h - is) / 2;
      g.fillStyle = row.param ? '#808000' : HI;
      g.fillRect(ix, iy, is, is);
      g.strokeStyle = sel ? HI : DARK;
      g.lineWidth = 1;
      g.strokeRect(ix + 0.5, iy + 0.5, is - 1, is - 1);
      const textCol = f.mode === 'none' ? SHADOW : sel ? HI : f.mode === 'returned' ? SHADOW : DARK;
      g.fillStyle = textCol;
      g.font = UI(fs);
      g.fillText(fitText(g, row.name, (s) => UI(s), fs, c1 - is - 12), ix + is + 4, rr.y + rr.h / 2 + 0.5);
      if (!row.value) continue;
      const vx = rr.x + c1 + 3;
      const vw = rr.w - c1 - 6;
      let col = textCol;
      if (!sel && f.mode === 'live') col = row.kind === 'ptr' ? '#0000ff' : row.kind === 'dangling' ? '#800000' : row.kind === 'undef' || row.kind === 'null' ? SHADOW : DARK;
      g.fillStyle = col;
      const t = fitText(g, row.value, (s) => UI(s), fs, vw);
      g.fillText(t, vx, rr.y + rr.h / 2 + 0.5);
      if (row.kind === 'ptr' || row.kind === 'dangling') {
        const tw = g.measureText(t).width;
        g.fillRect(vx, Math.round(rr.y + rr.h / 2 + fs * 0.5), tw, 1);
        if (row.kind === 'dangling') g.fillRect(vx, Math.round(rr.y + rr.h / 2), tw, 1);
      }
    }
  },

  chest(dc, r, c) {
    const g = dc.g;
    floppy(g, r, c.value, dc.z);
    if (c.flash > 0) {
      g.fillStyle = `rgba(255,255,0,${0.6 * c.flash})`;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    // desktop-icon label
    const fs = px(dc, 11, 7);
    g.font = UI(fs);
    const tw = g.measureText(c.name).width + 4;
    const lx = Math.round(r.x + r.w + px(dc, 4));
    const ly = Math.round(r.y + r.h / 2 - fs / 2 - 1);
    if (c.selected || c.recent) {
      g.fillStyle = NAVY;
      g.fillRect(lx, ly, tw, fs + 3);
      focusRect(g, { x: lx, y: ly, w: tw, h: fs + 3 }, '#ffff00');
    }
    g.fillStyle = HI;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(c.name, lx + 2, ly + 1);
    if (c.hovered && !c.selected) focusRect(g, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, HI);
  },

  proc(dc, r0, p) {
    const g = dc.g;
    const r = snapRect(r0);
    raised(g, r);
    const tb = { x: r.x + 3, y: r.y + 3, w: r.w - 6, h: px(dc, 18, 9) };
    titleBar(dc, tb, 'MS-DOS Prompt', p.state === 'running', true);
    const body = { x: r.x + 4, y: tb.y + tb.h + 2, w: r.w - 8, h: r.h - tb.h - 9 };
    g.fillStyle = DARK;
    g.fillRect(body.x, body.y, body.w, body.h);
    const fs = px(dc, 11, 7);
    g.font = MONO(fs);
    g.fillStyle = FACE;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    const lines = ['C:\\>a.out', ...tailLines(p.out, 3)];
    if (p.state === 'done' && p.exit !== null) lines.push(`exit ${p.exit}`, 'C:\\>');
    if (p.state === 'crashed') lines.push('Abnormal program', 'termination');
    lines.forEach((l, i) => g.fillText(fitText(g, l, MONO, fs, body.w - 6), body.x + 3, body.y + 3 + i * (fs + 2)));
    const blink = Math.floor(dc.time * 2) % 2 === 0;
    if ((p.state === 'running' || p.state === 'idle' || p.state === 'done') && blink) {
      const ly = body.y + 3 + (lines.length - (p.state === 'done' ? 1 : 0)) * (fs + 2);
      const lx = p.state === 'done' ? body.x + 3 + g.measureText('C:\\>').width : body.x + 3;
      g.fillRect(lx, ly + fs - 2, fs * 0.6, 2);
    }
    if (p.selected) handles(g, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, px(dc, 6, 4));
    else if (p.hovered) focusRect(g, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 });
  },

  plate(dc, x, y, text, kind) {
    const g = dc.g;
    const fs = px(dc, 11, 7);
    g.font = UI(fs, kind === 'ret');
    const w = Math.round(g.measureText(text).width + 8);
    const h = fs + 6;
    const bx = Math.round(x - w / 2);
    const by = Math.round(y - h / 2);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(bx + 2, by + 2, w, h);
    g.fillStyle = kind === 'void' ? FACE : '#ffffe1';
    g.fillRect(bx, by, w, h);
    g.strokeStyle = DARK;
    g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    g.fillStyle = kind === 'ptr' ? '#0000ff' : kind === 'void' ? SHADOW : DARK;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, bx + w / 2, by + h / 2 + 0.5);
    if (kind === 'ptr') g.fillRect(bx + 4, by + h - 3, w - 8, 1);
  },

  wire(dc, pts, complete) {
    const g = dc.g;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    strokeLine(g, pts, Math.max(3, 4 * dc.z), DARK);
    strokeLine(g, pts, Math.max(1.5, 2 * dc.z), '#ffff00');
    if (!complete) return;
    const [x, y] = pts[pts.length - 1];
    const [px0, py0] = pts[pts.length - 2];
    const l = Math.hypot(x - px0, y - py0) || 1;
    const s = Math.max(6, 9 * dc.z);
    arrowHead(g, x, y, (x - px0) / l, (y - py0) / l, s + 2, DARK);
    arrowHead(g, x - ((x - px0) / l) * 1.5, y - ((y - py0) / l) * 1.5, (x - px0) / l, (y - py0) / l, s - 1, '#ffff00');
  },

  dangling(dc, [x, y]) {
    const g = dc.g;
    const L = 22 * dc.z;
    strokeLine(g, [[x, y], [x + L, y + L * 0.4]], Math.max(1.5, 2 * dc.z), '#ff0000', [3, 3]);
    g.fillStyle = '#ff0000';
    g.font = UI(px(dc, 12, 8), true);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('×', x + L + 2, y + L * 0.4);
  },

  pulse(dc, x, y) {
    const g = dc.g;
    const s = px(dc, 9, 5);
    g.fillStyle = '#ffff00';
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    g.strokeStyle = DARK;
    g.strokeRect(Math.round(x - s / 2) + 0.5, Math.round(y - s / 2) + 0.5, s - 1, s - 1);
  },

  ghost(dc, r0, label) {
    const g = dc.g;
    const r = snapRect(r0);
    focusRect(g, r, HI);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.font = UI(px(dc, 11, 7));
    g.fillStyle = HI;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, label, (s) => UI(s), px(dc, 11, 7), r.w - 10), r.x + r.w / 2, r.y + r.h / 2);
  },

  beltHandle(dc, [x, y]) {
    const g = dc.g;
    const s = px(dc, 8, 6);
    g.fillStyle = HI;
    g.fillRect(Math.round(x - s / 2) - 1, Math.round(y - s / 2) - 1, s + 2, s + 2);
    g.fillStyle = NAVY;
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  },

  icon(g, kind: IconKind, s) {
    const u = s / 24;
    switch (kind) {
      case 'node':
        g.fillStyle = FACE; g.fillRect(2 * u, 3 * u, 20 * u, 17 * u);
        bevel(g, { x: 2 * u, y: 3 * u, w: 20 * u, h: 17 * u }, HI, DARK);
        g.fillStyle = NAVY; g.fillRect(3 * u, 4 * u, 18 * u, 4 * u);
        g.fillStyle = NAVY; g.fillRect(5 * u, 13 * u, 9 * u, 3 * u);
        return;
      case 'belt':
        g.strokeStyle = HI; g.lineWidth = 2 * u;
        g.beginPath(); g.moveTo(3 * u, 12 * u); g.lineTo(17 * u, 12 * u); g.stroke();
        arrowHead(g, 21 * u, 12 * u, 1, 0, 6 * u, DARK);
        return;
      case 'frame':
        g.fillStyle = HI; g.fillRect(3 * u, 4 * u, 18 * u, 16 * u);
        bevel(g, { x: 3 * u, y: 4 * u, w: 18 * u, h: 16 * u }, SHADOW, HI);
        g.fillStyle = FACE; g.fillRect(4 * u, 5 * u, 16 * u, 3 * u);
        g.fillStyle = NAVY; g.fillRect(4 * u, 12 * u, 16 * u, 3 * u);
        return;
      case 'wire':
        g.strokeStyle = DARK; g.lineWidth = 4 * u;
        g.beginPath(); g.moveTo(3 * u, 7 * u); g.bezierCurveTo(8 * u, 22 * u, 16 * u, 22 * u, 20 * u, 8 * u); g.stroke();
        g.strokeStyle = '#ffff00'; g.lineWidth = 2 * u; g.stroke();
        return;
      case 'chest':
        floppy(g, { x: 4 * u, y: 3 * u, w: 16 * u, h: 18 * u }, '', 0.5);
        return;
      default:
        genericIcon(g, kind, s, DARK, FACE);
    }
  },
};
