# blueprint42 — Specification

Status: draft v0.1, 2026-09-27. Owner: wachaipr (42 Bangkok).

> **Note (2026-10-02, renamed blueprint42).** The acceptance criteria below
> were written against the author's own get_next_line (`gnl_*`), which stays
> private. The public repo's fixture is `samples/line_reader/`, built to the
> same shape (10 functions, 4 static, a function-local static table of
> structs, a doubling buffer, reads of `BUFFER_SIZE`); the tests check the
> same things on it. The tool's folder in a project is `.blueprint42/`.

---

## 1. Principles

These decide arguments. If a feature conflicts with one of them, the principle wins.

1. **Text is the source of truth.** The user edits C source. The grid is a
   *view* of that source plus an *annotation layer* the author arranges.
   The grid never generates or rewrites code.
2. **Keyboard where you type, direct manipulation where you look.** The
   editor is vim-native (vim mode is a toggle, on by default). The grid
   behaves like a normal node editor: middle-drag or drag empty space to pan,
   wheel to zoom, drag to move or re-route, double-click to jump to code.
   Playback uses conventional keys (Space, ←/→). *(Amended 2026-09-27, see
   `DECISIONS.md`.)*
3. **The tool proposes, the author places.** New nodes get auto-placed on free
   cells. Once the author moves one, that position is theirs and is never
   overwritten by the tool.
4. **The picture must not lie.** Anything animated is driven by values from a
   real execution. Something the author drew but never tied to code is shown
   as unbound (dimmed), never animated with made-up data.
5. **42 scope only.** C under the Norminette rules. A small, fixed toolbox. No
   attempt to picture arbitrary programs.
6. **Sandbox before project.** Until Milestone 5 the app works only on code
   typed into it or loaded from its built-in samples. It never reads the
   user's filesystem.

## 2. The metaphor

| C concept | Grid entity | Notes |
|---|---|---|
| function definition | **machine** (1 cell, labeled) | Norminette caps a function at 25 lines, so machines stay uniform |
| call `f(a, b)` | **belt** from caller → callee | one belt per caller→callee pair (call sites listed in the inspector); arguments ride it as plates |
| return value | belt back to the caller | the value rides the same belt home |
| stack frame | **panel** under its machine | parameters + locals; appears on call, dims to "returned" (last values) after |
| recursive call | a **spawned copy** of the machine (`fact #2`, `fact #3`…) | the argument rides into the copy; the copy dissolves on return |
| pointer | **wire** from the pointer to its pointee | a write through `*p` travels the wire; a wire into a returned frame dangles |
| `struct` definition | **item type / recipe** | shown in a legend panel, not on the grid |
| global / `static` variable | **chest** that persists between calls | e.g. GNL's `bufs[GNL_MAX_FD]` is a row of chests |
| heap block (`malloc`) | **chest** with a lifetime | appears on malloc, disappears on free; leaked = never emptied, flagged at exit |
| array / buffer with indices | **strip** (conveyor) with **cursor markers** | e.g. `buf->data` with `pos`, `len`, `cap` |
| `read()` / input fd | **drill** | produces up to BUFFER_SIZE items per call |
| copy (`memcpy`, own copy loops) | **inserter** | moves items from strip to chest |
| linked list | **train** of linked cars | libft bonus, push_swap if list-based |
| stack (push_swap A/B) | **vertical stack** strip | |

Later (not in first milestones): threads and mutexes (Codexion: shared
chests with a lock). The current Common Core (see `DECISIONS.md`,
2026-09-28) has no pipex or minitalk.

The words above (machine, belt, chest…) are the metaphor, not a look. How
each is drawn is up to the active **skin** (see `DECISIONS.md`).

**Drill-down, not sprawl.** A machine can be *entered* (like the Factorissimo
mod): stepping inside a function opens its own sub-grid showing its locals and
statements. The top-level grid stays at function granularity so it never turns
into a hairball.

## 3. Architecture

```
┌───────────────────────────── browser app ──────────────────────────────┐
│  Editor pane                 Grid pane                  Side panels     │
│  CodeMirror 6 + vim mode ──► tree-sitter-c (wasm) ──►   toolbox, legend,│
│        ▲                     symbol model ──► layout ──► playback bar    │
│        └──── cursor/selection sync ◄──────────────┘                     │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ (M3+) POST source + input
                         ┌─────────▼──────────┐
                         │ local trace server │  cc -g -O0 → gdb (python)
                         │  (sandboxed tmpdir)│  → timeline.json
                         └────────────────────┘
```

**Recommended stack** (the prototyping agent may deviate, but should write
down why in `DECISIONS.md`):

- **Vite + TypeScript** web app. It runs locally, and later a campus build is
  just a static page.
- **CodeMirror 6** with **@replit/codemirror-vim** for the editor.
- **web-tree-sitter** + **tree-sitter-c** grammar (wasm) for parsing. It keeps
  working on broken or half-typed code, which matters because the grid updates
  as you type.
- **Canvas 2D** (or PixiJS if it gets slow) for the grid. No DOM node per cell.
- **Trace server (M3+)**: a small Python or Node process. It writes the
  sandbox's source to a temp dir, compiles with `cc -Wall -Wextra -Werror -g
  -O0`, and runs it under **gdb's Python API**, recording a timeline. The
  student's source needs no changes (so Norminette compliance is unaffected).

Why not Godot: text editing with real vim motions and tree-sitter
integration are much stronger on the web. The Factorio *feel* comes from the
grid, sprites, and animation, and Canvas can do all of that.

### Data files

- `*.blueprint.json`: the author's layer. Node positions keyed by **stable
  symbol id** (`func:gnl_find_delim`, `struct:s_gnl`,
  `static:get_next_line.bufs`), placed sprites, and their bindings to
  expressions (`buf->data`, `buf->pos`…). It never contains code.
- `timeline.json` (M3+): the ordered list of events produced by the trace server.

## 4. Milestones

Each milestone ends in something usable. Don't start the next one until the
current one's acceptance checks pass.

**Order change (2026-09-27):** M3 (real execution) is built before M2.
Without real values, M2's strips and markers would only be unbound
placeholders. See `DECISIONS.md`.

### M0 — Sandbox skeleton
- Split view: editor (vim mode) on the left, empty grid on the right.
- The grid pans and zooms with the mouse (middle-drag, wheel); focus follows
  the click.
- A toolbox panel lists the entities from §2 (non-functional for now).
- The built-in sample `samples/gnl_v3/` loads from a sample picker (bundled at
  build time; no filesystem access at runtime).

✅ Accept: opens with the GNL sample in the editor; you can edit (with or
without vim mode) and move around the grid.

### M1 — Live view (static structure)
- On every edit (debounced ~150 ms), parse with tree-sitter and extract
  functions, structs, globals/statics, and call sites.
- Functions become machines, calls become belts, statics become chests.
  New symbols are auto-placed on free cells near their callers; placed
  positions persist in memory for the session.
- Two-way sync: moving the editor cursor into a function highlights its
  machine; double-clicking a machine on the grid jumps the editor to its
  definition.
- The author can drag a machine anywhere on the grid, and drag a belt to
  re-route it.
- Broken or half-typed code never clears the grid. Symbols that don't parse
  keep their last known node and show it as "stale".

✅ Accept: on `samples/gnl_v3/`, the grid shows machines for all 10 functions
(including the four `static` ones: `gnl_swar_scan`, `gnl_append_chunk`,
`gnl_fill_line`, `gnl_copy`), belts for the
real call edges (`get_next_line → gnl_fill_line → gnl_append_chunk →
gnl_reserve / gnl_find_delim → gnl_swar_scan`, etc.), and `bufs` as a chest.
Renaming a function in the editor updates its machine label without moving it.

### M2 — Toolbox & binding (the author's layer)
- Place data sprites from the toolbox: strip, cursor marker, chest, drill,
  stack, train.
- Bind a sprite to an expression within a scope: a strip to
  `get_next_line:buf->data`, markers to `buf->pos`, `buf->len`, `buf->cap`.
- **Type-driven suggestions**: a struct holding `char *` + `size_t` fields
  named like `len/cap/pos/size/i` suggests "strip with markers". The author
  confirms or edits it.
- Save/load `*.blueprint.json` (download/upload in the sandbox; still no disk
  access).
- Unbound sprites are drawn dimmed (principle 4).

✅ Accept: an author can reproduce the GNL "factory" table from the design
discussion (bufs chests → buf strip with pos/len/cap markers → drill → scanner
→ inserter → line chest) in under 10 minutes, then play it back on the real
M3 trace and see `pos` chasing `len` and the doubling reallocation as the
strip swapping to a larger one.

### M3 — Real execution (the factory moves)
- Sandbox gets a `main.c` pane and a virtual input-file pane (text that is
  exposed to the program as a file / fd).
- The trace server compiles and runs under gdb, records per-line steps, function
  enter/exit with args and return values, bound expressions' values at each
  step (once M2 bindings exist), and every malloc/free (address + size). Capped at N steps (default
  20k), with a clear "trace truncated" notice.
- Playback bar: play/pause/step/scrub (Space, ←/→, Shift+←/→ by call).
  Belts animate on call and return, markers slide along strips, chests appear
  and disappear, and the editor highlights the current line in sync.

✅ Accept: GNL v3 with `-D BUFFER_SIZE=4` on a 3-line input runs under the
trace server. Frames show the real values at every step. Each allocation in
`gnl_reserve` appears as a heap chest, and the old block disappears when the
buffer doubles. Each returned line is a new heap chest the caller owns and
frees, and the run ends with no leaks reported. (The strip parts, `pos`
chasing `len`, are in M2's acceptance, which now comes after M3.)

### M4 — Truth checks (the teaching payoff)
- **Invariants** on sprites, declared by the author: `pos <= len <= cap`,
  "bytes after len are zero". A violated invariant freezes playback at that
  step and highlights it.
- **Leak report**: chests never emptied are listed at exit, each linked to the
  malloc call site that created it.
- **Picture vs. run mismatch**: a marker leaving its strip's bounds, or a belt
  firing that the static graph didn't predict (function pointers) gets
  flagged.

✅ Accept: an injected off-by-one in `gnl_consume` is caught by the
`pos <= len` invariant at the exact step it happens.

### M5 — Open a real project
- Open a 42 project directory: multiple `.c`/`.h` files, a Makefile-aware
  build. Blueprint files live alongside the code (e.g. `.ft_blueprint/`).
- Handles libft-sized projects (~50 files) without the grid becoming a
  hairball. Group into a module per file, collapsed by default.

✅ Accept: gnl_v3 opened as a project runs through its driver main, every
stop maps to the right file, and the M4 off-by-one is still caught at the
same step (now reported in `get_next_line_utils.c`). A Makefile project with
a libft sub-make and two same-named `static` helpers traces with each
helper told apart. 50 generated files open collapsed, with no overlapping
modules and one trunk per pair of files that call each other.

### M5.5 — Machines are their insides
- The canvas pane is called **Blueprint**.
- **Every machine on the grid is its inside, always** (author, 2026-09-28;
  replaces "expand in place" and "enter the machine"). There is no
  separate viewer. Each machine holds:
  - its motor (the skin's machine sprite, with its state);
  - **storage**: params, locals, struct fields (including the struct a
    pointer reaches) and statics;
  - **stations**, one per statement in code order: `if`/`else` switches
    fork the track, loops run back with a count, `return` is an exit;
  - a **memory floor**: the bytes each `char *` points at, with its
    struct's index fields (`pos`, `len`, `cap`) as markers.
- **Belts join statements.** A call leaves the caller's right side at the
  row of the statement that makes it and enters the callee's entry door.
  Its return comes back the same way.
- **Every statement run is a beat** in the machine that runs it:
  1. the values it reads fly from storage to its station;
  2. the station shows the expression with those values (`buf->pos = 6`,
     `6 == 8 → false`);
  3. what actually changed flies back, and a byte lands on its cell.
  When a statement calls, its changes land as the call's result comes
  back.
- **Pace:** Fast (≈0.35 s a statement) or Focus (≈1.1 s, calls and returns
  staged). ←/→ step one statement, Shift+←/→ one call. The camera follows
  the running statement.
- **Detail by zoom:** close up, everything moves; zoomed out, each machine
  shows its name and the line it's on.
- **Truth:**
  - Reads are the names a statement uses, valued from the snapshot at its
    stop.
  - Writes are the differences at the next stop.
  - Switch results come from the interpreter's `eval` events or, under
    gdb, from the next line the frame ran.
  - Nothing is evaluated.

✅ Accept: on gnl_v3, play. Watching `gnl_consume`:
- `6` flies from `line_end` into `buf->pos = line_end`, and `.pos`
  becomes 6;
- the switch reads `6 == 8 → false`;
- in the call that empties the buffer, `'\0'` lands on `data[0]` through
  `data[7]` while the loop counts ×8;
- the belt from `get_next_line` leaves at its `gnl_consume(buf, line_end)`
  statement.

### M6 — Neovim bridge (the end state)
- An nvim plugin syncs buffers and cursor over msgpack-RPC or a websocket to
  the grid window. Your real nvim with your config becomes the editor, and the
  in-app editor is optional.
- The endgame for "open any project like an IDE" is nvim as the IDE and
  ft_blueprint as the view next to it, not rebuilding nvim.
- (Author, 2026-09-28) The page doesn't care where an edit comes from: any
  editor pushes a file's text and cursor to the local server and the view
  follows. nvim is the first client; the in-app editor stays editable.

✅ Accept: with the project open in the page, an unsaved edit in nvim shows
in the grid as you type; your nvim cursor highlights its machine; a
double-click on the grid moves nvim's cursor there; quitting nvim without
saving puts the page back to what's on disk.

### Later / parking lot
- Shareable static exports (blueprint plus recorded timeline) for campus and
  peer evaluations. No server needed to view them.
- The rest of the C in the current Common Core: ft_printf (variadic
  arguments), push_swap (stacks A/B), and Codexion (POSIX threads and
  mutexes: shared chests with locks).
- Side-by-side comparison of two implementations of the same project (e.g.
  GNL v1 vs v3) sharing one input.
- Python: most of the Common Core after rank 01 is Python (Modules 00–10,
  A-Maze-ing, Fly-in, Call Me Maybe, Pac-Man, RAG, Agent Smith). That
  needs a Python engine (parser and tracer) next to the C one.

## 5. Out of scope (for now)

- Visual programming or code generation from the grid (see principle 1).
- Arbitrary C (heavy macros, function-pointer-heavy code, anything the
  Norminette forbids). Degrade gracefully, don't try to support it.
- Multi-user editing, accounts, cloud anything.

## 6. Open questions

- **Rename tracking:** when `gnl_fill_line` is renamed, how do we keep its
  placed position? Options: match by body similarity, ask the author, or keep
  it orphaned until reattached. *(Prototype answer in `DECISIONS.md`.)*
- **Automatic placement:** simple "nearest free cell to the caller", or a
  proper layered layout (Sugiyama-style) for the first placement only?
  *(Answered in `DECISIONS.md`: Sugiyama-style layering for the first
  placement.)*
- **Trace granularity:** is per-line stepping under gdb fast enough for
  100-line inputs, or do we need `-finstrument-functions` plus watchpoints?
- **Sprite art direction:** pixel art in the Factorio style vs. clean vector.
  (The author dislikes Scratch's look, so avoid rounded toy-block styling.)
  *(Answered in `DECISIONS.md`: skins.)*
