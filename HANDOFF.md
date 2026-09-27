# Handoff: ft_blueprint

For the next agent picking this up. Read in this order: `CLAUDE.md` (rules),
`SPEC.md` (principles and milestones), `DECISIONS.md` (every deviation and
why), then this file (current state and the next job).

## Where things stand (2026-09-27)

- Branch `cleanup-and-trace` (6 commits on top of `main`), **not merged, not
  pushed**. The M2 work described here is currently uncommitted. The author
  decides on merging.
- **Done:** M0, M1, M3, and M2. M3 was built before M2 on purpose (see
  `DECISIONS.md` and SPEC §4).
- **Next job: M4** (truth checks), then M5.
- **Checks:** Relevant parser, blueprint, trace, rendering, and browser
  regressions have been verified. Run the commands below for current results.

```sh
cd proto && npm install
npm run dev                          # app + trace server (POST /api/trace)
npm test                             # unit + integration (needs cc, gdb with Python)
npx vitest run -t "M3 acceptance"    # one test by name
```

## Architecture map (`proto/src`)

| File | Role |
|---|---|
| `parse.ts` | tree-sitter-c → `Model` (functions, params, locals, statics, call sites, externals). Stable ids `func:<name>`. |
| `layout.ts` | Node positions keyed by id; Sugiyama-style first placement; `setPos` pins; belt `waypoints`; rename heuristic; stale on parse errors. |
| `route.ts` | `buildScene`: recursion copy slots (`fn#2…`), per-call ports, channel and corridor routing, `crossings`. |
| `interp.ts` | In-browser interpreter (C subset) → `Trace`. Also owns the shared `Trace`/`Snap`/`Ev`/`V` types and `fmtVal`. |
| `gdb.ts` | Client for the trace server + `convertGdb` (gdb timeline → `Trace`). |
| `render.ts` | Engine: camera, hosts (frame → home node or copy), hit-testing, playback timing (`evDuration`, `switchAt`, `frameAt`), heap shelf, wires. **Draws nothing itself; calls the skin.** |
| `skins/*.ts` | `Skin` interface (`skins/types.ts`) + amp, classic, aqua, minimal. |
| `styles/*.css` | Chrome and editor restyled via CSS variables on `html[data-skin]`. |
| `main.ts` | App state, playback, sprite authoring, inspector, blueprint import/export, and per-sample localStorage. |
| `blueprint.ts` | Validated, source-free author layer (`*.blueprint.json`) and read-only binding grammar. |
| `samples.ts` | Bundled samples (`?raw`), with optional `stdin`, `defines`, `files`. |

The trace server lives in `proto/server/`:
- `trace.mjs` compiles with `cc -Wall -Wextra -Werror -g -O0` in a temp dir,
  runs gdb, and provides the Vite middleware with a same-origin +
  `x-ftb: 1` guard.
- `tracer.py` runs inside gdb's Python API and does the line stepping.

Key invariants:
- `trace.snaps[i]` is the state **before** `trace.evs[i]`; `snaps[i+1]` is
  the state after it.
- Geometry is identical across skins. New visuals go through the `Skin`
  interface and must be implemented in **all four** skins.
- The picture never animates invented values (principle 4). Unbound things
  are drawn dimmed.
- `samples/gnl_v3/` is a read-only fixture. The GNL sample appends a sandbox
  `main` and passes `-D BUFFER_SIZE=4 -D GNL_INIT_CAP=8`.
- Input model: vim only in the editor (toggle). The canvas is mouse-first
  (middle-drag pan, wheel zoom, drag to move/re-route, double-click to jump
  to code, right-click menu) plus player keys (Space, ←/→, Home/End). Don't
  add vim bindings to the canvas.

## M2: author sprites and bindings

Drag a **strip, marker, chest, drill, stack, or train** from the dock onto
free grid space. Click a sprite to edit its label, scope, function, and
expression in the inspector; drag it to move it. Right-click for Bind or
Remove. A standalone marker is an index card. To make cursors ride a strip,
enter `label = expression` lines in that strip's **Markers** field.

The inspector of a function or static can suggest a strip when a variable
has a struct with `char *` data and `size_t` length/capacity/position fields.
Clicking the suggestion adds a separate sprite in nearby free space. The
GNL sample offers `buf->data` with `buf->cap` and `pos`/`len`/`cap` markers;
`get_next_line`'s static `bufs` uses its `fd` parameter as the index.

Bindings observe the top live frame of the selected function. Gdb evaluates
read-only field/index expressions and samples up to 256 bytes for a strip at
each stop. Full capacity and marker indices remain available. The interpreter
supports simple variables only. Unbound or unavailable sprites are dimmed;
changing a binding clears the old trace until the new run returns. A bound
strip sits alongside the frame row. All four skins render it, including
marker movement and capacity changes.

**Export blueprint** downloads positions, routes, and sprites as
`*.blueprint.json`; **Import blueprint** validates and loads that file.
Source and stdin are never included. Work is also saved automatically per
sample in browser localStorage. Import does not change source or stdin.

The binding grammar deliberately excludes function calls, writes, and
arbitrary C expressions. It currently accepts identifiers, field access,
and array indexes by integer or identifier (`bufs[fd].data`). A standalone
marker has no attachment to a strip; strip markers provide that motion.

## Next milestone: M4 (SPEC §4)

- **M4, truth checks:** author-declared invariants on sprites
  (`pos <= len <= cap`). A violation freezes playback at that step. The
  leak report already exists (`trace.leaks`, alert in `renderAlerts`); link
  each leak to its `malloc` line in the editor. Flag a marker leaving its
  strip, and belts the static graph didn't predict. Acceptance: an injected
  off-by-one in `gnl_consume` is caught at the exact step.
- **M5, open a real project:** multi-file directories, Makefile-aware build,
  `.ft_blueprint/` next to the code, one module per file, collapsed by
  default. This is the first milestone allowed to touch the filesystem.

## Gotchas learned the hard way

- **gdb Python:**
  - You cannot create breakpoints (including `FinishBreakpoint`) inside a
    `Breakpoint.stop()` callback; it fails silently. That's why `malloc`
    really stops and the loop runs `finish` itself (`collect_alloc`).
  - `free` is reported twice per call while stepping; hits are deduplicated
    by `(rdi, return address, step)`.
  - Allocation args and results use x86-64 registers (`$rdi`, `$rsi`,
    `$rax`).
  - Always `set debuginfod enabled off` and `DEBUGINFOD_URLS=`.
  - Printing to stderr from gdb Python gets lost; log to a file when
    debugging.
- **tree-sitter-c** folds a leading minus into `number_literal` (`-7`).
- **Browsers** reserve Ctrl+W; don't use `<C-w>` chords.
- **Visual checks:** the Chrome extension wasn't available, so screenshots
  were taken headless with `playwright-core` and `/usr/bin/chromium` from
  the scratchpad. Dev builds expose `window.__ftb = { S, view, layout,
  computeBelts }` for exact coordinates.
- **GNL trace size:** a 3-line input produces about 1,050 events and a
  1.6 MB JSON response. Fine locally; delta-encode it if it grows.

## Open questions for the author

- Merge `cleanup-and-trace` into `main`?
- Default skin (currently Amp; the choice is remembered per browser).
