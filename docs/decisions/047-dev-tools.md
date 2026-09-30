# Dev tools: pictures compared, browsers driven

*2026-10-01* · **Status:** Accepted

- **Decision:** `tools/` holds scripts for maintaining the app, not part of
  it: `tools/pixcmp.mjs` (do two versions draw the same frames?) and the
  libraries it shares with later tools (`tools/lib/serve.mjs` serves any git
  ref from a temporary worktree; `tools/lib/browser.mjs` launches a browser).
  `playwright-core` is a dev dependency for them: it drives the system's
  Chromium (`/usr/bin/chromium`, or `CHROMIUM=`); it downloads no browser.
- **Why:** every picture or performance question this week needed a
  throwaway script, and a refactor could only claim "nothing changed" by
  eye. The objective "easy to diagnose, hard to break" (`docs/OBJECTIVES.md`)
  starts from a picture diff that can say so.
- **Deterministic frames:** the grid reads the time it is given (the leak's
  fall read the wall clock, so the same frame redrew differently), dev
  builds expose `__ftb.freeze()` so only the tool's frames reach the grid,
  each frame starts from the camera's home, and a trace server answer is
  recorded once and replayed to the other version (a program can differ run
  to run: glibc writes a random key into a freed tcache chunk). Canvases are
  rasterised on the CPU from the start (Chromium moves a canvas there itself
  after readbacks, and the two antialias differently). The working tree
  against itself: 0 differing frames.
- **Windows:** headless by default. A visible browser (a GPU measurement) is
  moved to the virtual desktop of the terminal the tool runs in (KDE, a
  one-off KWin script; no settings change).
- **Limits:** refs from before `__ftb.freeze` keep their own animation loop
  running during a comparison, so comparing against them is noisy (end of
  run frames, and some at fractional scales).
