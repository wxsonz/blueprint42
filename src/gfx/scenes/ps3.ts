// PS3's XrossMediaBar on the GPU (src/skins/consoles/ps3.ts ps3Sky, ps3Xmb are
// the canvas original, and the look to match): the sky in the theme colour
// (it cross-fades when the colour is changed), the twisting ribbon of
// translucent sheets, and white sparkles drifting through.
//
// CPU: the numbers (the sky as it is now, the ribbon's phases, the sparkles'
// places). GPU: the sky and the ribbon, solved for every pixel in the backdrop
// pass: the ribbon is 22 lines across a bundle whose width swings through zero,
// so each pixel only asks where the 22 lines are at its x, and how near it is
// to each (a soft line), to the glow along the middle, and whether it lies in
// a sheet (between lines i and i + 2). The canvas drew this small and blurred
// it: the softness here (a gaussian of 3 px) is what that came to. Only in a
// band around the ribbon; elsewhere it's the sky. The sparkles are the scene
// pass, each in its own small square (`regions`), like PS2's cubes.
import { ps2Still, toward } from '../../skins/consoles/common';
import { ps3Dust, ps3LineAlpha, ps3SheetAlpha, ps3SkyNow } from '../../skins/consoles/ps3';
import type { GfxView, GpuScene } from '../layer';

const LINES = 22;
const SHEETS = 10;
const DUST = ps3Dust.length;

// the uniform block, in vec4s
const V_RES = 0; // w, h
const V_SKY = 1; // 3: top, mid, bottom (r, g, b)
const V_LITE = 4; // the ribbon's colour
const V_PH = 5; // the ribbon's phases now: yc's two waves, a's, the lines' wiggle
const V_LA = 6; // 6: line alphas (22 of 24)
const V_SA = 12; // 3: sheet alphas (10 of 12)
const V_DUST = 15; // DUST: x, y, radius, alpha
const VEC4S = V_DUST + DUST;

const TAU = Math.PI * 2;
const NONE = new Float32Array(0);
const LINE_A = Array.from({ length: LINES }, (_, i) => ps3LineAlpha(i));
const SHEET_A = Array.from({ length: SHEETS }, (_, i) => ps3SheetAlpha(i * 2));

function frame(u: Float32Array, v: GfxView): Float32Array {
  const t = ps2Still || !v.time ? 30 : v.time;
  const W = v.w;
  const H = v.h;
  const set = (i: number, a: number, b = 0, c = 0, d = 0) => u.set([a, b, c, d], i * 4);
  const sky = ps3SkyNow();
  set(V_RES, W, H);
  sky.top.forEach((c, i) => u[V_SKY * 4 + i] = c / 255);
  sky.mid.forEach((c, i) => u[(V_SKY + 1) * 4 + i] = c / 255);
  sky.bot.forEach((c, i) => u[(V_SKY + 2) * 4 + i] = c / 255);
  const lite = toward(sky.mid, 255, 0.78);
  set(V_LITE, lite[0] / 255, lite[1] / 255, lite[2] / 255);
  // (ps3Wave's phases, reduced to a turn so a long-running page keeps its precision)
  set(V_PH, (0.9 + 0.11 * t) % TAU, (2 - 0.19 * t) % TAU, (1 + 0.14 * t) % TAU, (0.33 * t) % TAU);
  LINE_A.forEach((a, i) => (u[V_LA * 4 + i] = a));
  SHEET_A.forEach((a, i) => (u[V_SA * 4 + i] = a));
  const wrap = (x: number, span: number) => ((x % span) + span) % span;
  ps3Dust.forEach((d, i) => {
    const x = wrap(d.x * W * 1.2 + t * d.v * W, W * 1.2) - W * 0.1;
    const y = wrap(d.y * H + Math.sin(t * 0.3 + d.ph) * H * 0.01, H * 1.1) - H * 0.05;
    set(V_DUST + i, x, y, d.r * 3, d.a * (0.55 + 0.45 * Math.sin(t * d.f + d.ph)));
  });
  return NONE;
}

const WGSL = /* wgsl */ `
fn lineA(i: i32) -> f32 { return U.v[${V_LA} + i / 4][i % 4]; }
fn sheetA(i: i32) -> f32 { return U.v[${V_SA} + i / 4][i % 4]; }
fn sky(p: vec2f) -> vec3f {
  let W = U.v[${V_RES}].x;
  let H = U.v[${V_RES}].y;
  let dv = vec2f(0.25 * W, H);
  let t = clamp(dot(p, dv) / dot(dv, dv), 0.0, 1.0);
  var c = mix(U.v[${V_SKY}].rgb, U.v[${V_SKY} + 1].rgb, t / 0.42);
  if (t >= 0.42) { c = mix(U.v[${V_SKY} + 1].rgb, U.v[${V_SKY} + 2].rgb, (t - 0.42) / 0.58); }
  // the light at the top right, the shade at the bottom
  c = mix(c, vec3f(1.0), 0.14 * (1.0 - clamp(length(p - vec2f(0.85 * W, 0.0)) / (0.6 * W), 0.0, 1.0)));
  return mix(c, vec3f(10.0, 0.0, 40.0) / 255.0, 0.25 * (1.0 - clamp(length(p - vec2f(0.7 * W, H)) / (0.5 * W), 0.0, 1.0)));
}
// how much of the ribbon's colour is over this pixel
fn ribbon(p: vec2f) -> f32 {
  let W = U.v[${V_RES}].x;
  let H = U.v[${V_RES}].y;
  let ph = U.v[${V_PH}];
  let u = p.x / W;
  // (ps3Wave)
  let yc = (0.56 + 0.06 * sin(6.28 * 0.55 * u + ph.x) + 0.025 * sin(6.28 * 1.3 * u + ph.y)) * H;
  let a = (0.02 + 0.08 * sin(6.28 * 0.62 * u + ph.z)) * H;
  if (abs(p.y - yc) > abs(a) + 0.07 * H + 16.0) { return 0.0; }
  // the colour fades in from the left and out again toward the right
  let uc = clamp(u, 0.0, 1.0);
  let m = select(mix(1.0, 0.85, (uc - 0.45) / 0.55), mix(0.6, 1.0, uc / 0.45), uc < 0.45);
  var ys: array<f32, ${LINES}>;
  for (var i = 0; i < ${LINES}; i++) {
    ys[i] = yc + (-1.0 + 2.0 * f32(i) / ${LINES - 1}.0) * a + 0.01 * H * sin(6.28 * 1.7 * u + 0.6 * f32(i) + ph.w);
  }
  var tr = 1.0;
  // the glow along the middle: three wide soft bands
  let dm = abs(p.y - ys[${LINES >> 1}]);
  tr *= 1.0 - 0.035 * m * (1.0 - smoothstep(0.055 * H - 5.0, 0.055 * H + 5.0, dm));
  tr *= 1.0 - 0.035 * m * (1.0 - smoothstep(0.035 * H - 5.0, 0.035 * H + 5.0, dm));
  tr *= 1.0 - 0.035 * m * (1.0 - smoothstep(0.0175 * H - 5.0, 0.0175 * H + 5.0, dm));
  // the sheets, between every second line
  for (var j = 0; j < ${SHEETS}; j++) {
    let y0 = ys[2 * j];
    let y1 = ys[2 * j + 2];
    let lo = min(y0, y1);
    let hi = max(y0, y1);
    let cov = smoothstep(-5.0, 5.0, p.y - lo) - smoothstep(-5.0, 5.0, p.y - hi);
    tr *= 1.0 - sheetA(j) * m * max(cov, 0.0);
  }
  // the lines, soft
  for (var i = 0; i < ${LINES}; i++) {
    let dy = p.y - ys[i];
    if (abs(dy) < 16.0) { tr *= 1.0 - lineA(i) * m * 0.30 * exp(-dy * dy / 18.0); }
  }
  return 1.0 - tr;
}
fn backdrop(p: vec2f) -> vec4f {
  return vec4f(mix(sky(p), U.v[${V_LITE}].rgb, ribbon(p)), 1.0);
}
// the sparkles: white, soft, over whatever is there
fn scene(p: vec2f) -> vec4f {
  var tr = 1.0;
  for (var i = 0; i < ${DUST}; i++) {
    let d = U.v[${V_DUST} + i];
    let q = p - d.xy;
    if (dot(q, q) < d.z * d.z) {
      let r = length(q) / d.z;
      tr *= 1.0 - d.w * select(mix(0.8, 0.0, (r - 0.25) / 0.75), mix(1.0, 0.8, r / 0.25), r < 0.25);
    }
  }
  return vec4f(mix(vec3f(1.0), backAt(p), tr), 1.0);
}
`;

const GLSL = /* glsl */ `
float lineA(int i) { return v[${V_LA} + i / 4][i % 4]; }
float sheetA(int i) { return v[${V_SA} + i / 4][i % 4]; }
vec3 sky(vec2 p) {
  float W = v[${V_RES}].x;
  float H = v[${V_RES}].y;
  vec2 dv = vec2(0.25 * W, H);
  float t = clamp(dot(p, dv) / dot(dv, dv), 0.0, 1.0);
  vec3 c = t < 0.42 ? mix(v[${V_SKY}].rgb, v[${V_SKY} + 1].rgb, t / 0.42) : mix(v[${V_SKY} + 1].rgb, v[${V_SKY} + 2].rgb, (t - 0.42) / 0.58);
  c = mix(c, vec3(1.0), 0.14 * (1.0 - clamp(length(p - vec2(0.85 * W, 0.0)) / (0.6 * W), 0.0, 1.0)));
  return mix(c, vec3(10.0, 0.0, 40.0) / 255.0, 0.25 * (1.0 - clamp(length(p - vec2(0.7 * W, H)) / (0.5 * W), 0.0, 1.0)));
}
float ribbon(vec2 p) {
  float W = v[${V_RES}].x;
  float H = v[${V_RES}].y;
  vec4 ph = v[${V_PH}];
  float u = p.x / W;
  float yc = (0.56 + 0.06 * sin(6.28 * 0.55 * u + ph.x) + 0.025 * sin(6.28 * 1.3 * u + ph.y)) * H;
  float a = (0.02 + 0.08 * sin(6.28 * 0.62 * u + ph.z)) * H;
  if (abs(p.y - yc) > abs(a) + 0.07 * H + 16.0) return 0.0;
  float uc = clamp(u, 0.0, 1.0);
  float m = uc < 0.45 ? mix(0.6, 1.0, uc / 0.45) : mix(1.0, 0.85, (uc - 0.45) / 0.55);
  float ys[${LINES}];
  for (int i = 0; i < ${LINES}; i++) {
    ys[i] = yc + (-1.0 + 2.0 * float(i) / ${LINES - 1}.0) * a + 0.01 * H * sin(6.28 * 1.7 * u + 0.6 * float(i) + ph.w);
  }
  float tr = 1.0;
  float dm = abs(p.y - ys[${LINES >> 1}]);
  tr *= 1.0 - 0.035 * m * (1.0 - smoothstep(0.055 * H - 5.0, 0.055 * H + 5.0, dm));
  tr *= 1.0 - 0.035 * m * (1.0 - smoothstep(0.035 * H - 5.0, 0.035 * H + 5.0, dm));
  tr *= 1.0 - 0.035 * m * (1.0 - smoothstep(0.0175 * H - 5.0, 0.0175 * H + 5.0, dm));
  for (int j = 0; j < ${SHEETS}; j++) {
    float y0 = ys[2 * j];
    float y1 = ys[2 * j + 2];
    float lo = min(y0, y1);
    float hi = max(y0, y1);
    float cov = smoothstep(-5.0, 5.0, p.y - lo) - smoothstep(-5.0, 5.0, p.y - hi);
    tr *= 1.0 - sheetA(j) * m * max(cov, 0.0);
  }
  for (int i = 0; i < ${LINES}; i++) {
    float dy = p.y - ys[i];
    if (abs(dy) < 16.0) tr *= 1.0 - lineA(i) * m * 0.30 * exp(-dy * dy / 18.0);
  }
  return 1.0 - tr;
}
vec4 backdrop(vec2 p) {
  return vec4(mix(sky(p), v[${V_LITE}].rgb, ribbon(p)), 1.0);
}
vec4 scene(vec2 p) {
  float tr = 1.0;
  for (int i = 0; i < ${DUST}; i++) {
    vec4 d = v[${V_DUST} + i];
    vec2 q = p - d.xy;
    if (dot(q, q) < d.z * d.z) {
      float r = length(q) / d.z;
      tr *= 1.0 - d.w * (r < 0.25 ? mix(1.0, 0.8, r / 0.25) : mix(0.8, 0.0, (r - 0.25) / 0.75));
    }
  }
  return vec4(mix(vec3(1.0), backAt(p), tr), 1.0);
}
`;

export const ps3Scene: GpuScene = { id: 'ps3', vec4s: VEC4S, wgsl: WGSL, glsl: GLSL, frame,
  // each sparkle's square (and a pixel more)
  regions: (u) => Array.from({ length: DUST }, (_, i) => {
    const [x, y, r] = u.subarray((V_DUST + i) * 4, (V_DUST + i) * 4 + 3);
    return [x - r - 1, y - r - 1, 2 * r + 2, 2 * r + 2];
  }).flat() };
