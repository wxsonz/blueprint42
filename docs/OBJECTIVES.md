# Objectives

Where blueprint42 goes next: closer to a game, fun to use, and every picture
clear about what it means. Sizes are rough: **S** a session, **M** a few,
**L** a milestone.

Skin polish is not on this list. It's optional and guided by the author one
skin at a time; `docs/SKINS.md` says which skins are reviewed.

## Today (2026-09-29): the machine, redesigned

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
1. [ ] **IN dock** (S). Its own look at the top left, in the engine's four
   states: *idle* (dim, not called), *running* (holding the arguments that
   arrived), *waiting* (it called another function and is paused until that
   returns) and *crashed* (it died; the station that died is marked too).
2. [ ] **Pointer address tag** (S). A pointer row shows a tag, not a value;
   its line leads to what it points at in REACHED.
3. [ ] **Byte strips inside REACHED** (S). They're reached memory too, and
   today sit on their own below the stations. Their label says where the
   bytes live (heap, stack, static) and who allocated them.
4. [ ] **Argument vs return plates** (S). Different in shape, not just colour.
5. [ ] **Norm capacity** (M). Module 5 definitions, machine 25 physical lines,
   4 ports, 5 storage rows including local statics, counted the way
   norminette counts.

Settled today: the dock shows all four of the engine's states. The anatomy
is an engine change, so every skin gets all of it at once, in its existing
parts; per-skin looks come later.

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
   - **Output as it happens.** `printf` lines appearing at the statement that
     wrote them (the tracer has to unbuffer stdout).
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
