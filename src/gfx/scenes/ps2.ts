// PS2's boot screen on the GPU (src/skins/consoles/ps2.ts ps2Boot is the
// canvas original, and the look to match): black space, two layers of blue
// fog drifting against each other, six glass cubes tumbling, four coloured
// lights with a glowing head and a hairline trail. The same parallax: each
// layer follows the grid's camera by its own fraction and zooms by a small
// power of the grid's zoom; cubes wrap around, fog and lights ease to a stop.
//
// CPU: the numbers (fog rects, cube centres and rotations, light paths).
// GPU: the pixels (fog noise, the cubes as a ray against a rotated box, the
// light heads) and the trails as 1px lines.
import { ps2Still } from '../../skins/consoles/common';
import { hash } from '../../skins/util';
import type { GfxView, GpuScene } from '../layer';

const CUBES = Array.from({ length: 6 }, (_, i) => ({
  x: [-0.34, 0.36, -0.1, 0.18, -0.42, 0.44][i], y: [-0.28, -0.3, -0.05, 0.2, 0.3, 0.26][i],
  s: 0.06 + 0.06 * hash(i * 5 + 1), depth: 0.1 + 0.12 * hash(i * 23 + 6), rx: 0.05 + 0.08 * hash(i * 7 + 2), ry: 0.04 + 0.07 * hash(i * 11 + 3), p: Math.PI * 2 * hash(i * 13 + 4),
}));
const LIGHTS = [
  { col: [0xff, 0x4a, 0x5e], a: 0.23, b: 0.31, c: 0.17, p: [0.3, 1.9, 4.1, 0.7] },
  { col: [0x3d, 0xff, 0x72], a: 0.29, b: 0.19, c: 0.23, p: [2.4, 0.2, 1.3, 2.9] },
  { col: [0x9b, 0x7d, 0xff], a: 0.19, b: 0.27, c: 0.29, p: [4.6, 3.3, 0.4, 5.1] },
  { col: [0x4f, 0x78, 0xff], a: 0.26, b: 0.23, c: 0.2, p: [1.1, 5.2, 2.7, 3.8] },
];
const TRAIL = 90;

// the uniform block, in vec4s
const V_RES = 0; // w, h, t
const V_FOG = 1; // 2 rects: x, y, w, h (screen px)
const V_FOGA = 3; // the two alphas
const V_CUBE = 4; // 6: centre x, y, half size
const V_ROT = 10; // 6 × 3 rows of the view-to-cube rotation
const V_HEAD = 28; // 4: x, y, radius
const V_COL = 32; // 4: r, g, b
const VEC4S = 36;

// how far the grid has moved on screen, added up frame by frame (as the
// canvas version's trackPan)
const pan = { x: 0, y: 0, cx: NaN, cy: NaN, vw: 0, vh: 0 };
function trackPan(v: GfxView): void {
  const cx = v.camX + v.w / 2 / v.cs;
  const cy = v.camY + v.h / 2 / v.cs;
  if (pan.vw === v.w && pan.vh === v.h && Number.isFinite(pan.cx)) (pan.x += (cx - pan.cx) * v.cs), (pan.y += (cy - pan.cy) * v.cs);
  Object.assign(pan, { cx, cy, vw: v.w, vh: v.h });
}

function frame(u: Float32Array, v: GfxView): Float32Array {
  const t = ps2Still || !v.time ? 40 : v.time;
  const W = v.w;
  const H = v.h;
  trackPan(v);
  const soft = (x: number, lim: number) => lim * Math.tanh(x / lim);
  const zoomOf = (zf: number) => Math.min(1.8, Math.max(0.7, v.z ** zf));
  const set = (i: number, a: number, b = 0, c = 0, d = 0) => u.set([a, b, c, d], i * 4);
  set(V_RES, W, H, t);
  // a layer: screen = (q - centre) * sc + centre - off
  const layer = (k: number, zf: number, lim: number) => ({ sc: zoomOf(zf), ox: soft(pan.x * k, lim), oy: soft(pan.y * k, lim) });
  const toScreen = (L: ReturnType<typeof layer>, x: number, y: number): [number, number] => [(x - W / 2) * L.sc + W / 2 - L.ox, (y - H / 2) * L.sc + H / 2 - L.oy];

  // the fog
  const F = layer(0.03, 0.12, W * 0.1);
  for (let i = 0; i < 2; i++) {
    const dir = i ? -1 : 1;
    const ox = Math.sin(t * 0.045 + i * 2) * W * 0.04 * dir;
    const oy = Math.cos(t * 0.037 + i) * H * 0.03;
    const [x, y] = toScreen(F, -W * 0.08 + ox, -H * 0.08 + oy);
    set(V_FOG + i, x, y, W * 1.16 * F.sc, H * 1.16 * F.sc);
  }
  set(V_FOGA, 0.85, 0.55 + 0.1 * Math.sin(t * 0.3));

  // the cubes
  const sc = zoomOf(0.35);
  const wrap = (x: number, lo: number, span: number) => lo + ((((x - lo) % span) + span) % span);
  const unit = Math.min(W, H) * sc;
  CUBES.forEach((C, i) => {
    const ax = C.p + t * C.rx;
    const ay = C.p * 0.7 + t * C.ry;
    const cx = W / 2 + (wrap(W / 2 + C.x * W - pan.x * C.depth, -W * 0.2, W * 1.4) - W / 2) * sc;
    const cy = H / 2 + (wrap(H * 0.47 + C.y * H - pan.y * C.depth, -H * 0.25, H * 1.5) - H / 2) * sc;
    set(V_CUBE + i, cx, cy, C.s * unit * 0.75); // 0.75: the canvas's mean perspective
    // view = Ry(ay) · Rx(ax) · cube; the shader needs its transpose
    const c = Math.cos(ax), s = Math.sin(ax), cY = Math.cos(ay), sY = Math.sin(ay);
    set(V_ROT + i * 3, cY, 0, -sY);
    set(V_ROT + i * 3 + 1, sY * s, c, cY * s);
    set(V_ROT + i * 3 + 2, sY * c, -s, cY * c);
  });

  // the lights: heads as uniforms, trails as lines
  const Lp = layer(0.07, 0.25, W * 0.2);
  const at = (L: (typeof LIGHTS)[number], tt: number) => {
    const x3 = Math.sin(L.a * tt * 2.2 + L.p[0]) * (0.7 + 0.3 * Math.sin(0.11 * tt + L.p[3]));
    const y3 = Math.sin(L.b * tt * 2.2 + L.p[1]);
    const z3 = Math.cos(L.c * tt * 2.2 + L.p[2]);
    const k = 1.6 / (2.6 - z3);
    const [x, y] = toScreen(Lp, W / 2 + x3 * W * 0.46 * k, H * 0.47 + y3 * H * 0.36 * k);
    return { x, y, k };
  };
  const verts = new Float32Array(LIGHTS.length * TRAIL * 12);
  let n6 = 0;
  LIGHTS.forEach((L, i) => {
    const [r, g, b] = L.col.map((x) => x / 255);
    let prev = at(L, t - TRAIL * 0.018);
    for (let n = TRAIL - 1; n >= 0; n--) {
      const cur = at(L, t - n * 0.018);
      const a = (1 - n / TRAIL) ** 1.6 * 0.9;
      verts.set([prev.x, prev.y, r, g, b, a, cur.x, cur.y, r, g, b, a], n6);
      n6 += 12;
      prev = cur;
    }
    set(V_HEAD + i, prev.x, prev.y, 13 * prev.k * Lp.sc);
    set(V_COL + i, r, g, b);
  });
  return verts;
}

const WGSL = /* wgsl */ `
// an integer hash of a lattice point: exact, so a corner is the same value
// from every cell that shares it (a sin-based hash isn't, and cells jump)
fn h21(p: vec2f, s: f32) -> f32 {
  // WGSL wants every mix of * and ^ in parentheses (Chrome's compiler refuses it otherwise)
  var h = (bitcast<u32>(i32(p.x)) * 1597334677u) ^ (bitcast<u32>(i32(p.y)) * 3812015801u) ^ (u32(s) * 2654435769u);
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967295.0;
}
fn vnoise(p: vec2f, s: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i, s), h21(i + vec2f(1.0, 0.0), s), w.x), mix(h21(i + vec2f(0.0, 1.0), s), h21(i + vec2f(1.0, 1.0), s), w.x), w.y);
}
fn fogD(uv: vec2f, seed: f32) -> f32 {
  var n = 0.0;
  var amp = 0.55;
  var k = 1.0;
  for (var o = 0; o < 4; o++) {
    n += amp * vnoise(vec2f(uv.x * 5.0 * k, uv.y * 3.0 * k), seed + f32(o));
    amp *= 0.5;
    k *= 2.0;
  }
  let mask = max(0.0, 1.0 - length(vec2f((uv.x - 0.5) / 0.42, (uv.y - 0.47) / 0.42)));
  return max(0.0, n - 0.3) * 2.2 * pow(mask, 1.2);
}
fn over(d: vec4f, s: vec4f) -> vec4f { return s + d * (1.0 - s.a); }
// the fog alone: what the glass bends
fn fogAt(p: vec2f) -> vec3f {
  var c = vec4f(0.0, 0.0, 3.0 / 255.0, 1.0);
  for (var i = 0; i < 2; i++) {
    let r = U.v[${V_FOG} + i];
    let uv = (p - r.xy) / r.zw;
    if (all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0))) {
      let d = fogD(uv, select(9.0, 1.0, i == 0));
      let a = min(1.0, d * 0.8) * U.v[${V_FOGA}][i];
      let col = vec3f(20.0 + 26.0 * d, 22.0 + 26.0 * d, 110.0 + 70.0 * d) / 255.0;
      c = over(c, vec4f(col * a, a));
    }
  }
  return c.rgb;
}
// What the glass shows, reflected and seen through: a room of frosted
// blocks like the boot screen's towers, their ends facing in (a grid, each
// block its own shade, grain on it, dark gaps between). A room close by:
// where on screen (at, in blocks) as well as which way, so the blocks slide
// across a face and jump between faces.
fn envAt(r: vec3f, at: vec2f) -> vec3f {
  let uv = at + r.xy / (abs(r.z) + 0.55) * 1.6 + vec2f(select(0.0, 17.0, r.z < 0.0));
  let cell = floor(uv);
  let f = fract(uv);
  let shade = 0.42 + 0.45 * h21(cell, 5.0);
  // each block's end, and its sides darker toward the gap
  let side = smoothstep(0.78, 0.9, max(f.x, f.y));
  let gap = smoothstep(0.9, 0.97, max(f.x, f.y));
  let grain = 0.85 + 0.3 * vnoise(uv * 24.0, 7.0);
  let block = vec3f(0.74, 0.79, 0.95) * shade * grain * (1.0 - 0.45 * side);
  return mix(block, vec3f(0.02, 0.025, 0.06), gap);
}
// near an edge of the cube: the second-largest coordinate of the hit point near 1
fn edgeOf(h: vec3f, w: f32) -> f32 {
  let a = abs(h);
  let second = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));
  return 1.0 - smoothstep(0.0, w, 1.0 - second);
}
fn scene(p: vec2f) -> vec4f {
  var c = vec3f(fogAt(p));
  let L = normalize(vec3f(-0.45, -0.6, 0.66));
  let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  for (var i = 0; i < 6; i++) {
    let cc = U.v[${V_CUBE} + i];
    let q = (p - cc.xy) / cc.z;
    if (abs(q.x) > 1.8 || abs(q.y) > 1.8) { continue; }
    let r0 = U.v[${V_ROT} + i * 3].xyz;
    let r1 = U.v[${V_ROT} + i * 3 + 1].xyz;
    let r2 = U.v[${V_ROT} + i * 3 + 2].xyz;
    let o = vec3f(q, 5.0);
    let ol = vec3f(dot(r0, o), dot(r1, o), dot(r2, o));
    var dl = -vec3f(r0.z, r1.z, r2.z);
    dl = select(dl, vec3f(1e-5), abs(dl) < vec3f(1e-5));
    let t0 = (vec3f(-1.0) - ol) / dl;
    let t1 = (vec3f(1.0) - ol) / dl;
    let tn3 = min(t0, t1);
    let tf3 = max(t0, t1);
    let tn = max(max(tn3.x, tn3.y), tn3.z);
    let tf = min(min(tf3.x, tf3.y), tf3.z);
    if (tn > tf) { continue; }
    let toView = mat3x3f(r0, r1, r2);
    let nf = toView * (select(select(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), tn == tn3.y), vec3f(1.0, 0.0, 0.0), tn == tn3.x) * -sign(dl));
    let thick = tf - tn; // how much glass the ray crosses, in half-sides
    let px = 1.0 / cc.z; // one screen pixel, in half-sides
    let nb = toView * (select(select(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), tf == tf3.y), vec3f(1.0, 0.0, 0.0), tf == tf3.x) * sign(dl));
    // clear glass: what's behind, bent going in and coming out (glass 1.5)
    let v = vec3f(0.0, 0.0, -1.0);
    let inside = refract(v, nf, 1.0 / 1.5);
    var outd = refract(inside, -nb, 1.5);
    if (dot(outd, outd) < 1e-4) { outd = reflect(inside, -nb); } // total internal reflection
    let through = fogAt(p + (outd.xy - v.xy) * cc.z * 0.6) * 0.8 + envAt(outd, p / 70.0) * 0.55;
    // and on it, the room reflected: faint face-on, strong edge-on (Fresnel)
    let cosv = clamp(nf.z, 0.0, 1.0);
    let F = 0.08 + 0.72 * pow(1.0 - cosv, 3.0);
    let refl = envAt(reflect(v, nf), p / 70.0);
    let spec = pow(max(dot(nf, H), 0.0), 80.0) * 0.7;
    // glass edges catch the light: thin and bright, the far ones fainter
    let ew = max(px * 1.6, 0.02);
    let edges = edgeOf(ol + dl * tn, ew) * 0.55 + edgeOf(ol + dl * tf, ew) * 0.2;
    let col = mix(through, refl, F) + vec3f(1.0, 0.98, 0.95) * spec + vec3f(0.8, 0.86, 1.0) * edges;
    c = mix(c, col, clamp(thick / (px * 1.5), 0.0, 1.0));
  }
  for (var i = 0; i < 4; i++) {
    let h = U.v[${V_HEAD} + i];
    let r = length(p - h.xy) / max(h.z, 0.5);
    if (r < 1.0) {
      let col = U.v[${V_COL} + i].rgb;
      var s: vec4f;
      if (r < 0.12) { s = vec4f(mix(vec3f(1.0), col, r / 0.12), 1.0); }
      else if (r < 0.35) { s = vec4f(col, mix(1.0, 0.4, (r - 0.12) / 0.23)); }
      else { s = vec4f(col, mix(0.4, 0.0, (r - 0.35) / 0.65)); }
      c = c + s.rgb * s.a;
    }
  }
  return vec4f(c, 1.0);
}
`;

const GLSL = /* glsl */ `
float h21(vec2 p, float s) {
  uint h = (uint(int(p.x)) * 1597334677u) ^ (uint(int(p.y)) * 3812015801u) ^ (uint(s) * 2654435769u);
  h = (h ^ (h >> 16u)) * 2246822519u;
  h = (h ^ (h >> 13u)) * 3266489917u;
  h = h ^ (h >> 16u);
  return float(h) / 4294967295.0;
}
float vnoise(vec2 p, float s) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i, s), h21(i + vec2(1.0, 0.0), s), w.x), mix(h21(i + vec2(0.0, 1.0), s), h21(i + vec2(1.0, 1.0), s), w.x), w.y);
}
float fogD(vec2 uv, float seed) {
  float n = 0.0, amp = 0.55, k = 1.0;
  for (int o = 0; o < 4; o++) {
    n += amp * vnoise(vec2(uv.x * 5.0 * k, uv.y * 3.0 * k), seed + float(o));
    amp *= 0.5;
    k *= 2.0;
  }
  float mask = max(0.0, 1.0 - length(vec2((uv.x - 0.5) / 0.42, (uv.y - 0.47) / 0.42)));
  return max(0.0, n - 0.3) * 2.2 * pow(mask, 1.2);
}
vec4 over(vec4 d, vec4 s) { return s + d * (1.0 - s.a); }
vec3 axisOf(float t, vec3 t3) { return t == t3.x ? vec3(1.0, 0.0, 0.0) : t == t3.y ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0); }
vec3 fogAt(vec2 p) {
  vec4 c = vec4(0.0, 0.0, 3.0 / 255.0, 1.0);
  for (int i = 0; i < 2; i++) {
    vec4 r = v[${V_FOG} + i];
    vec2 uv = (p - r.xy) / r.zw;
    if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) {
      float d = fogD(uv, i == 0 ? 1.0 : 9.0);
      float a = min(1.0, d * 0.8) * v[${V_FOGA}][i];
      vec3 col = vec3(20.0 + 26.0 * d, 22.0 + 26.0 * d, 110.0 + 70.0 * d) / 255.0;
      c = over(c, vec4(col * a, a));
    }
  }
  return c.rgb;
}
vec3 envAt(vec3 r, vec2 at) {
  vec2 uv = at + r.xy / (abs(r.z) + 0.55) * 1.6 + vec2(r.z < 0.0 ? 17.0 : 0.0);
  vec2 cell = floor(uv);
  vec2 f = fract(uv);
  float shade = 0.42 + 0.45 * h21(cell, 5.0);
  float side = smoothstep(0.78, 0.9, max(f.x, f.y));
  float gap = smoothstep(0.9, 0.97, max(f.x, f.y));
  float grain = 0.85 + 0.3 * vnoise(uv * 24.0, 7.0);
  vec3 block = vec3(0.74, 0.79, 0.95) * shade * grain * (1.0 - 0.45 * side);
  return mix(block, vec3(0.02, 0.025, 0.06), gap);
}
float edgeOf(vec3 h, float w) {
  vec3 a = abs(h);
  float second = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));
  return 1.0 - smoothstep(0.0, w, 1.0 - second);
}
vec4 scene(vec2 p) {
  vec3 c = fogAt(p);
  vec3 L = normalize(vec3(-0.45, -0.6, 0.66));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  for (int i = 0; i < 6; i++) {
    vec4 cc = v[${V_CUBE} + i];
    vec2 q = (p - cc.xy) / cc.z;
    if (abs(q.x) > 1.8 || abs(q.y) > 1.8) continue;
    vec3 r0 = v[${V_ROT} + i * 3].xyz;
    vec3 r1 = v[${V_ROT} + i * 3 + 1].xyz;
    vec3 r2 = v[${V_ROT} + i * 3 + 2].xyz;
    vec3 o = vec3(q, 5.0);
    vec3 ol = vec3(dot(r0, o), dot(r1, o), dot(r2, o));
    vec3 dl = -vec3(r0.z, r1.z, r2.z);
    dl = mix(dl, vec3(1e-5), lessThan(abs(dl), vec3(1e-5)));
    vec3 t0 = (vec3(-1.0) - ol) / dl;
    vec3 t1 = (vec3(1.0) - ol) / dl;
    vec3 tn3 = min(t0, t1);
    vec3 tf3 = max(t0, t1);
    float tn = max(max(tn3.x, tn3.y), tn3.z);
    float tf = min(min(tf3.x, tf3.y), tf3.z);
    if (tn > tf) continue;
    mat3 toView = mat3(r0, r1, r2);
    vec3 nf = toView * (axisOf(tn, tn3) * -sign(dl));
    float thick = tf - tn;
    float px = 1.0 / cc.z;
    vec3 nb = toView * (axisOf(tf, tf3) * sign(dl));
    vec3 v = vec3(0.0, 0.0, -1.0);
    vec3 inside = refract(v, nf, 1.0 / 1.5);
    vec3 outd = refract(inside, -nb, 1.5);
    if (dot(outd, outd) < 1e-4) outd = reflect(inside, -nb);
    vec3 through = fogAt(p + (outd.xy - v.xy) * cc.z * 0.6) * 0.8 + envAt(outd, p / 70.0) * 0.55;
    float cosv = clamp(nf.z, 0.0, 1.0);
    float F = 0.08 + 0.72 * pow(1.0 - cosv, 3.0);
    vec3 refl = envAt(reflect(v, nf), p / 70.0);
    float spec = pow(max(dot(nf, H), 0.0), 80.0) * 0.7;
    float ew = max(px * 1.6, 0.02);
    float edges = edgeOf(ol + dl * tn, ew) * 0.55 + edgeOf(ol + dl * tf, ew) * 0.2;
    vec3 col = mix(through, refl, F) + vec3(1.0, 0.98, 0.95) * spec + vec3(0.8, 0.86, 1.0) * edges;
    c = mix(c, col, clamp(thick / (px * 1.5), 0.0, 1.0));
  }
  for (int i = 0; i < 4; i++) {
    vec4 h = v[${V_HEAD} + i];
    float r = length(p - h.xy) / max(h.z, 0.5);
    if (r < 1.0) {
      vec3 col = v[${V_COL} + i].rgb;
      vec4 s = r < 0.12 ? vec4(mix(vec3(1.0), col, r / 0.12), 1.0)
        : r < 0.35 ? vec4(col, mix(1.0, 0.4, (r - 0.12) / 0.23))
        : vec4(col, mix(0.4, 0.0, (r - 0.35) / 0.65));
      c += s.rgb * s.a;
    }
  }
  return vec4(c, 1.0);
}
`;

export const ps2Scene: GpuScene = { id: 'ps2', vec4s: VEC4S, wgsl: WGSL, glsl: GLSL, frame };
