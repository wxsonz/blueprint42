# Decisions

Deviations from SPEC.md's recommended stack and answers to SPEC §6 open
questions. Newest last.

## 2026-09-27: visual prototype in `proto/`, ahead of M0

- **Decision:** Build a throwaway-able prototype in `proto/` that runs tiny
  pointer programs end to end (edit → parse → factory → animated playback),
  before the M0/M1 work.
- **Why:** The author asked for it. The visual design decides whether the
  tool is worth using ("like people prefer vscode over nvim"), so it gets
  tested first. It pulls an M3 feature (execution) forward on purpose. M0/M1
  can reuse or replace `proto/`.

## 2026-09-27: in-browser interpreter instead of the gdb trace server (prototype only; kept, see below)

- **Decision:** `proto/src/interp.ts` walks the tree-sitter AST for a
  Norminette-shaped C subset (int/char/long, pointers to variables, `if`,
  `while`, calls, recursion, `static` locals). Anything else stops with an
  honest message: external calls, arrays, pointer arithmetic, and constructs
  the Norminette forbids.
- **Why:** It needs no server and has no latency while typing. Principle 4
  still holds because every animated value is computed from the code.
  Replace it with the SPEC §3 gdb trace server at M3. It can't run real
  GNL (`read`, `malloc`).

## 2026-09-27: focus keys are `Ctrl-h` / `Ctrl-l`, not `<C-w>h/l` (superseded below)

- **Decision:** `Ctrl-l` focuses the grid and `Ctrl-h` (from the grid) goes
  back to the editor, in the style of vim-tmux-navigator.
- **Why:** Browsers reserve `Ctrl-W` (close tab) and pages can't reliably
  intercept it, so one missed keystroke loses the session. `Ctrl-h` is only
  captured while the grid has focus, so it's still backspace in insert mode.

## 2026-09-27: SPEC §6 rename tracking (prototype answer)

- **Decision:** If exactly one function vanishes and exactly one appears in
  the same re-parse, treat it as a rename: the machine keeps its position and
  pin. Otherwise vanished symbols are removed, or kept as *stale* if the
  buffer has a syntax error.
- **Why:** Typing a rename changes one name per debounced parse, so the 1:1
  case covers normal editing. Revisit if M1 shows false matches, for example
  when deleting one function while pasting another.

## 2026-09-27: SPEC §6 automatic placement (superseded below)

- **Decision:** For first placement, use columns by BFS call depth from
  `main` (or from uncalled roots), 7 cells apart. A symbol added
  mid-session goes to the nearest free spot right of its first caller.
  Existing and pinned machines never move.
- **Why:** It's simple and stable. A Sugiyama pass may still be worth it for
  larger projects (M5).

## 2026-09-27: SPEC §6 sprite art direction (superseded by skins, below)

- **Decision:** Procedural vector art on Canvas 2D in a Factorio palette:
  bevelled steel machines with a gear window and status light, yellow-railed
  belts with moving chevrons, steel chests, and red "circuit wires" for
  pointers. Corners are chamfered or square, never rounded.
- **Why:** It reads well at any zoom, needs no asset pipeline, and avoids
  the Scratch look the author dislikes. Pixel art is still possible later.

## 2026-09-27: metaphor additions (not in SPEC §2)

- **Stack frame** is an inventory panel under its machine. Parameters are
  copper slots and locals are steel. The frame appears on call and dims to
  "RETURNED" (last values, read-only) after the return. Recursion stacks the
  panels and adds a ×n badge.
- **Pointer** is a red wire from the pointer slot to its pointee. A write
  through `*p` is a pulse travelling the wire. A wire into a frame that has
  returned is drawn dangling.
- **process** is a terminal box that calls `main` and shows the exit status.
- **Belts** are drawn one per caller→callee pair, not one per call site.
  The inspector lists the call sites. This keeps the grid readable; reconsider
  if per-site belts matter for M2 bindings.

## 2026-09-27: vim only in the editor; the canvas is mouse-first (amends SPEC principle 2)

- **Decision:** Vim keybindings are an editor option (the "Vim" toggle, on by
  default, remembered per browser). The canvas works like a normal node
  editor:
  - Middle-drag, or dragging empty space, pans. The wheel zooms at the
    pointer.
  - Click selects a function or a call. Dragging a function moves and pins
    it. Dragging a call re-routes it through the point you drop it on.
  - Double-click jumps to code (a function), resets a route (a call) or fits
    the view (empty space). Right-click opens a context menu.
  - Canvas keys are the usual player ones: Space, ←/→, Shift+←/→, Home/End
    and F.
  - The `hjkl` cursor, `m`-to-move, number-key toolbox and `Ctrl-h`/`Ctrl-l`
    focus keys are removed.
- **Why:** The author's direction: vim was meant for the text editor, not the
  picture. It replaces "every UI action needs a key binding" in CLAUDE.md
  and the "mouse is optional" half of SPEC principle 2. SPEC.md itself was
  not edited.

## 2026-09-27: skins instead of one Factorio-style look

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

## 2026-09-27: recursion spawns copies (amends the SPEC §2 metaphor)

- **Decision:** A recursive call spawns a copy of the function (`fact #2`,
  `fact #3`, …) next to its parent. The argument rides the belt into the new
  copy, the copy has its own frame, and on return the value rides back and
  the copy dissolves. The first live frame of a function is shown on its
  home node and each deeper one on the next copy. Copy slots are reserved
  per trace (max depth, capped at 10) so nothing moves during playback.
  When nothing is running, a dashed placeholder marks where the first copy
  will appear. The self-loop belt is gone. Mutual recursion uses the same
  hosts plus temporary belts. Copies can be selected but not dragged; they
  follow their home.
- **Why:** The author pictures recursion as building a new factory and
  carrying the value into it. One node with stacked frames hid the
  unwinding.

## 2026-09-27: routing, and SPEC §6 automatic placement

- **Decision:**
  - Initial placement is Sugiyama-style: columns by the longest call path
    (every callee sits right of all its callers; recursive edges are
    ignored for layering), and rows ordered by the average row of each
    node's callers.
  - Routing (`proto/src/route.ts`): every call gets its own port on each
    side of a node.
  - Calls between adjacent columns get their own vertical channel in the
    gap, ordered to avoid crossings.
  - Longer or backward calls run along a free horizontal corridor.
  - Where lines cross, the line on top cuts a gap in the one below.
  - Hovering or selecting a function or call dims every unrelated line.
- **Why:** Shared out-ports and shared trunks made separate calls look like
  one line, and breadth-first columns produced back-edges that looped over
  the whole graph ("overlapped lines … confused").

## 2026-09-27: M3 before M2

- **Decision:** Build real execution (the gdb trace server) before the
  toolbox and bindings. SPEC §4 is amended. M3's acceptance check keeps
  what execution alone can show; the strip parts (`pos` chasing `len`)
  moved to M2's.
- **Why:** M2's strips and markers only mean something with real values.
  Built first, they would all be unbound placeholders.

## 2026-09-27: the trace server (M3) and the two engines

- **Decision:**
  - The tracer (`proto/server/tracer.py`) runs inside gdb's Python API and
    steps line by line. It records the user stack with values, calls,
    return values (finish breakpoints), and `malloc`/`calloc`/`realloc`/
    `free` called directly from user code, so libc's own allocations (e.g.
    printf's buffer) are ignored.
  - `proto/server/trace.mjs` compiles with `cc -Wall -Wextra -Werror -g
    -O0` in a throwaway temp directory. It is served as Vite middleware
    (`POST /api/trace` on the dev and preview servers) instead of a
    separate process, so `npm run dev` stays one command.
  - The app has two engines: the in-browser interpreter (instant, a C
    subset) and gdb (the real thing). **Auto** uses gdb whenever the code
    calls something it doesn't define (`read`, `malloc`, `printf`…).
- **Why:** The interpreter can't run GNL and must never fake it (principle
  4). Keeping the interpreter gives instant feedback on small programs and
  works in a static build with no server.
- **Security:** the endpoint compiles and runs code, so it only answers
  same-origin requests from localhost that carry an `x-ftb` header.
  Another site can't set that header without a CORS preflight, which is
  never answered. Runs are time-capped. The compiled program is not
  sandboxed beyond that; it's the author's own code on their own machine.

## 2026-09-27: SPEC §6 trace granularity (measured)

- **Answer:** Per-line stepping under gdb is fast enough for sandbox-sized
  inputs. gnl_v3 with `BUFFER_SIZE=4` on a 3-line input is about 600 stops
  (about 1,050 events) in about 1 s, including compile. That's roughly 600
  stops per second, so a 100-line input (~20k stops) would take about
  30 s. That's at the cap and needs `-finstrument-functions` or watchpoints
  if it matters (M5-sized inputs).

## 2026-09-27: what the gdb picture shows (principle 4 details)

- Uninitialised locals show `?`, not stack garbage, until a value changes
  or the executed line assigns them (a regex over the source line). Params
  are always defined.
- Pointers resolve to what they point at: a variable (wire), an array
  element (`bufs[0]`), a heap block or offset into it (`#1`, `#1+10`), or a
  block that was freed (`freed #3`, drawn dangling). Anything else shows as
  a raw address.
- A write to a variable outside the running function is attributed to the
  running function's pointer that points at it (the wire it travels).
- With more than four live pointers, only the running function's wires and
  the focused function's wires are drawn. The rows still show every target
  as text.
- Long traces pick a playback speed that plays them in about 45 s.
- The GNL sample passes `-D GNL_INIT_CAP=8` (the fixture's own `#ifndef`
  knob) so the doubling shows on short lines. The fixture files are
  unchanged; the sandbox adds a small `main` after them.

## 2026-09-27: M2 author layer and binding limits

- **Decision:** Place strip, marker, chest, drill, inserter (copy), stack,
  and train sprites by dragging from the dock. The inserter was added in
  review because the M2 acceptance picture needs one. They stay where the author puts them and sit
  alongside function frame rows. Selecting a sprite opens its binding form;
  right-click offers Bind and Remove. A typed struct with `char *` data and
  named `size_t` fields can suggest a strip with markers, but the author
  chooses whether to add it.
- **Why:** Dock dragging follows the mouse-first canvas model, and keeping
  the frame row preserves the complete execution record beside the author's
  more focused view.
- **Decision:** Bindings accept only read-only identifiers with field and
  array-index access, such as `buf->data` or `bufs[fd].pos`. Both the browser
  parser and blueprint import validate them. Calls, writes, and arbitrary C
  expressions are excluded. The gdb tracer samples at most 256 bytes per
  strip per stop; capacity and marker indices still use full values.
- **Why:** Gdb expression evaluation must not alter the program being
  observed. The byte cap keeps the per-step timeline bounded while showing
  enough contents for small 42 buffers.
- **Decision:** Blueprint download/upload contains node positions, call
  waypoints, and sprites only; source and stdin remain local to each sample.
  Bindings rerun the trace and clear previous values until new samples arrive.
- **Why:** Text stays the source of truth, and stale values must never appear
  under an edited expression.

## 2026-09-27: M4 truth checks

- **Decision:** Invariants live on sprites (`invariants` in the blueprint,
  one per line in the sprite form) and are checked **client-side** over the
  values the tracer already sampled. Nothing is evaluated in the running
  program. The grammar (`proto/src/invariants.ts`) supports:
  - comparison chains over marker labels, `length`/`size`, `value` and
    integers (`pos <= len <= cap`, `len - 1 < cap`);
  - zero runs (`zero after len`, `zero after len for 8`);
  - an `on return:` prefix that checks only right after a function
    returns, for invariants a function may break mid-way and must restore.
- **Why:** Reusing the samples keeps checks instant to edit (no re-run) and
  keeps gdb strictly observational. `on return:` exists because gnl_v3's
  zeroed run is broken for one line on purpose (read() writes past `len`
  before `len` moves).
- **Finding:** "all bytes after `len` are zero" is **not** gnl_v3's
  invariant. `gnl_consume` zeroes only `sizeof(size_t)` bytes when it
  resets, exactly as its comment says. The author's invariant is expressible
  as `on return: zero after len for 8`, and the correct run satisfies it.
- **Decision:** A violation is an *episode*: first false sample to the next
  true one. Its culprit line is the last line executed before the sample.
  Forward playback freezes at the start of each episode, the sprite gets a
  red frame, the culprit line turns red in the editor, the timeline gets a
  red tick, and the alert links to the step and the line. Unknown samples
  (unbound) decide nothing.
- **Decision:** Built-in picture checks: every strip marker stays within
  `0..length`, and a call the static graph didn't predict (through a
  function pointer) is flagged, with a `?` badge on its belt and an alert
  at the call site.
- **Decision:** Leaks are reported only for a run that exited. A truncated
  or crashed run just stopped with blocks still in use.
- **Decision:** The tracer delta-encodes stops (changed variables, statics,
  heap contents and bound samples only; `expandStops` rebuilds them).
  Runs started from the editor are capped at 8 s. Correct gnl_v3 dropped
  from 1.6 MB to 0.29 MB; a runaway buggy variant from 40 MB to 2.7 MB.
