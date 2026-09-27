// "Amp" — a late-90s media player skin. Each function is a little player:
// gunmetal case, green LCD with a scrolling title, a spectrum analyzer that
// dances while it runs, and a transport row whose lit button is the state.
// Frames are the playlist; pointers are amber.
import type { Dc, IconKind, Rect, Skin } from './types';
import { arrowHead, fitText, hash, snapRect, strokeLine, Walk } from './util';
import { genericIcon } from './icons';
import { drawSprite, drawStrip, type SpritePalette } from './sprites';

const LCD = '#00e000';
const LCD_DIM = '#1f6a1f';
const LCD_BG = '#000000';
const AMBER = '#ffc020';
const RED = '#ff3a2a';
const SEL = '#0000c6';
const PIX = (px: number) => `${px}px Silkscreen, "DejaVu Sans Mono", monospace`;
const VT = (px: number) => `${px}px VT323, "DejaVu Sans Mono", monospace`;
const px = (dc: Dc, v: number, min = 1) => Math.max(min, Math.round(v * dc.z));
const spritePalette: SpritePalette = { body: '#303044', edge: '#08080c', track: LCD_BG, cell: '#143714', text: '#e8e8d0', muted: '#77798c', accent: LCD, marker: AMBER, selection: LCD, font: (s) => PIX(s), radius: 1 };

function metal(g: CanvasRenderingContext2D, r: Rect): void {
  const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  grad.addColorStop(0, '#50506a');
  grad.addColorStop(0.5, '#383850');
  grad.addColorStop(1, '#23232f');
  g.fillStyle = grad;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = '#08080c';
  g.lineWidth = 1;
  g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  g.fillRect(r.x + 1, r.y + 1, 1, r.h - 2);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1);
  g.fillRect(r.x + r.w - 2, r.y + 1, 1, r.h - 2);
}

// Title strip: grooved stripes either side of a tiny pixel caption.
function strip(dc: Dc, r: Rect, text: string, active: boolean): void {
  const g = dc.g;
  g.fillStyle = '#16161f';
  g.fillRect(r.x, r.y, r.w, r.h);
  const fs = px(dc, 8, 6);
  g.font = PIX(fs);
  const t = fitText(g, text, PIX, fs, r.w * 0.66, 5);
  const tw = g.measureText(t).width;
  const cx = r.x + r.w / 2;
  const a = active ? '#e8c86a' : '#6c6c88';
  const b = active ? '#7a5c1c' : '#2c2c3c';
  for (let y = r.y + 2; y < r.y + r.h - 1; y += 2) {
    g.fillStyle = (y - r.y) % 4 === 2 ? a : b;
    g.fillRect(r.x + 3, y, cx - tw / 2 - 6 - (r.x + 3), 1);
    g.fillRect(cx + tw / 2 + 6, y, r.x + r.w - 3 - (cx + tw / 2 + 6), 1);
  }
  g.fillStyle = active ? '#fff2c0' : '#a8a8c0';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, cx, r.y + r.h / 2 + 1);
}

function lcdBox(g: CanvasRenderingContext2D, r: Rect): void {
  g.fillStyle = LCD_BG;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.strokeStyle = '#0b0b12';
  g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(r.x, r.y + r.h, r.w, 1);
}

function glyph(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, s: number, col: string): void {
  g.fillStyle = col;
  const h = s / 2;
  switch (kind) {
    case 0: // prev
      g.fillRect(cx - h, cy - h, s * 0.18, s);
      g.beginPath(); g.moveTo(cx + h, cy - h); g.lineTo(cx - h * 0.5, cy); g.lineTo(cx + h, cy + h); g.fill();
      break;
    case 1: // play
      g.beginPath(); g.moveTo(cx - h * 0.8, cy - h); g.lineTo(cx + h, cy); g.lineTo(cx - h * 0.8, cy + h); g.fill();
      break;
    case 2: // pause
      g.fillRect(cx - h, cy - h, s * 0.35, s);
      g.fillRect(cx + h - s * 0.35, cy - h, s * 0.35, s);
      break;
    case 3: // stop
      g.fillRect(cx - h, cy - h, s, s);
      break;
    case 4: // next
      g.beginPath(); g.moveTo(cx - h, cy - h); g.lineTo(cx + h * 0.5, cy); g.lineTo(cx - h, cy + h); g.fill();
      g.fillRect(cx + h - s * 0.18, cy - h, s * 0.18, s);
      break;
  }
}

function analyzer(dc: Dc, r: Rect, mode: 'run' | 'hold' | 'off'): void {
  const g = dc.g;
  const n = 12;
  const bw = r.w / n;
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (mode === 'run') {
      const t = dc.time;
      v = 0.25 + 0.75 * Math.abs(Math.sin(t * (3 + hash(i) * 5) + i * 1.7)) * (0.55 + 0.45 * hash(i + Math.floor(t * 8)));
    } else if (mode === 'hold') v = 0.08 + 0.12 * hash(i);
    const h = Math.max(1, Math.round(v * r.h));
    const grad = g.createLinearGradient(0, r.y + r.h, 0, r.y);
    grad.addColorStop(0, '#18a818');
    grad.addColorStop(0.55, '#d8d818');
    grad.addColorStop(1, '#f04818');
    g.fillStyle = mode === 'off' ? '#0f260f' : grad;
    g.fillRect(Math.round(r.x + i * bw), Math.round(r.y + r.h - h), Math.max(1, Math.floor(bw - 1)), h);
  }
}

export const amp: Skin = {
  id: 'amp',
  name: 'Amp',
  blurb: 'a 90s media player: LCDs, analyzers, playlists',
  casing: '#0d0d14',
  strip(dc, r, info) { drawStrip(dc, r, info, spritePalette); },
  sprite(dc, r, kind, info) { drawSprite(dc, r, kind, info, spritePalette); },

  background(dc, camX, camY) {
    const g = dc.g;
    const grad = g.createLinearGradient(0, 0, 0, dc.vh);
    grad.addColorStop(0, '#12121c');
    grad.addColorStop(1, '#08080d');
    g.fillStyle = grad;
    g.fillRect(0, 0, dc.vw, dc.vh);
    if (dc.cs < 14) return;
    g.fillStyle = 'rgba(110,130,255,0.09)';
    for (let x = Math.floor(camX); x < camX + dc.vw / dc.cs + 1; x++) {
      for (let y = Math.floor(camY); y < camY + dc.vh / dc.cs + 1; y++) {
        g.fillRect(Math.round((x - camX) * dc.cs) - 1, Math.round((y - camY) * dc.cs) - 1, 2, 2);
      }
    }
  },

  belt(dc, pts, o) {
    const g = dc.g;
    const w = Math.max(3, 7 * dc.z);
    g.lineJoin = 'miter';
    if (o.selected) strokeLine(g, pts, w + 6, 'rgba(0,224,0,0.35)');
    strokeLine(g, pts, w, '#07070b');
    strokeLine(g, pts, w - 2, o.hovered ? '#474766' : '#2c2c40');
    strokeLine(g, pts, 1, 'rgba(255,255,255,0.12)');
    if (o.live) {
      g.shadowColor = LCD;
      g.shadowBlur = 6;
      strokeLine(g, pts, Math.max(2, 2.5 * dc.z), LCD, [2 * dc.z + 1, 7 * dc.z], -dc.time * 60 * dc.z * o.dir);
      g.shadowBlur = 0;
    }
    const walk = new Walk(pts);
    const end = walk.at(walk.length);
    arrowHead(g, end.x, end.y, end.dx, end.dy, Math.max(5, 8 * dc.z), o.live ? LCD : '#6c6c88');
  },

  node(dc, r0, n) {
    const g = dc.g;
    const r = snapRect(r0);
    if (n.state === 'running' || n.state === 'error') {
      g.shadowColor = n.state === 'error' ? RED : 'rgba(0,224,0,0.6)';
      g.shadowBlur = 18 * dc.z;
    }
    metal(g, r);
    g.shadowBlur = 0;
    const m = px(dc, 3);
    strip(dc, { x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: px(dc, 11, 7) }, n.name.toUpperCase(), n.state === 'running');

    // LCD
    const lcd = { x: r.x + px(dc, 6), y: r.y + px(dc, 17), w: r.w - px(dc, 12), h: px(dc, 52, 20) };
    lcdBox(g, lcd);
    g.save();
    g.beginPath();
    g.rect(lcd.x + 2, lcd.y + 1, lcd.w - 4, lcd.h - 2);
    g.clip();
    const on = n.stale ? LCD_DIM : n.state === 'error' ? RED : LCD;
    // state glyph
    const gs = px(dc, 7, 4);
    const gk = n.state === 'running' ? 1 : n.state === 'waiting' ? 2 : 3;
    glyph(g, gk, lcd.x + px(dc, 8), lcd.y + px(dc, 10), gs, on);
    // title: scrolls when it doesn't fit, like a long song title
    const tf = px(dc, 24, 10);
    g.font = VT(tf);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    const title = n.stale ? '-- STALE --' : n.name;
    const tw = g.measureText(title).width;
    const tx0 = lcd.x + px(dc, 16);
    const room = lcd.x + lcd.w - px(dc, 4) - tx0;
    g.fillStyle = on;
    if (tw <= room) g.fillText(title, tx0, lcd.y + px(dc, 12));
    else {
      const gap = px(dc, 30);
      const off = (dc.time * 26 * dc.z) % (tw + gap);
      g.fillText(title, tx0 - off, lcd.y + px(dc, 12));
      g.fillText(title, tx0 - off + tw + gap, lcd.y + px(dc, 12));
    }
    // second line
    const sf = px(dc, 15, 8);
    g.font = VT(sf);
    const blink = Math.floor(dc.time * 2.5) % 2 === 0;
    const status =
      n.stale ? 'NO SIGNAL' :
      n.state === 'running' ? 'PLAYING' :
      n.state === 'waiting' ? `WAIT ${n.waitingOn ?? ''}` :
      n.state === 'error' ? (blink ? 'ERROR' : '') : 'STOPPED';
    g.fillStyle = n.state === 'idle' || n.stale ? LCD_DIM : on;
    const ana = { x: lcd.x + lcd.w - px(dc, 52), y: lcd.y + px(dc, 26), w: px(dc, 46), h: lcd.h - px(dc, 30) };
    g.fillText(fitText(g, status, VT, sf, ana.x - lcd.x - px(dc, 8), 6), lcd.x + px(dc, 4), lcd.y + lcd.h - px(dc, 11));
    if (n.frames > 1) {
      g.fillStyle = on;
      g.textAlign = 'right';
      g.fillText(`x${n.frames}`, lcd.x + lcd.w - px(dc, 4), lcd.y + px(dc, 12));
      g.textAlign = 'left';
    }
    if (n.editing) {
      g.fillStyle = '#5ad1ff';
      g.font = VT(px(dc, 13, 7));
      g.fillText('EDIT', lcd.x + px(dc, 4), lcd.y + px(dc, 24));
    }
    analyzer(dc, ana, n.stale ? 'off' : n.state === 'running' ? 'run' : n.state === 'waiting' ? 'hold' : 'off');
    g.restore();

    // transport row
    const bh = px(dc, 14, 7);
    const bw = px(dc, 18, 9);
    const by = r.y + r.h - bh - px(dc, 6);
    const lit = n.state === 'running' ? 1 : n.state === 'waiting' ? 2 : 3;
    for (let i = 0; i < 5; i++) {
      const b = { x: r.x + px(dc, 6) + i * (bw + px(dc, 2)), y: by, w: bw, h: bh };
      const on2 = i === lit && !n.stale;
      g.fillStyle = on2 ? '#5a5a80' : '#34344a';
      g.fillRect(b.x, b.y, b.w, b.h);
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(b.x, b.y, b.w, 1);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(b.x, b.y + b.h - 1, b.w, 1);
      glyph(g, i, b.x + b.w / 2, b.y + b.h / 2, px(dc, 6, 3), on2 ? LCD : '#a8a8c0');
    }
    // toggles: STA(tic) and PIN
    const tf2 = px(dc, 6, 5);
    g.font = PIX(tf2);
    g.textBaseline = 'middle';
    const toggles: [string, boolean][] = [['STA', n.isStatic], ['PIN', n.pinned]];
    toggles.forEach(([label, on3], i) => {
      const x = r.x + px(dc, 6) + 5 * (bw + px(dc, 2)) + px(dc, 3) + i * px(dc, 22);
      g.fillStyle = on3 ? LCD : '#1d3a1d';
      g.fillRect(x, by + bh / 2 - 1, px(dc, 3, 2), px(dc, 3, 2));
      g.fillStyle = on3 ? '#d8d8f0' : '#6c6c88';
      g.textAlign = 'left';
      g.fillText(label, x + px(dc, 5), by + bh / 2 + 1);
    });

    // ports, one per call
    g.fillStyle = '#07070b';
    const ph = (ys: number[]) => Math.min(px(dc, 10, 5), ys.length > 1 ? (ys[1] - ys[0]) * 0.7 : 99);
    for (const y of n.inPorts) g.fillRect(r.x - px(dc, 3), y - ph(n.inPorts) / 2, px(dc, 3), ph(n.inPorts));
    for (const y of n.outPorts) g.fillRect(r.x + r.w, y - ph(n.outPorts) / 2, px(dc, 3), ph(n.outPorts));

    if (n.stale) {
      g.fillStyle = 'rgba(10,10,16,0.45)';
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    if (n.selected || n.hovered) {
      g.strokeStyle = n.selected ? LCD : '#8080a8';
      g.lineWidth = n.selected ? 2 : 1;
      g.setLineDash(n.selected ? [4, 3] : []);
      g.lineDashOffset = -dc.time * 12;
      g.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
      g.setLineDash([]);
    }
  },

  frame(dc, r0, f) {
    const g = dc.g;
    const r = snapRect(r0);
    for (let k = Math.min(f.stacked, 3); k > 0; k--) {
      const o = px(dc, 4) * k;
      metal(g, { x: r.x + o, y: r.y + o, w: r.w, h: r.h });
    }
    metal(g, r);
    const head = { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: Math.round(f.head.h) - 4 };
    strip(dc, head, f.mode === 'live' ? 'STACK FRAME' : f.mode === 'returned' ? 'RETURNED' : 'NO FRAME', f.mode === 'live');
    const body = { x: r.x + 3, y: r.y + Math.round(f.head.h) - 1, w: r.w - 6, h: r.h - Math.round(f.head.h) - 2 };
    g.fillStyle = LCD_BG;
    g.fillRect(body.x, body.y, body.w, body.h);
    const fs = px(dc, 16, 9);
    f.rows.forEach((row, i) => {
      const rr = { x: body.x, y: Math.round(row.rect.y), w: body.w, h: Math.round(row.rect.h) };
      if (row.recent || row.flash > 0) {
        g.fillStyle = row.recent ? SEL : `rgba(0,0,198,${row.flash})`;
        g.fillRect(rr.x, rr.y, rr.w, rr.h);
      }
      const base = f.mode === 'live' ? (row.recent ? '#ffffff' : LCD) : f.mode === 'returned' ? '#2f8a2f' : LCD_DIM;
      g.font = VT(fs);
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillStyle = base;
      const label = `${i + 1}. ${row.name}`;
      g.fillText(fitText(g, label, VT, fs, rr.w * 0.55, 7), rr.x + px(dc, 4), rr.y + rr.h / 2 + 1);
      g.textAlign = 'right';
      const val = row.value || '--';
      g.fillStyle =
        f.mode !== 'live' || row.recent ? base :
        row.kind === 'ptr' ? AMBER : row.kind === 'dangling' ? RED : row.kind === 'undef' || row.kind === 'null' ? LCD_DIM : LCD;
      g.fillText(fitText(g, val, VT, fs, rr.w * 0.42, 7), rr.x + rr.w - px(dc, 4), rr.y + rr.h / 2 + 1);
    });
  },

  chest(dc, r0, c) {
    const g = dc.g;
    const r = snapRect(r0);
    metal(g, { x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 });
    lcdBox(g, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 });
    if (c.flash > 0) {
      g.fillStyle = `rgba(0,224,0,${0.4 * c.flash})`;
      g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    }
    g.fillStyle = c.value === null ? LCD_DIM : LCD;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, c.value ?? '--', VT, px(dc, 20, 9), r.w - 6, 7), r.x + r.w / 2, r.y + r.h / 2 + 1);
    g.font = PIX(px(dc, 7, 5));
    g.fillStyle = c.selected || c.recent ? LCD : '#a8a8c0';
    g.textAlign = 'left';
    g.fillText(c.name.toUpperCase(), r.x + r.w + px(dc, 6), r.y + r.h / 2 + 1);
    if (c.selected || c.hovered) {
      g.strokeStyle = c.selected ? LCD : '#8080a8';
      g.strokeRect(r.x - 5.5, r.y - 5.5, r.w + 11, r.h + 11);
    }
  },

  proc(dc, r0, p) {
    const g = dc.g;
    const r = snapRect(r0);
    metal(g, r);
    const m = px(dc, 3);
    strip(dc, { x: r.x + m, y: r.y + m, w: r.w - 2 * m, h: px(dc, 11, 7) }, 'A.OUT', p.state === 'running');
    const lcd = { x: r.x + px(dc, 6), y: r.y + px(dc, 17), w: r.w - px(dc, 12), h: r.h - px(dc, 24) };
    lcdBox(g, lcd);
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    const cx = lcd.x + lcd.w / 2;
    const cy = lcd.y + lcd.h / 2;
    if (p.state === 'done' && p.exit !== null) {
      g.font = VT(px(dc, 14, 7));
      g.fillStyle = LCD_DIM;
      g.fillText('EXIT CODE', cx, lcd.y + px(dc, 12));
      g.font = VT(px(dc, 46, 16));
      g.fillStyle = LCD;
      g.fillText(fitText(g, p.exit, VT, px(dc, 46, 16), lcd.w - 8, 10), cx, cy + px(dc, 8));
    } else if (p.state === 'crashed') {
      g.font = VT(px(dc, 30, 12));
      g.fillStyle = Math.floor(dc.time * 2.5) % 2 ? RED : '#6a1810';
      g.fillText('CRASH', cx, cy);
    } else {
      g.font = VT(px(dc, 40, 14));
      g.fillStyle = p.state === 'running' ? LCD : LCD_DIM;
      const t = p.state === 'running' ? (Math.floor(dc.time * 2) % 2 ? '▶ RUN' : '▶ RUN ') : '--:--';
      g.fillText(t, cx, cy);
    }
    if (p.selected || p.hovered) {
      g.strokeStyle = p.selected ? LCD : '#8080a8';
      g.strokeRect(r.x - 3.5, r.y - 3.5, r.w + 7, r.h + 7);
    }
  },

  plate(dc, x, y, text, kind) {
    const g = dc.g;
    const fs = px(dc, 17, 9);
    g.font = VT(fs);
    const w = Math.round(g.measureText(text).width + px(dc, 10));
    const h = Math.round(fs * 0.95);
    const bx = Math.round(x - w / 2);
    const by = Math.round(y - h / 2);
    const col = kind === 'ptr' ? AMBER : kind === 'ret' ? '#ffffff' : kind === 'void' ? LCD_DIM : LCD;
    g.fillStyle = LCD_BG;
    g.fillRect(bx, by, w, h);
    g.strokeStyle = kind === 'ret' ? LCD : col;
    g.lineWidth = 1;
    g.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    g.shadowColor = col;
    g.shadowBlur = 6;
    g.fillStyle = col;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, bx + w / 2, by + h / 2 + 1);
    g.shadowBlur = 0;
  },

  wire(dc, pts, complete) {
    const g = dc.g;
    g.lineCap = 'round';
    strokeLine(g, pts, Math.max(3, 4 * dc.z), 'rgba(0,0,0,0.8)');
    g.shadowColor = AMBER;
    g.shadowBlur = 5;
    strokeLine(g, pts, Math.max(1.4, 1.8 * dc.z), AMBER);
    g.shadowBlur = 0;
    if (!complete) return;
    const [x, y] = pts[pts.length - 1];
    const [x0, y0] = pts[pts.length - 2];
    const l = Math.hypot(x - x0, y - y0) || 1;
    arrowHead(g, x, y, (x - x0) / l, (y - y0) / l, Math.max(5, 8 * dc.z), AMBER);
    g.fillStyle = AMBER;
    g.fillRect(pts[0][0] - 2, pts[0][1] - 2, 4, 4);
  },

  dangling(dc, [x, y]) {
    const L = 22 * dc.z;
    strokeLine(dc.g, [[x, y], [x + L, y + L * 0.4]], Math.max(1.4, 1.8 * dc.z), RED, [3, 3]);
  },

  pulse(dc, x, y) {
    const g = dc.g;
    const r = 7 * dc.z + 3;
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2);
    grad.addColorStop(0, 'rgba(255,220,90,0.95)');
    grad.addColorStop(1, 'rgba(255,160,0,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r * 2, 0, Math.PI * 2); g.fill();
  },

  ghost(dc, r0, label) {
    const g = dc.g;
    const r = snapRect(r0);
    g.strokeStyle = LCD_DIM;
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    g.setLineDash([]);
    g.font = VT(px(dc, 17, 9));
    g.fillStyle = LCD_DIM;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, label, VT, px(dc, 17, 9), r.w - 10, 7), r.x + r.w / 2, r.y + r.h / 2);
  },

  beltHandle(dc, [x, y]) {
    const g = dc.g;
    const s = px(dc, 9, 7);
    g.fillStyle = '#000';
    g.fillRect(Math.round(x - s / 2) - 1, Math.round(y - s / 2) - 1, s + 2, s + 2);
    g.fillStyle = LCD;
    g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
  },

  icon(g, kind: IconKind, s) {
    const u = s / 24;
    switch (kind) {
      case 'node':
        metal(g, { x: 2 * u, y: 3 * u, w: 20 * u, h: 18 * u });
        g.fillStyle = '#000'; g.fillRect(4 * u, 7 * u, 16 * u, 7 * u);
        g.fillStyle = LCD; for (let i = 0; i < 5; i++) g.fillRect((5 + i * 3) * u, (13 - (i % 3) * 2) * u, 2 * u, (1 + (i % 3) * 2) * u);
        return;
      case 'belt':
        strokeLine(g, [[3 * u, 12 * u], [18 * u, 12 * u]], 4 * u, '#2c2c40');
        strokeLine(g, [[3 * u, 12 * u], [18 * u, 12 * u]], 2 * u, LCD, [2 * u, 3 * u]);
        arrowHead(g, 22 * u, 12 * u, 1, 0, 5 * u, LCD);
        return;
      case 'frame':
        g.fillStyle = '#000'; g.fillRect(3 * u, 4 * u, 18 * u, 16 * u);
        g.fillStyle = LCD; g.fillRect(5 * u, 7 * u, 10 * u, 1.5 * u); g.fillRect(5 * u, 15 * u, 8 * u, 1.5 * u);
        g.fillStyle = SEL; g.fillRect(4 * u, 10 * u, 16 * u, 3 * u);
        return;
      case 'wire':
        g.strokeStyle = AMBER; g.lineWidth = 2 * u;
        g.beginPath(); g.moveTo(3 * u, 7 * u); g.bezierCurveTo(8 * u, 22 * u, 16 * u, 22 * u, 20 * u, 8 * u); g.stroke();
        return;
      case 'chest':
        metal(g, { x: 5 * u, y: 5 * u, w: 14 * u, h: 14 * u });
        g.fillStyle = '#000'; g.fillRect(7 * u, 7 * u, 10 * u, 10 * u);
        g.fillStyle = LCD; g.fillRect(10 * u, 10 * u, 4 * u, 4 * u);
        return;
      default:
        genericIcon(g, kind, s, '#a8a8c0', '#1b1b28');
    }
  },
};
