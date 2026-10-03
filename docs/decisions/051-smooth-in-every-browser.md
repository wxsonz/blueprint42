# Smooth in every browser: the page layer every frame, WebGL2 in Firefox, no rounded clip on the grid, a frame-rate cap, GPU time

*2026-10-03* · **Status:** Accepted

The plan "smooth in every browser" (`docs/OBJECTIVES.md`, 2026-10-03). No
picture changes: `tools/pixcmp` against the commit before, every skin at 1×
and 1.5×, 2,970 frames, 0 differing; Minimal, Minimal light, amp and Aqua
also at 1.25× and 2×.

- **The page layer draws every frame the grid draws** (revises decision
  045's 30 fps). In Zen (Firefox), a WebGPU canvas that skips a frame while
  the rest of the page redraws holds the next frame 66–100 ms, until a
  timeout: PS3 and PS4 played at 20 fps whenever the grid redrew every
  frame (playing, focus mode's dimming and zooming). Frame by frame:
  `17 66P 17 66P 17 83P …` (P: the background drew). Now 60 in Zen for
  both. Chromium pays 0.5 ms (PS3) to 1.1 ms (PS4) a frame for it. At rest
  the page layer still moves alone at 30: in Zen that's mostly 17 ms frames
  with an occasional 33, not the stall.
- **Firefox gets WebGL2, not WebGPU, for the GPU backgrounds** (the
  author's second Zen profile, 2026-10-03: PS3 still dipped). On this
  machine Zen draws 2D canvases on the GPU (over GL, on the CanvasRenderer
  thread, which also runs WebGPU), and with that a WebGPU canvas stalls
  66–130 ms every second or so. Zen uncapped, focus mode on the reader
  project, frames over 33 ms in 5 s: PS3 22 and 46 on WebGPU, 0 on WebGL2
  (178–205 fps); PS4 2–5 against 0. Chromium keeps WebGPU. Zen doesn't let
  a page time WebGL2 on the GPU, so its readout has no GPU time now.
- **A frame-rate cap** (author: the screen is 240 Hz): the GFX menu's
  Frame rate, 60, 120 or Screen (the default, so nothing changes unless
  picked). A frame is skipped when the next isn't due; playback reads the
  clock, so the same moments are shown, fewer of them. Measured uncapped:
  61 and 117 frames a second drawn against 166.
- **GPU time in the readout**: WebGPU `timestamp-query` (the first pass's
  start, the last's end, read back one frame at a time) or WebGL2's
  `EXT_disjoint_timer_query_webgl2`; where neither exists the menu says the
  browser doesn't let a page time the GPU. PS3's background is 0.2–0.3 ms
  of GPU in Zen, so the GPU's work was never the lag.
- **A scene with nothing over its backdrop (PS4) draws it straight to the
  screen**, dithered as the copy was: no offscreen image and full-screen
  copy. GPU time 0.171 → 0.128 ms in Chromium, 0.151 → 0.032 ms in Zen. The
  two ways agree within 1/255 (the dither lands once instead of after an
  8-bit image), checked on WebGPU (Zen) and WebGL2 (both).
- **Dot grids painted once** (`skins/util.ts` `dotGround`): Minimal's and
  amp's thousands of dots a frame are an image, copied while the camera,
  zoom and size stay as they are. Exact, because the grid isn't cleared
  between frames: the image holds the whole device pixels only, and the
  edge pixels the canvas only partly covers (its width is fractional,
  857.05 css px) get what they always got, painted on the grid (the base
  over the edge strips, the dots that reach them). A clip there would
  differ by up to 4/255, so the strips are filled, not clipped. Aqua keeps
  its own drawing: its pinstripes meet inside a pixel at fractional
  scaling, so its base isn't opaque in one go. Minimal 6.6 → 4.1 ms a frame,
  amp 6.4 → 4.6 (headless Chromium on the GPU, uncapped).
- **The engine's floor** (Barebone with every drawing call a no-op): 2.27
  → 2.10 ms. The skin guard's snapshot before every hook is a plain array,
  and `render.ts` keeps the font in force on its side (through save and
  restore, reset when a resize resets the canvas), so reading it doesn't
  ask the canvas and setting the font already set is skipped. A font the
  canvas refuses is never remembered.
- **The grid's pane no longer clips the canvas to its rounded corners**
  (found in the author's Zen profile, 2026-10-03: PS3 still dipped). In
  Firefox a canvas under a rounded clip (`.pane`'s `border-radius` with
  `overflow: hidden`) is redrawn through a mask every frame it changes, on
  the same thread (CanvasRenderer) that draws the 2D canvas and runs
  WebGPU, which sat 60–80% busy. Bisected in Zen: Minimal's stylesheet,
  then its variables, to `--pane-radius`. Now the pane doesn't clip while
  the grid's background is on the canvas (`#grid-wrap` still clips, square),
  the canvas clears its own pixels outside the pane's inner curve at the
  end of each frame (`render.ts` `cutCorners`), and the header gets the same
  curve (or its own, as XP's, if larger). Zen, uncapped, focus mode on the
  reader project: Minimal 73 → 274 fps, PS3 20 → 196, Tahoe 52 → 237. A GPU
  background under the grid (PS2) can't cut its corners, so the pane keeps
  its clip then (PS2 was 184 fps there already). The picture: the grid
  pane's screenshot against the commit before, corners only, matches except
  the curve's own pixels, about 5–10 a corner (the canvas smooths the curve
  a little differently from the browser's clip; up to 58/255 on Big Sur's
  dark arc); Minimal, PS3, Aqua and Seven match there too. The minimap's
  shadow, where it reaches a corner, is now cut square by `#grid-wrap`
  instead of round. Measured again with the canvas on the GPU (below):
  the clip put back, Minimal 176–259 → 71–74 fps, PS3 155–182 → 70, Tahoe
  292–308 → 52–54 with 12–13 frames over 33 ms.
- **Tools:** `tools/bench.mjs --headless` (Zen's own headless; Chromium
  with the GPU flags) for sessions with no terminal window; headless Zen
  is told to draw 2D canvases on the GPU as a window does here (by default
  it paints them in software, a different cost: the first numbers above
  for the clip were measured that way), and the bench counts frames over
  33 ms; `--pre '<js>'`
  to switch a part off (what it leaves in `window.__benchOut` is printed),
  and which backend drew the background, with its GPU time.

Measured and not done:
- **One GPU device for both layers:** a skin uses one layer or the other,
  never both, so it would only save a device when switching PS2 ↔ PS3.
- **Pipelines built ahead:** switching to PS2 the first time costs 50–83 ms
  with GFX off (the skin's restyle) and about 100 ms more with WebGPU in
  Chromium, once per skin a session; nothing measurable in Zen. Built
  ahead, the first frames would draw PS2's canvas background, itself
  costly.
- **`#page-bg` hidden while the GPU draws:** no change in Zen; headless
  Chromium's compositor is software, so it can't say.
- **No redraw at all while nothing moves:** at rest the grid still moves
  (a live belt's dashes run off the clock while paused), so stopping the
  15-a-second redraw would freeze them.
- **Reusing gradients:** the heavy skins' gradients cost filling pixels,
  not making them (amp 6.23 → 6.15 ms reused, wii 6.14 → 6.22); without
  gradient fills amp is 1.7 ms lighter, wii 2.0, Seven 0.8; without
  shadows Aqua is 1.0 ms lighter. Cheaper means a different look: the
  author's call per skin.
- **Focus mode's dimming and zooming in Zen** (the author asked for these
  three to be tried; Zen on the GPU, Follow on, PS3, 15–20 s). A gliding
  frame costs 8.3–8.6 ms against 5.5–5.8 still, and the grid's drawing is
  most of the difference (grid off: 4.5 against 3.3). The veil drawn as a
  page element instead: nothing to win, as the veil drawn not at all is no
  faster. The scene drawn at a camera that stands still on a picture, shown
  moved and scaled: PS3's gliding frames 8.5 → 14 ms, Minimal's the same;
  drawing on the picture was no cheaper (9.4) and copying it to the screen
  cost about 5 ms more, so taken out. A still layer and a moving one: under
  the veil something changes in 99% of frames (a box of 15–21% of the
  canvas), so a still layer would almost never be reused; drawing only the
  regions that changed is step 9's job.
- **Synthwave on the GPU:** its background is 1.2 ms a frame in Chromium
  (the sky is already one image; the floor about 50 lines), and Zen holds
  60. A GPU layer costs 0.3–0.5 ms of its own: not worth a medium step now.
