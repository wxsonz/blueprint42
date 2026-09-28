# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Working on ft_blueprint

Read `SPEC.md` first. Principles in §1 override convenience.

- M0–M6 are implemented in `proto/` (M6: live edits from any editor, nvim
  plugin in `proto/nvim/`). Nothing further is planned; ask the author. M3 came before M2 by the author's decision in `DECISIONS.md`.
- Record every deviation from the recommended stack, and every answer to an
  open question from SPEC §6, in `DECISIONS.md` (date, decision, why).
- `samples/gnl_v3/` is the author's real get_next_line. Treat it as a
  read-only fixture: never "fix" or reformat it. It's the acceptance test
  input for M1–M4.
- Input model (author's call, see `DECISIONS.md`): vim is an optional mode
  of the **editor** only. The canvas is mouse-first like a node editor
  (middle-drag pan, wheel zoom, drag to move/re-route, double-click,
  right-click menu), plus conventional player keys (Space, ←/→, Home/End).
  Don't add vim-style bindings to the canvas.
- Look and feel lives in skins. New visuals go through the `Skin` interface
  (`proto/src/skins/types.ts`) and every skin, never hard-coded colours in
  the engine.
- Filesystem rule (M5): only `proto/server/project.mjs` reads or writes the
  author's files, only inside a folder opened this session, and writes
  happen only after the author confirms the Save dialog. Never auto-save.
  Samples stay bundled at build time. Test projects go in a temp or
  scratch folder, never in `samples/gnl_v3/`.
- The author uses Arch Linux, nvim, and KDE Plasma on Wayland. Node, npm,
  python3, gdb, and cc are available.

## Current state

`proto/` is the app: M0, M1, M3 (real execution under gdb), M2 (author
sprites and bindings), M4 (invariants and truth checks), M5 (projects:
folders, modules, Makefile builds, confirmed saves), M5.5 (machines are
their insides: statements animated in place with real reads and writes) and
M6 (live edits and cursor from any editor; `proto/nvim/` is the Neovim
plugin: `:FtbConnect [port]`, `:FtbOpen`). No linter yet.

```sh
cd proto
npm install
npm run dev      # vite dev server + the trace server at POST /api/trace
npm run dev -- ~/42/get_next_line   # …and open that folder (like `code <folder>`)
npm run check    # tsc --noEmit
npm test         # vitest: unit tests + integration tests that run cc and gdb
npx vitest run test/route.test.ts          # one file
npx vitest run -t "M3 acceptance"          # one test by name
npm run build    # type-check + production build (static; interpreter only)
```

The integration tests (`test/trace.test.ts`) need `cc` and `gdb` with
Python on PATH. `npm run preview` also serves the trace server.

Pipeline in `proto/src/`: `parse.ts` (tree-sitter → symbol model) →
`layout.ts` (positions by stable id, pinning, belt waypoints, rename
heuristic) → `route.ts` (scene: recursive-copy slots, per-call ports,
channel/corridor routing, crossings) → `interp.ts` (runs `main`, emits events plus a snapshot before
and after each one) → `render.ts` (engine: camera, routing, hit-testing;
`frameAt(trace, pos)` picks the snapshot and in-flight event for a
fractional playback position; all drawing is delegated to the active skin) →
`main.ts` (state, playback loop, mouse and keys, DOM panels).
`skins/*.ts` draw canvas entities and `styles/*.css` restyle the chrome and
editor via CSS variables on `html[data-skin]`. Eighteen skins: amp, classic,
aqua, minimal (hand-written), and xp, seven, metro, the Mac eras in
`skins/macos.ts` (system7, platinum, leopard, yosemite, bigsur, tahoe), barebone (the
fastest to paint), blueprint, factory, gameboy, synthwave (specs for `skins/kit.ts` `makeSkin`, the quickest way
to add a theme; `Theme.window` gives desktop-style window chrome). `editor.ts` is CodeMirror
with vim in a toggleable compartment.

Two engines produce the same `Trace` (events + a snapshot before and after
each): `interp.ts` (in-browser, a C subset, refuses anything else) and the
trace server (`server/trace.mjs` compiles with the 42 flags in a temp dir;
`server/tracer.py` steps it under gdb's Python API; `src/gdb.ts` converts
the result). The app picks one per program (Auto: gdb when the code calls
functions it doesn't define). Samples can carry `stdin`, `-D` defines and
read-only support files (`src/samples.ts`).

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
and grid double-clicks back to editors; `src/live.ts` + `main.ts` `onLive`
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
  question in SPEC §6. Pick an approach, record it in `DECISIONS.md`.

## The GNL sample as a parser test

M1 acceptance expects exactly 10 machines from `samples/gnl_v3/`:
`get_next_line`, `gnl_fill_line`, `gnl_append_chunk`, `gnl_find_delim`,
`gnl_swar_scan` (get_next_line.c) and `gnl_copy`, `gnl_reserve`,
`gnl_extract_line`, `gnl_consume`, `gnl_reset` (get_next_line_utils.c).
Things the extractor has to handle:

- Norminette style: tab between return type and name, `static` functions,
  signatures that wrap across lines (`gnl_swar_scan`).
- `bufs` is a **function-local** `static t_gnl bufs[GNL_MAX_FD]` inside
  `get_next_line`, not a file-scope global. It must still become a chest
  (`static:get_next_line.bufs`).
- `get_next_line.h` is mostly long `**` design comments plus `#ifndef`-guarded
  macros (`BUFFER_SIZE`, `LINE`, `GNL_MAX_FD`), `typedef struct s_gnl`, and
  `typedef enum e_gnl_status`.
