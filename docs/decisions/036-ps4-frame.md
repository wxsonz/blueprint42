# PS4 takes the PS3's window frame

*2026-09-28* · **Status:** Accepted

- Files and machines have no pane: a faint outline (brighter when active)
  and the title over a thin white rule; their storage, stations and
  function box sit on the background, the function box alone a panel. The
  PS4 keeps its own touch: on the active window the rule is the console's
  light bar, glowing blue. The translucent title strip, drop shadow and
  thick white focus border are gone.
- PS4 colours from its system screens (Friends, Communities, Remote Play):
  royal blue (#0c4ad8 top left, #0638c4, #041f8c bottom right) crossed by
  a few broad soft streaks of light, no dust. Where the PS3 puts dark panels
  inside its frames, the PS4's are lighter see-through blue with thin pale
  edges (storage, stations, the function box, panes, the duel and feed),
  as its content cards are. Values in flight are its input field: dark
  navy with a white edge. Focus is a crisp white border; the header and
  the play bar are set off by pale hairlines.
- The PS4's streaks became a Möbius strip: the real surface (a band that
  turns half over going round), tilted and in perspective, bigger than the
  view so only its sweep shows, shaded only in darker and lighter blues by
  how each part faces the light (|facing|, since the strip has one side),
  with a pale rim along its single edge. Painted once per size into the
  backdrop, at the screen's sharpness. Static until the author settles how
  it should move.
- The Möbius strip moves: it keeps turning (tilt and heading drift) and
  spinning (the band rolls along itself, so the twist travels), and frames
  itself on every repaint to the rule of thirds: scaled to bleed past the
  top and bottom, centred on the left third line, drifting slowly between
  the upper and lower thirds, the right two thirds left open (as the PS4
  wallpaper leaves room for its logo). Stateless in time; painted at half
  size with a 1.4 px blur (which also hides the shading steps between its
  quads) at most 24 times a second, over the cached sky.
- The PS4's duel and feed follow the PS3's pattern with the PS4's own
  trophy notification: a dark charcoal box with large rounded corners and
  no border, a square tile with a thin edge holding the icon, the title in
  white SST and grey beneath. The duel's value box is the PS4's input field
  (navy, white edge), as values on the grid are.
- PS4 belts are its progress bar: a flat track, and on live belts white
  fills running along it the data's way. The gimmick: controller symbols
  (○ □ △ ✕, at random) burst out behind each fill as it moves, drifting off
  the line, turning, fading within about a second; pale outlines, in
  keeping with the skin's plainness. Stateless: symbols spawn at a fill's
  head on a fixed tick (some ticks skipped, so they come in bursts), so each
  one's place and age follow from the time.
- The PS4's sky follows its welcome screen instead of the flat royal blue:
  azure (#0a5fae) at the top, bright royal blue through the middle, sinking
  to near-black navy (#010a2e) at the bottom, a soft glow in the middle. The
  Möbius strip is now grey laid over it in soft-light, so it is literally
  lighter and darker sky; the grid's pane is see-through so the sky shows
  untinted.
- The Möbius strip is replaced by what the PS4's welcome screen actually
  shows (studied from the author's video, frames at 2 fps with the median
  frame subtracted so only the moving parts remain): crescent ribbons, thin
  at both ends, each a slice of a circle about the screen's size, made of
  three strands that slide and sometimes cross (a wide soft lighter sheet,
  a thin bright edge, a darker band). One sweeps across in a slow arc over
  about 9 s, entering and leaving by the edges, thickness breathing, fading
  in and out; a second runs half a pass behind. Grey in soft light (only
  lighter and darker sky); half size, soft strands blurred, bright edges
  sharp, at most 24 times a second. Cheaper than the Möbius (~2.7 ms
  headless against ~4.7).
- The PS4 is full-bleed too: its sky and ribbons are the whole page's
  background, one canvas behind every panel, the grid clear over it.
- The crescents were faces of one twisted triangular prism (the author's
  finding): the background is now that prism, one at a time, thin at head
  and tail and thick in the body, sweeping across on a slow arc in about
  12 s, spinning as it goes and fading in and out. Only faces turned to the
  viewer are drawn, each a flat opaque shade of the sky just behind it (the
  sky's gradient is worked out per quad), with the ridge between two
  visible faces as the bright line. No offscreen canvas, blur or soft-light
  blend any more: ~0.7 ms a frame headless against ~2.7 for the ribbons.
- The prism, corrected from the author's closer look: its head and tail are
  flared (bigger than the body) but faded out, so they never show; of its
  faces one is the sky's top colour, one the sky's middle (all but melting
  in near the middle), the third not drawn; one edge is a thick line of the
  top colour. Each face is now a flat shape per visible stretch with one
  fade gradient along the chord, which ends the banding of per-quad shading
  and makes it far less readable. ~0.2 ms a frame headless.
- The prism is longer (an arc of 1.9–2.4 rad on a circle beyond the view,
  so it runs across the whole screen), and its faces are glass instead of
  culled: each is one see-through shape the whole length, the third fainter,
  layering where they overlap. Culling cut it into crescent-like creases
  and made the edge line flicker as its visible stretches switched on and
  off segment by segment; the line now runs the whole length too.
- The prism read as fading in and out rather than moving: it now travels
  in and out past the edges (a wider sweep, fading only in the first and
  last 15% of a pass), and its twist varies: a steady turn plus two waves
  of extra turn travelling along it at their own speeds and ways, the spin
  speeding and slowing, each pass with its own rates; head and tail flare
  by different amounts and the body's thickness swells and eases along it.
- The prism's placement is no longer random: each pass takes one of ten
  placements read off the author's video (enter, middle and leave points;
  the arc is the circle through them), never the same twice running, and
  slides a little along it. Its twist is capped (at most 1.6π of turn along
  its length, the travelling waves scaled down to fit) so turns never bunch
  into clumps and it reads as a crescent most of the time. The ends now
  fade by angle around the arc's circle (a conic gradient), which follows
  the curve; the fade along the chord cut strongly bent ends off hard.
