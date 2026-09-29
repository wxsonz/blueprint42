import { backdrop, countBadge, makeSkin, type Palette, type Theme } from '../kit';
import type { Dc } from '../types';
import { dockOf } from '../dock';
import { hash, Walk } from '../util';
import { MONO, ps2Still, SST, text } from './common';

// PS4, from its system screens (Friends, Communities, Remote Play): a deep
// royal blue, lighter at the top left and sinking to navy at the bottom
// right, crossed by a few broad soft streaks of light; the content on
// lighter see-through blue cards with thin pale edges; fields dark navy
// with a white edge; focus a crisp white border; SST at light weights.
const ps4P: Palette = {
  bg: '#0538bc', card: 'rgba(80,140,255,0.24)', panel: 'rgba(80,140,255,0.18)', line: 'rgba(150,190,255,0.5)',
  fg: '#ffffff', dim: '#c6d6ff', faint: '#8aa6e8', accent: '#ffffff', ptr: '#ffd27a', ret: '#8ef0b8', wait: '#ffd166', err: '#ff8080',
  param: '#cfe0ff', cell: 'rgba(255,255,255,0.12)', track: 'rgba(0,12,70,0.35)',
};
// The background, after the PS4's welcome screen: one long twisted
// triangular prism at a time, following a slow arc across the view, flared
// at its head and tail but faded to nothing there, so only its pinched body
// shows. Its faces are glass: one in the sky's top colour, one in the sky's
// middle (so near the middle it all but melts in), the third fainter, each
// one see-through shape the whole length; one edge carries a thick line of
// the top colour. All faded toward the ends by one gradient along the
// chord: no banding, nothing flickering on and off as it spins, and cheap.
// Each pass takes one of the placements seen on the console (PS4_PLACES),
// sliding a little along its arc; its twist is a steady turn plus gentle
// waves travelling along it, the spin speeding and slowing, the turn rate
// capped so it never bunches into clumps. It sweeps across in about
// 16 s, spinning as it goes, fading in and out. Stateless in time.
// Where the PS4's band lies, as seen in its welcome screen (frames of the
// author's video): enter, middle and leave points, as fractions of the view.
const PS4_PLACES: number[][] = [
  [0.36, 1.02, 0.5, 0.45, 0.78, -0.02], // a slash rising from the bottom middle to the top right
  [0.45, 1.02, 0.62, 0.3, 1.02, 0.02], // the same, bending over into the top right corner
  [0.35, 0.35, 0.7, 0.03, 1.05, 0.1], // a hump over the top right
  [0.15, 1.02, 0.45, 0.15, 1.02, 0.2], // a rainbow over the top from the bottom left
  [0.05, 1.02, 0.5, 0.55, 1.02, 0.42], // a low arch rising across to the right
  [0.3, 1.02, 0.7, 0.65, 1.02, 0.72], // a low arch along the bottom right
  [-0.02, 1.05, 0.25, 0.85, 0.55, 0.6], // a short sweep up out of the bottom left corner
  [1.02, 0.1, 0.9, 0.6, 0.45, 1.02], // down the right side into the bottom
  [0.35, 1.02, 0.7, 0.95, 1.02, 0.75], // skimming the bottom right
  [0.12, -0.02, 0.04, 0.35, -0.02, 0.75], // down the left edge from the top
];
function ps4Prism(dc: Dc): void {
  const g = dc.g;
  const W = dc.vw;
  const H = dc.vh;
  const t = ps2Still || !dc.time ? 40 : dc.time;
  const P = 16;
  const n = Math.floor(t / P);
  const p = t / P - n;
  const hh = (k: number) => hash(n * 97 + k * 13 + 5);
  // it travels in and out past the edges; the fade only softens the very
  // start and end of a pass
  const ramp = (x: number) => Math.min(1, Math.max(0, x)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, x)));
  const fade = ramp(p / 0.15) * ramp((1 - p) / 0.15);
  // where it lies: one of the placements seen on the console (each three
  // points along the band: where it enters, its middle, where it leaves),
  // never the same twice running; the arc is the circle through them,
  // reaching a little past the ends so the faded tips sit off the view, and
  // it slides a little along that circle over the pass
  const prev = Math.floor(hash((n - 1) * 97 + 5) * PS4_PLACES.length);
  let pick = Math.floor(hh(0) * PS4_PLACES.length);
  if (pick === prev) pick = (pick + 1 + Math.floor(hh(24) * (PS4_PLACES.length - 1))) % PS4_PLACES.length;
  const [ax, ay, bx, by, ex, ey] = PS4_PLACES[pick].map((v, i) => v * (i % 2 ? H : W));
  let det = 2 * (ax * (by - ey) + bx * (ey - ay) + ex * (ay - by));
  if (Math.abs(det) < 1e-6) det = 1e-6;
  const sq = (x: number, y: number) => x * x + y * y;
  const ox = (sq(ax, ay) * (by - ey) + sq(bx, by) * (ey - ay) + sq(ex, ey) * (ay - by)) / det;
  const oy = (sq(ax, ay) * (ex - bx) + sq(bx, by) * (ax - ex) + sq(ex, ey) * (bx - ax)) / det;
  const R = Math.hypot(ax - ox, ay - oy);
  const a0 = Math.atan2(ay - oy, ax - ox);
  const am = Math.atan2(by - oy, bx - ox);
  const a1 = Math.atan2(ey - oy, ex - ox);
  const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
  let sweep = wrap(a1 - a0);
  const tm = wrap(am - a0);
  if (Math.sign(tm) !== Math.sign(sweep) || Math.abs(tm) > Math.abs(sweep)) sweep -= Math.sign(sweep) * Math.PI * 2;
  const EXT = 0.2;
  const slide = (p - 0.5) * 0.22 * sweep;
  const thAt = (s: number) => a0 + sweep * (-EXT + (1 + 2 * EXT) * s) + slide;
  // flared at head and tail (each by its own amount), pinched in the body,
  // its thickness easing a little along the length as it goes
  const rmin = H * (0.018 + 0.012 * hh(6));
  const rHead = H * (0.05 + 0.05 * hh(9));
  const rTail = H * (0.05 + 0.05 * hh(10));
  const bulge = 0.08 + 0.12 * hh(23);
  // the twist: a steady turn along the length plus a gentle wave of extra
  // turn running along it, the spin speeding and slowing. Capped: the turn
  // rate along the band never passes MAXTURN radians per length, so turns
  // never bunch into clumps and it reads as a crescent most of the time
  const MAXTURN = 1.6 * Math.PI;
  const sgn = hh(7) < 0.5 ? -1 : 1;
  const spin = sgn * (t * 0.35 + 0.8 * Math.sin(t * 0.21 + hh(11) * 6.28));
  const twist = (0.4 + 0.6 * hh(8)) * Math.PI * (hh(12) < 0.3 ? -1 : 1);
  const w1 = { a: 0.3 + 0.4 * hh(13), f: 0.3 + 0.4 * hh(14), v: (0.25 + 0.4 * hh(15)) * (hh(16) < 0.5 ? -1 : 1), ph: hh(17) * 6.28 };
  const w2 = { a: 0.1 + 0.2 * hh(18), f: 0.8 + 0.4 * hh(19), v: (0.4 + 0.5 * hh(20)) * (hh(21) < 0.5 ? -1 : 1), ph: hh(22) * 6.28 };
  const waveRate = w1.a * Math.PI * 2 * w1.f + w2.a * Math.PI * 2 * w2.f;
  const room = Math.max(0, MAXTURN - Math.abs(twist));
  const k = waveRate > room ? room / waveRate : 1;
  const N = 72;
  const ring: { x: number; y: number }[][] = [];
  const ang: number[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const th = thAt(s);
    const cx = ox + Math.cos(th) * R, cy = oy + Math.sin(th) * R;
    const nx = -Math.cos(th), ny = -Math.sin(th);
    const flare = (1 - s) ** 2.2 * rHead + s ** 2.2 * rTail;
    const r = (rmin + flare) * (1 + bulge * Math.sin(Math.PI * 2 * 1.3 * s + t * 0.37 + n));
    const tw = spin + twist * s + k * (w1.a * Math.sin(Math.PI * 2 * w1.f * s + w1.v * t + w1.ph) + w2.a * Math.sin(Math.PI * 2 * w2.f * s + w2.v * t + w2.ph));
    ang.push(tw);
    const tri: { x: number; y: number }[] = [];
    for (let j = 0; j < 3; j++) {
      const q = tw + (j * 2 * Math.PI) / 3;
      tri.push({ x: cx + nx * r * Math.cos(q), y: cy + ny * r * Math.cos(q) });
    }
    ring.push(tri);
  }
  // the colours: the top of the sky and its middle, faded to nothing toward
  // the head and tail by angle around the arc's circle (a conic gradient
  // follows the curve, where one along the chord cut strongly bent ends)
  const th0 = thAt(0), th1 = thAt(1);
  const lo = Math.min(th0, th1);
  const L = Math.abs(th1 - th0) / (Math.PI * 2);
  const along = (rgb: string, a: number) => {
    const gr = g.createConicGradient(lo, ox, oy);
    gr.addColorStop(0, `rgba(${rgb},0)`);
    gr.addColorStop(0.22 * L, `rgba(${rgb},${a * fade})`);
    gr.addColorStop(0.78 * L, `rgba(${rgb},${a * fade})`);
    gr.addColorStop(L, `rgba(${rgb},0)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    return gr;
  };
  const TOP = '10,95,174';
  const MID = '6,62,192';
  g.save();
  // the faces are glass: each drawn see-through along the whole length (one
  // fill, so a face that turns edge-on and flips never doubles up), the
  // third fainter; where faces overlap they layer, like strands
  for (const [k, rgb, a] of [[2, TOP, 0.18], [1, MID, 0.5], [0, TOP, 0.45]] as const) {
    g.fillStyle = along(rgb, a);
    g.beginPath();
    g.moveTo(ring[0][k].x, ring[0][k].y);
    for (let i = 1; i <= N; i++) g.lineTo(ring[i][k].x, ring[i][k].y);
    for (let i = N; i >= 0; i--) g.lineTo(ring[i][(k + 1) % 3].x, ring[i][(k + 1) % 3].y);
    g.closePath();
    g.fill();
  }
  // one edge a thick line of the top colour, the whole length (faded at the
  // ends with the rest), so nothing switches on and off as it spins
  g.strokeStyle = along(TOP, 0.8);
  g.lineWidth = Math.max(2, H / 260);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(ring[0][0].x, ring[0][0].y);
  for (let i = 1; i <= N; i++) g.lineTo(ring[i][0].x, ring[i][0].y);
  g.stroke();
  g.restore();
}
// A belt as the PS4's progress bar: a flat track; live, a white fill runs
// along it the data's way. The gimmick: as a fill moves, controller symbols
// (○ □ △ ✕, picked at random) burst out behind it, drifting off the line,
// turning and fading. Stateless: a symbol is spawned at the fill's head on a
// fixed tick, so its place and age follow from the time alone.
function ps4Span(g: CanvasRenderingContext2D, w: Walk, a: number, b: number): void {
  a = Math.max(0, a);
  b = Math.min(w.length, b);
  if (b - a < 0.5) return;
  const p = w.at(a);
  g.beginPath();
  g.moveTo(p.x, p.y);
  for (const s of w.segs) if (s.at > a && s.at < b) g.lineTo(s.x, s.y);
  const q = w.at(b);
  g.lineTo(q.x, q.y);
  g.stroke();
}
function ps4Symbol(g: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number, rot: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.beginPath();
  if (kind === 0) g.arc(0, 0, r, 0, Math.PI * 2);
  else if (kind === 1) g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
  else if (kind === 2) {
    g.moveTo(0, -r);
    g.lineTo(r * 0.95, r * 0.7);
    g.lineTo(-r * 0.95, r * 0.7);
    g.closePath();
  } else {
    g.moveTo(-r, -r);
    g.lineTo(r, r);
    g.moveTo(r, -r);
    g.lineTo(-r, r);
  }
  g.stroke();
  g.restore();
}
function ps4Belt(dc: Dc, pts: [number, number][], o: { live: boolean; dir: number; selected: boolean; hovered: boolean }): void {
  const g = dc.g;
  const z = dc.z;
  const w = new Walk(pts);
  const L = w.length;
  if (L < 1) return;
  g.save();
  g.lineCap = 'butt';
  g.lineJoin = 'miter';
  const th = Math.max(3, 4 * z);
  g.lineWidth = th;
  g.strokeStyle = o.live ? 'rgba(255,255,255,0.28)' : o.selected || o.hovered ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.18)';
  ps4Span(g, w, 0, L);
  if (o.live) {
    const t = ps2Still ? 20 : dc.time || 0;
    const speed = 90 * z;
    const gap = Math.max(160, 380 * z);
    const seg = Math.min(L * 0.4, Math.max(40, 110 * z));
    const along = (d: number) => (o.dir < 0 ? L - d : d);
    // the fills: white segments, their heads leading the data's way
    g.strokeStyle = '#ffffff';
    const D = t * speed;
    for (let head = D % gap; head < L + seg; head += gap) {
      const a = along(head - seg), b = along(head);
      ps4Span(g, w, Math.min(a, b), Math.max(a, b));
    }
    // the symbols, spawned at a head every tick, living `life` seconds
    const tick = 0.11;
    const life = 1.1;
    const seed = Math.round(L / z);
    g.lineWidth = Math.max(1, 1.3 * z);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const now = Math.floor(t / tick);
    for (let j = 0; j * tick < life; j++) {
      const i = now - j;
      const ts = i * tick;
      const age = t - ts;
      if (age < 0 || age > life) continue;
      const Ds = ts * speed;
      for (let m = Math.floor((Ds - L) / gap); m <= Math.floor(Ds / gap); m++) {
        const head = Ds - m * gap;
        if (head < 0 || head > L) continue;
        const h = (k: number) => hash(i * 7 + m * 131 + seed * 3 + k * 977);
        if (h(0) < 0.35) continue; // not every tick: a burst, not a stream
        const q = w.at(along(head));
        const side = h(1) < 0.5 ? -1 : 1;
        const out = age * (18 + 34 * h(2)) * z + th;
        const back = age * (8 + 16 * h(3)) * z * (o.dir < 0 ? -1 : 1);
        const x = q.x - q.dx * back - q.dy * out * side;
        const y = q.y - q.dy * back + q.dx * out * side;
        const f = 1 - age / life;
        g.strokeStyle = `rgba(210,228,255,${0.85 * f ** 1.5})`;
        ps4Symbol(g, Math.floor(h(4) * 4), x, y, (3 + 2.5 * h(5)) * z * (0.8 + 0.4 * (1 - f)), h(6) * 6.28 + age * (h(7) - 0.5) * 4);
      }
    }
  }
  g.restore();
}
export const ps4Theme: Theme = {
  id: 'ps4', name: 'PlayStation 4', blurb: 'the system screens: royal blue, lighter cards with pale edges, a white border on focus',
  ptrTags: true, plateShapes: true, capacity: true, // the Minimal and Barebone pictures
  p: ps4P, ui: SST, mono: MONO('"JetBrains Mono"'), radius: 0, spotlight: 'rgba(0,10,60,0.5)',
  pulseColor: 'rgba(255,255,255,0.9)',
  belt(dc, pts, o, t) {
    ps4Belt(dc, pts, o);
    countBadge(dc, pts, o, t);
  },
  card(dc, r, o) {
    const g = dc.g;
    if (o.kind === 'plate') {
      // values in flight: the dark navy input field with a white edge
      g.fillStyle = 'rgba(3,5,42,0.92)';
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = o.glow ? '#ffffff' : 'rgba(220,230,255,0.8)';
      g.lineWidth = 1;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      return;
    }
    if (o.fill !== 'transparent') {
      g.fillStyle = o.kind === 'wall' ? 'rgba(255,255,255,0.04)' : o.kind === 'frame' ? ps4P.panel : ps4P.card;
      g.fillRect(r.x, r.y, r.w, r.h);
    }
    // focus is a crisp white border; otherwise a thin pale edge
    g.strokeStyle = o.glow ? '#ffffff' : 'rgba(150,190,255,0.45)';
    g.lineWidth = o.glow ? Math.max(2, 3 * dc.z) : 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  },
  // storage and stations: a lighter card, its title over a pale rule
  panel(dc, r, head, title, live) {
    const g = dc.g;
    g.fillStyle = ps4P.card;
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = live ? 'rgba(200,220,255,0.8)' : 'rgba(150,190,255,0.45)';
    g.lineWidth = 1;
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    g.fillStyle = 'rgba(150,190,255,0.45)';
    g.fillRect(r.x, head.y + head.h - 1, r.w, 1);
    text(dc, head, title, SST, 12, live ? '#ffffff' : '#c6d6ff', { w: 400, x: head.x + 8 * dc.z });
  },
  background(dc) {
    backdrop(dc, 'ps4-welcome', (g, W, H) => {
      // the welcome screen: azure at the top, bright royal blue through the
      // middle, sinking to near-black navy at the bottom
      const sky = g.createLinearGradient(0, 0, W * 0.12, H);
      sky.addColorStop(0, '#0a5fae');
      sky.addColorStop(0.35, '#0746c4');
      sky.addColorStop(0.55, '#0538bc');
      sky.addColorStop(0.82, '#031a78');
      sky.addColorStop(1, '#010a2e');
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, Math.max(W, H) * 0.5);
      glow.addColorStop(0, 'rgba(20,80,235,0.28)');
      glow.addColorStop(1, 'rgba(20,80,235,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
    });
    // one twisted prism sweeping through, in shades of the sky only
    ps4Prism(dc);
  },
  window: {
    border: 0, corner: 0, titleH: 28, face: 'rgba(3,30,76,0.8)', workspace: 'rgba(255,255,255,0.05)',
    // as the PS3's: files and machines have no pane, only a faint outline,
    // so their storage, stations and function box sit on the background;
    // the function box alone is a panel
    frame(dc, r, active, _face, kind) {
      const g = dc.g;
      if (kind === 'node') {
        g.fillStyle = ps4P.card;
        g.fillRect(r.x, r.y, r.w, r.h);
        g.strokeStyle = active ? '#ffffff' : 'rgba(150,190,255,0.45)';
        g.lineWidth = active ? Math.max(2, 3 * dc.z) : 1;
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        return;
      }
      g.lineWidth = 1;
      g.strokeStyle = `rgba(255,255,255,${active ? 0.3 : 0.1})`;
      g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    },
    // the title over a thin white rule; on the active window the rule is
    // the console's light bar, glowing blue
    titleBar(dc, r, title, active) {
      const g = dc.g;
      text(dc, r, title, SST, 14, active ? '#ffffff' : '#cfe0f5', { w: active ? 400 : 300, x: r.x + 10 * dc.z });
      const y = r.y + r.h - 1;
      if (active) {
        g.fillStyle = 'rgba(95,177,255,0.35)';
        g.fillRect(r.x, y - 1.5 * dc.z, r.w, 4 * dc.z);
        g.fillStyle = '#8fd0ff';
        g.fillRect(r.x, y, r.w, Math.max(1, 1.5 * dc.z));
      } else {
        g.fillStyle = 'rgba(255,255,255,0.3)';
        g.fillRect(r.x, y, r.w, 1);
      }
    },
    progress(dc, r, fill, anim) {
      const g = dc.g;
      const h = Math.max(2, Math.min(r.h, 5 * dc.z));
      const y = r.y + (r.h - h) / 2;
      g.fillStyle = 'rgba(255,255,255,0.22)';
      g.fillRect(r.x, y, r.w, h);
      const x = anim ? r.x + r.w * (((dc.time * 0.5) % 1.3) - 0.3) : r.x;
      const w = anim ? r.w * 0.3 : r.w * fill;
      const a = Math.max(r.x, x);
      const e = Math.min(r.x + r.w, x + w);
      if (e > a) (g.fillStyle = '#ffffff'), g.fillRect(a, y, e - a, h);
    },
  },
};

export const ps4 = { ...makeSkin(ps4Theme), dock: dockOf(ps4Theme) };
ps4.fullBleed = true; // the sky and its ribbons behind the whole page, as the PS3's
