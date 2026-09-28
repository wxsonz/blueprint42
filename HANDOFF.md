# Handoff: ft_blueprint

For the next agent picking this up. Read in this order: `CLAUDE.md` (rules),
`SPEC.md` (principles and milestones), `DECISIONS.md` (every deviation and
why), then this file (current state and the next job).

## Where things stand (2026-09-28)

- `main` has everything through M5.5. M6 is on branch `m6-live`. Nothing
  is pushed (there is no remote).
- **Done:** M0, M1, M3, M2, M4, M5, M5.5 and M6. M3 was built before M2 on
  purpose (see `DECISIONS.md` and SPEC §4).
- **Next job:** none planned; see SPEC "Later / parking lot" and ask the
  author.
- **Checks:** 77 tests pass (`test/beats.test.ts` covers beats and machine geometry on the real GNL; `test/live.test.ts` the live routes) (`npm test`), including automated M2, M3, M4
  and M5.5 acceptance tests on the real GNL (`npx vitest run -t "acceptance"`),
  `test/interior.test.ts` (stations, gdb and interpreter switch results,
  room-making, blueprint round-trip), and M5 tests:
  `test/project.test.ts` (linking, modules, file server)
  and `test/project-trace.test.ts` (gnl as a project, Makefile + libft,
  library + driver, compile errors by file).
  `npm run check` is clean. The drop, bind, re-run, export and remove
  authoring flow was exercised headless with no console errors.

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
| `samples.ts` | Bundled samples (`?raw`), with optional `stdin`, `defines`, `files`; plus the gnl_v3 sample *project*. |
| `workspace.ts` | M5: the open project (buffers vs disk, run settings, driver rule, save, diffs), `/api/fs` client. |

The servers live in `proto/server/` (`dev.mjs` starts Vite and takes a folder):
- `project.mjs` is the only code that reads/writes the author's files
  (open, list folders, poll for outside edits, save with mtime checks).
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

Drag a **strip, marker, chest, drill, inserter (copy), stack, or train**
from the dock onto free grid space. Click a sprite to edit its label, scope, function, and
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

### Known gaps in M2

- **Shared sprite drawing.** All four skins draw sprites through one shared
  drawer (`skins/sprites.ts`) with a per-skin palette, so strips don't yet
  have each skin's own character (Classic bevels, Aqua gel, and so on).
  Worth a pass if the author cares; the `Skin.strip`/`Skin.sprite` hooks
  already exist.
- **Acceptance is only half automated.** `M2 acceptance` binds the whole
  GNL factory table and checks each piece sees real values. The "under 10
  minutes by hand" part has not been timed with a person.
- **Standalone markers don't attach to strips.** A strip's markers come
  from its own Markers field.

## M4: truth checks (done)

`src/invariants.ts` holds the grammar, evaluation over sampled values, and
episode detection (`findViolations`), plus `surpriseCalls`. In `main.ts`,
`violations()` caches results per trace and sprite set; the playback loop
freezes on each episode's first step. See `DECISIONS.md` for semantics.
Acceptance is automated: with `buf->pos = line_end + 1` injected into
`gnl_consume`, `pos <= len <= cap` fails first on exactly that line
(`pos 24 > len 23`), and the correct run raises nothing. The same flow was
walked in the browser: the strip suggested on `get_next_line` comes with
`pos <= len <= cap`, and playback freezes at the step with the culprit line
red.

## M5: projects (done)

`npm run dev -- <folder>` or Open Folder… opens a project. Each `.c` is a
module: collapsed blocks list their doors (public functions), open ones are
walls; calls between two hosts share one trunk with a count. Saving always
goes through the Save dialog (diffs, conflicts with outside edits). Builds
use the project's Makefile (`CC="cc -g -O0"`), or cc on every file; a
library runs through `.ft_blueprint/main.c`. Everything is recorded in
`DECISIONS.md`.

Known gaps:
- Only sources, headers and Makefiles reach the build copy: a program that
  opens data files (so_long maps) won't find them yet.
- Tabs can't be closed down to zero, and there's no "new file"/rename in
  the file list (edit on disk; the poll picks it up).
- Pinned modules can still overlap if the author drags them together
  (refused while dragging, but a module can grow into another when opened).

## M5.5: machines are their insides

Every machine on the grid shows its storage, stations and memory, and the
running statement animates in place (see SPEC).
- `src/machine.ts`: a machine's geometry in cells, from the code alone
  (`geomOf`, `machineSize`), its storage slots (`slotsOf`, from
  `frameRows`, which moved here with `folded`), and `callPortY` (the row a
  call leaves from). `layout.ts` uses `machineSize` for footprints and
  column widths. `route.ts` sizes hosts by it and puts out-ports at call
  statements and in-ports at the entry door.
- `src/beats.ts`: `timelineOf(trace, model)` groups every frame's events
  into statement beats:
  - under gdb, a step on a new station plus what the next stop reports;
  - under the interpreter, consecutive events on a station.
  Calls and returns stay belt events, except that a return carries the
  write of a statement whose changes happened inside the call (`lastRet`).
  `beatLen` sets Fast/Focus pacing. `readsOf`, `writesOf`, `computeText`
  and `slotValue` give what flies. Writes diff the snapshot at the stop
  against the next stop's; byte writes use `SnapCell.bytes` (heap blocks'
  first 48 bytes, from `gdb.ts`).
- `src/interior.ts` builds the stations (`planOf`: reads, calls, `keep`
  leaves such as `i++`) and infers switch results (`interiorAt`).
- `render.ts`:
  - `GridView.drawMachine` draws a machine with the existing skin hooks:
    wall, node (the motor), frame (storage), interior (stations), strip
    (memory), plate/pulse (values in flight), door (ports). Below 20 px a
    cell it draws only the name and current line.
  - `durationAt(trace, model, i)` feeds playback; `stationAt` and `foldAt`
    hit-test inside machines; `activeHostRect` frames the running
    statement for the follow camera; `home()` is the starting view (main,
    readable).
- `main.ts`: the playback loop spends a frame's time across many events;
  ←/→ step beats; the playbar describes the statement.
- Statics are storage rows now (no chests above machines).

## Layout tools and themes

- `Layout.tidy` (the Tidy button), `Layout.overlaps` / `Layout.settle`
  (run after any saved layout loads), and `shut` (machine.ts: closed
  machines, saved in the blueprint as `shut`). The pane head has Insides /
  Closed and Tidy.
- Eight skins. `skins/kit.ts` `makeSkin(theme)` implements every hook for
  the spec-driven ones (`blueprint`, `factory`, `gameboy`, `synthwave`);
  a new theme is a `Theme` (palette, fonts, `card`, `background`,
  optional `belt` / `nodeDecor` / `wallDecor`) plus a CSS file of
  variables (copy `styles/minimal.css`'s variable list).

## Performance and lenses

- Painting pixels is the cost (see DECISIONS). `main.ts` `adaptQuality`
  lowers `GridView.scale` when frames run slow.
- `GridView.onScreen` culls; `fitText` / `cutText` (skins/util.ts)
  memoize; the timeline strip is cached (`tlCache`); `frame()` idles at
  ~15 fps.
- Zoom goes to 0.02. Below 8 px a cell, `drawMachine` draws only the shell.
- Lenses: at the end of `GridView.draw`, far ends of the current call/return
  belt, or of writes into another machine's memory, are drawn by a second
  `GridView` (`lens = true`, `setSize`) and blitted into the corner.

## M6: live edits from any editor

The page doesn't care where an edit comes from (author's call). Any editor
pushes a file's text and cursor; the page applies it like typing.
- `server/live.mjs`: `POST /api/live/push` (edit, close, open, reveal,
  replay) and `POST /api/live/stream` (newline-separated JSON, held open;
  `role: 'page' | 'editor'`). Same guard as every route (localhost, `x-ftb`
  header, same origin when there is an Origin). It keeps the editors'
  latest unsaved text in memory so a reloaded page catches up; it never
  touches the disk. Absolute paths map to `{ root, rel }` only inside a
  folder the page opened (`project.mjs` `openedRootOf`).
- `src/live.ts` (the page's stream and `liveReveal`/`liveReplay`) and
  `main.ts` `onLive`: an edit becomes a minimal change in the in-app editor
  (or the file's text if it isn't open), the page follows the editor's
  cursor and file, a `close` puts the file back to its disk text, and
  `openAt` asks the editors to jump too. Files showing an editor's unsaved
  text (`liveFrom`) aren't hot-exit backed up and don't block closing the
  tab. The disk poll counts "disk now equals our text" as saved, not a
  conflict.
- `proto/nvim/`: the Neovim plugin (Lua, uses `curl`, Neovim 0.10+). With
  lazy.nvim: `{ dir = '~/42me/ft_blueprint/proto/nvim', opts = { port = 5173 } }`,
  then `:FtbConnect [port]`, `:FtbOpen [dir]`, `:FtbDisconnect`.
  `opts.auto = true` connects on startup.
- Checked end to end with headless nvim + the dev server + headless
  Chromium: typing shows up, the cursor highlights its machine, a grid
  double-click moves nvim's cursor, and quitting without saving reverts.
- Known: while the program plays, the in-app editor follows the running
  line, which can switch its file away from the one nvim is on.

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

- Default skin (currently Amp; the choice is remembered per browser).
