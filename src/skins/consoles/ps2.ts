import { backdrop, countBadge, makeSkin, softShadow, type Palette, type Theme } from '../kit';
import type { Dc } from '../types';
import { hash, strokeLine, Walk } from '../util';
import { EXO, F, MONO, ps2Still, text } from './common';

// the AV lead's colours: rubber (edge, body, mid, sheen) idle, lit, and carrying data
const CABLE = {
  edge: '#040405',
  idle: ['#242428', '#303036', '#484850'],
  lit: ['#32323a', '#43434c', '#62626e'],
  live: ['#1c2650', '#283a78', '#5878e0'],
};

// A cable end at p, pointing along (dx, dy): the far end (`start` false) is
// the moulded plug with its metal tip, the near one a short ridged collar.
function plug(g: CanvasRenderingContext2D, p: { x: number; y: number; dx: number; dy: number }, wd: number, room: number, tone: string[], live: boolean, start: boolean): void {
  g.save();
  g.translate(p.x, p.y);
  g.rotate(Math.atan2(p.dy, p.dx));
  const rect = (x: number, w: number, h: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(x, -h / 2, w, h);
  };
  if (start) {
    // collar: three ridges just past the start
    const l = wd * 1.6 * room;
    rect(-wd * 0.2, l + wd * 0.2, wd * 1.7 + 1.6, CABLE.edge);
    rect(0, l, wd * 1.7, tone[0]);
    for (let i = 1; i < 4; i++) rect((l * i) / 4 - 0.4, 0.8, wd * 1.7, CABLE.edge);
    rect(0, l, Math.max(1, wd * 0.25), tone[2]);
  } else {
    // plug: the moulded body, then the metal nose (the arrow's tip at p)
    const nose = wd * 1.6 * room;
    const body = wd * 3.4 * room;
    rect(-nose - body - 0.8, body + 0.8, wd * 2.5 + 1.6, CABLE.edge);
    rect(-nose - body, body, wd * 2.5, tone[0]);
    rect(-nose - body, body, wd * 2.5 * 0.5, tone[1]);
    rect(-nose - body * 0.7, Math.max(1, body * 0.08), wd * 2.5, CABLE.edge); // a seam
    rect(-nose - 0.8, nose + 0.8, wd * 1.5 + 1.6, CABLE.edge);
    rect(-nose, nose, wd * 1.5, live ? '#8ea6ff' : '#82828c');
    rect(-nose, nose, wd * 1.5 * 0.35, live ? '#d4ddff' : '#b8b8c2');
  }
  g.restore();
}

// The PlayStation 2 (2000), after Teiyu Goto's own account: "the thin blue
// logo on the large black background" is the Earth, small in the vastness of
// space; a jet-black monolith of stacked, squared-off ridges; the logo's
// single blue lines bending at right angles "as if prisms were refracting a
// laser"; a blue gradient stand; and the boot towers.
// what's active is silver, as on the console's face; Sony keeps its blue
// for the logo (here: the lights: the boot screen's, data in flight, the progress trail)
const PS2_SILVER = '#d6d6dc';
const ORBITRON = F('Orbitron, "Exo 2", sans-serif');
const ps2P: Palette = {
  bg: '#0b0b0b', card: '#131315', panel: '#101012', line: '#28282c',
  fg: '#dedee2', dim: '#a0a0a9', faint: '#676770', accent: PS2_SILVER, ptr: '#b3a8c4', ret: '#5fd0c8', wait: '#ffcc55', err: '#ff5a6e',
  param: '#c4c4cc', cell: '#1a1a1e', track: '#0f0f10',
};
// the console's matte plastic: a fine, dense grain of light and dark
// specks, pre-rendered once as a tile and laid over a surface anchored to
// it (so it moves with the window, never swims)
let ps2GrainTile: HTMLCanvasElement | null = null;
// when each window's lights came on (keyed by name), for the flash
const ps2Lit = new Map<string, number>();
// the kind of window whose frame was drawn last (its title bar comes next)
let ps2Kind: 'machine' | 'module' | 'node' | undefined;
// the progress trail's sweep, 0..1, shared with the power light
const ps2Phase = (t: number) => (t / 1.6) % 1;
function ps2Grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a = 1): void {
  if (!ps2GrainTile) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const cg = c.getContext('2d')!;
    const img = cg.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      // 2 px specks (a coarse sandblast), dark pits only: light specks
      // read as dust on a dark screen
      const x = (i % 128) >> 1;
      const y = Math.floor(i / 128) >> 1;
      const r = hash(x * 131 + y * 977 + 3);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 0;
      img.data[i * 4 + 3] = r * 80;
    }
    cg.putImageData(img, 0, 0);
    ps2GrainTile = c;
  }
  const pat = g.createPattern(ps2GrainTile, 'repeat');
  if (!pat) return;
  g.save();
  g.translate(Math.round(x), Math.round(y));
  g.globalAlpha *= a;
  g.fillStyle = pat;
  g.fillRect(0, 0, w, h);
  g.restore();
}
// the ridges: stacked, squared-off grooves across a black slab
function ridges(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number): void {
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(x, yy, w, 1);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x, yy + 1, w, 1);
  }
}
// The boot screen ("Sony Computer Entertainment"): black space with a
// low-resolution blue fog in the middle, glass cubes tumbling in it,
// and a few coloured lights sweeping through, each glowing at its head
// and dragging an ultra-sharp hairline trail. The fog is soft (small
// textures scaled up); the cubes and trails are drawn at full resolution. Stateless: a trail is the light's own path sampled back in
// time, so it looks the same at 15 or 60 frames a second and in the
// still preview.
// the fog: value noise on a tiny grid, a few octaves, inside a soft oval
function ps2FogTex(seed: number): HTMLCanvasElement {
  const W = 96;
  const H = 60;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const noise = (x: number, y: number, s: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const h = (i: number, j: number) => hash(i * 131 + j * 977 + s * 7919);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
    const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let n = 0;
      let amp = 0.55;
      for (let o = 0; o < 4; o++) (n += amp * noise((x / W) * 5 * 2 ** o, (y / H) * 3 * 2 ** o, seed + o)), (amp /= 2);
      const dx = (x / W - 0.5) / 0.42;
      const dy = (y / H - 0.47) / 0.42;
      const mask = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
      const d = Math.max(0, n - 0.3) * 2.2 * mask ** 1.2;
      const k = (y * W + x) * 4;
      img.data[k] = 20 + 26 * d;
      img.data[k + 1] = 22 + 26 * d;
      img.data[k + 2] = 110 + 70 * d;
      img.data[k + 3] = Math.min(255, 255 * d * 0.6);
    }
  g.putImageData(img, 0, 0);
  return c;
}
let ps2Fogs: HTMLCanvasElement[] | null = null;
const ps2Cubes = Array.from({ length: 6 }, (_, i) => ({
  x: [-0.34, 0.36, -0.1, 0.18, -0.42, 0.44][i], y: [-0.28, -0.3, -0.05, 0.2, 0.3, 0.26][i],
  s: 0.06 + 0.06 * hash(i * 5 + 1), depth: 0.1 + 0.12 * hash(i * 23 + 6), rx: 0.05 + 0.08 * hash(i * 7 + 2), ry: 0.04 + 0.07 * hash(i * 11 + 3), p: Math.PI * 2 * hash(i * 13 + 4),
}));
const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];
const ps2Lights = [
  { col: '#ff4a5e', a: 0.23, b: 0.31, c: 0.17, p: [0.3, 1.9, 4.1, 0.7] },
  { col: '#3dff72', a: 0.29, b: 0.19, c: 0.23, p: [2.4, 0.2, 1.3, 2.9] },
  { col: '#9b7dff', a: 0.19, b: 0.27, c: 0.29, p: [4.6, 3.3, 0.4, 5.1] },
  { col: '#4f78ff', a: 0.26, b: 0.23, c: 0.2, p: [1.1, 5.2, 2.7, 3.8] },
];
const ps2Sprites = new Map<string, HTMLCanvasElement>();
function ps2Sprite(col: string): HTMLCanvasElement {
  let c = ps2Sprites.get(col);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.12, col);
    r.addColorStop(0.35, col + '66');
    r.addColorStop(1, col + '00');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    ps2Sprites.set(col, c);
  }
  return c;
}
// Parallax: each layer follows the camera by a fraction of the grid's own
// motion (fog least, then the lights, the cubes most, each at its own
// depth), and zooms by a small power of the grid's zoom. Cubes wrap around;
// the fog and lights ease to a stop so they never leave the screen.
type Pan = { x: number; y: number; cx: number; cy: number; vw: number; vh: number };
const newPan = (): Pan => ({ x: 0, y: 0, cx: NaN, cy: NaN, vw: 0, vh: 0 });
// how far the grid has moved on screen, added up frame by frame: a zoom
// (anchored at the mouse) moves the grid at most the mouse's distance
// from the middle, so zooming far out or in never flings the layers
function trackPan(P: Pan, dc: Dc, camX: number, camY: number): void {
  const cx = camX + dc.vw / 2 / dc.cs;
  const cy = camY + dc.vh / 2 / dc.cs;
  if (P.vw === dc.vw && P.vh === dc.vh && Number.isFinite(P.cx)) (P.x += (cx - P.cx) * dc.cs), (P.y += (cy - P.cy) * dc.cs);
  Object.assign(P, { cx, cy, vw: dc.vw, vh: dc.vh });
}
const ps2Pan = newPan();
function ps2Boot(dc: Dc, camX: number, camY: number): void {
  const g = dc.g;
  const t = ps2Still || !dc.time ? 40 : dc.time;
  const W = dc.vw;
  const H = dc.vh;
  trackPan(ps2Pan, dc, camX, camY);
  const panX = ps2Pan.x;
  const panY = ps2Pan.y;
  const soft = (v: number, lim: number) => lim * Math.tanh(v / lim);
  const zoomOf = (zf: number) => Math.min(1.8, Math.max(0.7, dc.z ** zf));
  const layer = (k: number, zf: number, lim: number) => {
    const sc = zoomOf(zf);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.translate(W / 2 - soft(panX * k, lim), H / 2 - soft(panY * k, lim));
    g.scale(sc, sc);
    g.translate(-W / 2, -H / 2);
  };
  const dpr = g.getTransform().a;
  g.save();
  g.imageSmoothingEnabled = true;
  // the fog: two layers drifting against each other, breathing a little
  ps2Fogs ??= [ps2FogTex(1), ps2FogTex(9)];
  layer(0.03, 0.12, W * 0.1);
  for (let i = 0; i < 2; i++) {
    const dir = i ? -1 : 1;
    const ox = Math.sin(t * 0.045 + i * 2) * W * 0.04 * dir;
    const oy = Math.cos(t * 0.037 + i) * H * 0.03;
    g.globalAlpha = i ? 0.55 + 0.1 * Math.sin(t * 0.3) : 0.85;
    g.drawImage(ps2Fogs[i], -W * 0.08 + ox, -H * 0.08 + oy, W * 1.16, H * 1.16);
  }
  g.globalAlpha = 1;
  // the glass cubes, sharp: faces sorted back to front; the far ones barely
  // there, the near ones tinted by where they point and crossed by a
  // reflection band that slides as the cube turns; no outlines
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sc = zoomOf(0.35);
  const wrap = (v: number, lo: number, span: number) => lo + ((((v - lo) % span) + span) % span);
  const u = Math.min(W, H) * sc;
  const LX = -0.45, LY = -0.6, LZ = 0.66; // the light: above, left, in front
  g.lineJoin = 'round';
  for (const C of ps2Cubes) {
    const ax = C.p + t * C.rx;
    const ay = C.p * 0.7 + t * C.ry;
    const v3 = CUBE_V.map(([x, y, z]) => {
      const y1 = y * Math.cos(ax) - z * Math.sin(ax);
      const z1 = y * Math.sin(ax) + z * Math.cos(ax);
      return [x * Math.cos(ay) + z1 * Math.sin(ay), y1, -x * Math.sin(ay) + z1 * Math.cos(ay)];
    });
    const cx = W / 2 + (wrap(W / 2 + C.x * W - panX * C.depth, -W * 0.2, W * 1.4) - W / 2) * sc;
    const cy = H / 2 + (wrap(H * 0.47 + C.y * H - panY * C.depth, -H * 0.25, H * 1.5) - H / 2) * sc;
    const pts = v3.map(([x, y, z]) => {
      const k = 3 / (4 - z * 0.6);
      return [cx + x * C.s * u * k, cy + y * C.s * u * k];
    });
    const faces = CUBE_F.map((f) => {
      // a cube face's centre is its outward normal
      const n = [0, 1, 2].map((i) => f.reduce((sum, v) => sum + v3[v][i], 0) / 4);
      return { f, n };
    }).sort((p, q) => p.n[2] - q.n[2]);
    for (const { f, n } of faces) {
      const path = () => {
        g.beginPath();
        f.forEach((v, i) => (i ? g.lineTo(pts[v][0], pts[v][1]) : g.moveTo(pts[v][0], pts[v][1])));
        g.closePath();
      };
      path();
      if (n[2] <= 0) {
        g.fillStyle = 'rgba(3,5,16,0.12)';
        g.fill();
        continue;
      }
      const lit = Math.max(0, n[0] * LX + n[1] * LY + n[2] * LZ);
      const xs = f.map((v) => pts[v][0]);
      const ys = f.map((v) => pts[v][1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      // dark glass, lighter where it faces the light
      const body = g.createLinearGradient(x0, y0, x1, y1);
      body.addColorStop(0, `rgba(${60 + 70 * lit | 0},${80 + 70 * lit | 0},${170 + 50 * lit | 0},${0.05 + 0.09 * lit})`);
      body.addColorStop(1, 'rgba(4,6,22,0.24)');
      g.fillStyle = body;
      g.fill();
      // the reflection: a soft band with a sharp core, placed by the face's angle
      g.save();
      path();
      g.clip();
      const at = Math.min(0.92, Math.max(0.08, 0.5 + n[0] * 0.7 - n[1] * 0.5));
      const band = g.createLinearGradient(x0, y0, x1, y1);
      const a = 0.04 + 0.16 * lit * n[2];
      band.addColorStop(Math.max(0, at - 0.22), 'rgba(200,220,255,0)');
      band.addColorStop(Math.max(0, at - 0.03), `rgba(200,220,255,${a * 0.5})`);
      band.addColorStop(at, `rgba(235,242,255,${a})`);
      band.addColorStop(Math.min(1, at + 0.05), `rgba(200,220,255,${a * 0.25})`);
      band.addColorStop(Math.min(1, at + 0.15), 'rgba(200,220,255,0)');
      g.fillStyle = band;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.restore();
    }
  }
  // the lights: a glowing head, a hairline trail
  layer(0.07, 0.25, W * 0.2);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  const at = (L: (typeof ps2Lights)[number], tt: number) => {
    const x3 = Math.sin(L.a * tt * 2.2 + L.p[0]) * (0.7 + 0.3 * Math.sin(0.11 * tt + L.p[3]));
    const y3 = Math.sin(L.b * tt * 2.2 + L.p[1]);
    const z3 = Math.cos(L.c * tt * 2.2 + L.p[2]);
    const k = 1.6 / (2.6 - z3);
    return { x: W / 2 + x3 * W * 0.46 * k, y: H * 0.47 + y3 * H * 0.36 * k, k };
  };
  const N = 90;
  for (const L of ps2Lights) {
    let prev = at(L, t - N * 0.018);
    for (let n = N - 1; n >= 0; n--) {
      const cur = at(L, t - n * 0.018);
      g.globalAlpha = (1 - n / N) ** 1.6 * 0.9;
      g.strokeStyle = L.col;
      g.lineWidth = n < 8 ? 1.4 : 1;
      g.beginPath();
      g.moveTo(prev.x, prev.y);
      g.lineTo(cur.x, cur.y);
      g.stroke();
      prev = cur;
    }
    const d = 26 * prev.k;
    g.globalAlpha = 1;
    g.drawImage(ps2Sprite(L.col), prev.x - d / 2, prev.y - d / 2, d, d);
  }
  g.restore();
}

export const ps2Theme: Theme = {
  id: 'ps2', name: 'PlayStation 2', blurb: 'the black monolith and the boot screen: blue fog, glass cubes, sharp trails of light',
  p: ps2P, ui: EXO, mono: MONO('"Share Tech Mono"'), radius: 0, spotlight: 'rgba(0,0,0,0.65)',
  pulseColor: 'rgba(63,107,255,0.9)',
  flow: '#3f6bff', // data in motion is the console's blue light
  card(dc, r, o) {
    const g = dc.g;
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(12,12,12,0.55)' : o.kind === 'frame' || o.kind === 'plate' ? ps2P.panel : ps2P.card;
      g.fillRect(r.x, r.y, r.w, r.h);
      if (o.kind !== 'wall') ps2Grain(g, r.x, r.y, r.w, r.h, 0.45);
    }
    // no glowing borders: plates keep their colour, everything else a hairline
    g.strokeStyle = o.kind === 'plate' ? o.stroke : 'rgba(255,255,255,0.1)';
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  },
  // belts: a cable, like the console's AV lead: a round black rubber cord
  // shaded as a tube, a short strain-relief collar where it leaves, a moulded
  // plug with a metal tip where it arrives (the tip is the arrow). A live one
  // carries lights running along it like the progress light (a hot core
  // fading back over a soft glow), one every 360 px or so, in the direction
  // the data goes
  belt(dc, pts, o, t) {
    const g = dc.g;
    const z = dc.z;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const wd = Math.max(2.6, 4.4 * z); // the cord's thickness
    if (o.selected) strokeLine(g, pts, wd + Math.max(5, 8 * z), 'rgba(255,255,255,0.06)');
    const tone = o.live ? CABLE.live : o.hovered || o.selected ? CABLE.lit : CABLE.idle;
    strokeLine(g, pts, wd + 1.6, CABLE.edge);
    strokeLine(g, pts, wd, tone[0]);
    strokeLine(g, pts, wd * 0.6, tone[1]);
    strokeLine(g, pts, Math.max(1, wd * 0.2), tone[2]);
    const w = new Walk(pts);
    if (w.length > 4) {
      // the plug's length follows the cord, but a short belt keeps room for its cord
      const room = Math.min(1, w.length / (wd * 9));
      plug(g, w.at(w.length), wd, room, tone, o.live, false);
      plug(g, w.at(0), wd, room, tone, o.live, true);
    }
    if (o.live && w.length > 4) {
      const gap = Math.max(120, 360 * z);
      const tail = Math.min(w.length * 0.6, Math.max(40, 150 * z));
      const run = (dc.time * 260 * z) % gap;
      const N = 16;
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let head = run; head < w.length + tail; head += gap) {
        let prev: { x: number; y: number } | null = null;
        for (let k = 0; k <= N; k++) {
          const d = head - tail + (tail * k) / N;
          if (d < 0 || d > w.length) { prev = null; continue; }
          const q = w.at(o.dir < 0 ? w.length - d : d);
          if (prev) {
            const f = (k / N) ** 1.6;
            g.beginPath();
            g.moveTo(prev.x, prev.y);
            g.lineTo(q.x, q.y);
            g.strokeStyle = 'rgba(47,107,255,1)';
            g.globalAlpha = f * 0.3;
            g.lineWidth = Math.max(3, 5 * z);
            g.stroke();
            g.strokeStyle = '#d4ddff';
            g.globalAlpha = f;
            g.lineWidth = Math.max(1, 1.2 * z);
            g.stroke();
          }
          prev = q;
        }
        if (head <= w.length) {
          const q = w.at(o.dir < 0 ? w.length - head : head);
          const d = Math.max(10, 16 * z);
          g.globalAlpha = 1;
          g.drawImage(ps2Sprite('#4f78ff'), q.x - d / 2, q.y - d / 2, d, d);
        }
      }
      g.restore();
    }
    countBadge(dc, pts, o, t);
  },
  // storage and stations: the window, pared down. Graphite with the grain,
  // a hairline edge, a short ridged head with a small grey title
  panel(dc, r, head, title, live) {
    const g = dc.g;
    g.fillStyle = 'rgba(21,21,23,0.96)';
    g.fillRect(r.x, r.y, r.w, r.h);
    ps2Grain(g, r.x, r.y, r.w, r.h, 0.5);
    ridges(g, r.x, r.y, r.w, head.h, Math.max(3, 6 * dc.z));
    g.strokeStyle = 'rgba(255,255,255,0.07)';
    g.lineWidth = 1;
    g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w) - 1, Math.round(r.h) - 1);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(r.x, r.y + head.h, r.w, 1);
    text(dc, { ...head, x: r.x, w: r.w }, title.toUpperCase(), ORBITRON, 8.5, live ? '#d6d6dc' : '#8e8e97', { w: 500, x: r.x + 8 * dc.z });
  },
  // data in flight leaves the boot lights' trail: a hairline fading toward
  // the tail over a faint glow, a glowing head under the data
  trail(dc, pts, kind) {
    const g = dc.g;
    const col = kind === 'ret' ? '#5fd0c8' : '#4f78ff';
    const hot = kind === 'ret' ? '#c8fff6' : '#d4ddff';
    const n = pts.length - 1;
    if (n < 1) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.strokeStyle = col;
    const core = Math.max(1, Math.min(2, 1.3 * dc.z));
    for (let i = 1; i <= n; i++) {
      const f = (i / n) ** 1.5;
      g.beginPath();
      g.moveTo(pts[i - 1][0], pts[i - 1][1]);
      g.lineTo(pts[i][0], pts[i][1]);
      g.strokeStyle = col;
      g.globalAlpha = f * 0.22;
      g.lineWidth = core * 7;
      g.stroke();
      g.strokeStyle = hot;
      g.globalAlpha = f;
      g.lineWidth = core;
      g.stroke();
    }
    const [x, y] = pts[n];
    const d = Math.max(14, 24 * dc.z);
    g.globalAlpha = 0.9;
    g.drawImage(ps2Sprite(col), x - d / 2, y - d / 2, d, d);
    g.restore();
  },
  // the boot screen: black space, the fog, the cubes and the lights
  background(dc, camX, camY) {
    backdrop(dc, 'ps2-space', (g, W, H) => {
      g.fillStyle = '#000003';
      g.fillRect(0, 0, W, H);
    });
    ps2Boot(dc, camX, camY);
  },
  window: {
    border: 2, corner: 0, titleH: 26, face: 'rgba(0,0,0,0.06)', workspace: 'rgba(255,255,255,0.02)',
    // a black slab: stacked ridges along the head, thin lines turning at the corners
    frame(dc, r, active, face, kind) {
      const g = dc.g;
      ps2Kind = kind;
      softShadow(dc, r, 1, 10, 'rgba(0,0,0,0.8)', 3 * dc.z);
      // smoked, not solid: the dancing lights glow through between the panels
      g.fillStyle = 'rgba(20,20,22,0.96)';
      g.fillRect(r.x, r.y, r.w, r.h);
      ps2Grain(g, r.x, r.y, r.w, r.h, 0.5);
      ridges(g, r.x, r.y, r.w, 26 * dc.z, Math.max(3, 5 * dc.z));
      g.fillStyle = face;
      g.fillRect(r.x + 2 * dc.z, r.y + 26 * dc.z, r.w - 4 * dc.z, Math.max(0, r.h - 28 * dc.z));
      g.strokeStyle = 'rgba(255,255,255,0.06)';
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      // focus isn't an outline: the power light says it (titleBar)
      // a machine is the console standing up: the raised side block down its
      // right edge, with two columns of short vertical slits
      if (kind === 'machine' && r.h > 60 * dc.z) {
        const z = dc.z;
        const bw = Math.max(5, 10 * z);
        const x = r.x + r.w - 4 * z - bw;
        const top = r.y + 32 * z;
        const bottom = r.y + r.h - 10 * z;
        g.fillStyle = '#19191c';
        g.fillRect(x, top, bw, bottom - top);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, top, 1, bottom - top);
        g.fillStyle = 'rgba(0,0,0,0.7)';
        g.fillRect(x + bw - 1, top, 1, bottom - top);
        const sw = Math.max(1, 1.6 * z);
        const sh = Math.max(3, 7 * z);
        const step = sh + Math.max(1.5, 3 * z);
        for (let y = top + 4 * z; y + sh < bottom - 3 * z; y += step)
          for (const cx of [x + bw * 0.32, x + bw * 0.68]) {
            g.fillStyle = '#0b0b0b';
            g.fillRect(cx - sw / 2, y, sw, sh);
            g.fillStyle = 'rgba(255,255,255,0.16)';
            g.fillRect(cx - sw / 2, y + sh, sw, Math.max(0.5, 0.6 * z));
          }
      }
    },
    titleBar(dc, r, title, active, buttons) {
      text(dc, r, title.toUpperCase(), ORBITRON, 11, active ? '#eaeaed' : '#8e8e97', { w: 500, x: r.x + 10 * dc.z });
      // one light, the power light. Idle: standby (dim red). Active: green,
      // flashing quickly when the window becomes active; on a function box
      // it also flares each time the progress trail reaches the right end,
      // as if the light ran into it.
      if (buttons && r.w > 110 * dc.z) {
        const g = dc.g;
        const z = dc.z;
        const key = title.split(' ')[0];
        if (active && !ps2Lit.has(key)) ps2Lit.set(key, dc.time);
        if (!active) ps2Lit.delete(key);
        const since = dc.time - (ps2Lit.get(key) ?? -9);
        const on = active && (since > 0.72 || Math.floor(since * 11) % 2 === 0);
        const ph = ps2Phase(dc.time);
        const flare = on && ps2Kind === 'node' ? (ph < 0.18 ? 1 - ph / 0.18 : 0) : 0;
        const y = r.y + r.h / 2;
        const s = Math.max(2, 3 * z);
        const px = r.x + r.w - 12 * z;
        g.fillStyle = on ? (flare > 0.3 ? '#b8ffc0' : '#2ee048') : active ? '#0f3a17' : '#5a1a1c';
        g.fillRect(px - s, y - s, s * 2, s * 2);
        if (on) {
          const d = s * (6 + 6 * flare);
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 0.55 + 0.45 * flare;
          g.drawImage(ps2Sprite('#1ed03a'), px - d / 2, y - d / 2, d, d);
          g.restore();
        }
      }
    },
    // a light running along a hairline, trailing like the boot lights; when
    // it reaches the right end the power light flares (titleBar)
    progress(dc, r, fill, anim) {
      const g = dc.g;
      const y = Math.round(r.y + r.h / 2) + 0.5;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(r.x, y - 0.5, r.w, 1);
      const f = anim ? ps2Phase(dc.time) : fill;
      const x = r.x + r.w * f;
      if (x <= r.x + 1) return;
      const tail = Math.max(r.x, x - r.w * 0.5);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      const glow = g.createLinearGradient(tail, 0, x, 0);
      glow.addColorStop(0, 'rgba(47,107,255,0)');
      glow.addColorStop(1, anim ? 'rgba(47,107,255,0.35)' : 'rgba(47,107,255,0.15)');
      g.strokeStyle = glow;
      g.lineWidth = Math.max(3, 5 * dc.z);
      g.beginPath(); g.moveTo(tail, y); g.lineTo(x, y); g.stroke();
      const core = g.createLinearGradient(tail, 0, x, 0);
      core.addColorStop(0, 'rgba(212,221,255,0)');
      core.addColorStop(1, anim ? 'rgba(212,221,255,1)' : 'rgba(212,221,255,0.45)');
      g.strokeStyle = core;
      g.lineWidth = Math.max(1, 1.2 * dc.z);
      g.beginPath(); g.moveTo(tail, y); g.lineTo(x, y); g.stroke();
      if (anim) {
        const d = Math.max(10, 16 * dc.z);
        g.drawImage(ps2Sprite('#4f78ff'), x - d / 2, y - d / 2, d, d);
      }
      g.restore();
    },
  },
};

// Where a belt passes through a wall: a bulkhead port, the vented plate of a
// connector panel. Thin slits either side of a socket whose two metal bars
// line the opening the cord goes through; a blue light on the plate while
// data is running (dark otherwise). Drawn after the belt, so the cord shows
// in the opening.
function ps2Door(dc: Dc, [x, y]: [number, number], vertical: boolean, live: boolean): void {
  const g = dc.g;
  const wd = Math.max(2.6, 4.4 * dc.z); // the cord's thickness, as the belt draws it
  const len = wd * 7.4; // along the wall
  const th = wd * 2.4; // across it
  g.save();
  g.translate(x, y);
  g.rotate(vertical ? Math.PI / 2 : 0);
  // the plate in two halves, with the opening between them left open (the
  // cord shows through it), and a lit top edge
  const gap = wd; // half the opening: the cord's radius and a margin
  for (const [a, b] of [[-len / 2, -gap], [gap, len / 2]]) {
    g.fillStyle = CABLE.edge;
    g.fillRect(a - 0.8, -th / 2 - 0.8, b - a + 1.6, th + 1.6);
    g.fillStyle = '#1b1b1f';
    g.fillRect(a, -th / 2, b - a, th);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.fillRect(a, -th / 2, b - a, Math.max(1, wd * 0.16));
  }
  // the slit grille: two slits each side of the socket, each with a lit lower lip
  const sw = Math.max(1, wd * 0.3);
  const sh = th * 0.62;
  for (const k of [-2.7, -1.9, 1.9, 2.7]) {
    const sx = k * wd * 0.95 - sw / 2;
    g.fillStyle = '#050506';
    g.fillRect(sx, -sh / 2, sw, sh);
    g.fillStyle = 'rgba(255,255,255,0.09)';
    g.fillRect(sx + sw, -sh / 2 + 1, Math.max(0.6, sw * 0.35), sh);
  }
  // the socket: two metal bars along the opening, capped at the plate's faces
  const metal = live ? '#8ea6ff' : '#7c7c86';
  const bar = Math.max(1, wd * 0.34);
  for (const sgn of [-1, 1]) {
    g.fillStyle = metal;
    g.fillRect(sgn * gap - (sgn > 0 ? 0 : bar), -th / 2, bar, th);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(sgn * gap - (sgn > 0 ? 0 : bar), -th / 2, bar, Math.max(1, wd * 0.16));
  }
  // its light
  const lx = len / 2 - wd * 0.55;
  const r = Math.max(1, wd * 0.28);
  if (live) {
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(79,120,255,0.35)';
    g.beginPath();
    g.arc(lx, 0, r * 2.6, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
  g.fillStyle = live ? '#d4ddff' : '#0a0a0c';
  g.beginPath();
  g.arc(lx, 0, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

export const ps2 = { ...makeSkin(ps2Theme), door: ps2Door };
