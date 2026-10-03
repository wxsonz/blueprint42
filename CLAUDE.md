# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Working on blueprint42 (formerly ft_blueprint)

Read `docs/SPEC.md` first. Principles in §1 override convenience.
`docs/HANDOFF.md` has longer working notes (architecture map, known
limits); read the part you need.

- M0–M6 are implemented at the repo root (M6: live edits from any editor, nvim
  plugin in `nvim/`). Nothing further is planned; ask the author. M3 came before M2 by the author's decision in `docs/decisions/`.
- Record every deviation from the recommended stack, and every answer to an
  open question from SPEC §6, as a new numbered file in `docs/decisions/`
  (`NNN-short-name.md`: title, date, status, decision, why) with a line in its
  `README.md` index.
- `samples/line_reader/` is the acceptance-test fixture for M1–M5.5 (a
  get_next_line-style reader written for this repo; its tests pin exact
  values from real runs, so treat it as read-only). The author's real
  get_next_line (`samples/gnl_v3/`, if present locally) is private: never
  commit, publish or bundle it.
- Input model (author's call, see `docs/decisions/`): vim is an optional mode
  of the **editor** only. The canvas is mouse-first like a node editor
  (middle-drag pan, wheel zoom, drag to move/re-route, double-click,
  right-click menu), plus conventional player keys (Space, ←/→, Home/End).
  Don't add vim-style bindings to the canvas.
- Skin review status is in `docs/SKINS.md`. Reviewed means it meets the
  author's design standard, not frozen: change it when the author asks,
  never restyle it unasked. Log every skin pass there.
  Prototype new pictures in Minimal and Barebone only; don't edit other
  skins' code for them until the design settles.
- **Hard rule: the picture obeys how C really works** (SPEC principle 4).
  Every design shows what actually happens under the hood: a copied value is
  a copy, a pointer's line goes to the address it holds, memory is drawn
  where it lives. No workaround, shortcut or friendlier metaphor that
  contradicts the real behaviour. If the truth can't be drawn yet, draw
  less, never something false. This overrides looks, convenience and speed.
- Look and feel lives in skins. New visuals go through the `Skin` interface
  (`src/skins/types.ts`) and every skin, never hard-coded colours in
  the engine.
- Filesystem rule (M5): only `server/project.mjs` reads or writes the
  author's files, only inside a folder opened this session, and writes
  happen only after the author confirms the Save dialog. Never auto-save.
  Samples stay bundled at build time. Test projects go in a temp or
  scratch folder, never in `samples/`. The tool's folder inside a project
  is `.blueprint42/`; an old `.ft_blueprint/` is read as a fallback and never
  written.
- The author uses Arch Linux, nvim, and KDE Plasma on Wayland. Node, npm,
  python3, gdb, and cc are available.

## Current state

The app lives at the repo root: M0, M1, M3 (real execution under gdb), M2 (author
sprites and bindings), M4 (invariants and truth checks), M5 (projects:
folders, modules, Makefile builds, confirmed saves), M5.5 (machines are
their insides: statements animated in place with real reads and writes) and
M6 (live edits and cursor from any editor; `nvim/` is the Neovim
plugin: `:B42Connect [port]`, `:B42Open`; the old `:Ftb…` names still work).
`npm run lint` is Oxlint (type-aware) plus `tools/lint-canvas.mjs`
(decision 048); `npm run check` runs `tsc` then it.

```sh
npm install
npm run dev      # vite dev server + the trace server at POST /api/trace
npm run dev -- ~/42/get_next_line   # …and open that folder (like `code <folder>`)
npm run check    # tsc --noEmit, then npm run lint (Oxlint + the canvas save/restore check)
npm test         # vitest: unit tests + integration tests that run cc and gdb
npx vitest run test/route.test.ts          # one file
npx vitest run -t "M3 acceptance"          # one test by name
npm run build    # type-check + production build (static; interpreter only)
```

The integration tests (`test/trace.test.ts`) need `cc` and `gdb` with
Python on PATH. `npm run preview` also serves the trace server.

Pipeline in `src/`: `parse.ts` (tree-sitter → symbol model) →
`layout.ts` (positions by stable id, pinning, belt waypoints, rename
heuristic) → `route.ts` (scene: recursive-copy slots, per-call ports,
channel/corridor routing, crossings; built once per change, so code outside
`Layout`'s methods that moves anything calls `layout.touch()`, decision 049) → `interp.ts` (runs `main`, emits events plus a snapshot before
and after each one) → `playback.ts` (timing and hosts; `frameAt(trace, pos)`
picks the snapshot and in-flight event for a fractional playback position)
and `hit.ts` (hit-testing, rects) → `render.ts` (`GridView`: camera and
drawing, all of it delegated to the active skin) → `main.ts` (playback
loop, mouse and keys, skins, boot). `main.ts`'s shared state is in
`state.ts` (reassigned values have setters); the UI around it is split into
`panels.ts`, `playbar.ts`, `project-ui.ts` (projects, live edits, polling,
dialogs), `sample-ui.ts`, `feed.ts` (kill feed, duel, focus card) and
`page.ts` (clock, zoom, page background). Long gdb runs are windows of steps
(decision 043): `session.ts` talks to the trace server's sessions
(`/api/trace/open|window|stats|close`, `tracer.py` serve mode with gdb
checkpoints as savepoints); `stats-ui.ts` is the nerd stats panel. `norm.ts` counts the Norm's limits (lines, params, vars, definitions) as norminette does, for capacity.
`gfx/` is the GFX button's backgrounds (decision 044): `layer.ts` a GPU
canvas under the grid (WebGPU, else WebGL2), `scenes/` a skin's GPU scene
(WGSL and GLSL, keep both in step), `gfx.ts` the Full / Simple / Off setting.
A page-wide background (PS3, PS4: `fullBleed`) runs its scene on a second
layer under `#page-bg`, owned by `page.ts` (decision 045).
`skins/*.ts` draw canvas entities and `styles/*.css` restyle the chrome and
editor via CSS variables on `html[data-skin]`. Twenty-six skins: amp, classic,
aqua, minimal (hand-written), and xp, seven, metro, the Mac eras in
`skins/macos.ts` (system7, platinum, leopard, yosemite, bigsur, tahoe), barebone (the
fastest to paint), blueprint, factory, gameboy, synthwave, and the consoles in
`skins/consoles/` (one file each: ps1–ps5, wii, gamecube, switch, plus
`common.ts`; their CSS was
generated from short specs, edit it by hand now). Skins with both
modes (metro, bigsur, tahoe, minimal, barebone, wii, switch) have a second skin with
`variantOf`/`mode`; the picker lists base skins with a canvas-drawn preview
and ☀/☾ swaps modes (specs for `skins/kit.ts` `makeSkin`, the quickest way
to add a theme; `Theme.window` gives desktop-style window chrome). `editor.ts` is CodeMirror
with vim in a toggleable compartment.

Two engines produce the same `Trace` (events + a snapshot before and after
each): `interp.ts` (in-browser, a C subset, refuses anything else) and the
trace server (`server/trace.mjs` compiles with the 42 flags in a temp dir;
`server/tracer.py` steps it under gdb's Python API; `src/gdb.ts` converts
the result). The app picks one per program (Auto: gdb when the code calls
functions it doesn't define). Samples can carry `stdin`, `-D` defines and
read-only support files (`src/samples.ts`); the top bar's Examples menu
groups them (interpreter / gdb / input) and the sample projects.

Projects (M5): `src/workspace.ts` holds the open project (buffers vs disk,
run settings, the driver rule); `parse.ts` `parseProject` links files
(a static that another file shares becomes `name@file`); `layout.ts` keeps
modules (one per `.c`, collapsed blocks or walls) and packs them;
`route.ts` makes a collapsed module one host (`mod:<file>`) with trunks;
`server/project.mjs` is the file server (`/api/fs/*`); the trace server
builds projects with their Makefile. Events carry a `file`.

Machines are their insides (M5.5): every machine shows its storage,
stations (one per statement) and memory floor, and the running statement
animates in place (reads fly in, values fill the expression, writes fly
out). `src/machine.ts` is machine geometry and storage slots;
`src/beats.ts` groups the trace into statement beats and paces them;
`src/interior.ts` builds stations and switch results; `render.ts`
`drawMachine` draws it with existing skin hooks.

Live edits (M6): `server/live.mjs` (`/api/live/push`, `/api/live/stream`,
newline-separated JSON) relays editors' unsaved text and cursor to pages
and grid double-clicks back to editors; `src/live.ts` + `project-ui.ts` `onLive`
apply them. It never touches the disk.

In dev builds `window.__ftb` exposes `{ S, view, layout, editor,
computeBelts, openFolder, switchFile, … }` for headless checks.

## Architecture (planned, SPEC §3)

One-way data flow: **editor text → tree-sitter parse → symbol model →
layout → grid render.** The grid never writes code (principle 1); the only
reverse channel is cursor/selection sync (double-clicking a node jumps the
editor to its definition; the editor cursor highlights its node).

- **Symbol model** is keyed by stable ids: `func:<name>`, `struct:<tag>`,
  `static:<function>.<var>`. Layout positions and (M2+) `*.blueprint.json`
  bindings hang off these ids, never off code text or line numbers.
- **Layout** has two kinds of positions: auto-placed (tool may move) and
  author-placed (tool must never overwrite, principle 3).
- **Parse failures are sticky, not destructive**: a symbol that stops
  parsing keeps its last node and is marked stale; the grid is never
  cleared on broken input. Re-parse is debounced ~150 ms.
- Rename tracking (keeping a machine's position across a rename) is an open
  question in SPEC §6. Pick an approach, record it in `docs/decisions/`.

## The line reader as a parser test

M1 acceptance expects exactly 10 machines from `samples/line_reader/` (plus
the sandbox `main` the sample appends): `read_line`, `lr_fill`, `lr_append`,
`lr_find_nl`, `lr_scan` (line_reader.c) and `lr_copy`, `lr_grow`,
`lr_take_line`, `lr_consume`, `lr_reset` (line_reader_utils.c). Things the
extractor has to handle:

- Norminette style: tab between return type and name, `static` functions
  (four of them), signatures that wrap across lines (`lr_fill`).
- `bufs` is a **function-local** `static t_reader bufs[LR_MAX_FD]` inside
  `read_line`, not a file-scope global. It must still become a chest
  (`static:read_line.bufs`).
- `line_reader.h` is a `**` design comment plus `#ifndef`-guarded macros
  (`BUFFER_SIZE`, `LR_INIT_CAP`), `typedef struct s_reader`, and
  `typedef enum e_lr_status`.
