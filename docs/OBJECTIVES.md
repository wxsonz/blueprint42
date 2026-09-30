# Objectives

Where blueprint42 goes next: closer to a game, fun to use, and every picture
clear about what it means. Sizes are rough: **S** a session, **M** a few,
**L** a milestone.

Skin polish is not on this list. It's optional and guided by the author one
skin at a time; `docs/SKINS.md` says which skins are reviewed.

## Next (2026-10-01): easy to diagnose, hard to break

The main objective: when something looks wrong, slow or stuck, the tool
itself says where, and a change can't quietly break a picture. No new
features and no new looks: every step keeps the pixels and the behaviour
the same, and proves it (step 1 first, so the others can be checked).

Why now. Each of these cost real time this week, and each was found by hand
with throwaway scripts:
- One skin threw once (PS2's capacity bar, a 0/0) and the whole playback
  froze: nothing stood between a hook and the frame loop.
- A condition readout showed a pointer's own value where the value it
  reads should be (`→tab[0] > →tab[0]`); nothing checked what a frame shows
  against the trace.
- PS3's focus veil ignored the picked theme colour; text fits made before a
  font loaded were kept. State a picture depends on wasn't followed.
- Every performance question needed a new script, a git worktree for
  before/after pictures, and three browsers (headless Chromium misreports
  the GPU; Firefox draws canvases on another thread).

Where the risk sits (sizes today):
- `GridView.draw` (`src/render.ts`) is one 667-line function: layout,
  values, animation and painting mixed. `convertGdb` (`src/gdb.ts`, 416
  lines), `run` (`src/interp.ts`, 373) and `boot` (`src/main.ts`, 259)
  follow.
- `main.ts` writes the shared state `S` directly in 80 places; nothing
  records who changed what.
- The tests (103) cover the pipeline well but never call a skin's drawing
  code: `test/skins.test.ts` checks the picker's groups only.

Steps, in this order:
1. [x] **Pictures you can diff** (M). Done 2026-10-01 (decision 047): the
   working tree against itself, 0 of 90 frames differ at 1 and 1.25. Rendering takes its clock from the
   frame, never `performance.now()` (the leak fall and the crash jam read it
   now, so two runs of the same frame differ). Then `tools/pixcmp`: draws
   fixed frames (samples × positions × zooms × skins × 1, 1.25, 2 scaling)
   from two git refs and reports what differs, composited over the page
   colour. Done when the same ref against itself differs in 0 pixels, and a
   refactor step can say "identical" from one command.
2. [x] **A skin can't stop the frame** (S). Done 2026-10-01: `src/skins/guard.ts`,
   errors in `src/diag.ts`; nothing added when a hook succeeds (several skins
   leave style that later drawing relies on: a save/restore around each
   changed 11 skins' pictures), 0 of 495 frames differ; a forced throw in
   PS2's dock leaves the grid drawn and playback running. Every skin hook runs inside a
   guard: a throw is logged once (skin, hook, the info it got), the item is
   skipped or drawn as a plain marked box, and the frame goes on. Replaces
   the single try/catch around the whole frame (`main.ts` `frame`). Done
   when a hook forced to throw leaves the rest of the grid drawn and the
   error listed (step 5).
3. [x] **Skin contract tests** (M). Done 2026-10-01: `test/skin-contract.test.ts`,
   what the grid really passes recorded by `tools/capture-hooks.mjs`
   (`test/fixtures/hook-calls.json`, rerun it when an info grows), in a
   recording context (`test/helpers/rec2d.ts`); overhangs declared per hook.
   It found and these fixed: a capacity of 0 (printf's buffer before its
   first call) drew a bar of width NaN in every skin; a squeezed tag and a
   rounded box asked for negative radii (a real browser throws); the kit's
   storage titles and wall notes, and Minimal's and Aqua's wall notes,
   spilled long text out of their boxes; Aqua reset a fitted title to full
   size. Pictures change only there. Every skin × every hook, called with
   ordinary and edge-case infos (empty text, 0 and huge capacities, 0-size
   rects, no trace, fractional zooms, each tint): nothing throws, nothing
   non-finite reaches the canvas (a recording 2D context rejects NaN), and
   drawing stays inside the rect it was given (bar declared overhangs).
   Would have caught the 0/0. Done when it runs in `npm test` for all 34
   skins.
4. [x] **What a frame shows, as data** (L). Done 2026-10-01: `src/frame.ts`
   (`frameState`, and what the process box, printf's buffer, stdin, the
   modules, walls, the heap bar and the IN dock show) with no canvas;
   `GridView.draw` is 64 lines naming 15 paint passes (0 of 2,970 frames
   differ). `test/frame.test.ts`: a readout says the array's values at j and
   j + 1, a block is lost the moment nothing points at it, the dock shows the
   arguments the call carried, stdin never gives back what it took. Not yet:
   machines' hit rects (`hit.ts`) are worked out apart from the frame; the
   heap bar's are the ones its pass laid out. Split `GridView.draw` into a
   pure step, `frameScene(state, trace, pos, camera) → Scene` (every
   machine, row, readout, plate, card and line with its rect and the value
   it shows), and painting passes that only draw a Scene. The Scene is
   testable without a canvas: "at step 42, the readout says `5 > 2`",
   "the lost card is red", "this line ends at the address its pointer
   holds" (SPEC principle 4 as tests). Hit-testing reads the same Scene, so
   what you click is what's drawn. Done when `draw` is a short list of
   passes, and the readout, heap bar, dock and stdin have Scene tests.
5. [x] **Diagnostics built in** (M). Done 2026-10-01: `src/diag.ts` (the
   profiler, off until asked) and the dev panel `src/diag-ui.ts` (top bar,
   "diag"; `__ftb.diag(true|false)`): ms per paint pass and skin hook, canvas
   calls by kind, the text memos' hit rates, frames a second, hook errors and
   failed trace checks. `tools/bench.mjs`: a headed Chromium or Zen window on
   the terminal's desktop, one ref or two alternating, fps with that
   breakdown; it refuses to report from a hidden window. A dev panel (and `__ftb.diag()`)
   instead of scripts: per frame, the time in each pass and each skin hook,
   canvas calls by kind (fills, gradients, text, images), memo hit rates,
   the page's frame rate and the background's, recent hook errors (step 2)
   and failed checks (step 7). The bench scripts from this week become
   `tools/bench` (a headed Chromium or Zen window, placed on the terminal's
   desktop), so "is it faster" is one command.
6. [x] **State changes by name** (M). Done 2026-10-01: `S` is read-only to
   the compiler outside `state.ts`; ~100 writes became `update('seek' |
   'play' | 'advance' | 'select' | …, patch)` (and `updateRun` for a
   project's run settings). Dev builds keep the last 200, repeats counted,
   in `__ftb.diag().actions` and on every hook error and failed check. `S` changes only through named
   actions in `state.ts` (`seek`, `play`, `loadTrace`, `setSkin`, …); dev
   builds keep the last 200 with their arguments, attached to every error
   report. Done when nothing outside `state.ts` assigns to `S`.
7. [x] **A trace that checks itself** (M). Done 2026-10-01: `src/validate.ts`
   (shape, frame and cell ids, pointers, calls push and returns pop, malloc
   and free, heap slots, output and stdin only forward), on every trace in
   dev builds (failures in the diagnostics panel) and in
   `test/validate.test.ts` for every sample under both engines (all pass;
   broken traces fail with the check named). The engines report their own
   failures by stage (`EngineError`: gdb setup / stops, at which stop /
   finish; the interpreter's statics / execute / finish). Not split into
   separate functions: `convertGdb` is one state machine over shared tables,
   and its stages are marked in place. `validateTrace(trace)`: every
   event's cells, frames and heap blocks exist in the snapshots around it;
   snapshots only change where an event says; ids stay stable; output only
   grows. Run on every trace in dev and in the tests, for both engines
   (the interpreter and gdb), so a converter bug fails where it happens,
   not as a wrong picture later. Split `convertGdb` and `run` into stages
   with typed outputs so a failure names its stage.
8. [x] **State a skin depends on, followed** (S). Done 2026-10-01: PS3's
   veil is computed when read (the one tinted skin); its gradient and
   backdrop caches key on the colours; the three text memos (fits, widths,
   cuts) clear when a font finishes loading (cuts didn't). The contract
   tests switch every tint and check the veil and panel fills follow, one
   veil per tint. Colours and sizes that
   depend on a tint, a mode or a font are computed when read (as PS3's veil
   now is), never copied once; memos key on everything they depend on, or
   clear on the event that changes it (as text fitting now clears on font
   load). A contract test switches every tint and checks the veil, panels
   and plates follow.
9. [x] **A linter** (S). Done 2026-10-01 (decision 048): Oxlint with types
   (eqeqeq, no-shadow, no floating promises) and `tools/lint-canvas.mjs` (a
   save without its restore, a return with one open), in `npm run check`
   (under 2 s). ESLint can't: typescript-eslint needs TypeScript's JS API,
   which TypeScript 7 doesn't have. It found 27 shadowed names and a floating
   promise; fixed. ESLint with a few rules that catch this week's
   kinds of bugs: floating promises, unused values, `==`, shadowed names,
   a canvas state change without a matching restore. `npm run check`
   runs it.
10. [ ] **A map for the next person** (S). `docs/HANDOFF.md` gets one page:
   which module owns what (data in, data out), how to debug each kind of
   problem (wrong value, wrong place, slow, stuck, a skin), and which tool
   answers it.

Rules for these steps:
- Behaviour and pictures don't change; each step is checked with step 1's
  diff (0 differing pixels outside what the step names) and the tests.
- Reviewed skins keep their code's look; only the plumbing around hooks
  changes.
- One step per commit series; each leaves the app working.

## Today (2026-09-30): nothing hidden

The main objective: the picture never hides what the program did. Whatever
happens is drawn where it happens, and whatever doesn't fit is counted
(`docs/VISUALS.md`, clarity rule 6; decision 046). Prototyped in Minimal and
Barebone; truth fixes go to every skin.

Done:
- [x] printf's buffer above the process box: what waits, how full, when it
      flushes (Minimal, Barebone); a flush falls into the terminal, `write`
      goes straight in past it (every skin).
- [x] The statement that died is crossed out with its signal.
- [x] `*p` and `a[i]` read from the memory they really read, and show the value.
- [x] Nothing dropped silently: older past values, reads past 8, writes past
      10, the dock's arguments are counted.
- [x] Values in flight always land, with time for each one.
- [x] Belt crossings cut a real gap (the background shows through).

Next, in this order:
1. [x] **Stack and literal bytes** (S). A stack array (`char buf[32]`) or a
   string literal shows its bytes like a heap block does. A char array's
   strip sits in its own pool (LOCALS, KEPT), with no pointer line; a
   literal is "literal (read-only)" in REACHED; a pointer into a stack
   array shows those bytes and says "(stack)" (gdb engine; the `bytes`
   sample).
2. [x] **stdin and stderr** (S). Input being used up by `read(0, …)` (a
   stdin node under the process box, fd 0's real offset), and output to fd 2
   flying into the terminal, its text in the error colour (Minimal,
   Barebone).
3. [x] **The heap bar** (M). Built in Minimal and Barebone (docs/VISUALS.md,
   "The heap bar"); other skins keep the shelf until it settles. The heap belongs to no function and outlives
   every call, so it's drawn as a bar fixed to the screen (bottom left),
   with you wherever you go, replacing the heap shelf (one thing, one
   picture). One card per live block: its size, where it was malloc'd, its
   first bytes or fields, who points at it. `malloc` drops a card in, `free`
   takes it out, blocks still there at exit stay in red (leaks); `+n` when
   more exist than fit. Pointer lines run from rows to their card (full from
   the running frame, quieter otherwise, a stub when the row is off screen),
   and it folds down to a thin line when the space is wanted. A struct can
   be *watched* there too, never moved: "watching `main.r` (on main's
   stack)", and "gone: its frame returned" once it has, because a local
   lives in its frame. Items 4 and 5 are drawn on it. Prototyped in Minimal
   and Barebone.
4. [x] **Two names for the same memory** (M). Pointers holding the same
   address are marked as sharing it, not just given separate lines: `×N` on
   the tag (every skin that draws tags), the names on the heap card.
5. [x] **Ownership of heap blocks** (M). Who must free a block: a tag on it,
   and a warning when a function returns without freeing or handing it on.
   Built as what C really has: the pointers holding it (the card's `←`
   line, heap-internal ones included) and the moment the last one goes
   (`LOST`, an alert with the step; `src/ownership.ts`; the `lost` sample).
6. [x] **Computed indexes and chains** (M). `a[j + 1]`, `p->next->len`,
   `**pp` read from where the memory is, like `*p` and `a[i]`. An index is
   any integer expression of names and numbers (C's truncating `/`); a chain
   goes through `->` only (a nested `a->b.c` stays as written), reading a
   block's fields where gdb read them through a pointer of the same type.
7. [x] **Loop rounds as a whole** (M). Which way each round went, not only
   each row's past values: one mark per round on a loop's readout row (in /
   out), and on each `if` directly inside it, its result in the same columns
   (a dot: not reached that round); the last 12, older ones counted (every
   skin that draws stations with the shared interior). A switch's readout now
   reads `*p`, `a[i]` and chains from their memory too (it showed the
   pointer's own value before).
8. [x] **Long statements** (S). Station code is cut at 44 characters; show the
   whole line (wrap or on hover). Hover a cut or wrapped statement: a tip
   (styled like the other panels, per skin) shows all of it on one line.
9. [x] **The printf buffer in PS1–PS4** (S each), in each skin's own parts:
   one of its storage panels (`printf`, the head's capacity how full), the
   dock's own light lit while bytes wait (`kit.ts`, with `Theme.look.dock`).
10. [x] **`static` functions** marked the same way in every skin (S): as C
    writes it, in the machine's title every skin draws (`static
    lr_append(fd, buf, nl)`); skins with a dock showed nothing before.
11. [x] **Capacity for a single file** (S). Its 5 definitions, with no module
    wall to show them on: next to its name in the grid's head (`sort.c ·
    4/5 functions`, in the bad colour past 5; the line reader's combined
    buffer says 11/5, true of it as one file).
12. [x] **Types shelf** (L). Structs, typedefs, enums and macro constants
    from headers, on the grid: a column of cards left of the machines
    (Minimal, Barebone; `skins/typeshelf.ts`, `parse.ts` `typeDefsOf`), the
    `-D` value the run used, the struct in use outlined.
13. [x] **Legend overlay** (M). The real drawings and what each one means:
    the grid's Legend button (Esc closes); each tile drawn by the active
    skin's own hooks with example values (`src/legend.ts`), so it is 1:1
    with the canvas in every skin.
14. [x] **Real events as effects** (S each). A leak falls off the shelf at
    exit, `free` takes the block away, a segfault jams the machine: at the
    run's end a leaked card drops, bounces once and settles red (heap bar);
    `free` takes its card down and away; the machine that crashed shakes
    hard and stops (every skin).

Rough edges, fixed: the kill feed covered the stations of machines under it
(following now frames clear of it); the IN dock was mostly empty with one
argument or none (it now says where the call came from and which call it
is: `from main:10 · call 1 of 9`; the PS docks count arguments that don't
fit instead of dropping them).

The toolbelt (the legend strip at the bottom left) is hidden for now, the
author's call: its icons aren't 1:1 with what the canvas draws. Its right half
was the only way to drag author sprites onto the grid; strips still come from
the inspector. The Legend overlay (13) now does its first job, drawn with the real
pictures; placing strips stays in the inspector.

## 2026-09-29: the machine, redesigned

The main objective: a machine reads as the life of one call, top to bottom
(`docs/VISUALS.md`, "Machine anatomy"; decision 041). It's the first piece of
the visual grammar that later becomes the editor.

Done:
- [x] Storage in pools: PARAMETERS (the copies it was called with), LOCALS
      (the Norm's declaration block), KEPT (statics), REACHED (memory through
      a pointer, written `buf->len`).
- [x] RETURN at the bottom: the return type, and the value when it leaves.
- [x] Each row's past values, `cap  ? → 0 → 8 → 16`, in every skin (the
      five storage-table drawings: the kit's, Minimal, Aqua, Classic, Amp).
- [x] `->` in labels no longer drawn as one arrow glyph.

Next, in this order:
1. [x] **IN dock** (S). Its own look at the top left, in the engine's four
   states: *idle* (dim, not called), *running* (holding the arguments that
   arrived), *waiting* (it called another function and is paused until that
   returns) and *crashed* (it died; it says the line and the signal).
   Prototyped in Minimal and Barebone (`Skin.dock`, `skins/dock.ts`); other
   skins keep their motor until the design settles. The station that died
   is crossed out in the stations too (decision 046).
2. [x] **Pointer address tag** (S). A pointer row shows a tag, not a value:
   a socket dot and what its address points at (`bufs[0]`, `heap #1`),
   in PARAMETERS, LOCALS, REACHED and the IN dock. The tag says only what
   the pointer holds (the origin), never where it was handed down from.
   Every pointer always has its line (quieter outside the running frame,
   never hidden); one whose target isn't drawn gets a stub with its arrow;
   a `char *` gets a line to its byte strip, where its text now lives.
   Prototyped in Minimal and Barebone (`RowInfo.tag`, `drawTag`; the kit's
   `ptrTags`); other skins still print the value.
3. [x] **Byte strips inside REACHED** (S). The bytes behind each `char *`
   are drawn inside the REACHED panel, under its rows, in every skin (an
   engine change). Each strip's label says what the pointer reaches and
   where it came from: `data → heap #1 · malloc lr_grow:172` (or "malloc
   before step N" in a window that began later). A pointer with no bytes
   to show says where it points (`(stack)`, `(static)`) or `NULL`. Only heap
   bytes are drawn so far: a stack array or a string literal gets the line
   and the label, not its bytes.
4. [x] **Argument vs return plates** (S). Different in shape, not just
   colour: a call's argument on a belt is a hexagon (pointed ends), a
   return value the reverse (notched ends); everything else keeps its pill.
   Neither shape points a way, since a belt can run in any direction.
   `plate(…, role)`, `platePath`; prototyped in Minimal and Barebone (the
   kit's `plateShapes`).
5. [x] **Norm capacity** (M). Each limit shows where it applies, as
   `used/max` with a small bar: faint while there's room, amber when full,
   red past it. Parameters on the IN dock (`2/4`), variables on LOCALS
   (`3/5`, local statics included; on KEPT if there are only statics),
   lines on the stations (`22/25 lines`, the physical lines between the
   braces), definitions on a module (`5/5 fns`, prototypes don't count).
   Counted in `src/norm.ts`; `test/norm.test.ts` checks each limit against
   norminette itself (25/26 lines, 5/6 vars, 4/5 args, 5/6 functions).
   Prototyped in Minimal and Barebone (`Skin.capacity`). Not shown yet: a
   single file's definitions (it has no module wall).

Settled today: the dock shows all four of the engine's states. The anatomy
is an engine change, so every skin gets all of it at once, in its existing
parts; per-skin looks come later. New pictures are prototyped in Minimal
and Barebone only.

Still open: are expressions typed as text inside a station (recommended),
or built from blocks? See `docs/VISUALS.md`.

## What Upload Labs gets right

[Upload Labs](https://uploadlabs.enigmastudio.dev/) is a node-automation
game. Nodes are small windows (downloaders, processors, scanners, uploaders)
that you wire output to input, left to right, to move files and earn money.
The parts worth borrowing:

- **Typed ports.** An output only connects to an input that takes it, and
  the game shows which ones do while you drag.
- **Space opens the node menu.** Placing a node is one key, a pick and a
  click.
- **Flow you can count.** Every link shows throughput, and processing nodes
  show their multiplier (a scanner's ×4). You can see where the bottleneck is.
- **Merge and split nodes.** Folders merge streams, allocators split them by
  ratio. Layout is a spatial puzzle.
- **Schematics.** Save a group of nodes and stamp it again elsewhere.
- **Goals and unlocks.** Milestones open new nodes, so there is always a next
  thing to build.

For blueprint42 the "files" are values and the "money" is a program that
works. The same loop becomes: design the machines, wire the belts, write the
code that fills them, run it, and watch it deliver.

## 0. Decided: the grid will write code, within the Norm

The author's call (`decisions/040-visual-grammar.md`): blueprint42 grows
toward a visual code editor, and its scope for writing code is Norm C. The
Norm fixes the structure of the code, so it can be drawn and placed without
losing anything, and learning to write that structure is good practice in
itself. The first step is defining the pictures (`docs/VISUALS.md`), each
one both something to read and something to place later.

"Ghost machines" below are called **plans** (`Skin.ghost` is already the
reserved slot of a recursive copy).

## A. Build with belts (L)

1. **Plans (M).** Space opens a palette on the grid. Pick a blank machine,
   name it, and it sits there dimmed as a plan (principle 4: drawn but not in
   code). A "to build" list shows every plan that doesn't exist yet. It turns solid the moment a function with that name parses.
2. **Typed ports (M).** Ports carry their C types. Dragging a belt from an
   output highlights only compatible inputs. A mismatch shows red, with the
   reason the compiler would give (`char *` into `int`).
3. **Belts that propose code (M, needs 0).** Wire a ghost's inputs and it
   proposes the prototype (`static int ft_count(char *s)`) and an empty body.
   Drop a belt from machine A onto a station inside B and it proposes the
   call on that line. Undo takes it back.
4. **Norminette as the game's rules (S; its capacity pictures are item 5 of
   Today).** A machine's 25 lines are a
   capacity bar. Its 4 parameters are 4 input slots, and a fifth won't fit.
   A file's 5 functions are 5 module slots. Hitting a limit looks like a full
   machine, not an error message later.
5. **Merge and split, the C way (S).** An `if` is a splitter and a loop is a
   return belt. Name them in the palette too, so a design can have them
   before the code does.
6. **Schematics (M).** Select machines and belts, save them as a pattern
   ("read loop", "split into words", "list push") and stamp them as plans
   elsewhere. They're stored in the blueprint file, never as code.

## B. Goals and progress (L)

1. **Tests as deliveries (M).** A test set (stdin, args, expected output) runs
   each case as a packet. Packets travel the belts, and the ones that pass
   reach an output dock: "7 / 9 delivered". A failing one stops where the
   output first went wrong.
2. **Missions (L).** One per Common Core project (libft, get_next_line,
   ft_printf, push_swap…, from the current curriculum). A mission is ghost
   plans named by the subject plus behaviour tests. It says what must go
   in and come out, never how, so it can't turn into a solution sheet.
3. **Run stats as a score (S).** Steps, the deepest stack, bytes malloc'd,
   bytes leaked, the longest machine. Refactor and try to beat your own
   record; the best run is kept per sample or project.
4. **Achievements (S).** They use the trophy notification the PS3 and PS4
   skins already have, drawn by every skin. Examples: the first leak-free run,
   the first recursion, a whole project inside every Norminette limit.
5. **Sound (S, off by default).** Soft clicks for steps, a chime for a
   delivery, a thud for a crash.

## C. Define every visualization (M)

Aim: fun to look at, and every mark means exactly one thing.

1. **A visual dictionary (S).** ✅ `docs/VISUALS.md`, checked against
   norminette. Still to do: a Legend overlay in the app that shows the real
   drawings. Each entry gives what it
   is, what it means in C, and what makes it light up. Entries:
   - machine (storage rows, stations, memory floor), recursion copies,
     modules and walls;
   - belts (calls) and their data plates, return values, crossings and their
     gaps, count badges;
   - heap blocks and the heap shelf, strips with `pos`/`len`/`cap` markers,
     chests (statics);
   - invariant violations, stale and unbound (dimmed) marks;
   - the kill feed, the duel, the focus card, the process box (stdout, exit
     code), lenses.
2. **Audit each against the dictionary (M).** One mark, one meaning. Where two
   things look alike (an argument plate and a return plate) or one thing
   looks two ways between skins, fix it in the engine and the skin hooks, not
   per skin.
3. **Missing pictures (M each).** Things C students get wrong that the grid
   doesn't show yet:
   - **Ownership.** Who malloc'd a block and who must free it: a tag on the
     block, and a warning belt when it leaves a function that forgot it.
   - **Aliasing.** Two names for the same memory: pointer arrows from storage
     rows to the bytes they point at.
   - **Loop history.** ✅ per row (each storage row shows its past values);
     a loop's rounds as a whole are not shown yet.
   - **Output as it really happens.** A printf buffer node above the
     terminal: `printf` text waits there until a flush, `write` goes straight
     to the terminal, so mixed output shows why it came out in that order
     (`docs/VISUALS.md`, "Output"). Done: the tracer runs stdout as a
     terminal (a pseudo-terminal, the default) or a pipe (the "stdout" toggle
     in the run settings), reports every write(2) (the user's own, or libc
     flushing printf's buffer) and the buffer's real contents each step; the
     terminal box shows what has really arrived by then. The buffer node is
     drawn above the terminal in Minimal and Barebone, and the bytes fly
     out as they really leave (decision 046).
4. **Fun without lying (S each).** Every effect is driven by a real event:
   - a leak is an item falling off the shelf at exit;
   - a segfault jams the machine at the statement that died;
   - `free` is a recycler taking the block away;
   - a return is the plate riding home.

## Order

Today's list first (the machine is the grammar's core), then the rest of
C2's to-do list in `docs/VISUALS.md`. Then A1–A2, A3, B1 and B3. Missions
(B2) come last: they need the rest.

## Sources

- [Upload Labs](https://uploadlabs.enigmastudio.dev/)
- [Core nodes explained](https://www.upload-labs.com/en/guides/core-nodes)
- [Steam page](https://steamcommunity.com/app/3606890?l=english)
