# Handoff: ft_blueprint

For the next agent picking this up. Read in this order: `CLAUDE.md` (rules),
`SPEC.md` (principles and milestones), `DECISIONS.md` (every deviation and
why), then this file (current state and the next job).

## Where things stand (2026-09-27)

- Branch `cleanup-and-trace` (6 commits on top of `main`), **not merged, not
  pushed**. The author decides on merging.
- **Done:** M0, M1 and M3. M3 was built before M2 on purpose (see
  `DECISIONS.md` and SPEC §4).
- **Next job: M2** (toolbox and bindings), then M4 and M5.
- **Checks:** 27 tests pass (`cd proto && npm test`), `npm run check` is
  clean, `npm run build` works.

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
| `main.ts` | App state, analyze → engine choice, playback loop, mouse/keys, panels, persistence (localStorage per sample). |
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

## Next milestone: M2, toolbox and bindings (the author's layer)

Goal: the author places data sprites and binds them to expressions, and M3
playback animates them with real values. This is the GNL factory picture:
`bufs` chests → `buf->data` strip with `pos`/`len`/`cap` markers → drill
(`read`) → scanner → inserter (copy) → line chest.

### Tasks

1. **Sprite model + persistence.**
   - Add sprites to the author layer: `{ id, kind: 'strip' | 'marker' |
     'chest' | 'drill' | 'stack' | 'train', x, y, binding?: { scope:
     'fn' | 'global', fn?: string, expr: string } }`.
   - A strip also has `lengthExpr` (e.g. `buf->cap`) and `markers:
     [{ expr: 'buf->pos', label: 'pos' }, …]`.
   - Key everything by stable ids, never by line numbers.
   - Persist with the existing per-sample localStorage (`Saved` in
     `main.ts`).
   - Add `*.blueprint.json` export/import as a download/upload. No disk
     access (principle 6).
2. **Placing from the dock.**
   - The legend dock (`#dock` in `main.ts`) already lists strip, drill,
     copy, train and stack as greyed "M2" slots. Make them draggable onto
     the canvas.
   - Selected sprites move by drag. Right-click → Bind…, Remove.
   - A binding editor in the inspector: pick a scope (function) and type an
     expression, validated with tree-sitter (`parse.ts`).
   - Mouse-first, per the input model above.
3. **Evaluating bindings in the tracer.**
   - In `server/tracer.py`, after each stop, for every binding whose scope
     function has a live frame: `frame.select()`, then
     `gdb.parse_and_eval(expr)`.
   - For strips, also read the bytes (`read_memory(ptr, min(len, 256))`).
   - Send them in the request (`bindings: [...]`) and return per-stop
     `bound: { [spriteId]: value | bytes }`.
   - Recursion: bind to the **top** live frame of that function.
   - The interpreter engine can support bindings only for plain variables.
     Otherwise leave them unbound (dimmed).
4. **Rendering.**
   - Add `strip(dc, rect, { bytes, length, markers: [{label, index}],
     bound })` and `sprite(dc, rect, kind, info)` to the `Skin` interface.
     Implement them in amp, classic, aqua and minimal.
   - Markers slide between indices over the event's animation time (see how
     `switchAt` and `flash` work in `render.ts`).
   - A reallocation (the pointer bound to the strip changes to a new heap
     block) shows as the strip swapping to a larger one.
   - Unbound sprites are dimmed and never animated.
5. **Type-driven suggestions.**
   - A struct with a `char *` plus `size_t` fields named like
     `len/cap/pos/size/i` (e.g. `t_gnl`) suggests "strip with markers" on
     that struct's pointer. Offer it from the inspector of a frame row or
     static.
   - The tracer already sends struct field names and types (`fields` in
     `ser()`).
6. **Tests.**
   - Sprite persistence round-trip.
   - Binding evaluation through `handleTrace` on GNL: `buf->pos` takes
     several distinct values and never exceeds `buf->len`.
   - A render smoke test via the dev-only `window.__ftb` hook.

### Acceptance (SPEC §4, amended)
An author reproduces the GNL factory table in under 10 minutes, then plays
it back on the real M3 trace and sees `pos` chasing `len`, and the doubling
reallocation as the strip swapping to a larger one.

## After M2 (SPEC §4)

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
- M2 placement UX: drag from the dock (proposed), or right-click the canvas
  → Add?
- Should a bound strip replace the struct's row in the frame panel, or sit
  next to it?
