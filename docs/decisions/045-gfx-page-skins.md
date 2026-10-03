# GFX: PS3's ribbon and PS4's prism on the GPU, on the page's layer

*2026-09-30* · **Status:** Accepted

- **Decision (author):** Port the PS3 and PS4 canvas backgrounds to the GPU
  (WebGPU, with the same WebGL2 fallback), taking PS2's scene as the model.
  The look stays the canvas original's; Simple, Off and the canvas fallback
  keep the old drawing.
- **A second layer.** PS3 and PS4 are `fullBleed`: their background is the
  whole page, painted by `paintPage` on `#page-bg`, never on the grid's
  canvas, so the grid's `GfxLayer` never saw them. `page.ts` now owns a second
  `GfxLayer` (`#gfx-page`, fixed, under the then-clear `#page-bg`) that
  `paintPage` runs the skin's scene on, with the window as its view (no
  camera, no zoom). The readout beside the button reports whichever layer
  drew it.
- **PS3** (`scenes/ps3.ts`): the sky (the theme colour, mid cross-fade too,
  from `ps3SkyNow`), the ribbon, the sparkles. The ribbon is 22 lines across
  a bundle whose width swings through zero, so a pixel only asks where the
  lines are at its x: how near to each (a soft line), to the glow along the
  middle, whether it lies in a sheet (between lines i and i + 2). The canvas
  drew it at 0.3 scale and blurred it; a gaussian of about 3 px is what that
  came to. Only a band around the ribbon is worked out. The 170 sparkles are
  the scene pass, each in its own small square (`regions`), like PS2's cubes.
  `ps3Wave` (which the windows' lit edges still use on the CPU) is repeated
  in the shaders and marked so.
- **PS4** (`scenes/ps4.ts`): the sky, and the prism with no geometry at all.
  Every point of a ring lies on the arc's normal, so a pixel's place is its
  angle around the arc's circle (how far along the band) and its distance
  from that circle (the offset `r(s)·cos(tw(s) + j·120°)` of edge j); a face
  is what lies between two edges, the thick line is one edge. `ps4Geom` (the
  canvas drawing's numbers, pulled out of `ps4Prism`) feeds both.
- **Checked** against the canvas original at 1280×800, fixed times, in
  headless Chromium (WebGL2 through the GPU scene, and the WGSL offscreen
  through Chrome's Tint on its SwiftShader adapter): mean difference
  0.47/255 for PS4 over 16 different passes and 0.66 for PS3 over 6 times
  (the worst pixels are the canvas's own blur fading at the window's right
  edge); WGSL and GLSL agree to within 1. A live window shows
  `WebGL2 · 0.1–0.4 ms` of CPU a frame here (software GL). Headless Chromium
  here cannot keep a WebGPU canvas alive (PS2's existing scene loses the
  device the same way), so the WebGPU *canvas* path of this change is
  untested on a real GPU; the shaders and pipelines are.
- **A layer fix this found.** PS4's frame pass never reads its uniforms (all
  the work is in the backdrop), so with `layout: 'auto'` the frame pipeline's
  bind group layout had no binding 0 and the layer's bind group was refused:
  on WebGPU the scene would have fallen back to WebGL2. The frame pipeline now
  has an explicit layout (uniforms, resolution, backdrop, sampler), and the
  WebGL path no longer binds a uniform block a program dropped.
