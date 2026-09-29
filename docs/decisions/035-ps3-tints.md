# PS3, second pass: XMB lines and focus, theme colours

*2026-09-28* · **Status:** Accepted

- No parallax on the PS3 background: the wave and sparkles stay put while
  the grid pans and zooms (parallax is the PS2's thing).
- Lines are soft light: a faint wide glow under a thin white core, a soft
  chevron instead of an arrowhead, and live belts carry sparkles along in
  the data's direction. Progress is the install bar: a see-through capsule
  with a glossy fill, and a soft light sliding along it while running.
  Windows are frosting only (no outline), the title line fades out at both
  ends, and focus is a slowly breathing white halo (canvas and panes).
- Theme colours: `Skin.tints`, `tint(id, instant)` and `busy()` (all
  optional). The PS3 offers the XMB blue plus the XMB's classic colours as
  jelly swatches on the top bar, folded to the current one until pointed
  at. Picking one cross-fades over 2.5 s: the canvas lerps its sky and
  frosted fills (drawing at full rate while `busy()`), and the chrome
  follows through `@property`-registered `--xmb-*` colours that transition.
  The choice is remembered per skin in this browser (`ftb.tint.<skin>`);
  on load it applies without a fade. The real XMB picks colour from a panel
  that slides in from the right; the author chose the top bar for now.
- Third pass, for cost and taste: no blur anywhere in the PS3 skin (CSS
  `backdrop-filter` on panes, the duel, the inspector and the colour strip;
  canvas `shadowBlur` on the focus halo and title lines). Panes are a deeper
  tint of the colour instead, the halo is three faint widening rings, and it
  no longer breathes. Titles no longer glow. On live belts the data is a
  steady glow drifting slowly along (about 36 px/s, one per ~320 px), with
  sparkles winking in and out at random spots just off the line, each coming
  back somewhere else (seeded per belt, so belts don't wink in step).
- Fourth pass: files and machines lose their pane entirely; a window is its
  title and fading line, with its storage, stations and function box (the
  only tinted panel left) floating on the sky. Everything follows the theme
  colour: the jelly (value bubbles, counts, icons, the play button, the
  duel's chip and badges) is the colour lifted toward white, and the
  chrome's old fixed cyan (accent, cursor, selection, call colour) is a pale
  mix of it. The kit's sprite palette (memory strips, storage) and `casing`
  now read the palette live instead of copying it at load, so a theme that
  changes colours at run time is followed everywhere.
- Fifth pass: a file's or machine's frame is a barely-there outline (the
  title's line part of it) with one light running slowly around it, a
  fading tail behind (a lap in about 14 s; brighter on the active window;
  each window starts at its own point). The XMB is the whole page's
  background, not just the grid's: a skin can say `fullBleed`, and then
  main.ts paints its background on one fixed canvas behind every panel
  (`#page-bg`) and the grid clears its canvas instead of painting a floor,
  so the wave runs behind the editor and the bars too.
- Sixth pass: data (values in flight, counts, the duel's value box) takes
  the shape of an XMB item tile, the glass behind a package's icon: dark
  glass in the theme colour, corners well rounded but not a pill, a thin
  light rim, a gloss over the top half ending in a shallow curve, light
  pooling at the bottom. It replaces the pale jelly bead there.
- The PS3's colours include black (#1c1c20: charcoal at the top to black),
  listed after the XMB blue.
- The wave's light was a fixed pale blue; it is now the theme colour mixed
  78% toward white (following a fade as it happens), and the sparkles are
  plain white.
- The light looping around a frame is gone: the outline is lit by the wave
  instead, brighter where the ribbon passes near or behind it (from the
  wave's own shape, `ps3Wave`, shared with the ribbon, mapped from the grid
  canvas to the page). Each edge is one stroke with a gradient sampled
  along it.
- The PS3's duel and feed are trophy notifications: a near-black box with a
  thin light border inside a dark one, a dark square tile holding the icon
  (the feed's arrow; the duel's →, ↩ or ✎ by kind), the title in white
  Rodin and the values in grey beneath. They stay black whatever the theme
  colour, as the console's notifications do.
- The PS3 colour picker opens as one strip widening from the current colour
  (0.16 s, a light ease-out) with each drop fading in as the edge passes its place,
  and closes the same way in reverse (the far drops first). Pure CSS: each
  drop's place from the right (`--i`, the current one 0) orders it and
  staggers its fade; `--n` sizes the strip.
- A full-bleed background (`#page-bg`) is sized by the window
  (`innerWidth`/`innerHeight` × the view's pixel scale), not by its CSS
  box: the app zoom is CSS `zoom` on the page, and zoomed out to 67% the
  canvas had grown to 2239×1343 (2.2× the pixels, frames dropping to 33 ms).
  It is now the window's size at any app zoom, and the wave looks the same.
- The PS3 ribbon is painted at 0.3× (was 0.5×) and softened with a 0.8 px
  blur on that small copy before it is scaled up: no stair-steps when the
  window is resized, and softer, like the console's. The blur is cheap at
  that size; high-quality smoothing on the upscale was tried and tripled
  the cost, so the upscale is the default bilinear.
