# Fast at any size: work once per change, long work in slices

*2026-10-03* · **Status:** Accepted

- **Decision:** the plan "fast at any size" (`docs/OBJECTIVES.md`,
  2026-10-03): a frame costs what's on screen, not what's in the program,
  and a long run never stops the page. No picture changes: `tools/pixcmp`
  against the commit before, every skin: the samples 1,485 frames, 0
  differing; a 30-file project with every module open, 660 frames, 3
  differing in one run (PS4's top band at zoom 0.05, glyph by glyph), which
  didn't happen again in three more (every skin at that zoom, PS4 alone,
  each version against itself): a font loading at another moment, not the
  picture.
- **A scene per change, not per call.** `route.ts` `buildScene` keeps the
  last few scenes of each layout and builds again only when something it
  reads changes: the layout's revision (`Layout.rev`, bumped by every
  method that moves, opens, closes, pins or re-routes anything), the model,
  the trace, the folded and shut machines, and the live calls a frame adds.
  `computeScene` builds one for real (tests, tools). **Rule:** code outside
  `Layout`'s methods that changes positions, modules or routes calls
  `layout.touch()` (or uses `setRoute`). Dev builds check a kept scene
  against the layout now and then and report a change made without it
  ("scene kept" in the diagnostics) instead of drawing it stale.
- **Indexes instead of scans.**
  - `Layout.nodesOf` keeps each file's machines, rebuilt when a machine is
    added or removed; `fileCap` counts once per model.
  - Routing finds obstacles near a rect through a grid of cells, taken
    corridors by row, and an edge's verticals through a map: the same scene
    as before, field for field (checked against the old code on every
    sample and on generated projects of up to 60 files, open, half open,
    dragged, hand-routed, with live extras).
  - Belt crossings are found once per scene (`crossingsOf`, the same grid
    idea); a frame only picks the gaps its drawing order needs (`gapsFor`),
    the same points in the same order as trying every later belt.
- **An edit parses one file.** Each file's struct tags and typedef names
  are kept with its tree (an anonymous struct's key is unique to its
  tree), its type definitions too, and `bufferShapes` once per model (the
  inspector asked for it per variable, every step).
- **Long work in slices** (`src/slices.ts`): a generator that yields now
  and then runs in slices of about 8 ms between frames (`inSlices`), or at
  once (`allAtOnce`). `convertGdb`, `timelineOf`'s beats and
  `validateTrace` are generators underneath, with their old synchronous
  calls kept; a window's answer is read in slices too (`jsonSteps`: the
  stops a piece at a time; the same value as `JSON.parse`).
- **Windows ahead** (`main.ts` `windowTrace`). A window is converted, and
  what its first frames would work out once (each function's deepest
  stack, the return cards, the kill feed, the playbar's bars, the past
  values of the frames still there at its end), in slices before it's
  shown: the next one while this one plays, so playback runs on into it.
  The window shown and its neighbours stay converted, so going back is
  immediate. Caches of a trace are keyed by the trace (and the model), not
  by `traceRevision`, so they can be built before the trace is shown.
- **Row history:** a slot's past values are scanned from its text alone,
  skipping snapshots that share the frame (or the statics) with the last
  one, and the snapshots after a returned frame once (a frame id never
  comes back: both engines give every call a new one).
- **Measuring:** `tools/scale.mjs` (projects of any size generated in the
  OS temp dir; the pipeline, frames in the app, gdb runs, windows with the
  browser's long tasks); `tools/pixcmp.mjs --folders … --open` compares a
  project's pictures. The dev profiler times the whole frame (playbar,
  minimap, feed, inspector…, not just the paint passes) and keeps the
  slowest frame's breakdown (`__ftb.diag().worstFrame`).
- **Found on the way:** a trace server that exited while a session was
  closing left its gdb running (a quit waits behind a window being
  recorded, and the kill's timer doesn't keep the server up), and killing
  it then would have held the exit forever (a worker thread waiting on the
  reply pipe). `server/trace.mjs` keeps closing sessions until their gdb is
  gone, and at exit kills them and gives a waiting read its end.
- **Not changed:** recording under gdb (about 1,000 steps a second) is
  still the limit for long runs; ways past it are the author's call
  (OBJECTIVES, step 8).
