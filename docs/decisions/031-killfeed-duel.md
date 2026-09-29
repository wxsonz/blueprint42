# kill feed, the duel, Barebone

*2026-09-28* · **Status:** Accepted

- **Decision (author):** Transfers between functions get a kill feed
  (top-right of the Blueprint pane). Each call, return, and write into
  memory another function owns is one row: a coloured icon with the
  function's initials, an action icon (➜ call, ↩ return, ✎ write), and a
  short payload written the C way (`int fd = 0 · t_gnl * buf = {…}`,
  `t_gnl_status GNL_LINE_READY`, `bufs = …`). Newest on top, older rows
  fade; click a row to jump there. It's built once per trace and redrawn
  only when the newest row changes.
- **Decision (author):** The corner lenses become the duel. When a
  transfer's sender or receiver is off screen, an overlay pops up with the
  sender on the left and the receiver on the right. Each view slides in
  from where its machine really is, its camera starting on the whole
  machine and gliding to the spot. The payload crosses from left to right.
- **Decision (author):** A Barebone skin for speed: flat fills and 1 px
  lines, no gradients, glow, blur, shadows or floor pattern, belts that
  change colour instead of animating, system fonts. Measured at 2× with
  the paint forced to finish: 5 ms a frame (Minimal 6.4, Tahoe 11.7, Amp
  17.4).
- **Decision (author):** Barebone is black and white: no borders or glow
  anywhere (surfaces differ by a shade), and colour only where it means
  something: the running machine and live belts (blue), pointers,
  returned values, errors, and a value that just changed. Feed icons are
  gray there; only the action keeps its colour.
- **Decision (author):** The duel viewer sits on a black backing, with a
  heavy black edge around each view, so the busy scene behind doesn't
  blend into it. The frame is drawn under the live view (some skins paint
  it solid).
- **Decision (author: the live views "lack attention"):** The duel shows
  what's happening as code, not as more scene. For a call: the caller's
  line with the call marked, and the callee's signature with the values
  that arrived. For a return: the return statement with its typed value,
  and the caller's line with the call replaced by that value. For a
  write: the writing statement, and the owner's variable going from old
  to new. A big verb (CALLS / RETURNS / WRITES INTO) sits in the middle,
  with the payload chip crossing. It's a DOM overlay on a black backing
  that stays up ≥1.5 s, and it's cheaper than the two live views it
  replaced.
