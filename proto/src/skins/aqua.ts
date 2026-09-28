// "Aqua" — an early-2000s glossy desktop. Functions are windows whose traffic
// lights are the run state (green running, yellow waiting, red crashed),
// running shows a barber-pole bar, stale code gets the spinning pinwheel.
// Belts are gel tubes: blue while carrying a call, graphite otherwise.
import type { Dc, IconKind, Pt, Rect, Skin } from './types';
import { arrowHead, baseName, beltMid, fitText, rrect, strokeLine, tailLines, Walk } from './util';
import { genericIcon } from './icons';
import { drawCrate, drawInterior, drawSprite, drawStrip, type SpritePalette } from './sprites';

const UI = (px: number, bold = false) => `${bold ? '700 ' : ''}${px}px "Lucida Grande", "DejaVu Sans", "Helvetica Neue", sans-serif`;
const MONO = (px: number) => `${px}px Monaco, "DejaVu Sans Mono", Menlo, monospace`;
const BLUE = '#3875d7';
const ORANGE = '#e8641b';
const px = (dc: Dc, v: number, min = 1) => Math.max(min, v * dc.z);
const spritePalette: SpritePalette = { body: '#e8ebef', edge: '#8794a5', track: '#ffffff', cell: '#b6d4f8', text: '#242a35', muted: '#77818e', accent: BLUE, marker: ORANGE, selection: BLUE, font: (s) => MONO(s), radius: 8 };

type Gel = 'blue' | 'graphite' | 'green' | 'orange' | 'red' | 'yellow';
const GELS: Record<Gel, [string, string, string]> = {
  blue: ['#9fd0ff', '#2f7de1', '#1b4f9c'],
  graphite: ['#e6e9ee', '#a3aab3', '#6b737c'],
  green: ['#b4f0a4', '#34b53a', '#1b6e20'],
  orange: ['#ffd0a0', '#f07a22', '#9c4410'],
  red: ['#ffb1a8', '#e8453a', '#8c1f16'],
  yellow: ['#fff0a0', '#f2b90f', '#9c7206'],
};

function gel(g: CanvasRenderingContext2D, r: Rect, radius: number, kind: Gel): void {
  const [top, mid, edge] = GELS[kind];
  const grad = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  grad.addColorStop(0, mid);
  grad.addColorStop(0.5, mid);
  grad.addColorStop(1, top);
  rrect(g, r.x, r.y, r.w, r.h, radius);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = edge;
  g.lineWidth = 1;
  g.stroke();
  // specular highlight
  rrect(g, r.x + r.h * 0.18, r.y + 1.5, r.w - r.h * 0.36, r.h * 0.42, Math.max(1, radius * 0.7));
  const hl = g.createLinearGradient(0, r.y, 0, r.y + r.h * 0.45);
  hl.addColorStop(0, 'rgba(255,255,255,0.95)');
  hl.addColorStop(1, 'rgba(255,255,255,0.15)');
  g.fillStyle = hl;
  g.fill();
}

function light(g: CanvasRenderingContext2D, x: number, y: number, r: number, kind: Gel, dot: boolean): void {
  const [top, mid, edge] = GELS[kind];
  const grad = g.createRadialGradient(x, y + r * 0.45, r * 0.1, x, y, r);
  grad.addColorStop(0, top);
  grad.addColorStop(0.7, mid);
  grad.addColorStop(1, edge);
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 0.8;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(x, y - r * 0.45, r * 0.55, r * 0.32, 0, 0, Math.PI * 2); g.fill();
  if (dot) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath(); g.arc(x, y + r * 0.1, r * 0.3, 0, Math.PI * 2); g.fill();
  }
}

function pinstripe(g: CanvasRenderingContext2D, r: Rect, a: string, b: string, offset = 0): void {
  g.fillStyle = a;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.fillStyle = b;
  const start = r.y - ((r.y + offset) % 4 + 4) % 4;
  for (let y = start; y < r.y + r.h; y += 4) {
    const y0 = Math.max(y, r.y);
    const y1 = Math.min(y + 2, r.y + r.h);
    if (y1 > y0) g.fillRect(r.x, y0, r.w, y1 - y0);
  }
}

function windowChrome(dc: Dc, r: Rect, title: string, lights: [Gel, Gel, Gel], dot: boolean, dim: boolean): Rect {
  const g = dc.g;
  const rad = px(dc, 7, 3);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.38)';
  g.shadowBlur = 14 * dc.z;
  g.shadowOffsetY = 5 * dc.z;
  rrect(g, r.x, r.y, r.w, r.h, [rad, rad, 3, 3]);
  g.fillStyle = '#ededed';
  g.fill();
  g.restore();
  g.save();
  rrect(g, r.x, r.y, r.w, r.h, [rad, rad, 3, 3]);
  g.clip();
  pinstripe(g, r, '#f1f1f1', '#e9e9e9', 0);
  const th = px(dc, 22, 11);
  const tg = g.createLinearGradient(0, r.y, 0, r.y + th);
  tg.addColorStop(0, dim ? '#f4f4f4' : '#f7f7f7');
  tg.addColorStop(1, dim ? '#e2e2e2' : '#d3d3d3');
  g.fillStyle = tg;
  g.fillRect(r.x, r.y, r.w, th);
  g.fillStyle = 'rgba(255,255,255,0.45)';
  for (let y = r.y + 1; y < r.y + th; y += 2) g.fillRect(r.x, y, r.w, 1);
  g.fillStyle = '#a0a0a0';
  g.fillRect(r.x, r.y + th - 1, r.w, 1);
  g.restore();
  rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, [rad, rad, 3, 3]);
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 1;
  g.stroke();
  const lr = px(dc, 5.5, 3);
  const cy = r.y + th / 2;
  lights.forEach((k, i) => light(g, r.x + px(dc, 12) + i * px(dc, 16), cy, lr, k, dot && i === 0));
  const tx = r.x + px(dc, 12) + 2 * px(dc, 16) + lr + px(dc, 6);
  const tw = r.x + r.w - px(dc, 8) - tx;
  const fs = px(dc, 12, 7);
  const t = fitText(g, title, (s) => UI(s), fs, tw, 6);
  g.font = UI(fs);
  g.fillStyle = dim ? '#8a8a8a' : '#222';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, tx + tw / 2, cy + 0.5);
  return { x: r.x, y: r.y + th, w: r.w, h: r.h - th };
}

function barber(dc: Dc, r: Rect, fill: number, anim: boolean): void {
  const g = dc.g;
  const rad = r.h / 2;
  rrect(g, r.x, r.y, r.w, r.h, rad);
  const tg = g.createLinearGradient(0, r.y, 0, r.y + r.h);
  tg.addColorStop(0, '#c9c9c9');
  tg.addColorStop(1, '#f4f4f4');
  g.fillStyle = tg;
  g.fill();
  g.strokeStyle = '#9a9a9a';
  g.lineWidth = 1;
  g.stroke();
  if (!anim && fill <= 0) return;
  const w = anim ? r.w : Math.max(r.h, r.w * fill);
  g.save();
  rrect(g, r.x, r.y, w, r.h, rad);
  g.clip();
  gel(g, { x: r.x, y: r.y, w, h: r.h }, rad, 'blue');
  if (anim) {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    const sw = r.h;
    const off = (dc.time * 30 * dc.z) % (sw * 2);
    for (let x = r.x - sw * 2 + off; x < r.x + w + sw; x += sw * 2) {
      g.beginPath();
      g.moveTo(x, r.y + r.h); g.lineTo(x + sw, r.y); g.lineTo(x + sw * 2, r.y); g.lineTo(x + sw, r.y + r.h);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
}

function pinwheel(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  const cols = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];
  for (let i = 0; i < 6; i++) {
    g.fillStyle = cols[i];
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, r, a + (i * Math.PI) / 3, a + ((i + 1) * Math.PI) / 3);
    g.closePath();
    g.fill();
  }
  const hl = g.createRadialGradient(x, y - r * 0.4, 0, x, y, r);
  hl.addColorStop(0, 'rgba(255,255,255,0.7)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hl;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

function focusRing(g: CanvasRenderingContext2D, r: Rect, rad: number, strong: boolean): void {
  rrect(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, rad + 3);
  g.strokeStyle = strong ? 'rgba(56,117,215,0.55)' : 'rgba(56,117,215,0.25)';
  g.lineWidth = 4;
  g.stroke();
  if (strong) {
    rrect(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, rad + 1);
    g.strokeStyle = BLUE;
    g.lineWidth = 1;
    g.stroke();
  }
}

export const aqua: Skin = {
  id: 'aqua',
  name: 'Aqua',
  blurb: 'early-2000s gloss: gel, pinstripes, traffic lights',
  casing: '#ececec',
  spotlight: 'rgba(40,48,60,0.5)',
  strip(dc, r, info) { drawStrip(dc, r, info, spritePalette); },
  sprite(dc, r, kind, info) { drawSprite(dc, r, kind, info, spritePalette); },
  crate(dc, x, y, c) { drawCrate(dc, x, y, c, spritePalette); },
  interior(dc, r, i) { drawInterior(dc, r, i, spritePalette); },

  background(dc, camX, camY) {
    const g = dc.g;
    pinstripe(g, { x: 0, y: 0, w: dc.vw, h: dc.vh }, '#f0f0f0', '#e6e6e6', Math.round(camY * dc.cs));
    if (dc.cs < 16) return;
    g.fillStyle = 'rgba(0,0,0,0.09)';
    for (let x = Math.floor(camX); x < camX + dc.vw / dc.cs + 1; x++) {
      for (let y = Math.floor(camY); y < camY + dc.vh / dc.cs + 1; y++) {
        g.fillRect(Math.round((x - camX) * dc.cs), Math.round((y - camY) * dc.cs), 1.5, 1.5);
      }
    }
  },

  belt(dc, pts, o) {
    const g = dc.g;
    const w = Math.max(4, 9 * dc.z);
    const blue = o.live;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    if (o.selected || o.hovered) strokeLine(g, pts, w + 7, o.selected ? 'rgba(56,117,215,0.4)' : 'rgba(56,117,215,0.18)');
    strokeLine(g, pts, w, blue ? '#1d4f9e' : '#78808a');
    strokeLine(g, pts, w - 2, blue ? '#4f95ec' : '#b3bac2');
    strokeLine(g, pts.map(([x, y]) => [x, y - w * 0.18] as Pt), Math.max(1, w * 0.22), 'rgba(255,255,255,0.75)');
    const walk = new Walk(pts);
    if (o.live) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      const gap = 18 * dc.z + 6;
      const off = ((dc.time * 50 * dc.z * o.dir) % gap + gap) % gap;
      for (let d = off; d < walk.length; d += gap) {
        const p = walk.at(d);
        g.beginPath(); g.arc(p.x, p.y - w * 0.05, w * 0.18, 0, Math.PI * 2); g.fill();
      }
    }
    const end = walk.at(walk.length);
    arrowHead(g, end.x, end.y, end.dx, end.dy, Math.max(5, 8 * dc.z), blue ? '#1d4f9e' : '#6b737c');
    if (o.count > 1) {
      const [mx, my] = beltMid(pts);
      const fs = px(dc, 11, 7);
      g.font = UI(fs, true);
      const t = `${o.count}`;
      const pw = Math.max(g.measureText(t).width + px(dc, 12), fs + px(dc, 6));
      const ph2 = fs + px(dc, 5);
      gel(g, { x: mx - pw / 2, y: my - ph2 / 2, w: pw, h: ph2 }, ph2 / 2, blue ? 'blue' : 'graphite');
      g.fillStyle = blue ? '#fff' : '#2c3036';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, mx, my + 0.5);
    }
  },

  // A collapsed file is a Finder window: a source list of its public functions.
  module(dc, r, m) {
    const g = dc.g;
    const lights: [Gel, Gel, Gel] = [
      m.state === 'error' ? 'red' : 'graphite',
      m.state === 'waiting' ? 'yellow' : 'graphite',
      m.state === 'running' ? 'green' : 'graphite',
    ];
    const body = windowChrome(dc, r, baseName(m.name), lights, false, m.state === 'idle');
    const pad = px(dc, 6);
    const foot = px(dc, 18, 10);
    const list = { x: r.x + pad, y: body.y + pad, w: r.w - pad * 2, h: body.h - pad * 2 - foot };
    rrect(g, list.x, list.y, list.w, list.h, px(dc, 4, 2));
    g.fillStyle = '#e8edf3';
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    g.stroke();
    g.save();
    rrect(g, list.x, list.y, list.w, list.h, px(dc, 4, 2));
    g.clip();
    const rowH = 0.55 * dc.cs;
    const fs = px(dc, 11, 7);
    g.textBaseline = 'middle';
    m.doors.forEach((d, i) => {
      const y = list.y + px(dc, 3) + i * rowH;
      if (d.live) {
        const hg = g.createLinearGradient(0, y, 0, y + rowH);
        hg.addColorStop(0, '#6aa3f0');
        hg.addColorStop(1, '#2f6fd6');
        g.fillStyle = hg;
        g.fillRect(list.x, y, list.w, rowH);
      }
      light(g, list.x + px(dc, 9), y + rowH / 2, px(dc, 3.5, 2), d.undeclared ? 'orange' : d.live ? 'green' : 'graphite', false);
      g.font = UI(fs);
      g.textAlign = 'left';
      g.fillStyle = d.live ? '#fff' : '#242a35';
      g.fillText(fitText(g, d.name, (s2) => UI(s2), fs, list.w - px(dc, 22), 6), list.x + px(dc, 17), y + rowH / 2 + 0.5);
    });
    if (m.more) {
      g.font = UI(px(dc, 10, 6));
      g.fillStyle = '#77818e';
      g.textAlign = 'left';
      g.fillText(`${m.more} more`, list.x + px(dc, 17), list.y + px(dc, 3) + m.doors.length * rowH + rowH / 2);
    }
    g.restore();
    g.font = UI(px(dc, 10, 6));
    g.fillStyle = m.state === 'error' ? '#b3261e' : '#7a7a7a';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const status = m.state === 'running' ? `Running ${m.running ?? ''}` : m.state === 'waiting' ? `Waiting in ${m.running ?? ''}` : m.state === 'error' ? 'Quit unexpectedly' : `${m.fns} function${m.fns === 1 ? '' : 's'}`;
    g.fillText(fitText(g, status + (m.depth > 1 ? ` · ×${m.depth}` : ''), (s2) => UI(s2), px(dc, 10, 6), r.w - pad * 2 - 12, 6), list.x, r.y + r.h - foot / 2 - px(dc, 2));
    if (m.pinned) {
      g.fillStyle = BLUE;
      g.beginPath(); g.arc(r.x + r.w - pad - px(dc, 3), r.y + r.h - foot / 2 - px(dc, 2), px(dc, 3, 2), 0, Math.PI * 2); g.fill();
    }
    const ph = (ys: number[]) => Math.min(px(dc, 12, 6), ys.length > 1 ? (ys[1] - ys[0]) * 0.7 : 99);
    const pk = m.state === 'running' ? 'blue' : 'graphite';
    for (const y of m.inPorts) gel(g, { x: r.x - px(dc, 4), y: y - ph(m.inPorts) / 2, w: px(dc, 5, 3), h: ph(m.inPorts) }, 2, pk);
    for (const y of m.outPorts) gel(g, { x: r.x + r.w - 1, y: y - ph(m.outPorts) / 2, w: px(dc, 5, 3), h: ph(m.outPorts) }, 2, pk);
    if (m.selected || m.hovered) focusRing(g, r, px(dc, 7, 3), m.selected);
  },

  // An open file is a glass drawer with a brushed tab.
  wall(dc, r, w) {
    const g = dc.g;
    const rad = px(dc, 10, 4);
    rrect(g, r.x, r.y, r.w, r.h, rad);
    g.fillStyle = 'rgba(255,255,255,0.42)';
    g.fill();
    g.strokeStyle = w.live ? 'rgba(56,117,215,0.55)' : 'rgba(0,0,0,0.18)';
    g.lineWidth = w.live ? 2 : 1;
    g.stroke();
    const h = w.head;
    g.save();
    rrect(g, r.x, r.y, r.w, r.h, rad);
    g.clip();
    const tg = g.createLinearGradient(0, h.y, 0, h.y + h.h);
    tg.addColorStop(0, '#f4f5f7');
    tg.addColorStop(1, '#cfd3d9');
    g.fillStyle = tg;
    g.fillRect(h.x, h.y, h.w, h.h);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(h.x, h.y + h.h - 1, h.w, 1);
    g.restore();
    const fs = px(dc, 12, 7);
    g.font = UI(fs, true);
    g.fillStyle = w.live ? '#1b4f9c' : '#4a4f57';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, w.name, (s2) => UI(s2, true), fs, h.w - px(dc, 60), 6), h.x + px(dc, 12), h.y + h.h / 2 + 0.5);
    g.font = UI(px(dc, 10, 6));
    g.fillStyle = '#7a7a7a';
    g.textAlign = 'right';
    g.fillText(`${w.fns} fn${w.fns === 1 ? '' : 's'}${w.pinned ? ' · pinned' : ''}`, h.x + h.w - px(dc, 12), h.y + h.h / 2 + 0.5);
    if (w.selected || w.hovered) focusRing(g, r, rad, w.selected);
  },

  // Focus: a soft blue halo that breathes, like a default button.
  attention(dc, r, a) {
    const g = dc.g;
    const o = 4 + 10 * (1 - a);
    g.save();
    g.globalAlpha = Math.min(1, a * 1.2);
    g.shadowColor = 'rgba(56,117,215,0.9)';
    g.shadowBlur = 24 * dc.z;
    rrect(g, r.x - o, r.y - o, r.w + 2 * o, r.h + 2 * o, px(dc, 10, 4) + o);
    g.strokeStyle = 'rgba(56,117,215,0.85)';
    g.lineWidth = Math.max(3, 5 * dc.z);
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  },

  door(dc, [x, y], vertical, live) {
    const L = px(dc, 14, 8);
    const T = px(dc, 7, 4);
    const r = vertical ? { x: x - T / 2, y: y - L / 2, w: T, h: L } : { x: x - L / 2, y: y - T / 2, w: L, h: T };
    gel(dc.g, r, T / 2, live ? 'blue' : 'graphite');
  },

  node(dc, r, n) {
    const g = dc.g;
    const lights: [Gel, Gel, Gel] = [
      n.state === 'error' ? 'red' : 'graphite',
      n.state === 'waiting' ? 'yellow' : 'graphite',
      n.state === 'running' ? 'green' : 'graphite',
    ];
    const body = windowChrome(dc, r, n.name, lights, n.editing, n.state === 'idle' || n.stale);
    const pad = px(dc, 10);
    const bar = { x: r.x + pad, y: body.y + px(dc, 12), w: r.w - pad * 2, h: px(dc, 12, 6) };
    barber(dc, bar, n.state === 'waiting' ? 0.45 : 0, n.state === 'running');
    const fs = px(dc, 11, 7);
    g.font = UI(fs);
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillStyle = n.state === 'error' ? '#b3261e' : '#3a3a3a';
    const status =
      n.stale ? 'Not responding' :
      n.state === 'running' ? 'Running' :
      n.state === 'waiting' ? `Waiting for ${n.waitingOn ?? '…'}` :
      n.state === 'error' ? 'Quit unexpectedly' : 'Idle';
    let sx = bar.x;
    if (n.stale) {
      const pr = fs * 0.55;
      pinwheel(g, sx + pr, bar.y + bar.h + px(dc, 8) + pr, pr, dc.time * 6);
      sx += pr * 2 + 4;
    }
    g.fillText(fitText(g, status, (s) => UI(s), fs, r.x + r.w - pad - sx, 6), sx, bar.y + bar.h + px(dc, 8));
    // footer
    g.font = UI(px(dc, 10, 6));
    g.fillStyle = '#7a7a7a';
    g.textBaseline = 'alphabetic';
    const foot = [`${n.params} param${n.params === 1 ? '' : 's'}`, n.isStatic ? 'static' : '', n.frames > 1 ? `×${n.frames}` : ''].filter(Boolean).join(' · ');
    g.fillText(fitText(g, foot, (s) => UI(s), px(dc, 10, 6), r.w - pad * 2 - 12, 6), bar.x, r.y + r.h - px(dc, 8));
    if (n.pinned) {
      g.fillStyle = BLUE;
      g.beginPath(); g.arc(r.x + r.w - pad, r.y + r.h - px(dc, 11), px(dc, 3, 2), 0, Math.PI * 2); g.fill();
    }
    // ports, one per call
    const ph = (ys: number[]) => Math.min(px(dc, 12, 6), ys.length > 1 ? (ys[1] - ys[0]) * 0.7 : 99);
    const pk = n.state === 'running' ? 'blue' : 'graphite';
    for (const y of n.inPorts) gel(g, { x: r.x - px(dc, 4), y: y - ph(n.inPorts) / 2, w: px(dc, 5, 3), h: ph(n.inPorts) }, 2, pk);
    for (const y of n.outPorts) gel(g, { x: r.x + r.w - 1, y: y - ph(n.outPorts) / 2, w: px(dc, 5, 3), h: ph(n.outPorts) }, 2, pk);
    if (n.selected || n.hovered) focusRing(g, r, px(dc, 7, 3), n.selected);
  },

  frame(dc, r, f) {
    const g = dc.g;
    for (let k = Math.min(f.stacked, 3); k > 0; k--) {
      const o = px(dc, 4) * k;
      rrect(g, r.x + o, r.y + o, r.w, r.h, 3);
      g.fillStyle = '#f7f7f7';
      g.fill();
      g.strokeStyle = '#a0a0a0';
      g.stroke();
    }
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.22)';
    g.shadowBlur = 8 * dc.z;
    g.shadowOffsetY = 2 * dc.z;
    rrect(g, r.x, r.y, r.w, r.h, 3);
    g.fillStyle = '#fff';
    g.fill();
    g.restore();
    g.save();
    rrect(g, r.x, r.y, r.w, r.h, 3);
    g.clip();
    const head = f.head;
    const hg = g.createLinearGradient(0, head.y, 0, head.y + head.h);
    hg.addColorStop(0, '#fbfbfb');
    hg.addColorStop(1, '#d9d9d9');
    g.fillStyle = hg;
    g.fillRect(head.x, head.y, head.w, head.h);
    g.fillStyle = '#a8a8a8';
    g.fillRect(head.x, head.y + head.h - 1, head.w, 1);
    const c1 = head.x + head.w * 0.5;
    g.fillRect(c1, head.y + 3, 1, head.h - 6);
    const fs = px(dc, 10.5, 7);
    g.font = UI(fs);
    g.fillStyle = f.mode === 'none' ? '#999' : '#333';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText('Variable', head.x + 6, head.y + head.h / 2);
    g.fillText(f.mode === 'returned' ? 'Last value' : 'Value', c1 + 6, head.y + head.h / 2);
    f.rows.forEach((row, i) => {
      const rr = row.rect;
      const sel = row.recent;
      if (sel) {
        const sg = g.createLinearGradient(0, rr.y, 0, rr.y + rr.h);
        sg.addColorStop(0, '#6a9fe8');
        sg.addColorStop(1, '#3a73d6');
        g.fillStyle = sg;
      } else g.fillStyle = i % 2 ? '#edf3fe' : '#ffffff';
      g.fillRect(rr.x, rr.y, rr.w, rr.h);
      if (row.flash > 0) {
        g.fillStyle = `rgba(56,117,215,${0.55 * row.flash})`;
        g.fillRect(rr.x, rr.y, rr.w, rr.h);
      }
      const col = sel ? '#fff' : f.mode === 'live' ? '#1a1a1a' : '#9a9a9a';
      g.font = UI(px(dc, 11, 7));
      g.fillStyle = col;
      g.textAlign = 'left';
      const dot = px(dc, 3, 2);
      if (!row.depth) {
        g.beginPath(); g.arc(rr.x + 8, rr.y + rr.h / 2, dot, 0, Math.PI * 2);
        g.fillStyle = sel ? '#fff' : row.param ? ORANGE : '#9aa3ad';
        g.fill();
      }
      g.fillStyle = col;
      g.fillText(fitText(g, row.name, (s) => UI(s), px(dc, 11, 7), rr.w * 0.5 - 18, 6), rr.x + 15, rr.y + rr.h / 2 + 0.5);
      if (!row.value) return;
      g.font = MONO(px(dc, 10.5, 7));
      g.fillStyle =
        sel || f.mode !== 'live' ? col :
        row.kind === 'ptr' ? ORANGE : row.kind === 'dangling' ? '#b3261e' : row.kind === 'undef' || row.kind === 'null' ? '#9a9a9a' : '#1a1a1a';
      g.fillText(fitText(g, row.value, MONO, px(dc, 10.5, 7), rr.w * 0.5 - 10, 6), c1 + 6, rr.y + rr.h / 2 + 0.5);
    });
    g.restore();
    rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, 3);
    g.strokeStyle = '#9d9d9d';
    g.lineWidth = 1;
    g.stroke();
  },

  chest(dc, r, c) {
    const g = dc.g;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.3)';
    g.shadowBlur = 6 * dc.z;
    g.shadowOffsetY = 2 * dc.z;
    gel(g, r, px(dc, 6, 3), c.value === null ? 'graphite' : 'blue');
    g.restore();
    if (c.flash > 0) {
      rrect(g, r.x, r.y, r.w, r.h, px(dc, 6, 3));
      g.fillStyle = `rgba(255,255,255,${0.7 * c.flash})`;
      g.fill();
    }
    if (c.value !== null) {
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 2;
      g.fillText(fitText(g, c.value, (s) => UI(s, true), px(dc, 13, 7), r.w - 6, 6), r.x + r.w / 2, r.y + r.h * 0.58);
      g.shadowBlur = 0;
    }
    const fs = px(dc, 11, 7);
    g.font = UI(fs);
    const tw = g.measureText(c.name).width + 10;
    const lx = r.x + r.w + px(dc, 5);
    const ly = r.y + r.h / 2 - fs / 2 - 2;
    if (c.selected || c.recent) {
      rrect(g, lx, ly, tw, fs + 4, (fs + 4) / 2);
      g.fillStyle = BLUE;
      g.fill();
    }
    g.fillStyle = c.selected || c.recent ? '#fff' : '#222';
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(c.name, lx + 5, ly + (fs + 4) / 2 + 0.5);
    if (c.hovered && !c.selected) focusRing(g, r, px(dc, 6, 3), false);
  },

  proc(dc, r, p) {
    const g = dc.g;
    const lights: [Gel, Gel, Gel] = [p.state === 'crashed' ? 'red' : 'graphite', 'graphite', p.state === 'running' ? 'green' : 'graphite'];
    const body = windowChrome(dc, r, 'Terminal — a.out', lights, false, p.state === 'idle');
    g.fillStyle = '#fff';
    g.fillRect(body.x + 1, body.y, body.w - 2, body.h - 1);
    const fs = px(dc, 10, 6);
    g.font = MONO(fs);
    g.fillStyle = '#111';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    const lines = ['[localhost:~] % ./a.out', ...tailLines(p.out, 3)];
    if (p.state === 'done' && p.exit !== null) lines.push(`exit ${p.exit}`);
    if (p.state === 'crashed') lines.push('Bus error');
    lines.forEach((l, i) => g.fillText(fitText(g, l, MONO, fs, body.w - 10, 6), body.x + 5, body.y + 4 + i * (fs + 3)));
    if (p.state === 'running' && Math.floor(dc.time * 2) % 2 === 0) g.fillRect(body.x + 5, body.y + 4 + lines.length * (fs + 3), fs * 0.6, fs);
    if (p.selected || p.hovered) focusRing(g, r, px(dc, 7, 3), p.selected);
  },

  plate(dc, x, y, text, kind) {
    const g = dc.g;
    const fs = px(dc, 11, 7);
    g.font = UI(fs, true);
    const h = fs + px(dc, 7, 4);
    const w = Math.max(h, g.measureText(text).width + h * 0.9);
    const r = { x: x - w / 2, y: y - h / 2, w, h };
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = 5;
    g.shadowOffsetY = 2;
    gel(g, r, h / 2, kind === 'ptr' ? 'orange' : kind === 'ret' ? 'green' : kind === 'void' ? 'graphite' : 'blue');
    g.restore();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 2;
    g.fillText(text, x, y + 0.5);
    g.shadowBlur = 0;
  },

  wire(dc, pts, complete) {
    const g = dc.g;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    strokeLine(g, pts, Math.max(3, 4.5 * dc.z), '#8c3a0c');
    strokeLine(g, pts, Math.max(2, 3 * dc.z), ORANGE);
    strokeLine(g, pts.map(([x, y]) => [x, y - 0.8] as Pt), 1, 'rgba(255,255,255,0.6)');
    const r = Math.max(3, 4 * dc.z);
    const ends = complete ? [pts[0], pts[pts.length - 1]] : [pts[0]];
    for (const [x, y] of ends) gel(g, { x: x - r, y: y - r, w: r * 2, h: r * 2 }, r, 'orange');
  },

  dangling(dc, [x, y]) {
    const L = 22 * dc.z;
    strokeLine(dc.g, [[x, y], [x + L, y + L * 0.4]], Math.max(2, 3 * dc.z), 'rgba(232,100,27,0.6)', [4, 4]);
  },

  pulse(dc, x, y) {
    const g = dc.g;
    const r = 8 * dc.z + 3;
    const grad = g.createRadialGradient(x, y, 0, x, y, r * 2);
    grad.addColorStop(0, 'rgba(255,200,140,1)');
    grad.addColorStop(1, 'rgba(232,100,27,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r * 2, 0, Math.PI * 2); g.fill();
  },

  ghost(dc, r, label) {
    const g = dc.g;
    rrect(g, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, px(dc, 7, 3));
    g.strokeStyle = 'rgba(0,0,0,0.3)';
    g.setLineDash([5, 4]);
    g.lineWidth = 1.2;
    g.stroke();
    g.setLineDash([]);
    g.font = UI(px(dc, 11, 7));
    g.fillStyle = '#8a8a8a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(fitText(g, label, (s) => UI(s), px(dc, 11, 7), r.w - 12, 6), r.x + r.w / 2, r.y + r.h / 2);
  },

  beltHandle(dc, [x, y]) {
    const r = px(dc, 6, 5);
    gel(dc.g, { x: x - r, y: y - r, w: r * 2, h: r * 2 }, r, 'blue');
  },

  icon(g, kind: IconKind, s) {
    const u = s / 24;
    switch (kind) {
      case 'node':
        rrect(g, 2 * u, 3 * u, 20 * u, 18 * u, 3 * u); g.fillStyle = '#f0f0f0'; g.fill(); g.strokeStyle = '#999'; g.stroke();
        light(g, 6 * u, 7 * u, 2 * u, 'red', false); light(g, 11 * u, 7 * u, 2 * u, 'yellow', false); light(g, 16 * u, 7 * u, 2 * u, 'green', false);
        gel(g, { x: 5 * u, y: 13 * u, w: 14 * u, h: 4 * u }, 2 * u, 'blue');
        return;
      case 'belt':
        strokeLine(g, [[3 * u, 12 * u], [18 * u, 12 * u]], 6 * u, '#1d4f9e');
        strokeLine(g, [[3 * u, 12 * u], [18 * u, 12 * u]], 4 * u, '#4f95ec');
        arrowHead(g, 22 * u, 12 * u, 1, 0, 5 * u, '#1d4f9e');
        return;
      case 'frame':
        g.fillStyle = '#fff'; g.fillRect(3 * u, 4 * u, 18 * u, 16 * u);
        g.fillStyle = '#edf3fe'; g.fillRect(3 * u, 12 * u, 18 * u, 4 * u);
        g.fillStyle = BLUE; g.fillRect(3 * u, 8 * u, 18 * u, 4 * u);
        g.strokeStyle = '#999'; g.strokeRect(3 * u, 4 * u, 18 * u, 16 * u);
        return;
      case 'wire':
        g.strokeStyle = ORANGE; g.lineWidth = 3 * u;
        g.beginPath(); g.moveTo(3 * u, 7 * u); g.bezierCurveTo(8 * u, 22 * u, 16 * u, 22 * u, 20 * u, 8 * u); g.stroke();
        return;
      case 'chest':
        gel(g, { x: 5 * u, y: 5 * u, w: 14 * u, h: 14 * u }, 3 * u, 'blue');
        return;
      default:
        genericIcon(g, kind, s, '#6b737c', '#ffffff');
    }
  },
};
