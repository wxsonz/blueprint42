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
  then drawn clear. A scene is two passes: its backdrop (and the hairlines)
  into an offscreen image, then the frame, which can look anywhere in that
  image (`backAt`). WebGPU when the browser gives an adapter, else WebGL2;
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
- **Cubes (author): clear glass in a real 3D space.** The fog, the light
  heads and the trails are a wall just behind the cubes; each cube has a
  depth (the one its parallax already used). A pixel's ray is traced into
  the nearest cube and bent going in (glass 1.5); it comes out again
  parallel, shifted sideways by the way across (a slab of glass), and goes
  on to another cube or the wall. The reflected ray is followed the same
  way, weighted by Fresnel. So the glass shows what is really around it:
  the fog and trails bent, the other cubes. No drawn edges, highlights or
  tints (the author: "not to see an edge", "nothing inside"). A first
  version also traced the far faces and bounced rays inside (total internal
  reflection); it drew the cube's inner faces and edges as a shape inside
  the glass, and was dropped. A ray leaving toward the viewer sees space
  (black), not a tinted sky. One bounce between cubes: a cube seen in
  another is plain glass. Readings tried first and dropped: tinted glass,
  solid frosted blocks, a baked room of blocks. Simple mode and the canvas
  fallback keep the old look. The output is dithered by half a step.
- **Cost (author: "too much compute").** Measured on the RTX 4060 (wgpu,
  3840×2160): 2.30 ms a frame at first, 0.48 ms now. Two changes, both in
  the layer so any scene can use them. **Bake:** a scene can draw an image
  once (`bake`, read with `bakedAt`); the fog never changes shape, it only
  slides and scales, so it is baked at 512×320 and the backdrop reads it,
  instead of eight noise octaves per pixel per frame (backdrop 1.57 → 0.21
  ms). **Regions:** a scene can name the rects it changes (`regions`); the
  backdrop is copied across the frame and the glass shader runs only in each
  cube's square, with a scissor (the cube search cost the same for every
  pixel of the screen, and about 4% are glass). In the author's Chrome
  (WebGPU, NVIDIA, 2560×1353) a frame, CPU and GPU together, is about 1 ms.
- **Beside the button (author):** what draws the background (`WebGPU`,
  `WebGL2`, `canvas`, `still`, `off`) and a live readout, `fps · ms`: the
  background's frames a second and the CPU time of one frame (the GPU's own
  time isn't measured).
- **Chrome's compiler is the strict one.** Tint (Chrome) refuses WGSL that
  naga (wgpu, Firefox) accepts: `a * b ^ c` needs parentheses. That broke
  PS2's scene in Chrome only. WGSL is checked with Tint (Dawn's `webgpu`
  npm package, in a scratch folder, not a dependency), `test/gfx.test.ts`
  lints for the mix, and the layer asks the compiler after building a
  shader and falls back to WebGL2 on any error, saying why in the GFX menu.
- **Next:** port the other animated backgrounds one at a time (PS3's waves,
  PS4, Synthwave); a skin without a GPU scene keeps its canvas background.
