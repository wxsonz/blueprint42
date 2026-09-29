# the PS2 boot screen, animated

*2026-09-28* · **Status:** Accepted
- **Decision (author: make the PS2 dramatic with the menu's dancing lights,
  light trails, the era's stacked-frame blur; then: sharp trails as in the
  "Sony Computer Entertainment" screen, low-res fog, glass cubes):** The PS2
  background is that boot screen, animated:
  - Black space with a blue fog in the middle: two tiny value-noise
    textures (96×60) scaled up and drifting against each other.
  - Six glass cubes tumbling, sharp (author: not low-res, and fake the
    reflection). Faces are sorted back to front. Far faces are barely
    there; near faces get a dark glass gradient lit by where they point
    and a reflection band (soft, with a sharp core) whose place follows
    the face's angle, so it slides as the cube turns. No outlines, and
    kept dim (author: edges and brightness were too much).
  - Parallax (author): each layer follows the grid's pan by a fraction
    (fog 3%, lights 7%, cubes 10–22% each by depth) and zooms by a small
    power of the grid's zoom (fog z^0.12, lights z^0.25, cubes z^0.35).
    Cubes wrap around as you pan; the fog and lights ease to a stop
    (tanh) so they never leave the screen.
  - Four coloured lights (red, green, violet, blue) sweeping through in
    3D, each with a glowing head and a hairline trail drawn at full
    resolution.
  - It's stateless. A trail is the light's own path sampled back in
    time, so it looks the same at the idle 15 fps, at 60 fps, and in the
    picker's still preview. Reduced motion freezes it. It costs about
    0.5 ms a frame.
  - The towers and Earth glow are gone. Machine windows are smoked (80%)
    instead of solid, so the lights pass behind them; storage and
    stations stay opaque under text.
- **Decision (author: too much blue; the PS2 is darker, with its iconic
  blue):** The chrome and canvas are black and graphite with white-grey
  text. Blue (the logo's: royal `#1a1ad6` to `#2f7cff`, lines in
  `#3f6bff`) is kept for the corner lines, the active window, pressed and
  primary buttons, the cursor and selection. The fog is darker and
  thinner. The Earth glow under the page is gone.
- **Fix (author: zoomed far in, the cubes shift oddly):** Parallax used
  the camera's corner in zoomed pixels, so zooming changed the offset and
  the cubes wrapped. It now uses the world point at the view's middle,
  in px at zoom 1, so zoom only scales the layers.
- **Fix (author: zooming out still drifts):** Zoom is anchored at the
  mouse, so zooming far out moves the view's middle across thousands of
  world px. The parallax now adds up how far the grid actually moved on
  screen, frame by frame; a zoom moves it at most the mouse's distance
  from the middle. Each layer's zoom is clamped to 0.7–1.8×.
- **Decision (author: data in flight should leave a light trail):** A new
  optional skin hook, `Skin.trail(dc, pts, kind)` (`Theme.trail` in the
  kit), gets the stretch of path that data just travelled, oldest point
  first, and draws under the data. The engine passes it for:
  - a call's argument train along its belt (about seven cells behind the
    tail);
  - a return riding back;
  - a write's pulse along its wire;
  - reads and writes inside a machine.
  Only the PS2 sets it for now: a white-hot hairline over a wide faint
  glow in the lights' colours (blue for arguments, teal for returns),
  fading toward the tail, with a glowing head. Skins without it draw
  nothing extra.
- **Decision (author: where would the PS2's grille go?):** On the right
  edge of each machine: the console standing up, with its raised side
  block and two columns of short vertical slits. The machine's title bar
  gets the front bay's two lights: power (green while active) and eject
  (blue, as on the hardware).
- **Decision (author: still too much blue; Sony uses it very sparingly, so
  not on everything active):** What's active or pressed is silver: live
  belts, active window corners, the progress line, pressed and primary
  buttons, switches, cursor, selection and argument trails. Blue is left
  only where Sony put it: the logo, plus the eject light and the boot
  screen's fog and lights (the reference).
- **Decision (author: blue only for actual lights; muted objects with the
  console's grainy texture):** Blue is left only on real lights: the
  eject light, the boot screen's lights and their fog, and the trails.
  The printed logo keeps it too, as on the console's top. Pointers and
  parameters are muted greys (lilac-grey `#b3a8c4`, `#c4c4cc`).
  Surfaces get the PS2's matte grain:
  - on the canvas, a 128 px tile of light and dark specks laid over
    windows and cards, anchored to each surface so it moves with it;
  - in the chrome, a faint SVG `feTurbulence` layer on the bars, pane
    heads, buttons, status line, duel, return card and inspector.
- **Decision (author: grain too fine and brightens everything; focus
  should be the lights flashing, not an outline; bring back a blue
  light; data logistics can be blue; no glowing borders):**
  - Grain: coarse 2 px specks, mostly dark pits (canvas tile, and a
    black-only SVG noise in the chrome), so it textures without
    lightening.
  - Focus: windows lose the bright corner outline. The front-bay lights
    carry it. Idle is a dim red standby light. On becoming active, power
    (green) and eject (blue, glowing) flash quickly for about 0.7 s, then
    stay lit.
  - The play button carries a small blue light while playing.
  - New kit option `Theme.flow`: the colour of data in motion (live
    belts, their arrows, argument plates), falling back to the accent.
    The PS2 sets it, its pulses and its argument trails to its blue.
  - PS2 cards draw no glowing borders: a hairline, and plates keep their
    colour.
- **Decision (author: buttons should be solid, like real buttons, not
  transparent over the grille):** PS2 buttons are solid black-plastic
  keys: their own graphite face, a lit top edge, a shadow under them.
  Pressed and primary (playing) buttons sink in with an inset shadow. No
  grain on buttons.
- **Decision (author: the white grain looks unnatural; remove the corner
  edges):** The canvas grain is dark pits only (no light specks, which
  read as dust). The right-angle corner lines are gone from machine
  windows and from the page's panes; windows keep a faint hairline.
- **Decision (author: storage, stations and the duel should follow the
  window, but more minimal; the progress bar as a trail light that lights
  the title light at the end, one light, true green; then the same light
  on the belts):**
  - The PS2 `panel` hook: graphite with the grain, a hairline edge, a
    short ridged head, and a small grey Orbitron title. The duel, return
    card and inspector get a ridged title and hairline borders through
    their CSS variables.
  - Progress is a light running along a hairline: a hot core fading
    back over a blue glow, with a glowing head, sweeping every 1.6 s.
  - The title bar has one light, the power light, in true green
    (`#2ee048`). Idle is dim red standby; it flashes on activation. On
    a function box it flares each time the progress light reaches the
    right end. It knows it's in a function box because the kit draws a
    window's frame (which records its kind) right before its title bar.
    The eject light is gone.
  - PS2 belts (`Theme.belt`): a grey hairline. A live belt is a dim
    blue line carrying progress-style lights (one per ~360 px, 150 px
    tails) in the data's direction.
- The PS2 duel takes the window's look instead of the shared one: a ridged
  title in small Orbitron with the one green power light (it flashes when a
  new exchange comes up), square hairline cards with ridged role strips, and
  the travel track as a hairline that the data rides as a trail light (blue,
  teal for returns) with a plain chip under its head. The track gets its
  progress as `--p`, which other skins ignore.
