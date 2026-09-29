// The GPU background layer: its own canvas under the grid's (which is then
// drawn clear), running a skin's GPU scene. WebGPU when the browser gives an
// adapter, else WebGL2; with neither, the skin draws on the canvas as before.
//
// A scene is two passes, the same in both backends:
// 1. the backdrop, into an offscreen image: a full-screen fragment shader
//    (`backdrop`: fog, glows) and hairlines the scene computes on the CPU
//    (x, y in CSS px, then r, g, b, a; additive, premultiplied);
// 2. the frame (`scene`), which can look anywhere in the backdrop with
//    `backAt(p)`: what's behind a glass cube, bent, or reflected in it.
// Both read one uniform block of vec4s the scene fills each frame.

export interface GfxView {
  w: number; // CSS px
  h: number;
  dpr: number;
  time: number; // seconds
  z: number; // the grid's zoom
  cs: number; // px per grid cell
  camX: number; // the grid's camera, cells
  camY: number;
}

export interface GpuScene {
  id: string;
  vec4s: number; // the uniform block's size, in vec4s
  // fragment shaders: WGSL `fn backdrop(p: vec2f) -> vec4f` and
  // `fn scene(p: vec2f) -> vec4f`, GLSL `vec4 backdrop(vec2 p)` and
  // `vec4 scene(vec2 p)`; p in CSS px from the top left, reading `U.v[i]`
  // (WGSL) / `v[i]` (GLSL); `scene` may call `backAt(p)` (the backdrop's
  // colour at p, clamped to the edges); results opaque
  wgsl: string;
  glsl: string;
  // fill the uniforms for this frame; return the hairline vertices (pairs)
  frame(u: Float32Array, view: GfxView): Float32Array;
}

type Backend = 'webgpu' | 'webgl2';

// GPUBufferUsage flags (the constants aren't in TypeScript's DOM lib)
const USE = { COPY_DST: 0x08, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10, VERTEX: 0x20, UNIFORM: 0x40 };

export const LINE_WGSL = /* wgsl */ `
struct LU { res: vec4f };
@group(0) @binding(0) var<uniform> L: LU;
struct VO { @builtin(position) pos: vec4f, @location(0) col: vec4f };
@vertex fn vs_line(@location(0) p: vec2f, @location(1) c: vec4f) -> VO {
  var o: VO;
  o.pos = vec4f(p.x / L.res.x * 2.0 - 1.0, 1.0 - p.y / L.res.y * 2.0, 0.0, 1.0);
  o.col = vec4f(c.rgb * c.a, c.a);
  return o;
}
@fragment fn fs_line(i: VO) -> @location(0) vec4f { return i.col; }
`;

export const fullWgsl = (s: GpuScene) => /* wgsl */ `
struct Uni { v: array<vec4f, ${s.vec4s}> };
@group(0) @binding(0) var<uniform> U: Uni;
@group(0) @binding(1) var<uniform> R: vec4f; // css w, h, dpr
@group(0) @binding(2) var T: texture_2d<f32>; // the backdrop (pass 2 only)
@group(0) @binding(3) var S: sampler;
@vertex fn vs_full(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var q = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(q[i], 0.0, 1.0);
}
fn backAt(p: vec2f) -> vec3f { return textureSampleLevel(T, S, p / R.xy, 0.0).rgb; }
${s.wgsl}
@fragment fn fs_back(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  return vec4f(backdrop(fc.xy / R.z).rgb, 1.0);
}
@fragment fn fs_full(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let c = scene(fc.xy / R.z);
  // a half-step of noise: dark gradients don't band into rings at 8 bits
  let n = fract(sin(dot(fc.xy, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  return vec4f(c.rgb + vec3f(n / 255.0), 1.0);
}
`;

const GL_FULL_VS = `#version 300 es
void main() {
  vec2 q = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(q, 0.0, 1.0);
}`;
const glFs = (s: GpuScene, pass: 'backdrop' | 'scene') => `#version 300 es
precision highp float;
layout(std140) uniform Uni { vec4 v[${s.vec4s}]; };
uniform vec4 R; // css w, h, dpr, framebuffer height
uniform sampler2D T; // the backdrop (pass 2 only)
out vec4 outColor;
vec3 backAt(vec2 p) { return textureLod(T, vec2(p.x / R.x, 1.0 - p.y / R.y), 0.0).rgb; }
${s.glsl}
void main() {
  vec2 p = vec2(gl_FragCoord.x, R.w - gl_FragCoord.y) / R.z;
  ${pass === 'backdrop' ? 'outColor = vec4(backdrop(p).rgb, 1.0);' : `float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  outColor = vec4(scene(p).rgb + vec3(n / 255.0), 1.0);`}
}`;
const GL_LINE_VS = `#version 300 es
layout(location = 0) in vec2 p;
layout(location = 1) in vec4 c;
uniform vec4 R;
out vec4 col;
void main() {
  gl_Position = vec4(p.x / R.x * 2.0 - 1.0, 1.0 - p.y / R.y * 2.0, 0.0, 1.0);
  col = vec4(c.rgb * c.a, c.a);
}`;
const GL_LINE_FS = `#version 300 es
precision mediump float;
in vec4 col;
out vec4 outColor;
void main() { outColor = col; }`;

interface GpuState {
  device: GPUDevice;
  ctx: GPUCanvasContext;
  format: GPUTextureFormat;
  line: GPURenderPipeline;
  lineU: GPUBuffer;
  lineBind: GPUBindGroup;
  resU: GPUBuffer;
  scenes: Map<string, { back: GPURenderPipeline; pipe: GPURenderPipeline; buf: GPUBuffer; backBind: GPUBindGroup; bind: GPUBindGroup | null; tex: GPUTexture | null }>;
  sampler: GPUSampler;
  verts: GPUBuffer | null;
  vertCap: number;
}

interface GlState {
  gl: WebGL2RenderingContext;
  line: WebGLProgram;
  lineR: WebGLUniformLocation | null;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
  scenes: Map<string, { back: WebGLProgram; prog: WebGLProgram; ubo: WebGLBuffer; rBack: WebGLUniformLocation | null; r: WebGLUniformLocation | null; t: WebGLUniformLocation | null }>;
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  size: [number, number];
}

export class GfxLayer {
  canvas: HTMLCanvasElement;
  backend: Backend | null = null;
  failed = '';
  private gpu: GpuState | null = null;
  private glS: GlState | null = null;
  private ready: Promise<void> | null = null;
  private uni = new Float32Array(0);
  lastMs = 0; // CPU time of the last frame (the scene's JS and the submit)
  frames = 0; // frames drawn, ever (the GFX readout counts them per second)

  constructor(under: HTMLCanvasElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'gfx';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true;
    under.before(this.canvas);
  }

  init(): Promise<void> {
    this.ready ??= this.start();
    return this.ready;
  }

  get ok(): boolean {
    return !!(this.gpu || this.glS);
  }

  private async start(): Promise<void> {
    try {
      const adapter = 'gpu' in navigator ? await navigator.gpu.requestAdapter({ powerPreference: 'low-power' }) : null;
      if (adapter) {
        const device = await adapter.requestDevice();
        const ctx = this.canvas.getContext('webgpu') as GPUCanvasContext | null;
        if (ctx) {
          this.setupGpu(device, ctx);
          this.backend = 'webgpu';
          // lost, or a shader it wouldn't take: WebGL2 on a fresh canvas (a
          // canvas that had a WebGPU context can't give a WebGL one)
          device.lost.then((info) => this.gpu?.device === device && this.fallBack(`WebGPU device lost${info.message ? `: ${info.message}` : ''}`));
          device.addEventListener('uncapturederror', (e) => this.gpu?.device === device && this.fallBack(`WebGPU: ${(e as GPUUncapturedErrorEvent).error.message}`));
          return;
        }
      }
    } catch (e) {
      this.failed = `WebGPU: ${(e as Error).message}`;
    }
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true });
    if (gl) {
      this.setupGl(gl);
      this.backend = 'webgl2';
      return;
    }
    this.failed ||= 'no WebGPU or WebGL2';
  }

  // (public for tests)
  fallBack(why: string): void {
    this.failed = why;
    this.gpu = null;
    this.backend = null;
    const fresh = document.createElement('canvas');
    fresh.id = this.canvas.id;
    fresh.setAttribute('aria-hidden', 'true');
    fresh.hidden = this.canvas.hidden;
    this.canvas.replaceWith(fresh);
    this.canvas = fresh;
    const gl = fresh.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true });
    if (!gl) return;
    try {
      this.setupGl(gl);
      this.backend = 'webgl2';
    } catch (e) {
      this.failed += `; WebGL2: ${(e as Error).message}`;
    }
  }

  private setupGpu(device: GPUDevice, ctx: GPUCanvasContext): void {
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque' });
    const mod = device.createShaderModule({ code: LINE_WGSL });
    const add: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const line = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vs_line', buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }, { shaderLocation: 1, offset: 8, format: 'float32x4' }] }] },
      fragment: { module: mod, entryPoint: 'fs_line', targets: [{ format, blend: { color: add, alpha: add } }] },
      primitive: { topology: 'line-list' },
    });
    const lineU = device.createBuffer({ size: 16, usage: USE.UNIFORM | USE.COPY_DST });
    const lineBind = device.createBindGroup({ layout: line.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: lineU } }] });
    const resU = device.createBuffer({ size: 16, usage: USE.UNIFORM | USE.COPY_DST });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.gpu = { device, ctx, format, line, lineU, lineBind, resU, scenes: new Map(), sampler, verts: null, vertCap: 0 };
  }

  private setupGl(gl: WebGL2RenderingContext): void {
    const line = program(gl, GL_LINE_VS, GL_LINE_FS);
    const vao = gl.createVertexArray()!;
    const vbo = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);
    gl.bindVertexArray(null);
    this.glS = { gl, line, lineR: gl.getUniformLocation(line, 'R'), vao, vbo, scenes: new Map(), fbo: gl.createFramebuffer()!, tex: gl.createTexture()!, size: [0, 0] };
  }

  hide(): void {
    this.canvas.hidden = true;
  }

  // Draw one frame of `scene`. False if it can't (no backend, or the scene
  // failed to build): the caller draws the canvas background instead.
  render(scene: GpuScene, view: GfxView): boolean {
    if (!this.ok) return false;
    const t0 = performance.now();
    const W = Math.max(1, Math.round(view.w * view.dpr));
    const H = Math.max(1, Math.round(view.h * view.dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) (this.canvas.width = W), (this.canvas.height = H);
    if (this.uni.length !== scene.vec4s * 4) this.uni = new Float32Array(scene.vec4s * 4);
    const verts = scene.frame(this.uni, view);
    let drawn = false;
    try {
      drawn = this.gpu ? this.drawGpu(scene, view, verts, W, H) : this.drawGl(scene, view, verts, W, H);
    } catch (e) {
      this.failed = `${scene.id}: ${(e as Error).message}`;
      drawn = false;
    }
    this.canvas.hidden = !drawn;
    this.lastMs = performance.now() - t0;
    if (drawn) this.frames++;
    return drawn;
  }

  private drawGpu(scene: GpuScene, view: GfxView, verts: Float32Array, W: number, H: number): boolean {
    const G = this.gpu!;
    const { device } = G;
    let sc = G.scenes.get(scene.id);
    if (!sc) {
      const mod = device.createShaderModule({ code: fullWgsl(scene) });
      // ask the compiler, don't wait for an error event: a shader it refuses
      // draws nothing at all (fall back to WebGL2, and say why in the menu)
      void mod.getCompilationInfo().then((ci) => {
        const err = ci.messages.find((m) => m.type === 'error');
        if (err && this.gpu?.device === device) this.fallBack(`WebGPU refused ${scene.id}'s shader (line ${err.lineNum}: ${err.message})`);
      });
      const pipeOf = (entry: string) => device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: mod, entryPoint: 'vs_full' },
        fragment: { module: mod, entryPoint: entry, targets: [{ format: G.format }] },
        primitive: { topology: 'triangle-list' },
      });
      const back = pipeOf('fs_back');
      const pipe = pipeOf('fs_full');
      const buf = device.createBuffer({ size: scene.vec4s * 16, usage: USE.UNIFORM | USE.COPY_DST });
      const backBind = device.createBindGroup({ layout: back.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: { buffer: G.resU } }] });
      sc = { back, pipe, buf, backBind, bind: null, tex: null };
      G.scenes.set(scene.id, sc);
    }
    // the backdrop's image, as big as the canvas
    if (!sc.tex || sc.tex.width !== W || sc.tex.height !== H) {
      sc.tex?.destroy();
      sc.tex = device.createTexture({ size: [W, H], format: G.format, usage: USE.TEXTURE_BINDING | USE.RENDER_ATTACHMENT });
      sc.bind = device.createBindGroup({ layout: sc.pipe.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: sc.buf } }, { binding: 1, resource: { buffer: G.resU } },
        { binding: 2, resource: sc.tex.createView() }, { binding: 3, resource: G.sampler },
      ] });
    }
    const res = new Float32Array([view.w, view.h, view.dpr, 0]);
    device.queue.writeBuffer(sc.buf, 0, this.uni);
    device.queue.writeBuffer(G.resU, 0, res);
    device.queue.writeBuffer(G.lineU, 0, res);
    if (verts.length) {
      if (!G.verts || G.vertCap < verts.byteLength) {
        G.verts?.destroy();
        G.vertCap = Math.max(verts.byteLength, 4096);
        G.verts = device.createBuffer({ size: G.vertCap, usage: USE.VERTEX | USE.COPY_DST });
      }
      device.queue.writeBuffer(G.verts, 0, verts);
    }
    const enc = device.createCommandEncoder();
    // 1. the backdrop and the hairlines, into its image
    const a = enc.beginRenderPass({ colorAttachments: [{ view: sc.tex.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    a.setPipeline(sc.back);
    a.setBindGroup(0, sc.backBind);
    a.draw(3);
    if (verts.length && G.verts) {
      a.setPipeline(G.line);
      a.setBindGroup(0, G.lineBind);
      a.setVertexBuffer(0, G.verts);
      a.draw(verts.length / 6);
    }
    a.end();
    // 2. the frame, looking into it
    const b = enc.beginRenderPass({ colorAttachments: [{ view: G.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    b.setPipeline(sc.pipe);
    b.setBindGroup(0, sc.bind!);
    b.draw(3);
    b.end();
    device.queue.submit([enc.finish()]);
    return true;
  }

  private drawGl(scene: GpuScene, view: GfxView, verts: Float32Array, W: number, H: number): boolean {
    const S = this.glS!;
    const { gl } = S;
    let sc = S.scenes.get(scene.id);
    if (!sc) {
      const back = program(gl, GL_FULL_VS, glFs(scene, 'backdrop'));
      const prog = program(gl, GL_FULL_VS, glFs(scene, 'scene'));
      const ubo = gl.createBuffer()!;
      gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
      gl.bufferData(gl.UNIFORM_BUFFER, scene.vec4s * 16, gl.DYNAMIC_DRAW);
      for (const pr of [back, prog]) gl.uniformBlockBinding(pr, gl.getUniformBlockIndex(pr, 'Uni'), 0);
      sc = { back, prog, ubo, rBack: gl.getUniformLocation(back, 'R'), r: gl.getUniformLocation(prog, 'R'), t: gl.getUniformLocation(prog, 'T') };
      S.scenes.set(scene.id, sc);
    }
    // the backdrop's image, as big as the canvas
    if (S.size[0] !== W || S.size[1] !== H) {
      gl.bindTexture(gl.TEXTURE_2D, S.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, S.tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      S.size = [W, H];
    }
    gl.viewport(0, 0, W, H);
    gl.bindBuffer(gl.UNIFORM_BUFFER, sc.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uni);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, sc.ubo);
    // 1. the backdrop and the hairlines, into its image
    gl.bindFramebuffer(gl.FRAMEBUFFER, S.fbo);
    gl.disable(gl.BLEND);
    gl.useProgram(sc.back);
    gl.uniform4f(sc.rBack, view.w, view.h, view.dpr, H);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (verts.length) {
      gl.useProgram(S.line);
      gl.uniform4f(S.lineR, view.w, view.h, view.dpr, H);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindVertexArray(S.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, S.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STREAM_DRAW);
      gl.drawArrays(gl.LINES, 0, verts.length / 6);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    }
    // 2. the frame, looking into it
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(sc.prog);
    gl.uniform4f(sc.r, view.w, view.h, view.dpr, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, S.tex);
    gl.uniform1i(sc.t, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}
