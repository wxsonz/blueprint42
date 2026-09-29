// PS4's welcome screen on the GPU (src/skins/consoles/ps4.ts ps4Prism and its
// background are the canvas original, and the look to match): the sky, and one
// twisted glass prism sweeping through it.
//
// CPU: the numbers (ps4Geom: where the band lies, how it turns). GPU: every
// pixel. The prism needs no geometry: the points of each ring lie on the arc's
// normal, so a pixel's place is its angle around the arc's circle (how far
// along the band, s) and its distance from that circle (the offset of the
// three edges, r(s)·cos(tw(s) + j·120°)). A face is what lies between two
// edges, the thick line is one edge; all of it drawn as the canvas does (faces
// see-through, layered, faded to nothing at both tips).
import { ps2Still } from '../../skins/consoles/common';
import { ps4Geom } from '../../skins/consoles/ps4';
import type { GfxView, GpuScene } from '../layer';

// the uniform block, in vec4s
const V_RES = 0; // w, h
const V_ARC = 1; // ox, oy, R, the angle where s = 0 (less the tip that reaches past)
const V_SWEEP = 2; // sweep, EXT, rmin, rHead
const V_FLARE = 3; // rTail, bulge, phase, spin
const V_TW1 = 4; // twist, k·w1.a, w1.f, w1's phase now
const V_TW2 = 5; // k·w2.a, w2.f, w2's phase now, fade
const V_LINE = 6; // the thick edge's width, how far from the circle the prism can reach
const VEC4S = 7;

const TAU = Math.PI * 2;
const NONE = new Float32Array(0);

function frame(u: Float32Array, v: GfxView): Float32Array {
  const t = ps2Still || !v.time ? 40 : v.time;
  const G = ps4Geom(v.w, v.h, t);
  const lw = Math.max(2, v.h / 260);
  const set = (i: number, a: number, b = 0, c = 0, d = 0) => u.set([a, b, c, d], i * 4);
  set(V_RES, v.w, v.h);
  set(V_ARC, G.ox, G.oy, G.R, G.a0 + G.slide);
  set(V_SWEEP, G.sweep, G.EXT, G.rmin, G.rHead);
  set(V_FLARE, G.rTail, G.bulge, G.phase % TAU, G.spin % TAU);
  set(V_TW1, G.twist, G.k * G.w1.a, G.w1.f, (G.w1.v * t + G.w1.ph) % TAU);
  set(V_TW2, G.k * G.w2.a, G.w2.f, (G.w2.v * t + G.w2.ph) % TAU, G.fade);
  set(V_LINE, lw, (G.rmin + Math.max(G.rHead, G.rTail)) * (1 + G.bulge) + lw + 2);
  return NONE;
}

const WGSL = /* wgsl */ `
const TAU = 6.283185307;
fn sky(t: f32) -> vec3f {
  let c0 = vec3f(10.0, 95.0, 174.0) / 255.0; // #0a5fae
  let c1 = vec3f(7.0, 70.0, 196.0) / 255.0; // #0746c4
  let c2 = vec3f(5.0, 56.0, 188.0) / 255.0; // #0538bc
  let c3 = vec3f(3.0, 26.0, 120.0) / 255.0; // #031a78
  let c4 = vec3f(1.0, 10.0, 46.0) / 255.0; // #010a2e
  if (t < 0.35) { return mix(c0, c1, t / 0.35); }
  if (t < 0.55) { return mix(c1, c2, (t - 0.35) / 0.2); }
  if (t < 0.82) { return mix(c2, c3, (t - 0.55) / 0.27); }
  return mix(c3, c4, (t - 0.82) / 0.18);
}
// the width of the ring at s, and how far round it has turned
fn rAt(s: f32) -> f32 {
  let a = U.v[${V_SWEEP}];
  let b = U.v[${V_FLARE}];
  let flare = pow(1.0 - s, 2.2) * a.w + pow(s, 2.2) * b.x;
  return (a.z + flare) * (1.0 + b.y * sin(TAU * 1.3 * s + b.z));
}
fn twAt(s: f32) -> f32 {
  let c = U.v[${V_TW1}];
  let d = U.v[${V_TW2}];
  return U.v[${V_FLARE}].w + c.x * s + c.y * sin(TAU * c.z * s + c.w) + d.x * sin(TAU * d.y * s + d.z);
}
// the three edges' offsets from the arc at s
fn edges(s: f32) -> vec3f {
  let a = twAt(s);
  return rAt(s) * vec3f(cos(a), cos(a + 2.0943951), cos(a + 4.1887902));
}
fn prism(p: vec2f, base: vec3f) -> vec3f {
  let fade = U.v[${V_TW2}].w;
  if (fade <= 0.0) { return base; }
  let o = U.v[${V_ARC}];
  let d = p - o.xy;
  let rho = length(d);
  if (abs(rho - o.z) > U.v[${V_LINE}].y) { return base; }
  let sweep = U.v[${V_SWEEP}].x;
  let ext = U.v[${V_SWEEP}].y;
  // how far along the sweep this angle is (it may come round more than once)
  let dl = atan2(d.y, d.x) - o.w;
  var uu = 0.0;
  var ok = false;
  for (var i = -2; i <= 2; i++) {
    let x = (dl + f32(i) * TAU) / sweep;
    if (!ok && x >= -ext && x <= 1.0 + ext) { uu = x; ok = true; }
  }
  if (!ok) { return base; }
  let s = clamp((uu + ext) / (1.0 + 2.0 * ext), 0.0, 1.0);
  // faded to nothing toward both tips
  let fs = clamp(min(s, 1.0 - s) / 0.22, 0.0, 1.0) * fade;
  if (fs <= 0.0) { return base; }
  let off = o.z - rho;
  let e = 0.004;
  let s0 = max(s - e, 0.0);
  let s1 = min(s + e, 1.0);
  let q = edges(s);
  // each edge's slope across the band, to measure in px straight off it
  let sl = (edges(s1) - edges(s0)) / (s1 - s0) / max(rho * abs(sweep) * (1.0 + 2.0 * ext), 1.0);
  let dd = (vec3f(off) - q) / sqrt(vec3f(1.0) + sl * sl); // px inside the edge on its side (signed)
  // a face is what lies between two edges
  let f2 = clamp(0.5 + min(select(-dd.z, dd.z, q.z < q.x), select(dd.x, -dd.x, q.z < q.x)), 0.0, 1.0);
  let f1 = clamp(0.5 + min(select(-dd.y, dd.y, q.y < q.z), select(dd.z, -dd.z, q.y < q.z)), 0.0, 1.0);
  let f0 = clamp(0.5 + min(select(-dd.x, dd.x, q.x < q.y), select(dd.y, -dd.y, q.x < q.y)), 0.0, 1.0);
  let top = vec3f(10.0, 95.0, 174.0) / 255.0;
  let mid = vec3f(6.0, 62.0, 192.0) / 255.0;
  var c = base;
  c = mix(c, top, 0.18 * fs * f2);
  c = mix(c, mid, 0.5 * fs * f1);
  c = mix(c, top, 0.45 * fs * f0);
  // one edge a thick line of the top colour
  let line = clamp(U.v[${V_LINE}].x * 0.5 + 0.5 - abs(dd.x), 0.0, 1.0);
  return mix(c, top, 0.8 * fs * line);
}
fn backdrop(p: vec2f) -> vec4f {
  let W = U.v[${V_RES}].x;
  let H = U.v[${V_RES}].y;
  let dv = vec2f(0.12 * W, H);
  var c = sky(clamp(dot(p, dv) / dot(dv, dv), 0.0, 1.0));
  let glow = 0.28 * (1.0 - clamp(length(p - vec2f(0.5 * W, 0.4 * H)) / (max(W, H) * 0.5), 0.0, 1.0));
  c = mix(c, vec3f(20.0, 80.0, 235.0) / 255.0, glow);
  return vec4f(prism(p, c), 1.0);
}
fn scene(p: vec2f) -> vec4f { return vec4f(backAt(p), 1.0); }
`;

const GLSL = /* glsl */ `
const float TAU = 6.283185307;
vec3 sky(float t) {
  vec3 c0 = vec3(10.0, 95.0, 174.0) / 255.0;
  vec3 c1 = vec3(7.0, 70.0, 196.0) / 255.0;
  vec3 c2 = vec3(5.0, 56.0, 188.0) / 255.0;
  vec3 c3 = vec3(3.0, 26.0, 120.0) / 255.0;
  vec3 c4 = vec3(1.0, 10.0, 46.0) / 255.0;
  if (t < 0.35) return mix(c0, c1, t / 0.35);
  if (t < 0.55) return mix(c1, c2, (t - 0.35) / 0.2);
  if (t < 0.82) return mix(c2, c3, (t - 0.55) / 0.27);
  return mix(c3, c4, (t - 0.82) / 0.18);
}
float rAt(float s) {
  vec4 a = v[${V_SWEEP}];
  vec4 b = v[${V_FLARE}];
  float flare = pow(1.0 - s, 2.2) * a.w + pow(s, 2.2) * b.x;
  return (a.z + flare) * (1.0 + b.y * sin(TAU * 1.3 * s + b.z));
}
float twAt(float s) {
  vec4 c = v[${V_TW1}];
  vec4 d = v[${V_TW2}];
  return v[${V_FLARE}].w + c.x * s + c.y * sin(TAU * c.z * s + c.w) + d.x * sin(TAU * d.y * s + d.z);
}
vec3 edges(float s) {
  float a = twAt(s);
  return rAt(s) * vec3(cos(a), cos(a + 2.0943951), cos(a + 4.1887902));
}
vec3 prism(vec2 p, vec3 base) {
  float fade = v[${V_TW2}].w;
  if (fade <= 0.0) return base;
  vec4 o = v[${V_ARC}];
  vec2 d = p - o.xy;
  float rho = length(d);
  if (abs(rho - o.z) > v[${V_LINE}].y) return base;
  float sweep = v[${V_SWEEP}].x;
  float ext = v[${V_SWEEP}].y;
  float dl = atan(d.y, d.x) - o.w;
  float uu = 0.0;
  bool ok = false;
  for (int i = -2; i <= 2; i++) {
    float x = (dl + float(i) * TAU) / sweep;
    if (!ok && x >= -ext && x <= 1.0 + ext) { uu = x; ok = true; }
  }
  if (!ok) return base;
  float s = clamp((uu + ext) / (1.0 + 2.0 * ext), 0.0, 1.0);
  float fs = clamp(min(s, 1.0 - s) / 0.22, 0.0, 1.0) * fade;
  if (fs <= 0.0) return base;
  float off = o.z - rho;
  float e = 0.004;
  float s0 = max(s - e, 0.0);
  float s1 = min(s + e, 1.0);
  vec3 q = edges(s);
  vec3 sl = (edges(s1) - edges(s0)) / (s1 - s0) / max(rho * abs(sweep) * (1.0 + 2.0 * ext), 1.0);
  vec3 dd = (vec3(off) - q) / sqrt(vec3(1.0) + sl * sl);
  float f2 = clamp(0.5 + min(q.z < q.x ? dd.z : -dd.z, q.z < q.x ? -dd.x : dd.x), 0.0, 1.0);
  float f1 = clamp(0.5 + min(q.y < q.z ? dd.y : -dd.y, q.y < q.z ? -dd.z : dd.z), 0.0, 1.0);
  float f0 = clamp(0.5 + min(q.x < q.y ? dd.x : -dd.x, q.x < q.y ? -dd.y : dd.y), 0.0, 1.0);
  vec3 top = vec3(10.0, 95.0, 174.0) / 255.0;
  vec3 mid = vec3(6.0, 62.0, 192.0) / 255.0;
  vec3 c = base;
  c = mix(c, top, 0.18 * fs * f2);
  c = mix(c, mid, 0.5 * fs * f1);
  c = mix(c, top, 0.45 * fs * f0);
  float line = clamp(v[${V_LINE}].x * 0.5 + 0.5 - abs(dd.x), 0.0, 1.0);
  return mix(c, top, 0.8 * fs * line);
}
vec4 backdrop(vec2 p) {
  float W = v[${V_RES}].x;
  float H = v[${V_RES}].y;
  vec2 dv = vec2(0.12 * W, H);
  vec3 c = sky(clamp(dot(p, dv) / dot(dv, dv), 0.0, 1.0));
  float glow = 0.28 * (1.0 - clamp(length(p - vec2(0.5 * W, 0.4 * H)) / (max(W, H) * 0.5), 0.0, 1.0));
  c = mix(c, vec3(20.0, 80.0, 235.0) / 255.0, glow);
  return vec4(prism(p, c), 1.0);
}
vec4 scene(vec2 p) { return vec4(backAt(p), 1.0); }
`;

// everything is in the backdrop: the frame just copies it across (no regions)
export const ps4Scene: GpuScene = { id: 'ps4', vec4s: VEC4S, wgsl: WGSL, glsl: GLSL, frame, regions: () => [] };
