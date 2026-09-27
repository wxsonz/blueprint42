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

## 2026-09-27: M5 open a real project

- **Decision (author):** Saving is allowed but never automatic. Every save
  goes through a dialog that lists each file, whether it's new, `+/−`
  line counts and an expandable diff, and writes nothing until confirmed
  (Ctrl+S, the Save… button, or `:w` in vim). Unsaved work is backed up in
  browser storage ("hot exit") and restored only over the same disk text
  it was edited from.
- **Decision (author):** Opening a project behaves like VS Code:
  `npm run dev -- <folder>` opens it (like `code <folder>`), Open Folder…
  (Ctrl+O) browses folders through the local server, and the last folder
  reopens on the next start. Also: tabs, a file list (Ctrl+B), go-to-file
  (Ctrl+P), and reloading files changed on disk by another editor, unless
  they have unsaved edits here (then they're marked as a conflict).
  Ctrl+O and Ctrl+B stay vim's while the editor has focus in vim mode.
- **Decision:** Only `server/project.mjs` touches the author's files. It
  reads `.c`, `.h`, Makefiles and `.ft_blueprint/`, and skips `.git`,
  `node_modules`, other dot folders and files over 1 MB. It writes only:
  - inside a folder opened this session;
  - to those same kinds of files;
  - never through a symlink out of the folder;
  - never over a file whose mtime changed since the page loaded it, unless
    the author picks "Overwrite with mine".
  The routes sit behind the same localhost + same-origin + `x-ftb` guard as
  the trace server.
- **Decision:** Multi-file visuals. Each `.c` file is a module:
  - A collapsed module is one block that lists its doors, meaning its
    non-static functions. A door is marked when no header declares it.
  - An open module is a wall around its machines.
  - Calls between the same two hosts share one belt (a trunk) with a
    call-site count.
  - A belt passing a module's wall gets a door mark.
  - Modules start collapsed (SPEC), except the one with `main`.
  - Modules are packed in columns by the file-to-file call graph. Only
    auto-placed ones move. Dragging a machine inside a module pins that
    module, so re-packing never drags your arrangement away.
  - While running, a collapsed module lights up and shows which function is
    running inside and how deep. Playback never opens a module by itself.
- **Decision:** Ids across files. A function keeps `func:<name>`. Only a
  `static` function that another file also defines becomes
  `func:<name>@<file>`, and its machine keeps its place when that happens.
  Calls resolve like the linker: the file's own definition first, then the
  one non-static definition. A call to another file's static is a warning,
  not a belt.
- **Decision:** Building. The trace server receives the project's current
  buffers, saved or not, and builds a copy in a temp folder:
  - With a Makefile: `make CC="cc -g -O0 -D…"`, so the Makefile's own
    CFLAGS, `-Werror` and sub-makes (libft) apply.
  - Its `NAME` is the program. If `NAME` is a `.a`, the program is the
    driver `.ft_blueprint/main.c` linked against it.
  - Without a Makefile: `cc -Wall -Wextra -Werror -g -O0` on every `.c`,
    with `-I` for each header folder.
  - Only source-like files are copied, so data files such as `.ber` maps
    are not there yet.
  - A Makefile that drops `-g` (calls `cc` directly) gets a clear error.
- **Decision:** A library (libft, gnl) runs through a driver
  `.ft_blueprint/main.c`, offered by a button when there's no `main`. It's
  set aside if the project has its own `main`. Run settings (stdin, args,
  `-D`) live in `.ft_blueprint/run.json`.
- **Decision:** `.ft_blueprint/blueprint.json` (format v2) holds only what
  the author decided:
  - pinned machines, relative to their module;
  - pinned modules;
  - modules opened or closed against the default;
  - routes and sprites.
  Auto-placement is reproduced from the code, so the file doesn't churn in
  git. The browser keeps full positions for continuity. Blueprint v1
  (samples) still loads.
- **Decision:** gnl_v3 is also bundled as a read-only sample project (the
  untouched fixture files plus a driver and `run.json`). It shows modules
  in a static build and is the M5 acceptance input; saving it is refused.

## 2026-09-27: Real data on belts, struct fields in frames

- **Decision (author):** What rides a belt is the real data, not the
  argument's name:
  - A `char *` travels as its text (`"hello\n"`).
  - A struct, by value or behind a pointer, travels as a crate: its type,
    where it lives (`t_gnl @ →bufs[0]`), and its fields with values.
  - An `int *` shows what it points at (`→a = 3`).
  Returns work the same way: `get_next_line` hands back `"hello\n"`. The
  playbar reads the same way (`gnl_consume({data "hel…", len 23, …}, 21)`).
- **Decision:** A struct variable (or pointer to one) unfolds in its frame
  into one row per field, with live values. A field that changed on this
  step is lit. Fields come from the struct definitions in the code
  (typedef aliases included), so frame sizes are known before a run and
  the layout is stable. Rows are open by default, capped at 6 fields plus
  "+n more". Clicking a struct row folds it, and auto-placed machines
  reflow. Folds are saved with the layout (`folded` in the blueprint).
- **Decision:** The tracer follows a struct pointer one level (the
  pointee's fields only; `lst->next` stays an address). A record is
  rebuilt when anything it shows changes: the pointee's bytes and the text
  behind its `char *` fields, not just the pointer. Strings are cut to a
  readable length instead of shrunk to fit.
- **Decision:** Amp draws data in VT323. Its pixel font has capitals only,
  which turned `hello` into `HELLO`. That misreports the data, and strips
  had the same problem.

## 2026-09-27: Fast and Focus playback

- **Decision (author):** Two ways to play, switched in the playbar (or
  `M` on the canvas) and remembered:
  - **Fast** is the existing animation: every event plays once and the
    follow camera only pans, never zooms.
  - **Focus** stages each call, return and write through a pointer as a
    short scene:
    1. The camera frames the sender and the receiver.
    2. Everything else is veiled.
    3. The sender flashes while the data waits at its port.
    4. The data travels 3 times for a call and 2 for a return or pointer
       write.
    5. Then the receiver flashes as the new state appears.
  - Each skin draws the veil colour and its own "look here" mark: Amp a
    green viewfinder, Classic yellow marching ants, Aqua a blue halo,
    Minimal accent corners.
- **Decision (author feedback, revised):** Focus scenes send the data
  **once**, with longer pauses instead of repeats:
  - **A call** (or a write through a pointer) waits at the sender to be
    read (1.5–5 s, more for more data), travels once, then stays parked at
    the receiver while its frame fills in (1.2–4 s).
  - **A return** first shows a **card** over the fully veiled grid (2.5–7 s,
    sized to its content):
    - *in*: what the function was called with, including struct fields;
    - *out*: what it hands back, meaning its return value and anything it
      changed through its pointers (`buf->pos 0 → 6`, `*n 3 → 4`), with
      changes marked and unchanged values dimmed.
    - Changes to by-value copies aren't shown as outputs.
  - **Then** the end product travels back once. When a function also
    changed data through pointers, that rides along as a crate
    (`void · changed`, `buf->pos 6`).
  - The camera frames the sender while you read (and during the card),
    both while the data travels, and the receiver during the hold.
  - Data is drawn at least full size in focus. Arguments travel as a train
    that fits the belt. Fast mode is unchanged.
- **Decision:** Focus scenes never play faster than 1.5×. Plain steps still
  follow the speed setting, so long traces (GNL: about 1,000 events) stay
  watchable. Positions are in events, so switching modes mid-run keeps the
  same moment on screen.
