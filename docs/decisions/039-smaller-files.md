# the three biggest files split along their seams

*2026-09-29* · **Status:** Accepted

- **Decision:** `skins/consoles.ts` (2111 lines) became `skins/consoles/`,
  one file per console plus `common.ts` for what more than one uses.
  `render.ts` (1652) kept the view and drawing; playback timing and hosts
  moved to `playback.ts`, hit-testing and rects to `hit.ts`. `main.ts`
  (3167) kept the playback loop, input, skins and boot; its shared state
  moved to `state.ts`, and its UI to `panels.ts`, `playbar.ts`,
  `project-ui.ts`, `sample-ui.ts`, `feed.ts` and `page.ts` (DOM helpers in
  `dom.ts`).
- **Decision:** Splits follow the sections the files already had, never
  finer. Values another module reassigns live in `state.ts` behind setters
  (ES imports are read-only bindings). No behaviour changed: every moved
  line was compared with the original.
- **Why:** Most tasks touch one area, and reading a 2–3k-line file to change
  one skin or one panel was the main cost of working on the code. Files now
  stay under ~1200 lines, most under 600.
- **Known cycle:** `panels.ts`, `playbar.ts`, `project-ui.ts` and
  `sample-ui.ts` import functions from `main.ts`. Their top level only
  declares things, so the cycle is safe; keep it that way (no top-level
  calls into `main.ts`).
