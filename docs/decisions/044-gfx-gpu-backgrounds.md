# GFX: skins' backgrounds on the GPU, with a button to turn them down

*2026-09-29* · **Status:** Accepted

- **Decision (author):** Animated backgrounds may run on the GPU; nothing
  else does. Machines, belts and text stay Canvas 2D in every skin: they
  are mostly text, which the canvas draws natively and a GPU renderer would
  need a glyph atlas for, and moving them would mean rewriting all 26 skins.
- **Decision (author):** A **GFX** button in the top bar: **Full**
  (animated; the skin's GPU scene where it has one, else its canvas
  animation as before), **Simple** (one still picture, painted once per
  size) or **Off** (the skin's flat colour). Remembered per browser. The
  default is Full, or Simple when the browser asks for reduced motion or has
  no GPU.
- **How:** `src/gfx/layer.ts` puts its own canvas under the grid's, which is
  then drawn clear. WebGPU when the browser gives an adapter, else WebGL2;
  if the WebGPU device is lost or rejects a shader, it falls back to WebGL2
  on a fresh canvas (a canvas that had a WebGPU context can't give a WebGL
  one). A scene (`src/gfx/scenes/`) is one full-screen fragment shader
  (WGSL and GLSL) plus hairlines computed on the CPU. While the grid rests,
  the scene alone keeps moving at 30 fps.
- **First scene: PS2's boot screen** (`scenes/ps2.ts`), matched against the
  canvas original (`ps2Boot`): the same fog, cubes, lights and parallax.
  The cubes are a ray against each rotated box. Its noise uses an integer
  hash: a `fract(sin(x) · 43758)` hash gave neighbouring cells different
  values for a shared corner on WebGPU, and the fog came out blocky.
- **Why:** measured in headless Chromium (software canvas), PS2's canvas
  background cost 31 ms a frame at 900×760 at 2× (PS3's 13.5 ms, Minimal's
  1.4 ms); the GPU scene costs about 0.2–0.4 ms of CPU a frame. Checked:
  the WGSL compiles and draws the same picture as the WebGL2 path, through
  wgpu-native on the RTX 4060 (headless Chromium here has no WebGPU device).
- **Next:** port the other animated backgrounds one at a time (PS3's waves,
  PS4, Synthwave); a skin without a GPU scene keeps its canvas background.
