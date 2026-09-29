// PS2's boot screen on the GPU (src/skins/consoles/ps2.ts ps2Boot is the
// canvas original, and the look to match): black space, two layers of blue
// fog drifting against each other, six glass cubes tumbling, four coloured
// lights with a glowing head and a hairline trail. The same parallax: each
// layer follows the grid's camera by its own fraction and zooms by a small
// power of the grid's zoom; cubes wrap around, fog and lights ease to a stop.
//
// CPU: the numbers (fog rects, cube centres, depths and rotations, light
// paths). GPU, in 3D (x, y as on screen, z toward the viewer, px): the
// backdrop (fog, light heads, trails as 1px lines) is a wall behind
// everything; each glass cube is traced, the ray bent going in and out and
// reflected, and followed on to the other cubes or the wall.
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
const V_RES = 0; // w, h, t, the backdrop plane's z
const V_FOG = 1; // 2 rects: x, y, w, h (screen px)
const V_FOGA = 3; // the two alphas
const V_CUBE = 4; // 6: centre x, y, half size, z
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
  set(V_RES, W, H, t, -0.55 * Math.min(W, H) * zoomOf(0.35)); // the backdrop: a wall just behind every cube
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
    // a real depth (the one its parallax already uses): nearer cubes pan more
    set(V_CUBE + i, cx, cy, C.s * unit * 0.75, ((C.depth - 0.16) / 0.06) * 0.35 * unit); // 0.75: the canvas's mean perspective
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

// ---- pass 1: the wall behind everything: space, the fog, the light heads
// (the trails are drawn into it too, as lines) ----
fn backdrop(p: vec2f) -> vec4f {
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
  for (var i = 0; i < 4; i++) {
    let h = U.v[${V_HEAD} + i];
    let r = length(p - h.xy) / max(h.z, 0.5);
    if (r < 1.0) {
      let col = U.v[${V_COL} + i].rgb;
      var s: vec4f;
      if (r < 0.12) { s = vec4f(mix(vec3f(1.0), col, r / 0.12), 1.0); }
      else if (r < 0.35) { s = vec4f(col, mix(1.0, 0.4, (r - 0.12) / 0.23)); }
      else { s = vec4f(col, mix(0.4, 0.0, (r - 0.35) / 0.65)); }
      c = vec4f(c.rgb + s.rgb * s.a, 1.0);
    }
  }
  return c;
}

// ---- pass 2: the cubes, traced in 3D ----
// A ray against cube i: where it enters and leaves (tn, tf, in px along the
// ray), the faces' normals there, and the hit points in the cube's own
// coordinates (for its edges). tn > tf: missed.
struct Hit { tn: f32, tf: f32, nIn: vec3f, nOut: vec3f, hIn: vec3f, hOut: vec3f };
fn cubeRay(i: i32, o: vec3f, d: vec3f) -> Hit {
  var h: Hit;
  let cc = U.v[${V_CUBE} + i];
  let r0 = U.v[${V_ROT} + i * 3].xyz;
  let r1 = U.v[${V_ROT} + i * 3 + 1].xyz;
  let r2 = U.v[${V_ROT} + i * 3 + 2].xyz;
  let rel = o - vec3f(cc.xy, cc.w);
  let ol = vec3f(dot(r0, rel), dot(r1, rel), dot(r2, rel)) / cc.z;
  var dl = vec3f(dot(r0, d), dot(r1, d), dot(r2, d)) / cc.z;
  dl = select(dl, vec3f(1e-6), abs(dl) < vec3f(1e-6));
  let t0 = (vec3f(-1.0) - ol) / dl;
  let t1 = (vec3f(1.0) - ol) / dl;
  let tn3 = min(t0, t1);
  let tf3 = max(t0, t1);
  h.tn = max(max(tn3.x, tn3.y), tn3.z);
  h.tf = min(min(tf3.x, tf3.y), tf3.z);
  let toWorld = mat3x3f(r0, r1, r2);
  h.nIn = toWorld * (select(select(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), h.tn == tn3.y), vec3f(1.0, 0.0, 0.0), h.tn == tn3.x) * -sign(dl));
  h.nOut = toWorld * (select(select(vec3f(0.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0), h.tf == tf3.y), vec3f(1.0, 0.0, 0.0), h.tf == tf3.x) * sign(dl));
  h.hIn = ol + dl * h.tn;
  h.hOut = ol + dl * h.tf;
  return h;
}
// near an edge of the cube: the second-largest coordinate of a point on it near 1
fn edgeOf(h: vec3f, w: f32) -> f32 {
  let a = abs(h);
  let second = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));
  return 1.0 - smoothstep(0.0, w, 1.0 - second);
}
// what a ray sees once it's past the glass: the wall, where it lands
fn wallAt(o: vec3f, d: vec3f) -> vec3f {
  let zb = U.v[${V_RES}].w;
  if (d.z > -1e-3) { return mix(vec3f(0.02, 0.025, 0.07), vec3f(0.1, 0.13, 0.27), smoothstep(-0.6, 0.9, -d.y)); } // away from the wall: a faint sky
  return backAt((o + d * ((zb - o.z) / d.z)).xy);
}
// the nearest cube a ray meets (not \`skip\`), or -1
fn nearest(o: vec3f, d: vec3f, skip: i32) -> i32 {
  var best = -1;
  var bt = 1e9;
  for (var j = 0; j < 6; j++) {
    if (j == skip) { continue; }
    let h = cubeRay(j, o, d);
    if (h.tn <= h.tf && h.tn > 0.5 && h.tn < bt) { bt = h.tn; best = j; }
  }
  return best;
}
// what a ray from the surface of cube \`skip\` sees: another cube (glass: the
// wall straight through it, its edges, a sheen), or the wall
fn seen(o: vec3f, d: vec3f, skip: i32) -> vec3f {
  let j = nearest(o, d, skip);
  if (j < 0) { return wallAt(o, d); }
  let h = cubeRay(j, o, d);
  let px = 1.0 / U.v[${V_CUBE} + j].z;
  let edges = edgeOf(h.hIn, max(px * 1.6, 0.02)) * 0.3 + edgeOf(h.hOut, max(px * 1.6, 0.02)) * 0.1;
  let F = 0.04 + 0.4 * pow(1.0 - abs(dot(h.nIn, d)), 4.0);
  return wallAt(o + d * h.tf, d) * (1.0 - F) + vec3f(0.1, 0.13, 0.25) * F + vec3f(0.8, 0.86, 1.0) * edges;
}
fn scene(p: vec2f) -> vec4f {
  let o = vec3f(p, 1e4);
  let v = vec3f(0.0, 0.0, -1.0);
  // the nearest cube under this pixel (a quick look at its square first)
  var i = -1;
  var h: Hit;
  var bt = 1e9;
  for (var j = 0; j < 6; j++) {
    let cc = U.v[${V_CUBE} + j];
    if (abs(p.x - cc.x) > cc.z * 1.8 || abs(p.y - cc.y) > cc.z * 1.8) { continue; }
    let hj = cubeRay(j, o, v);
    if (hj.tn <= hj.tf && hj.tn < bt) { bt = hj.tn; i = j; h = hj; }
  }
  let wall = backAt(p);
  if (i < 0) { return vec4f(wall, 1.0); }
  let hs = U.v[${V_CUBE} + i].z;
  let px = 1.0 / hs; // one screen pixel, in half-sides
  let x0 = o + v * h.tn;
  // through: bent going in (glass 1.5), bent again coming out the far face,
  // and on to whatever is there: another cube, or the wall
  // (a ray meeting a face too steeply stays in: total internal reflection,
  // up to three bounces inside before it leaves)
  var dir = refract(v, h.nIn, 1.0 / 1.5);
  var pos = x0 - h.nIn * 0.01;
  var outd = dir;
  var farEdge = 0.0;
  for (var k = 0; k < 4; k++) {
    let hi = cubeRay(i, pos, dir);
    let e = pos + dir * hi.tf;
    if (k == 0) { farEdge = edgeOf(hi.hOut, max(px * 1.6, 0.02)); }
    outd = refract(dir, -hi.nOut, 1.5);
    pos = e;
    if (dot(outd, outd) > 1e-4 || k == 3) {
      if (dot(outd, outd) <= 1e-4) { outd = reflect(dir, -hi.nOut); }
      break;
    }
    dir = reflect(dir, -hi.nOut);
    pos = e + hi.nOut * 0.01;
  }
  let through = seen(pos, outd, i);
  // on it: what the face reflects (the other cubes, the wall at a slant, the
  // sky), faint face-on, stronger edge-on (Fresnel)
  let r = reflect(v, h.nIn);
  let F = 0.04 + 0.4 * pow(1.0 - clamp(h.nIn.z, 0.0, 1.0), 4.0);
  let refl = seen(x0, r, i);
  let Lg = normalize(vec3f(-0.45, -0.6, 0.66));
  let spec = pow(max(dot(h.nIn, normalize(Lg + vec3f(0.0, 0.0, 1.0))), 0.0), 80.0) * 0.7;
  let ew = max(px * 1.6, 0.02);
  let edges = edgeOf(h.hIn, ew) * 0.35 + farEdge * 0.12;
  let col = mix(through, refl, F) + vec3f(1.0, 0.98, 0.95) * spec + vec3f(0.8, 0.86, 1.0) * edges;
  // soft silhouette: coverage from how much glass the ray crossed
  return vec4f(mix(wall, col, clamp((h.tf - h.tn) / hs / (px * 1.5), 0.0, 1.0)), 1.0);
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
vec4 backdrop(vec2 p) {
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
  for (int i = 0; i < 4; i++) {
    vec4 h = v[${V_HEAD} + i];
    float r = length(p - h.xy) / max(h.z, 0.5);
    if (r < 1.0) {
      vec3 col = v[${V_COL} + i].rgb;
      vec4 s = r < 0.12 ? vec4(mix(vec3(1.0), col, r / 0.12), 1.0)
        : r < 0.35 ? vec4(col, mix(1.0, 0.4, (r - 0.12) / 0.23))
        : vec4(col, mix(0.4, 0.0, (r - 0.35) / 0.65));
      c.rgb += s.rgb * s.a;
    }
  }
  return vec4(c.rgb, 1.0);
}
struct Hit { float tn; float tf; vec3 nIn; vec3 nOut; vec3 hIn; vec3 hOut; };
vec3 axisOf(float t, vec3 t3) { return t == t3.x ? vec3(1.0, 0.0, 0.0) : t == t3.y ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0); }
Hit cubeRay(int i, vec3 o, vec3 d) {
  Hit h;
  vec4 cc = v[${V_CUBE} + i];
  vec3 r0 = v[${V_ROT} + i * 3].xyz;
  vec3 r1 = v[${V_ROT} + i * 3 + 1].xyz;
  vec3 r2 = v[${V_ROT} + i * 3 + 2].xyz;
  vec3 rel = o - vec3(cc.xy, cc.w);
  vec3 ol = vec3(dot(r0, rel), dot(r1, rel), dot(r2, rel)) / cc.z;
  vec3 dl = vec3(dot(r0, d), dot(r1, d), dot(r2, d)) / cc.z;
  dl = mix(dl, vec3(1e-6), lessThan(abs(dl), vec3(1e-6)));
  vec3 t0 = (vec3(-1.0) - ol) / dl;
  vec3 t1 = (vec3(1.0) - ol) / dl;
  vec3 tn3 = min(t0, t1);
  vec3 tf3 = max(t0, t1);
  h.tn = max(max(tn3.x, tn3.y), tn3.z);
  h.tf = min(min(tf3.x, tf3.y), tf3.z);
  mat3 toWorld = mat3(r0, r1, r2);
  h.nIn = toWorld * (axisOf(h.tn, tn3) * -sign(dl));
  h.nOut = toWorld * (axisOf(h.tf, tf3) * sign(dl));
  h.hIn = ol + dl * h.tn;
  h.hOut = ol + dl * h.tf;
  return h;
}
float edgeOf(vec3 h, float w) {
  vec3 a = abs(h);
  float second = max(max(min(a.x, a.y), min(a.y, a.z)), min(a.x, a.z));
  return 1.0 - smoothstep(0.0, w, 1.0 - second);
}
vec3 wallAt(vec3 o, vec3 d) {
  float zb = v[${V_RES}].w;
  if (d.z > -1e-3) return mix(vec3(0.02, 0.025, 0.07), vec3(0.1, 0.13, 0.27), smoothstep(-0.6, 0.9, -d.y));
  return backAt((o + d * ((zb - o.z) / d.z)).xy);
}
int nearest(vec3 o, vec3 d, int skip) {
  int best = -1;
  float bt = 1e9;
  for (int j = 0; j < 6; j++) {
    if (j == skip) continue;
    Hit h = cubeRay(j, o, d);
    if (h.tn <= h.tf && h.tn > 0.5 && h.tn < bt) { bt = h.tn; best = j; }
  }
  return best;
}
vec3 seen(vec3 o, vec3 d, int skip) {
  int j = nearest(o, d, skip);
  if (j < 0) return wallAt(o, d);
  Hit h = cubeRay(j, o, d);
  float px = 1.0 / v[${V_CUBE} + j].z;
  float edges = edgeOf(h.hIn, max(px * 1.6, 0.02)) * 0.3 + edgeOf(h.hOut, max(px * 1.6, 0.02)) * 0.1;
  float F = 0.04 + 0.4 * pow(1.0 - abs(dot(h.nIn, d)), 4.0);
  return wallAt(o + d * h.tf, d) * (1.0 - F) + vec3(0.1, 0.13, 0.25) * F + vec3(0.8, 0.86, 1.0) * edges;
}
vec4 scene(vec2 p) {
  vec3 o = vec3(p, 1e4);
  vec3 vd = vec3(0.0, 0.0, -1.0);
  int i = -1;
  Hit h;
  float bt = 1e9;
  for (int j = 0; j < 6; j++) {
    vec4 cc = v[${V_CUBE} + j];
    if (abs(p.x - cc.x) > cc.z * 1.8 || abs(p.y - cc.y) > cc.z * 1.8) continue;
    Hit hj = cubeRay(j, o, vd);
    if (hj.tn <= hj.tf && hj.tn < bt) { bt = hj.tn; i = j; h = hj; }
  }
  vec3 wall = backAt(p);
  if (i < 0) return vec4(wall, 1.0);
  float hs = v[${V_CUBE} + i].z;
  float px = 1.0 / hs;
  vec3 x0 = o + vd * h.tn;
  vec3 dir = refract(vd, h.nIn, 1.0 / 1.5);
  vec3 pos = x0 - h.nIn * 0.01;
  vec3 outd = dir;
  float farEdge = 0.0;
  for (int k = 0; k < 4; k++) {
    Hit hi = cubeRay(i, pos, dir);
    vec3 e = pos + dir * hi.tf;
    if (k == 0) farEdge = edgeOf(hi.hOut, max(px * 1.6, 0.02));
    outd = refract(dir, -hi.nOut, 1.5);
    pos = e;
    if (dot(outd, outd) > 1e-4 || k == 3) {
      if (dot(outd, outd) <= 1e-4) outd = reflect(dir, -hi.nOut);
      break;
    }
    dir = reflect(dir, -hi.nOut);
    pos = e + hi.nOut * 0.01;
  }
  vec3 through = seen(pos, outd, i);
  vec3 r = reflect(vd, h.nIn);
  float F = 0.04 + 0.4 * pow(1.0 - clamp(h.nIn.z, 0.0, 1.0), 4.0);
  vec3 refl = seen(x0, r, i);
  vec3 Lg = normalize(vec3(-0.45, -0.6, 0.66));
  float spec = pow(max(dot(h.nIn, normalize(Lg + vec3(0.0, 0.0, 1.0))), 0.0), 80.0) * 0.7;
  float ew = max(px * 1.6, 0.02);
  float edges = edgeOf(h.hIn, ew) * 0.35 + farEdge * 0.12;
  vec3 col = mix(through, refl, F) + vec3(1.0, 0.98, 0.95) * spec + vec3(0.8, 0.86, 1.0) * edges;
  return vec4(mix(wall, col, clamp((h.tf - h.tn) / hs / (px * 1.5), 0.0, 1.0)), 1.0);
}
`;

export const ps2Scene: GpuScene = { id: 'ps2', vec4s: VEC4S, wgsl: WGSL, glsl: GLSL, frame };
