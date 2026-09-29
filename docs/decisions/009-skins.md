# skins instead of one Factorio-style look

*2026-09-27* · **Status:** Accepted

- **Decision:** The whole app is skinnable, like old media-player skins. A
  skin (`proto/src/skins/<id>.ts` + `proto/src/styles/<id>.css`) draws every
  canvas entity and restyles the chrome and the editor through CSS
  variables. Geometry is shared, so switching skins never moves anything.
  Four ship:
  - **Amp**: a late-90s media player with LCDs, a spectrum analyzer and a
    playlist-style frame.
  - **Classic**: a 90s desktop with windows. The running function's title
    bar is active, statics are floppy disks, pointers read like links, and
    stale code is "(Not Responding)".
  - **Aqua**: early-2000s gloss with traffic-light run states, gel tubes and
    a pinwheel for stale code.
  - **Minimal**: a plain baseline.
- **Why:** The author found a Factorio imitation off-putting and a plain
  minimal UI characterless. Skins give character without committing to one
  look. The skin names are generic on purpose; none names a real product.
- **Also:** Nodes are now 4×3 cells (was 3×3) so title bars fit, columns
  are 7 cells apart, and UI copy uses neutral names (function, call, frame,
  pointer, static) because the factory words don't fit every skin.
