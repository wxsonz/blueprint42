# speed, zoom out, lenses

*2026-09-28*

- **Finding:** under load, most frame time is the browser painting canvas
  pixels, not JavaScript (measured: 7.5 fps at 4× CPU throttle on a 2×
  screen; 2.5× faster at 1×). Linux browsers often paint canvas in
  software.
- **Decision:** adaptive sharpness. The canvas starts at the screen's pixel
  ratio. If frames run slow for a second while something moves, it paints
  at a lower ratio (2 → 1.5 → 1.25 → 1 → 0.75, with a one-time note), and
  it goes back up when there's headroom. Measured under the same load: 7.5
  → ~37 fps.
- **Decision:** don't draw what's off screen (machines, modules, belts,
  walls). Remember fitted and cut text. Draw the timeline strip once per
  trace and skin. Synthwave glows use wide faint strokes, not `shadowBlur`.
  Paused and still, redraw at ~15 fps.
- **Decision (author):** zoom out to 2%. Far out, a machine is just its
  shell (no text); backgrounds drop their per-cell detail.
- **Decision (author's idea):** lenses instead of a zooming camera. When a
  call or return travels to a place off screen, or a statement writes into
  memory another machine owns (a static, a caller's local), up to two
  small live views of that far end appear in the pane's corner. Fast mode's
  camera still only pans.
- **Decision (2026-09-28, the author found Focus dimming slow):** measured
  with the paint forced to finish, a dimmed frame cost ~2× a plain one. The
  attention marks' `shadowBlur` was most of that, then the veil and the
  full insides of machines under it. Now attention marks use a wide faint
  stroke instead of blur (every skin), machines outside the scene draw
  compact while veiled, Synthwave's sky and sun are cached per size, and
  lenses repaint at ~15 fps. Dimmed now ≈ 1–1.35× plain.
