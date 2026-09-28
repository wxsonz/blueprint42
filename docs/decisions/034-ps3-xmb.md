# the PS3 skin is the blue XMB

*2026-09-28*

- The PS3 skin drops the month-by-month colour (and `xmbColour`) for the
  classic blue: teal at the top sinking to navy. The author picked the blue
  variant as the one to go with.
- The background animates: a ribbon of lines and translucent sheets whose
  width swings through zero so it twists, and about 170 white sparkles
  drifting and twinkling (most near the ribbon, a few big bokeh), with a
  little parallax like the PS2's. The ribbon is soft, so it is painted at
  half size and at most 24 times a second; a canvas blur filter was tried
  and doubled the cost, so its glow is stacked wide strokes.
- Windows, storage and stations are plain frosted rectangles with a white
  hairline under the title (the settings pages' look); panes and panels use
  CSS `backdrop-filter` for the real blur, the canvas fakes it with a pale
  veil. The top and play bars are set off by white hairlines.
- The things you touch are jelly (pale cyan, lit from above, a soft rim, a
  shadow): values in flight and counts, the progress bead, the play button
  and the legend icons (the kit's flat icon, thickened and glossed, with
  its own lines pressed in).
