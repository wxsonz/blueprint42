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

## 2026-09-27: M5.5 inside a machine (the author's design)

- **Decision (author):** The canvas pane is renamed "Blueprint".
- **Decision (author):** A function's interior opens in place: the machine
  expands on the grid and neighbours move aside. Not an overlay, not a side
  panel.
- **Decision (author):** Every statement is a station. Conditions are
  switches that fork the track, loops are loop-backs with counts, and
  `return` is an exit. A token follows the running line, and each switch
  shows its operand values and result.

## 2026-09-28: M5.5 as built

- **Decision:** The interior hangs under the frame panel, as wide as its
  code needs (at most 12 cells). Auto-placed machines move aside: the
  column gets wider and the machines below move down. Pinned ones stay.
- **Decision:** Double-click a machine opens or closes it and still jumps to
  its code; double-click a statement inside jumps to that line. Right-click
  has Open/Close too.
- **Decision:** A switch's result is never computed by the tool. The
  interpreter reports it (`eval`); under gdb it is the next line the frame
  ran. While the frame sits on a switch its result shows as `…`.
- **Decision:** The readout replaces only names and one-level members
  (`buf->pos`) with their values at that moment. Calls, `sizeof` and array
  names stay as written, so `i < sizeof(size_t)` reads `8 < sizeof(size_t)`.
- **Decision:** A loop's count is for its current run (or its last one),
  not a total over the whole function call, so a nested loop starts again
  at ×0 each time round the outer one.
- **Decision:** One skin hook (`interior`) drawn by a shared function with
  each skin's palette, like crates, instead of three hooks per skin.

## 2026-09-28: M6 live edits from any editor

- **Decision (author):** The web app doesn't care where a change is made;
  it applies it to the view. So the bridge is editor-agnostic: a local
  push/stream API that any editor can use, with nvim as the first client,
  instead of the app attaching to nvim's RPC socket.
- **Decision:** The in-app editor stays editable. When an editor pushes a
  file, that text replaces the page's (the latest change wins, with a note
  if the page had its own edits there).
- **Decision:** An editor's unsaved text is never written by the tool. It
  shows as unsaved in the page; saving is `:w` in nvim (or the page's own
  confirmed Save). Quitting nvim without saving reverts the page to disk.
- **Decision:** Transport is plain HTTP on the existing dev server: POSTs
  and one long-lived POST stream of newline-separated JSON, behind the same
  guard as the other routes. The nvim side uses `curl`, so the plugin has
  no dependencies beyond Neovim 0.10.
- **Decision:** The page follows the editor's cursor and current file, and
  a double-click on the grid moves the editor's cursor (SPEC's one reverse
  channel, now to nvim too).

## 2026-09-28: the Common Core this tool targets

- **Decision (author):** The reference for "the 42 Common Core" is the
  current curriculum the author downloaded to `~/42cc/42cc-new`
  (`projects_data.json` lists every project with its rank and language).
  pipex and minitalk are no longer in it. Its C projects are Libft,
  ft_printf, get_next_line, push_swap (rank 00–01) and Codexion (rank 03,
  threads and mutexes); most of the rest is Python.
- **Why:** The parking lot named projects that no longer exist. Check that
  folder before planning support for a project.

## 2026-09-28: Enter the machine (replaces M5.5's in-place interior)

- **Decision (author):** The inside of a function is a main feature, not a
  side panel. Double-click enters the machine: it becomes a room filling
  the Blueprint pane, with the factory faint around it; Esc leaves. This
  replaces "expand in place" from 2026-09-27.
- **Decision (author):** Inside, playback is slow for that function's
  statements and skips everything else.
- **Decision:** A statement's reads are the names it uses (not the plain
  target of `=`), valued from the snapshot at its stop. `i++` and `&x`
  are shown as written. Its writes are what differs at the next stop. Both
  come straight from the trace, and nothing is evaluated.
- **Decision:** Pointed-at bytes live on a memory floor along the bottom
  of the room (legible at 24 cells wide), not inside the frame panel. Sibling
  integer fields named like indices (`pos`, `len`, `cap`, `size`, `start`,
  `end`, `i`…) mark their position on it. That is a naming heuristic, and
  it only draws values that are really there.
- **Decision:** The room reuses existing skin hooks (wall, frame, strip,
  interior, door, plate, pulse) rather than adding new ones, so every skin
  has it at once.

## 2026-09-28: the machine is its inside (replaces "enter the machine")

- **Decision (author):** No separate viewer. Every machine on the grid *is*
  its inside, always: storage on the left, stations on the right, memory
  along the bottom. People always see the moving parts.
- **Decision:** Belts join statements, not boxes: a call leaves the
  caller's right side at the row of the statement that makes it and enters
  the callee's entry door (left side, top). Its return comes back the same
  way into that statement.
- **Decision (author):** Detail by zoom. Close up, every station, variable
  and byte moves; zoomed out, machines fade to a compact summary (name,
  state, current line). Nothing to toggle.
- **Decision (author):** Fast/Focus decide the pace. Every statement is a
  beat (read → compute → write), about 0.35 s in Fast and 1.1 s in Focus
  at 1×; calls and returns keep their belt animations. ←/→ step one
  statement.

## 2026-09-28: Tidy, closed machines, four more themes

- **Decision (author):** A button puts the layout back to the auto layout
  (**Tidy**: unpins everything, drops hand-routed belts; Undo in the toast).
  **Insides / Closed** shows or hides every machine's inside; a closed
  machine is its motor plus the line it's on. One machine: double-click
  its title or motor.
- **Decision:** Layouts saved when machines were small are settled when
  they load (auto machines re-placed, colliding pinned ones freed) instead
  of drawing machines on top of each other.
- **Decision (author):** Four more themes: Blueprint, Factory floor, Game
  Boy, Synthwave. They share one implementation of the skin hooks
  (`skins/kit.ts`) driven by a theme spec (palette, fonts, card, floor,
  belt, flourishes). The original four keep their own files. The picker
  is a dropdown now.

## 2026-09-28: speed, zoom out, lenses

- **Finding:** under load, most frame time is the browser painting canvas
  pixels, not JavaScript (measured: 7.5 fps at 4× CPU throttle on a 2×
  screen; 2.5× faster at 1×). Linux browsers often paint canvas in
  software.
- **Decision:** adaptive sharpness. The canvas starts at the screen's pixel
  ratio. If frames run slow for a second while something moves, it paints
  at a lower ratio (2 → 1.5 → 1.25 → 1 → 0.75, with a one-time note), and
  it goes back up when there's headroom. Measured under the same load: 7.5
  → ~37 fps.
- **Decision:** don't draw what's off screen (machines, modules, belts,
  walls). Remember fitted and cut text. Draw the timeline strip once per
  trace and skin. Synthwave glows use wide faint strokes, not `shadowBlur`.
  Paused and still, redraw at ~15 fps.
- **Decision (author):** zoom out to 2%. Far out, a machine is just its
  shell (no text); backgrounds drop their per-cell detail.
- **Decision (author's idea):** lenses instead of a zooming camera. When a
  call or return travels to a place off screen, or a statement writes into
  memory another machine owns (a static, a caller's local), up to two
  small live views of that far end appear in the pane's corner. Fast mode's
  camera still only pans.
- **Decision (2026-09-28, the author found Focus dimming slow):** measured
  with the paint forced to finish, a dimmed frame cost ~2× a plain one. The
  attention marks' `shadowBlur` was most of that, then the veil and the
  full insides of machines under it. Now attention marks use a wide faint
  stroke instead of blur (every skin), machines outside the scene draw
  compact while veiled, Synthwave's sky and sun are cached per size, and
  lenses repaint at ~15 fps. Dimmed now ≈ 1–1.35× plain.

## 2026-09-28: real windows, and XP / 7 / 8 skins

- **Decision (author):** Classic's machines and files are real windows:
  a title bar across the whole top with caption buttons, a gray client
  area for a machine, and the dark app workspace for a file (an MDI parent
  holding its functions' windows). There's no turquoise inside them any
  more. `WallInfo.kind` tells skins which is which.
- **Decision (author):** Three more skins: Windows XP (Luna), Windows 7
  (Aero), Windows 8 (Metro). The theme kit gained window chrome
  (`Theme.window`: frame, title bar, caption buttons, progress bar) and a
  cached wallpaper helper (`backdrop`). Wallpapers are drawn, not images:
  Bliss, Harmony, and the Metro start purple. Metro gives each machine its
  own tile colour from its name.

## 2026-09-28: the Mac eras

- **Decision (author):** Mac skins alongside the Windows ones: System 7,
  Mac OS 9 (Platinum), Mac OS X Leopard, OS X Yosemite, macOS Big Sur and
  macOS Tahoe (Liquid Glass). The existing Aqua skin covers 10.0–10.4.
  They're theme-kit specs in `skins/macos.ts`, sharing traffic lights,
  centred titles and title-bar stripes. Wallpapers are drawn, not copied
  images: the gray pattern, OS 9 blue, Aurora, a dusk mountain, coastal
  waves, and the lake. The skin list is ordered Windows, then Mac by era,
  then the rest.
- **Decision (author: "XP never had a square focus border"):** On the
  desktop skins, selection and attention speak the OS's language. A
  selected machine is the active window (active title bar), with no box
  and no hover outline. Focus mode's "look here" flashes the window's
  title bar and draws a ring along the window's own corners (square-bottomed
  on XP). Skins that paint whole windows set `solidMachines`, so the engine
  doesn't lay its square floor behind rounded corners.

## 2026-09-28: kill feed, the duel, Barebone

- **Decision (author):** Transfers between functions get a kill feed
  (top-right of the Blueprint pane). Each call, return, and write into
  memory another function owns is one row: a coloured icon with the
  function's initials, an action icon (➜ call, ↩ return, ✎ write), and a
  short payload written the C way (`int fd = 0 · t_gnl * buf = {…}`,
  `t_gnl_status GNL_LINE_READY`, `bufs = …`). Newest on top, older rows
  fade; click a row to jump there. It's built once per trace and redrawn
  only when the newest row changes.
- **Decision (author):** The corner lenses become the duel. When a
  transfer's sender or receiver is off screen, an overlay pops up with the
  sender on the left and the receiver on the right. Each view slides in
  from where its machine really is, its camera starting on the whole
  machine and gliding to the spot. The payload crosses from left to right.
- **Decision (author):** A Barebone skin for speed: flat fills and 1 px
  lines, no gradients, glow, blur, shadows or floor pattern, belts that
  change colour instead of animating, system fonts. Measured at 2× with
  the paint forced to finish: 5 ms a frame (Minimal 6.4, Tahoe 11.7, Amp
  17.4).
- **Decision (author):** Barebone is black and white: no borders or glow
  anywhere (surfaces differ by a shade), and colour only where it means
  something: the running machine and live belts (blue), pointers,
  returned values, errors, and a value that just changed. Feed icons are
  gray there; only the action keeps its colour.
- **Decision (author):** The duel viewer sits on a black backing, with a
  heavy black edge around each view, so the busy scene behind doesn't
  blend into it. The frame is drawn under the live view (some skins paint
  it solid).
- **Decision (author: the live views "lack attention"):** The duel shows
  what's happening as code, not as more scene. For a call: the caller's
  line with the call marked, and the callee's signature with the values
  that arrived. For a return: the return statement with its typed value,
  and the caller's line with the call replaced by that value. For a
  write: the writing statement, and the owner's variable going from old
  to new. A big verb (CALLS / RETURNS / WRITES INTO) sits in the middle,
  with the payload chip crossing. It's a DOM overlay on a black backing
  that stays up ≥1.5 s, and it's cheaper than the two live views it
  replaced.

## 2026-09-28: light and dark modes

- **Decision (author):** Skins whose originals had both looks get both:
  Barebone (dark ↔ light), Windows 8 (dark ↔ light), macOS Big Sur and
  macOS Tahoe (light ↔ dark). The picker lists one entry per skin; a ☀/☾
  button next to it appears only when the skin has both, and the chosen
  mode (`ftb.mode`) carries over to the next skin that has both. A
  variant is its own skin (`variantOf`, `mode`) built from the same theme
  builder, with its own stylesheet. Skins whose originals had one look
  (XP, 7, System 7, OS 9, Aqua, Leopard, Yosemite, Game Boy…) stay single.
- **Decision (author: Factory title bars unreadable, fps drops on Focus
  zoom):** Factory's title sits on dark steel under a thin hazard band
  (the stripes used to run under the text). Its floor was ~10 of 14 ms a
  frame while zooming (thousands of tread marks, then a screen-sized
  scaled pattern). It's now plain geometry: plate rectangles, one seam
  path and corner rivets, and it costs ~1 ms. Running machines and lamps
  glow with halos, not blur. Measured while zooming, paint forced: 13.9 →
  4.9 ms.
- **Decision (author: the overlays were vague):** The duel opens with a
  plain sentence ("get_next_line calls gnl_fill_line with fd = 0, …",
  "gnl_fill_line returns 0 to get_next_line", "gnl_consume changes
  get_next_line's bufs: … ➜ …"), and each card has a role title (CALLER
  / CALLED / RETURNING / WRITER / OWNER) with a short line on what that
  side is doing. Focus mode's return card is rewritten as statements:
  ① it was called with (typed), ② it gives back (typed, or "nothing
  (void)"), ③ it changed, through its pointers (`buf->len  23 ➜ 0`, one
  big line each, or "nothing it can reach changed"), ④ left as they were.
  While that card is up, the duel stays hidden.

- **Decision (author: the statement-style return card was harder to
  read):** Back to a side-by-side comparison, but the changes can't be
  missed: a table of everything the function could reach, with columns
  *before (when called)* and *after (now, at return)*. A changed row gets
  an accent band, the old value struck out, `➜ new` in bold and a
  CHANGED tag. Rows that stayed the same are quiet and say "same". A
  pointer argument says "same address · what it points at is below", and
  a value argument says "a copy: the caller's own is untouched". "Gives
  back" sits on top and a count sits at the foot. (Bug found on the way:
  `#duel` had `display: grid` and no `[hidden]` rule, so hiding it did
  nothing and it could sit behind the card.)
- **Decision (author: Barebone dark too dark; Minimal wants light):**
  Barebone dark is charcoal now (`#161616` floor, `#222`/`#2b2b2b`
  cards, softer greys for text) instead of near black. Minimal becomes
  `minimalOf(dark)`, with a light twin `minimal-light` (paper `#f5f6f8`,
  white cards, the same blue accent darkened for contrast) and
  `styles/minimal-light.css`.
- **Decision (author: icons in the skin list):** The `<select>` is now a
  button plus a popover grid. Each skin shows a 72×44 preview that the
  skin itself draws (its `background` and one `node` on a small canvas,
  cached as a data URL), so a preview can't drift from the real look.
  Also shown: the name, a ☀☾ mark if it has both modes, and its blurb.
  Only base skins are listed; the ☀/☾ button still picks the mode, and
  picking a skin keeps the stored mode. It closes on Escape or a click
  outside.
- **Decision (author: Factory titles still unreadable; tiny fonts in Game
  Boy, System 7, Amp):** Audited every skin headlessly, measuring the real
  x-height of each visible DOM text, not its px size. Fixes:
  - Text never sits on stripes. Factory's panel titles are steel with the
    hazard band above them. System 7 and OS 9 cut a plate out of the
    stripes for the title, as the real Mac did (`--ptitle-plate`), and do
    the same for the pane-head info.
  - VT323 draws small for its px size. `base.css` multiplies every mono
    size by `--mono-scale` (1.4 in Amp, Game Boy and System 7), and the
    overlays' labels and notes use `--label-font` / `--label-scale`.
    Amp and Game Boy use VT323 there instead of their tiny pixel UI font.
  - System 7 uses VT323 on purpose (Monaco isn't there on Linux, and the
    fallback was tuned for nothing).
  - On the canvas, Game Boy keeps Press Start 2P for titles (13 px and
    up) and draws smaller labels in VT323. System 7's canvas mono is
    VT323 at 1.35×. Amp's caption strips grow from 8 to 10 px.
- **Decision (author: the canvas zoom readout is useless; wants a zoom
  for everything):** The header has an app zoom (`− 100% +`, click the %
  to reset). Ctrl+wheel anywhere, the canvas included, and Ctrl+= / − / 0
  step through browser-like levels (50–300 %), remembered in
  `ftb.zoom`. It's CSS `zoom` on `<html>`: the canvases measure their
  boxes, so they stay sharp and hit-testing is unchanged. `#app`'s
  height divides out the zoom because viewport units ignore it, and the
  context menu divides it out of its position. The page can't read or
  set the browser's own zoom reliably, which is why it's our own. The
  plain wheel still zooms the camera, and its % readout is gone.
- **Decision (author: the duel ignores the skin):** The duel is built from
  the skin's own variables now, with nothing hard-coded:
  - the sentence is the skin's title bar (`--ptitle-*`, with the stripe
    plate);
  - the frame is the skin's panel (`--panel-*`, painted by `::before`
    over `--bg`, so translucent and gradient panels still hide the
    canvas);
  - the cards use the skin's field borders;
  - the role strip, track and chip take panel and editor colours.
  
  Skins can tune it with `--duel-say-size` (Game Boy uses 10px). Checked
  headlessly in all 23 skins, including title contrast.

  Fixed on the way:
  - Barebone light's `--ptitle-fg` was the dark skin's white.
  - A duel that began fading out stayed invisible if the same event came
    back.
- **Decision (author: Aero and Liquid Glass don't look right):** Both
  drew opaque boxes. `kit.ts` `glassBehind()` now shows the skin's own
  wallpaper through a window. The wallpaper is fixed to the screen, so
  what's behind a window is the same pixels of the cached backdrop:
  - a blurred copy is made once per size;
  - each window draws only its own rectangle from it;
  - with `lens > 1` it's magnified about the window's centre.

  The two skins:
  - **Windows 7:** frames are blurred Harmony under a blue tint, with a
    top shine, diagonal streaks and the dark and white double edge. The
    DOM chrome became Aero too: the page is Harmony, the top bar and
    playbar are glass (a light blur over the static wallpaper), and each
    pane has a 6 px glass frame. Costs about 0.5 ms a frame.
  - **Tahoe:** windows are clear glass that bends the lake (4 px blur,
    1.07× lens), with a lensing edge (light top-left, shade bottom-right)
    and the content on a lighter frosted sheet. File walls stay plain
    tint, since they're big and the lens there cost for little. The lens
    costs about 3 ms a frame at 2× DPR (scaled draws leave the fast copy
    path); the adaptive resolution absorbs it.
- **Decision (author: Tahoe should be frosted, the way later releases
  toned Liquid Glass down):** Tahoe's windows are frosted glass: a 12 px
  blur, no lens, a whiter frost and a softer rim. It's also back on the
  fast copy path (the lens cost about 3 ms).
- **Decision (author: Windows 7 put the skin list behind the viewer):**
  The Aero blur (`backdrop-filter`) made `#top` its own layer, below the
  panes that come after it. `#top` now sits at `z-index: 30` for every
  skin.
- **Decision (author: console skins; picked PS1–PS5, Wii, GameCube, N64,
  Switch, SNES and GBA):** Eleven kit themes in `skins/consoles.ts`, with
  Wii and Switch in light and dark. Each has a cached wallpaper and
  window chrome in the console's own style:
  - **PS1:** grey plastic with the △○✕□ buttons.
  - **PS2:** the boot towers, and dark blue glass.
  - **PS3:** the XMB wave, and the highlight band.
  - **PS4:** bokeh, flat tiles and the white focus.
  - **PS5:** the white focus ring.
  - **Wii:** white channels with the blue glow.
  - **GameCube:** isometric cubes.
  - **N64:** four-colour title bars and segmented progress.
  - **Switch:** a focus outline that breathes, and Joy-Con dots.
  - **SNES:** purple bars and the Super Famicom buttons.
  - **GBA:** a screen inside a bezel.

  Their chrome and editor CSS (about 110 variables each) is generated
  from about 20 base colours by a script that isn't kept in the repo.
  The files are ordinary CSS now. New web fonts: Rubik, Exo 2, Nunito,
  Jost and Chakra Petch.

  Checked headlessly: close-ups, duel title contrast (all at least
  4.6:1) and the text-size audit.
- **Decision (author: the skin list is overwhelming):** The picker groups
  base skins by family (`SKIN_GROUPS` in `skins/index.ts`): Simple,
  Windows, Mac, PlayStation, Nintendo, Just for fun. A skin missing from
  the groups still shows, under "Other".
  - The list has a sticky row of jump chips, a heading per group, and
    opens scrolled to the current skin's group.
  - `test/skins.test.ts` checks that every base skin is in exactly one
    group and that no light/dark twin is listed.
- **Decision (author: the Game Boy skin list is far bigger than
  others'):**
  - The picker read in the active skin's UI font, and Press Start 2P is
    about twice as wide as a normal font. It now uses `--label-font` /
    `--label-scale`, as the overlays do: Amp and Game Boy get VT323,
    the rest keep their UI font.
  - Line height divides out the label scale, since VT323's glyphs are
    short.
  - The open list's height went from 1577 to 1232 px in Game Boy and Amp,
    against about 1090 px in the other skins.
- **Decision (author: Windows 7 and Tahoe look "not quite right"):** Both
  are redrawn from references, not from memory.
  - **Windows 7** (MakeAero's generator values; NameThatUI):
    - a 9 px frame with 8 px corners;
    - "Sky" glass, `hsl(210 65% 52%)` at about 0.52;
    - a strong top shine (0.62), streaks at 0.22;
    - a dark outer line, a bright inner hairline and a soft inner glow;
    - caption buttons hanging from the top edge: 19 px tall, 1.45 : 2.3
      widths, square on top, with the split-gloss red close
      (`#e6a99f → #d16b5b | #cf4b34 → #d8654c`);
    - a dark caption on a white glow.
    
    The glass, tint and shine cover only the frame ring (`glassBehind`
    got a `hole`), since the client area covers the rest; that took the
    skin from about 15 to about 9 ms a frame (Minimal is 6–9).
  - **Tahoe** (WWDC 2025 notes via Zed #38233, lapcat, MacStories, OSXDaily):
    - toolbar windows have 26 pt corners;
    - the title is plain bold text by the traffic lights, not a pill;
    - the glass is a capsule of toolbar buttons at the trailing edge;
    - the window is a calm, near-solid frosted surface (0.9 over a 14 px
      blur);
    - content sits in flat grouped cards (white or 7% white, a hairline,
      12 pt corners);
    - the progress bar is a thin blue capsule;
    - the wallpaper is the default abstract wave (blue by day, violet by
      night), not the lake-and-mountains scene;
    - the DOM panes follow: the wave palette and 22 px corners.
    
    `liquidGlass` is gone.
- **Decision (author: pre-rendered textures for Aero's glass and shadow,
  as Windows does?):** Yes, as the real thing does.
  - `glassBehind` takes a `bake`: paint laid once on the cached blurred
    wallpaper copy. Windows 7 bakes its Sky tint and the reflection
    streaks into it. Like DWM's reflection texture, the streaks are fixed
    to the screen, so windows slide under them. Each window's glass is
    one image draw; only the window-relative top shine is still painted
    per window.
  - `kit.ts` `softShadow` draws a drop shadow from a pre-rendered
    nine-slice texture. It's blurred once per (radius, spread, colour),
    its inside is cut away so it never darkens glass, and it's drawn as 8
    image draws per window.
  - Measured A/B against the strokes and per-window fills: 9.0 against
    9.7 ms a frame, within noise, so it's no slower. The shadow is now
    real and soft instead of a 4 px line, at the same cost.
- **Decision (author, with a Windows 7 screenshot: the reflection runs
  the other way, and softly):**
  - The baked streaks now run from top-left down to bottom-right (about
    0.55 across per 1 down), wider and blurred when baked, so the soft
    edges cost nothing per frame.
  - The CSS glass on the top bar and playbar uses the same angle (61deg)
    with soft stops.
  - The caption glow is a pre-blurred white pill stretched behind the
    title, as Aero's is, instead of a hard white text outline. It's one
    image draw.
- **Decision (author: the Aero reflections should be much wider):** The
  baked bands are 60–180 px wide, 60–220 px apart, with an occasional
  thin bright one. They're softer (12 px blur, baked) and fainter (0.14)
  so the wide bands don't wash out the glass. The CSS glass (`--aero`)
  has matching wide bands.
- **Decision (author: Tab indents the front of the line, not at the
  cursor; show tabs and trailing spaces):**
  - Tab is CodeMirror's `insertTab`: a tab where the cursor is, or an
    indent when there's a selection. Shift+Tab is `indentLess`.
  - Both step aside in vim's normal and visual modes, where Tab isn't an
    edit.
  - Whitespace shows like vim's `listchars`: every tab as a faint `──›`,
    trailing spaces as dots on a soft red wash (norminette rejects
    them). Spaces inside a line stay unmarked.
  - The colours come from `--ed-ws` and `--bad`, so each skin can tune
    them.
- **Decision (author: the console skins should follow their real UIs, not
  just recolour):** Researched each console's interface and rebuilt the
  skins on it: the canvas chrome, and the app chrome through a shared
  `.sysclock` (a clock some consoles show; hidden unless a skin shows
  it). New fonts: M PLUS 1p (Rodin-like, the Wii), M PLUS Rounded 1c (the
  PS3 later) and Source Sans 3 (SST-like, PS4 and PS5).
  - **Wii**, from zuvv/WiiMenu's measured tokens:
    - the canvas: a light-blue lined desktop (`#eef7fa → #c9e2ec`);
      channels as glossy white bezels (14 px corners, `#ccd5da` edge)
      around a recessed screen; grey `#55636b` labels, centred; the Wii
      blue `#35b4e5` ring on the active one;
    - the chrome: the curved white bottom bar with a big grey clock in
      its hump, and round glossy buttons.
  - **Switch**, from Adam Argyle's recreation:
    - the canvas: Basic White (`#ebebeb`) or Basic Black (`#2d2d2d`);
      plain tiles; the selection is an outline 5 px thick and 5 px out,
      pulsing between `hsl(200 100% 50%)` and `hsl(200 100% 80%)`; the
      selected title in cyan;
    - the chrome: the user circle, time and battery top-right, round
      white icon buttons with coloured glyphs, and hint-bar rules.
  - **PS4**, from d4v1-sudo/Ps4-UI:
    - the canvas: `#0e6cc4` blue with light bands and dust; square tiles;
      a translucent white title strip (`rgba(255,255,255,.2)`); a 3 px
      white frame on focus; SST at light weights.
  - **PS5**, from khaledOghli/PS5_Online:
    - the canvas: dark over blurred, darkened game art; cards with 17 px
      corners; the white focus ring standing off the card;
    - the chrome: "Games · Media"-style text tabs (light, the active one
      bold) and the clock top-right.
- **Console skins, part 2:**
  - **PS3:** the XMB. Its backdrop colour follows the date, walking from
    this month's colour toward next month's, as the console's shader does
    (faquino/PlayStation-3-XMB's reverse-engineering notes: September is
    magenta, October amber). The clock sets `--xmb` so the canvas and the
    chrome agree. Items have no window chrome: soft dark panels, white
    rounded Rodin-style type (M PLUS Rounded 1c), the soft white
    highlight band on the active one, the date and time top-right.
  - **PS1:** the BIOS menu's big glowing purple-blue sphere (Drew1440's
    BIOS walkthrough) replaces the scattered △○✕□. They stay on the
    windows' buttons.
  - **PS2:** the chrome sits on the boot towers' blue haze, and the
    selection glows cyan.
  - **GameCube:** the IPL is black with a violet haze and one large
    translucent cube; the panes are glassy purple with lavender edges.
  - **N64, SNES and GBA** had no system UI to reference, so they stay
    hardware-inspired: plastics, button colours, the screen bezel, the
    N64 logo colours.
- **PS3 readability:** light months (amber, silver, gold) washed out the
  white chrome text. The gradient now starts only 12% toward white (it
  was 28%), and the chrome text carries a soft dark shadow, as the XMB's
  does. Audited all ten reworked console skins: duel titles are at least
  6.6:1, and no text has an x-height below 5 px.
- **Decision (author and friends: drop SNES, N64 and GBA):** Removed. They
  had no system UI to reference, and hardware colours alone read as a
  recolour. The Chakra Petch font went with the N64.
- **Decision (author and friends: the PlayStations don't feel right; use
  their console visual language and promotional graphics):**
  - **PS1**, after Teiyu Goto's plain grey console, Manabu Sakamoto's logo
    (a red P over an S in yellow, green and blue: `#e4002b`, `#f9b51b`,
    `#00a651`, `#0072ce`), the controller's four symbols, black jewel
    cases with ridged spines, and the black boot screen:
    - the page is the boot screen with the four colours faint from below;
    - the top bar and playbar are the grey console, with the logo stripe
      under the top bar;
    - buttons are like POWER and RESET, with a green power light on Play;
    - panes are black jewel cases with a ridged spine;
    - machine windows are bevelled grey plastic, with the stripe under a
      dark title bar and △○✕□ as its buttons.
  - **PS2**, after Goto's account (Kill Screen; SUPERJUMP): the thin blue
    logo on black is the Earth small in space; a jet-black monolith of
    stacked, squared-off ridges; lines bending at 90° like a laser
    through prisms; a blue gradient stand:
    - the canvas: black space, the Earth's blue from below, the towers far
      off; black slabs with ridged heads and electric-blue (`#2f8cff`)
      right-angle brackets; capital Orbitron titles; the progress bar is
      one line turning up at its end;
    - the chrome: ridged black bars with a thin blue rule, square outlined
      buttons that fill with the stand's gradient when on, and panes with
      blue corner brackets.
  - **PS5**, after Yujin Morisawa's design (Push Square, Creative Bloq): the
    DualSense's grip is about 40,000 tiny △○✕□ layered together, his
    Easter egg. The canvas and page carry that texture, barely visible
    (it's drawn above the backdrop's shading, or it vanishes). The playbar
    is the Control Center: a dark rounded tray with round buttons.
  - **PS4**, after the console (Tom's Guide): a parallelogram of matte and
    gloss split by a slim light bar, blue while working. The light bar
    runs under the top bar and under the active window's title strip.
  - **PS3** stays the XMB, which was already referenced.
- **Decision (author, with screenshots: PS1 feedback):**
  - **Flicker:** window buttons (△○✕□; Aero's and Metro's too) showed
    only above a width of 150 world units, right at a machine window's
    natural width, so rounding flipped them on and off. The threshold is
    now 110.
  - **Dither:** the PS1's 15-bit colour with a 4×4 ordered (Bayer)
    dither. The BIOS tiles are quantised to 5 bits a channel with a real
    Bayer dither once, when the backdrop is cached (`psDither`). A static
    Bayer tile is blended (`overlay`, 0.16) over the whole screen, which
    the GPU composites, with no per-frame filtering.
  - **Progress:** an old PC case's front panel: a green power LED, an
    amber disk LED that flickers while running, and a segmented load
    meter (green, then amber, then red).
  - **All grey, like the console:** the PAL BIOS's grey block background;
    grey panes and bars; a light editor with syntax colours to match.
  - **Buttons:** round and convex like the lid button; Play is green,
    and red while playing (`button.playing`, set by main).
  - **Logo and grille:** the logo carries the four PS1 colours, and the
    console's vent grille is the playbar's texture.
- **Decision (author: the dither is too much):** No more full-screen
  overlay; it grained the text too. The dither applies only where the
  PS1 would show it: shaded plastic and gradients (the top bar, the
  playbar's grille, the domed buttons), as a gentle Bayer layer blended
  into each element's own gradient (`background-blend-mode: overlay`),
  plus the BIOS tiles, which are dithered once when cached. Text,
  editor and flat panels stay clean.
- **Decision (author: the play light is backwards):** It shows the
  state, not the icon: red while paused, green while playing.
- **Decision (author: the PS1 duel doesn't match, the grille is noisy):**
  - The duel, the return card and the inspector get the windows' look:
    a dark title with the logo's four colours underneath.
  - The dark palette's pastels are replaced with colours that read on
    grey: calls in `#0063b3`, returns and values in `#00864a`, pointers
    in `#b0307a`.
  - The playbar is plain dithered plastic, and the vent grille is a
    slim, softer 8 px strip along its bottom edge, like the vent on the
    console's side.
- **Decision (author: PS1 storage and stations look off; put the grille on
  the machine instead):**
  - The kit gets an optional `Theme.panel(dc, r, head, title, live)`,
    used for a machine's storage (kit `frame`) and stations
    (`drawInterior`, through `SpritePalette.panel`) instead of the plain
    card and caption. The PS1's is bevelled grey plastic under a dark
    title bar with the logo stripe, like its windows.
  - `WindowStyle.frame` now learns the window's kind (`machine`, `module`
    or `node`), so the PS1 draws the console's vent grille down the left
    side of each machine, as if the function were the console's top. The
    grille is gone from the playbar.
- **Decision (author: the four-colour line is overused noise):** The
  logo's colours appear in only two places: the brand logo and the title
  bar of the active window (running or selected), where they mark focus.
  The top bar, pane heads, the duel, the return card, the inspector,
  storage and stations lose the stripe; they use plain dark or grey
  rules.

## 2026-09-28: the PS2 boot screen, animated
- **Decision (author: make the PS2 dramatic with the menu's dancing lights,
  light trails, the era's stacked-frame blur; then: sharp trails as in the
  "Sony Computer Entertainment" screen, low-res fog, glass cubes):** The PS2
  background is that boot screen, animated:
  - Black space with a blue fog in the middle: two tiny value-noise
    textures (96×60) scaled up and drifting against each other.
  - Six glass cubes tumbling, sharp (author: not low-res, and fake the
    reflection). Faces are sorted back to front. Far faces are barely
    there; near faces get a dark glass gradient lit by where they point
    and a reflection band (soft, with a sharp core) whose place follows
    the face's angle, so it slides as the cube turns. No outlines, and
    kept dim (author: edges and brightness were too much).
  - Parallax (author): each layer follows the grid's pan by a fraction
    (fog 3%, lights 7%, cubes 10–22% each by depth) and zooms by a small
    power of the grid's zoom (fog z^0.12, lights z^0.25, cubes z^0.35).
    Cubes wrap around as you pan; the fog and lights ease to a stop
    (tanh) so they never leave the screen.
  - Four coloured lights (red, green, violet, blue) sweeping through in
    3D, each with a glowing head and a hairline trail drawn at full
    resolution.
  - It's stateless. A trail is the light's own path sampled back in
    time, so it looks the same at the idle 15 fps, at 60 fps, and in the
    picker's still preview. Reduced motion freezes it. It costs about
    0.5 ms a frame.
  - The towers and Earth glow are gone. Machine windows are smoked (80%)
    instead of solid, so the lights pass behind them; storage and
    stations stay opaque under text.
- **Decision (author: too much blue; the PS2 is darker, with its iconic
  blue):** The chrome and canvas are black and graphite with white-grey
  text. Blue (the logo's: royal `#1a1ad6` to `#2f7cff`, lines in
  `#3f6bff`) is kept for the corner lines, the active window, pressed and
  primary buttons, the cursor and selection. The fog is darker and
  thinner. The Earth glow under the page is gone.
- **Fix (author: zoomed far in, the cubes shift oddly):** Parallax used
  the camera's corner in zoomed pixels, so zooming changed the offset and
  the cubes wrapped. It now uses the world point at the view's middle,
  in px at zoom 1, so zoom only scales the layers.
- **Fix (author: zooming out still drifts):** Zoom is anchored at the
  mouse, so zooming far out moves the view's middle across thousands of
  world px. The parallax now adds up how far the grid actually moved on
  screen, frame by frame; a zoom moves it at most the mouse's distance
  from the middle. Each layer's zoom is clamped to 0.7–1.8×.
- **Decision (author: data in flight should leave a light trail):** A new
  optional skin hook, `Skin.trail(dc, pts, kind)` (`Theme.trail` in the
  kit), gets the stretch of path that data just travelled, oldest point
  first, and draws under the data. The engine passes it for:
  - a call's argument train along its belt (about seven cells behind the
    tail);
  - a return riding back;
  - a write's pulse along its wire;
  - reads and writes inside a machine.
  Only the PS2 sets it for now: a white-hot hairline over a wide faint
  glow in the lights' colours (blue for arguments, teal for returns),
  fading toward the tail, with a glowing head. Skins without it draw
  nothing extra.
- **Decision (author: where would the PS2's grille go?):** On the right
  edge of each machine: the console standing up, with its raised side
  block and two columns of short vertical slits. The machine's title bar
  gets the front bay's two lights: power (green while active) and eject
  (blue, as on the hardware).
- **Decision (author: still too much blue; Sony uses it very sparingly, so
  not on everything active):** What's active or pressed is silver: live
  belts, active window corners, the progress line, pressed and primary
  buttons, switches, cursor, selection and argument trails. Blue is left
  only where Sony put it: the logo, plus the eject light and the boot
  screen's fog and lights (the reference).
- **Decision (author: blue only for actual lights; muted objects with the
  console's grainy texture):** Blue is left only on real lights: the
  eject light, the boot screen's lights and their fog, and the trails.
  The printed logo keeps it too, as on the console's top. Pointers and
  parameters are muted greys (lilac-grey `#b3a8c4`, `#c4c4cc`).
  Surfaces get the PS2's matte grain:
  - on the canvas, a 128 px tile of light and dark specks laid over
    windows and cards, anchored to each surface so it moves with it;
  - in the chrome, a faint SVG `feTurbulence` layer on the bars, pane
    heads, buttons, status line, duel, return card and inspector.
- **Decision (author: grain too fine and brightens everything; focus
  should be the lights flashing, not an outline; bring back a blue
  light; data logistics can be blue; no glowing borders):**
  - Grain: coarse 2 px specks, mostly dark pits (canvas tile, and a
    black-only SVG noise in the chrome), so it textures without
    lightening.
  - Focus: windows lose the bright corner outline. The front-bay lights
    carry it. Idle is a dim red standby light. On becoming active, power
    (green) and eject (blue, glowing) flash quickly for about 0.7 s, then
    stay lit.
  - The play button carries a small blue light while playing.
  - New kit option `Theme.flow`: the colour of data in motion (live
    belts, their arrows, argument plates), falling back to the accent.
    The PS2 sets it, its pulses and its argument trails to its blue.
  - PS2 cards draw no glowing borders: a hairline, and plates keep their
    colour.
- **Decision (author: buttons should be solid, like real buttons, not
  transparent over the grille):** PS2 buttons are solid black-plastic
  keys: their own graphite face, a lit top edge, a shadow under them.
  Pressed and primary (playing) buttons sink in with an inset shadow. No
  grain on buttons.
- **Decision (author: the white grain looks unnatural; remove the corner
  edges):** The canvas grain is dark pits only (no light specks, which
  read as dust). The right-angle corner lines are gone from machine
  windows and from the page's panes; windows keep a faint hairline.
- **Decision (author: storage, stations and the duel should follow the
  window, but more minimal; the progress bar as a trail light that lights
  the title light at the end, one light, true green; then the same light
  on the belts):**
  - The PS2 `panel` hook: graphite with the grain, a hairline edge, a
    short ridged head, and a small grey Orbitron title. The duel, return
    card and inspector get a ridged title and hairline borders through
    their CSS variables.
  - Progress is a light running along a hairline: a hot core fading
    back over a blue glow, with a glowing head, sweeping every 1.6 s.
  - The title bar has one light, the power light, in true green
    (`#2ee048`). Idle is dim red standby; it flashes on activation. On
    a function box it flares each time the progress light reaches the
    right end. It knows it's in a function box because the kit draws a
    window's frame (which records its kind) right before its title bar.
    The eject light is gone.
  - PS2 belts (`Theme.belt`): a grey hairline. A live belt is a dim
    blue line carrying progress-style lights (one per ~360 px, 150 px
    tails) in the data's direction.
- The PS2 duel takes the window's look instead of the shared one: a ridged
  title in small Orbitron with the one green power light (it flashes when a
  new exchange comes up), square hairline cards with ridged role strips, and
  the travel track as a hairline that the data rides as a trail light (blue,
  teal for returns) with a plain chip under its head. The track gets its
  progress as `--p`, which other skins ignore.

## 2026-09-28: the PS3 skin is the blue XMB

- The PS3 skin drops the month-by-month colour (and `xmbColour`) for the
  classic blue: teal at the top sinking to navy. The author picked the blue
  variant as the one to go with.
- The background animates: a ribbon of lines and translucent sheets whose
  width swings through zero so it twists, and about 170 white sparkles
  drifting and twinkling (most near the ribbon, a few big bokeh), with a
  little parallax like the PS2's. The ribbon is soft, so it is painted at
  half size and at most 24 times a second; a canvas blur filter was tried
  and doubled the cost, so its glow is stacked wide strokes.
- Windows, storage and stations are plain frosted rectangles with a white
  hairline under the title (the settings pages' look); panes and panels use
  CSS `backdrop-filter` for the real blur, the canvas fakes it with a pale
  veil. The top and play bars are set off by white hairlines.
- The things you touch are jelly (pale cyan, lit from above, a soft rim, a
  shadow): values in flight and counts, the progress bead, the play button
  and the legend icons (the kit's flat icon, thickened and glossed, with
  its own lines pressed in).

## 2026-09-28: PS3, second pass: XMB lines and focus, theme colours

- No parallax on the PS3 background: the wave and sparkles stay put while
  the grid pans and zooms (parallax is the PS2's thing).
- Lines are soft light: a faint wide glow under a thin white core, a soft
  chevron instead of an arrowhead, and live belts carry sparkles along in
  the data's direction. Progress is the install bar: a see-through capsule
  with a glossy fill, and a soft light sliding along it while running.
  Windows are frosting only (no outline), the title line fades out at both
  ends, and focus is a slowly breathing white halo (canvas and panes).
- Theme colours: `Skin.tints`, `tint(id, instant)` and `busy()` (all
  optional). The PS3 offers the XMB blue plus the XMB's classic colours as
  jelly swatches on the top bar, folded to the current one until pointed
  at. Picking one cross-fades over 2.5 s: the canvas lerps its sky and
  frosted fills (drawing at full rate while `busy()`), and the chrome
  follows through `@property`-registered `--xmb-*` colours that transition.
  The choice is remembered per skin in this browser (`ftb.tint.<skin>`);
  on load it applies without a fade. The real XMB picks colour from a panel
  that slides in from the right; the author chose the top bar for now.
- Third pass, for cost and taste: no blur anywhere in the PS3 skin (CSS
  `backdrop-filter` on panes, the duel, the inspector and the colour strip;
  canvas `shadowBlur` on the focus halo and title lines). Panes are a deeper
  tint of the colour instead, the halo is three faint widening rings, and it
  no longer breathes. Titles no longer glow. On live belts the data is a
  steady glow drifting slowly along (about 36 px/s, one per ~320 px), with
  sparkles winking in and out at random spots just off the line, each coming
  back somewhere else (seeded per belt, so belts don't wink in step).
- Fourth pass: files and machines lose their pane entirely; a window is its
  title and fading line, with its storage, stations and function box (the
  only tinted panel left) floating on the sky. Everything follows the theme
  colour: the jelly (value bubbles, counts, icons, the play button, the
  duel's chip and badges) is the colour lifted toward white, and the
  chrome's old fixed cyan (accent, cursor, selection, call colour) is a pale
  mix of it. The kit's sprite palette (memory strips, storage) and `casing`
  now read the palette live instead of copying it at load, so a theme that
  changes colours at run time is followed everywhere.
- Fifth pass: a file's or machine's frame is a barely-there outline (the
  title's line part of it) with one light running slowly around it, a
  fading tail behind (a lap in about 14 s; brighter on the active window;
  each window starts at its own point). The XMB is the whole page's
  background, not just the grid's: a skin can say `fullBleed`, and then
  main.ts paints its background on one fixed canvas behind every panel
  (`#page-bg`) and the grid clears its canvas instead of painting a floor,
  so the wave runs behind the editor and the bars too.
- Sixth pass: data (values in flight, counts, the duel's value box) takes
  the shape of an XMB item tile, the glass behind a package's icon: dark
  glass in the theme colour, corners well rounded but not a pill, a thin
  light rim, a gloss over the top half ending in a shallow curve, light
  pooling at the bottom. It replaces the pale jelly bead there.
- The PS3's colours include black (#1c1c20: charcoal at the top to black),
  listed after the XMB blue.
- The wave's light was a fixed pale blue; it is now the theme colour mixed
  78% toward white (following a fade as it happens), and the sparkles are
  plain white.
- The light looping around a frame is gone: the outline is lit by the wave
  instead, brighter where the ribbon passes near or behind it (from the
  wave's own shape, `ps3Wave`, shared with the ribbon, mapped from the grid
  canvas to the page). Each edge is one stroke with a gradient sampled
  along it.
- The PS3's duel and feed are trophy notifications: a near-black box with a
  thin light border inside a dark one, a dark square tile holding the icon
  (the feed's arrow; the duel's →, ↩ or ✎ by kind), the title in white
  Rodin and the values in grey beneath. They stay black whatever the theme
  colour, as the console's notifications do.
- The PS3 colour picker opens as one strip widening from the current colour
  (0.16 s, a light ease-out) with each drop fading in as the edge passes its place,
  and closes the same way in reverse (the far drops first). Pure CSS: each
  drop's place from the right (`--i`, the current one 0) orders it and
  staggers its fade; `--n` sizes the strip.
- A full-bleed background (`#page-bg`) is sized by the window
  (`innerWidth`/`innerHeight` × the view's pixel scale), not by its CSS
  box: the app zoom is CSS `zoom` on the page, and zoomed out to 67% the
  canvas had grown to 2239×1343 (2.2× the pixels, frames dropping to 33 ms).
  It is now the window's size at any app zoom, and the wave looks the same.
- The PS3 ribbon is painted at 0.3× (was 0.5×) and softened with a 0.8 px
  blur on that small copy before it is scaled up: no stair-steps when the
  window is resized, and softer, like the console's. The blur is cheap at
  that size; high-quality smoothing on the upscale was tried and tripled
  the cost, so the upscale is the default bilinear.

## 2026-10-02: PS4 takes the PS3's window frame

- Files and machines have no pane: a faint outline (brighter when active)
  and the title over a thin white rule; their storage, stations and
  function box sit on the background, the function box alone a panel. The
  PS4 keeps its own touch: on the active window the rule is the console's
  light bar, glowing blue. The translucent title strip, drop shadow and
  thick white focus border are gone.
- PS4 colours from its system screens (Friends, Communities, Remote Play):
  royal blue (#0c4ad8 top left, #0638c4, #041f8c bottom right) crossed by
  a few broad soft streaks of light, no dust. Where the PS3 puts dark panels
  inside its frames, the PS4's are lighter see-through blue with thin pale
  edges (storage, stations, the function box, panes, the duel and feed),
  as its content cards are. Values in flight are its input field: dark
  navy with a white edge. Focus is a crisp white border; the header and
  the play bar are set off by pale hairlines.
- The PS4's streaks became a Möbius strip: the real surface (a band that
  turns half over going round), tilted and in perspective, bigger than the
  view so only its sweep shows, shaded only in darker and lighter blues by
  how each part faces the light (|facing|, since the strip has one side),
  with a pale rim along its single edge. Painted once per size into the
  backdrop, at the screen's sharpness. Static until the author settles how
  it should move.
- The Möbius strip moves: it keeps turning (tilt and heading drift) and
  spinning (the band rolls along itself, so the twist travels), and frames
  itself on every repaint to the rule of thirds: scaled to bleed past the
  top and bottom, centred on the left third line, drifting slowly between
  the upper and lower thirds, the right two thirds left open (as the PS4
  wallpaper leaves room for its logo). Stateless in time; painted at half
  size with a 1.4 px blur (which also hides the shading steps between its
  quads) at most 24 times a second, over the cached sky.
- The PS4's duel and feed follow the PS3's pattern with the PS4's own
  trophy notification: a dark charcoal box with large rounded corners and
  no border, a square tile with a thin edge holding the icon, the title in
  white SST and grey beneath. The duel's value box is the PS4's input field
  (navy, white edge), as values on the grid are.
