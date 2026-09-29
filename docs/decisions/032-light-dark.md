# light and dark modes

*2026-09-28* · **Status:** Accepted

- **Decision (author):** Skins whose originals had both looks get both:
  Barebone (dark ↔ light), Windows 8 (dark ↔ light), macOS Big Sur and
  macOS Tahoe (light ↔ dark). The picker lists one entry per skin; a ☀/☾
  button next to it appears only when the skin has both, and the chosen
  mode (`ftb.mode`) carries over to the next skin that has both. A
  variant is its own skin (`variantOf`, `mode`) built from the same theme
  builder, with its own stylesheet. Skins whose originals had one look
  (XP, 7, System 7, OS 9, Aqua, Leopard, Yosemite, Game Boy…) stay single.
- **Decision (author: Factory title bars unreadable, fps drops on Focus
  zoom):** Factory's title sits on dark steel under a thin hazard band
  (the stripes used to run under the text). Its floor was ~10 of 14 ms a
  frame while zooming (thousands of tread marks, then a screen-sized
  scaled pattern). It's now plain geometry: plate rectangles, one seam
  path and corner rivets, and it costs ~1 ms. Running machines and lamps
  glow with halos, not blur. Measured while zooming, paint forced: 13.9 →
  4.9 ms.
- **Decision (author: the overlays were vague):** The duel opens with a
  plain sentence ("get_next_line calls gnl_fill_line with fd = 0, …",
  "gnl_fill_line returns 0 to get_next_line", "gnl_consume changes
  get_next_line's bufs: … ➜ …"), and each card has a role title (CALLER
  / CALLED / RETURNING / WRITER / OWNER) with a short line on what that
  side is doing. Focus mode's return card is rewritten as statements:
  ① it was called with (typed), ② it gives back (typed, or "nothing
  (void)"), ③ it changed, through its pointers (`buf->len  23 ➜ 0`, one
  big line each, or "nothing it can reach changed"), ④ left as they were.
  While that card is up, the duel stays hidden.

- **Decision (author: the statement-style return card was harder to
  read):** Back to a side-by-side comparison, but the changes can't be
  missed: a table of everything the function could reach, with columns
  *before (when called)* and *after (now, at return)*. A changed row gets
  an accent band, the old value struck out, `➜ new` in bold and a
  CHANGED tag. Rows that stayed the same are quiet and say "same". A
  pointer argument says "same address · what it points at is below", and
  a value argument says "a copy: the caller's own is untouched". "Gives
  back" sits on top and a count sits at the foot. (Bug found on the way:
  `#duel` had `display: grid` and no `[hidden]` rule, so hiding it did
  nothing and it could sit behind the card.)
- **Decision (author: Barebone dark too dark; Minimal wants light):**
  Barebone dark is charcoal now (`#161616` floor, `#222`/`#2b2b2b`
  cards, softer greys for text) instead of near black. Minimal becomes
  `minimalOf(dark)`, with a light twin `minimal-light` (paper `#f5f6f8`,
  white cards, the same blue accent darkened for contrast) and
  `styles/minimal-light.css`.
- **Decision (author: icons in the skin list):** The `<select>` is now a
  button plus a popover grid. Each skin shows a 72×44 preview that the
  skin itself draws (its `background` and one `node` on a small canvas,
  cached as a data URL), so a preview can't drift from the real look.
  Also shown: the name, a ☀☾ mark if it has both modes, and its blurb.
  Only base skins are listed; the ☀/☾ button still picks the mode, and
  picking a skin keeps the stored mode. It closes on Escape or a click
  outside.
- **Decision (author: Factory titles still unreadable; tiny fonts in Game
  Boy, System 7, Amp):** Audited every skin headlessly, measuring the real
  x-height of each visible DOM text, not its px size. Fixes:
  - Text never sits on stripes. Factory's panel titles are steel with the
    hazard band above them. System 7 and OS 9 cut a plate out of the
    stripes for the title, as the real Mac did (`--ptitle-plate`), and do
    the same for the pane-head info.
  - VT323 draws small for its px size. `base.css` multiplies every mono
    size by `--mono-scale` (1.4 in Amp, Game Boy and System 7), and the
    overlays' labels and notes use `--label-font` / `--label-scale`.
    Amp and Game Boy use VT323 there instead of their tiny pixel UI font.
  - System 7 uses VT323 on purpose (Monaco isn't there on Linux, and the
    fallback was tuned for nothing).
  - On the canvas, Game Boy keeps Press Start 2P for titles (13 px and
    up) and draws smaller labels in VT323. System 7's canvas mono is
    VT323 at 1.35×. Amp's caption strips grow from 8 to 10 px.
- **Decision (author: the canvas zoom readout is useless; wants a zoom
  for everything):** The header has an app zoom (`− 100% +`, click the %
  to reset). Ctrl+wheel anywhere, the canvas included, and Ctrl+= / − / 0
  step through browser-like levels (50–300 %), remembered in
  `ftb.zoom`. It's CSS `zoom` on `<html>`: the canvases measure their
  boxes, so they stay sharp and hit-testing is unchanged. `#app`'s
  height divides out the zoom because viewport units ignore it, and the
  context menu divides it out of its position. The page can't read or
  set the browser's own zoom reliably, which is why it's our own. The
  plain wheel still zooms the camera, and its % readout is gone.
- **Decision (author: the duel ignores the skin):** The duel is built from
  the skin's own variables now, with nothing hard-coded:
  - the sentence is the skin's title bar (`--ptitle-*`, with the stripe
    plate);
  - the frame is the skin's panel (`--panel-*`, painted by `::before`
    over `--bg`, so translucent and gradient panels still hide the
    canvas);
  - the cards use the skin's field borders;
  - the role strip, track and chip take panel and editor colours.
  
  Skins can tune it with `--duel-say-size` (Game Boy uses 10px). Checked
  headlessly in all 23 skins, including title contrast.

  Fixed on the way:
  - Barebone light's `--ptitle-fg` was the dark skin's white.
  - A duel that began fading out stayed invisible if the same event came
    back.
- **Decision (author: Aero and Liquid Glass don't look right):** Both
  drew opaque boxes. `kit.ts` `glassBehind()` now shows the skin's own
  wallpaper through a window. The wallpaper is fixed to the screen, so
  what's behind a window is the same pixels of the cached backdrop:
  - a blurred copy is made once per size;
  - each window draws only its own rectangle from it;
  - with `lens > 1` it's magnified about the window's centre.

  The two skins:
  - **Windows 7:** frames are blurred Harmony under a blue tint, with a
    top shine, diagonal streaks and the dark and white double edge. The
    DOM chrome became Aero too: the page is Harmony, the top bar and
    playbar are glass (a light blur over the static wallpaper), and each
    pane has a 6 px glass frame. Costs about 0.5 ms a frame.
  - **Tahoe:** windows are clear glass that bends the lake (4 px blur,
    1.07× lens), with a lensing edge (light top-left, shade bottom-right)
    and the content on a lighter frosted sheet. File walls stay plain
    tint, since they're big and the lens there cost for little. The lens
    costs about 3 ms a frame at 2× DPR (scaled draws leave the fast copy
    path); the adaptive resolution absorbs it.
- **Decision (author: Tahoe should be frosted, the way later releases
  toned Liquid Glass down):** Tahoe's windows are frosted glass: a 12 px
  blur, no lens, a whiter frost and a softer rim. It's also back on the
  fast copy path (the lens cost about 3 ms).
- **Decision (author: Windows 7 put the skin list behind the viewer):**
  The Aero blur (`backdrop-filter`) made `#top` its own layer, below the
  panes that come after it. `#top` now sits at `z-index: 30` for every
  skin.
- **Decision (author: console skins; picked PS1–PS5, Wii, GameCube, N64,
  Switch, SNES and GBA):** Eleven kit themes in `skins/consoles.ts`, with
  Wii and Switch in light and dark. Each has a cached wallpaper and
  window chrome in the console's own style:
  - **PS1:** grey plastic with the △○✕□ buttons.
  - **PS2:** the boot towers, and dark blue glass.
  - **PS3:** the XMB wave, and the highlight band.
  - **PS4:** bokeh, flat tiles and the white focus.
  - **PS5:** the white focus ring.
  - **Wii:** white channels with the blue glow.
  - **GameCube:** isometric cubes.
  - **N64:** four-colour title bars and segmented progress.
  - **Switch:** a focus outline that breathes, and Joy-Con dots.
  - **SNES:** purple bars and the Super Famicom buttons.
  - **GBA:** a screen inside a bezel.

  Their chrome and editor CSS (about 110 variables each) is generated
  from about 20 base colours by a script that isn't kept in the repo.
  The files are ordinary CSS now. New web fonts: Rubik, Exo 2, Nunito,
  Jost and Chakra Petch.

  Checked headlessly: close-ups, duel title contrast (all at least
  4.6:1) and the text-size audit.
- **Decision (author: the skin list is overwhelming):** The picker groups
  base skins by family (`SKIN_GROUPS` in `skins/index.ts`): Simple,
  Windows, Mac, PlayStation, Nintendo, Just for fun. A skin missing from
  the groups still shows, under "Other".
  - The list has a sticky row of jump chips, a heading per group, and
    opens scrolled to the current skin's group.
  - `test/skins.test.ts` checks that every base skin is in exactly one
    group and that no light/dark twin is listed.
- **Decision (author: the Game Boy skin list is far bigger than
  others'):**
  - The picker read in the active skin's UI font, and Press Start 2P is
    about twice as wide as a normal font. It now uses `--label-font` /
    `--label-scale`, as the overlays do: Amp and Game Boy get VT323,
    the rest keep their UI font.
  - Line height divides out the label scale, since VT323's glyphs are
    short.
  - The open list's height went from 1577 to 1232 px in Game Boy and Amp,
    against about 1090 px in the other skins.
- **Decision (author: Windows 7 and Tahoe look "not quite right"):** Both
  are redrawn from references, not from memory.
  - **Windows 7** (MakeAero's generator values; NameThatUI):
    - a 9 px frame with 8 px corners;
    - "Sky" glass, `hsl(210 65% 52%)` at about 0.52;
    - a strong top shine (0.62), streaks at 0.22;
    - a dark outer line, a bright inner hairline and a soft inner glow;
    - caption buttons hanging from the top edge: 19 px tall, 1.45 : 2.3
      widths, square on top, with the split-gloss red close
      (`#e6a99f → #d16b5b | #cf4b34 → #d8654c`);
    - a dark caption on a white glow.
    
    The glass, tint and shine cover only the frame ring (`glassBehind`
    got a `hole`), since the client area covers the rest; that took the
    skin from about 15 to about 9 ms a frame (Minimal is 6–9).
  - **Tahoe** (WWDC 2025 notes via Zed #38233, lapcat, MacStories, OSXDaily):
    - toolbar windows have 26 pt corners;
    - the title is plain bold text by the traffic lights, not a pill;
    - the glass is a capsule of toolbar buttons at the trailing edge;
    - the window is a calm, near-solid frosted surface (0.9 over a 14 px
      blur);
    - content sits in flat grouped cards (white or 7% white, a hairline,
      12 pt corners);
    - the progress bar is a thin blue capsule;
    - the wallpaper is the default abstract wave (blue by day, violet by
      night), not the lake-and-mountains scene;
    - the DOM panes follow: the wave palette and 22 px corners.
    
    `liquidGlass` is gone.
- **Decision (author: pre-rendered textures for Aero's glass and shadow,
  as Windows does?):** Yes, as the real thing does.
  - `glassBehind` takes a `bake`: paint laid once on the cached blurred
    wallpaper copy. Windows 7 bakes its Sky tint and the reflection
    streaks into it. Like DWM's reflection texture, the streaks are fixed
    to the screen, so windows slide under them. Each window's glass is
    one image draw; only the window-relative top shine is still painted
    per window.
  - `kit.ts` `softShadow` draws a drop shadow from a pre-rendered
    nine-slice texture. It's blurred once per (radius, spread, colour),
    its inside is cut away so it never darkens glass, and it's drawn as 8
    image draws per window.
  - Measured A/B against the strokes and per-window fills: 9.0 against
    9.7 ms a frame, within noise, so it's no slower. The shadow is now
    real and soft instead of a 4 px line, at the same cost.
- **Decision (author, with a Windows 7 screenshot: the reflection runs
  the other way, and softly):**
  - The baked streaks now run from top-left down to bottom-right (about
    0.55 across per 1 down), wider and blurred when baked, so the soft
    edges cost nothing per frame.
  - The CSS glass on the top bar and playbar uses the same angle (61deg)
    with soft stops.
  - The caption glow is a pre-blurred white pill stretched behind the
    title, as Aero's is, instead of a hard white text outline. It's one
    image draw.
- **Decision (author: the Aero reflections should be much wider):** The
  baked bands are 60–180 px wide, 60–220 px apart, with an occasional
  thin bright one. They're softer (12 px blur, baked) and fainter (0.14)
  so the wide bands don't wash out the glass. The CSS glass (`--aero`)
  has matching wide bands.
- **Decision (author: Tab indents the front of the line, not at the
  cursor; show tabs and trailing spaces):**
  - Tab is CodeMirror's `insertTab`: a tab where the cursor is, or an
    indent when there's a selection. Shift+Tab is `indentLess`.
  - Both step aside in vim's normal and visual modes, where Tab isn't an
    edit.
  - Whitespace shows like vim's `listchars`: every tab as a faint `──›`,
    trailing spaces as dots on a soft red wash (norminette rejects
    them). Spaces inside a line stay unmarked.
  - The colours come from `--ed-ws` and `--bad`, so each skin can tune
    them.
- **Decision (author: the console skins should follow their real UIs, not
  just recolour):** Researched each console's interface and rebuilt the
  skins on it: the canvas chrome, and the app chrome through a shared
  `.sysclock` (a clock some consoles show; hidden unless a skin shows
  it). New fonts: M PLUS 1p (Rodin-like, the Wii), M PLUS Rounded 1c (the
  PS3 later) and Source Sans 3 (SST-like, PS4 and PS5).
  - **Wii**, from zuvv/WiiMenu's measured tokens:
    - the canvas: a light-blue lined desktop (`#eef7fa → #c9e2ec`);
      channels as glossy white bezels (14 px corners, `#ccd5da` edge)
      around a recessed screen; grey `#55636b` labels, centred; the Wii
      blue `#35b4e5` ring on the active one;
    - the chrome: the curved white bottom bar with a big grey clock in
      its hump, and round glossy buttons.
  - **Switch**, from Adam Argyle's recreation:
    - the canvas: Basic White (`#ebebeb`) or Basic Black (`#2d2d2d`);
      plain tiles; the selection is an outline 5 px thick and 5 px out,
      pulsing between `hsl(200 100% 50%)` and `hsl(200 100% 80%)`; the
      selected title in cyan;
    - the chrome: the user circle, time and battery top-right, round
      white icon buttons with coloured glyphs, and hint-bar rules.
  - **PS4**, from d4v1-sudo/Ps4-UI:
    - the canvas: `#0e6cc4` blue with light bands and dust; square tiles;
      a translucent white title strip (`rgba(255,255,255,.2)`); a 3 px
      white frame on focus; SST at light weights.
  - **PS5**, from khaledOghli/PS5_Online:
    - the canvas: dark over blurred, darkened game art; cards with 17 px
      corners; the white focus ring standing off the card;
    - the chrome: "Games · Media"-style text tabs (light, the active one
      bold) and the clock top-right.
- **Console skins, part 2:**
  - **PS3:** the XMB. Its backdrop colour follows the date, walking from
    this month's colour toward next month's, as the console's shader does
    (faquino/PlayStation-3-XMB's reverse-engineering notes: September is
    magenta, October amber). The clock sets `--xmb` so the canvas and the
    chrome agree. Items have no window chrome: soft dark panels, white
    rounded Rodin-style type (M PLUS Rounded 1c), the soft white
    highlight band on the active one, the date and time top-right.
  - **PS1:** the BIOS menu's big glowing purple-blue sphere (Drew1440's
    BIOS walkthrough) replaces the scattered △○✕□. They stay on the
    windows' buttons.
  - **PS2:** the chrome sits on the boot towers' blue haze, and the
    selection glows cyan.
  - **GameCube:** the IPL is black with a violet haze and one large
    translucent cube; the panes are glassy purple with lavender edges.
  - **N64, SNES and GBA** had no system UI to reference, so they stay
    hardware-inspired: plastics, button colours, the screen bezel, the
    N64 logo colours.
- **PS3 readability:** light months (amber, silver, gold) washed out the
  white chrome text. The gradient now starts only 12% toward white (it
  was 28%), and the chrome text carries a soft dark shadow, as the XMB's
  does. Audited all ten reworked console skins: duel titles are at least
  6.6:1, and no text has an x-height below 5 px.
- **Decision (author and friends: drop SNES, N64 and GBA):** Removed. They
  had no system UI to reference, and hardware colours alone read as a
  recolour. The Chakra Petch font went with the N64.
- **Decision (author and friends: the PlayStations don't feel right; use
  their console visual language and promotional graphics):**
  - **PS1**, after Teiyu Goto's plain grey console, Manabu Sakamoto's logo
    (a red P over an S in yellow, green and blue: `#e4002b`, `#f9b51b`,
    `#00a651`, `#0072ce`), the controller's four symbols, black jewel
    cases with ridged spines, and the black boot screen:
    - the page is the boot screen with the four colours faint from below;
    - the top bar and playbar are the grey console, with the logo stripe
      under the top bar;
    - buttons are like POWER and RESET, with a green power light on Play;
    - panes are black jewel cases with a ridged spine;
    - machine windows are bevelled grey plastic, with the stripe under a
      dark title bar and △○✕□ as its buttons.
  - **PS2**, after Goto's account (Kill Screen; SUPERJUMP): the thin blue
    logo on black is the Earth small in space; a jet-black monolith of
    stacked, squared-off ridges; lines bending at 90° like a laser
    through prisms; a blue gradient stand:
    - the canvas: black space, the Earth's blue from below, the towers far
      off; black slabs with ridged heads and electric-blue (`#2f8cff`)
      right-angle brackets; capital Orbitron titles; the progress bar is
      one line turning up at its end;
    - the chrome: ridged black bars with a thin blue rule, square outlined
      buttons that fill with the stand's gradient when on, and panes with
      blue corner brackets.
  - **PS5**, after Yujin Morisawa's design (Push Square, Creative Bloq): the
    DualSense's grip is about 40,000 tiny △○✕□ layered together, his
    Easter egg. The canvas and page carry that texture, barely visible
    (it's drawn above the backdrop's shading, or it vanishes). The playbar
    is the Control Center: a dark rounded tray with round buttons.
  - **PS4**, after the console (Tom's Guide): a parallelogram of matte and
    gloss split by a slim light bar, blue while working. The light bar
    runs under the top bar and under the active window's title strip.
  - **PS3** stays the XMB, which was already referenced.
- **Decision (author, with screenshots: PS1 feedback):**
  - **Flicker:** window buttons (△○✕□; Aero's and Metro's too) showed
    only above a width of 150 world units, right at a machine window's
    natural width, so rounding flipped them on and off. The threshold is
    now 110.
  - **Dither:** the PS1's 15-bit colour with a 4×4 ordered (Bayer)
    dither. The BIOS tiles are quantised to 5 bits a channel with a real
    Bayer dither once, when the backdrop is cached (`psDither`). A static
    Bayer tile is blended (`overlay`, 0.16) over the whole screen, which
    the GPU composites, with no per-frame filtering.
  - **Progress:** an old PC case's front panel: a green power LED, an
    amber disk LED that flickers while running, and a segmented load
    meter (green, then amber, then red).
  - **All grey, like the console:** the PAL BIOS's grey block background;
    grey panes and bars; a light editor with syntax colours to match.
  - **Buttons:** round and convex like the lid button; Play is green,
    and red while playing (`button.playing`, set by main).
  - **Logo and grille:** the logo carries the four PS1 colours, and the
    console's vent grille is the playbar's texture.
- **Decision (author: the dither is too much):** No more full-screen
  overlay; it grained the text too. The dither applies only where the
  PS1 would show it: shaded plastic and gradients (the top bar, the
  playbar's grille, the domed buttons), as a gentle Bayer layer blended
  into each element's own gradient (`background-blend-mode: overlay`),
  plus the BIOS tiles, which are dithered once when cached. Text,
  editor and flat panels stay clean.
- **Decision (author: the play light is backwards):** It shows the
  state, not the icon: red while paused, green while playing.
- **Decision (author: the PS1 duel doesn't match, the grille is noisy):**
  - The duel, the return card and the inspector get the windows' look:
    a dark title with the logo's four colours underneath.
  - The dark palette's pastels are replaced with colours that read on
    grey: calls in `#0063b3`, returns and values in `#00864a`, pointers
    in `#b0307a`.
  - The playbar is plain dithered plastic, and the vent grille is a
    slim, softer 8 px strip along its bottom edge, like the vent on the
    console's side.
- **Decision (author: PS1 storage and stations look off; put the grille on
  the machine instead):**
  - The kit gets an optional `Theme.panel(dc, r, head, title, live)`,
    used for a machine's storage (kit `frame`) and stations
    (`drawInterior`, through `SpritePalette.panel`) instead of the plain
    card and caption. The PS1's is bevelled grey plastic under a dark
    title bar with the logo stripe, like its windows.
  - `WindowStyle.frame` now learns the window's kind (`machine`, `module`
    or `node`), so the PS1 draws the console's vent grille down the left
    side of each machine, as if the function were the console's top. The
    grille is gone from the playbar.
- **Decision (author: the four-colour line is overused noise):** The
  logo's colours appear in only two places: the brand logo and the title
  bar of the active window (running or selected), where they mark focus.
  The top bar, pane heads, the duel, the return card, the inspector,
  storage and stations lose the stripe; they use plain dark or grey
  rules.
