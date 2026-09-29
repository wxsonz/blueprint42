# blueprint42

> See what goes into what.

A code viewer for 42 students where the C you write also shows up as a
**factory on a 2D grid**: functions are machines, calls are belts, buffers
are conveyor strips with cursors riding on them, statics and heap blocks are
chests. Run the program and the factory moves, with values from the real
execution (your code compiled with the 42 flags and stepped under gdb), not
from a diagram someone drew and hoped was right.

**Text is the source of truth; the grid is a live view of it, plus a layout
you arrange.** You never program by dragging blocks around. You type C (in
the built-in editor with optional vim keys, or in Neovim), and the grid keeps
up.

## What it shows

- **Every function as a machine, from its code.** Each machine holds its
  storage (parameters and locals, struct fields unfolded), a station per
  statement, and the memory it can reach. Calls are belts between machines;
  recursion gets one copy of the machine per level.
- **The run, statement by statement.** Play, pause and scrub: the running
  statement lights up in place, what it reads flies in, the expression fills
  with values (`6 == 8 → false`), and what it writes flies out. Loops count
  their rounds; ifs show the way they went.
- **Data in flight.** Arguments ride the belts into the callee and return
  values ride back, strings as their text and structs as their fields. A
  panel spells each exchange out: who called whom, with what, on which line.
- **Real memory.** Heap blocks appear when malloc'd and vanish when freed;
  byte buffers are drawn as strips with their `pos`/`len`/`cap` markers
  moving. Leaks are reported at exit, crashes (a segfault, an abort) stop the
  run at the statement that died.
- **Your own design on top.** Place strips, markers and chests on the grid,
  bind them to real expressions (`buf->data` with length `buf->cap`), and
  state invariants (`pos <= len <= cap`). A violation is flagged at the exact
  step it first happens.
- **Whole projects.** Open a folder: one module per `.c` file, calls
  crossing between them, headers linked the way the compiler does. It builds
  with the project's own Makefile (sub-makes for libft included), or with a
  driver `main` kept in `.blueprint42/` for a library.
- **Any editor.** Open a folder and keep working in VS Code, vim, Emacs or
  anything else: each time you save, the page picks the change up within a
  couple of seconds. The optional Neovim plugin goes further: it streams
  unsaved buffers and the cursor, and double-clicking a machine jumps nvim
  to it. The page never writes to disk without an explicit, confirmed Save.
- **Twenty-six skins.** From Classic Mac and Windows XP to the PlayStation
  line (the PS3's XMB with its wave, the PS4's twisting ribbon), each
  drawing the same factory its own way. Some are still works in progress
  and marked ⚠ in the picker: Windows 8, the Macs from Leopard on (Leopard,
  Yosemite, Big Sur, Tahoe), the PS5, the Nintendo ones (Game Boy, GameCube,
  Wii, Switch) and the just-for-fun ones (Amp, Blueprint, Factory,
  Synthwave). They draw everything, but haven't had their polish pass yet.

## Try it

You need Node 20+, and for real execution `cc` and `gdb` built with Python
(any Linux distribution's gdb is).

```sh
npm install
npm run dev                  # http://localhost:5173
npm run dev -- ~/42/libft    # …and open that folder, like `code <folder>`
```

Pick something from **Examples** on the top bar:

| Runs in your browser | Real C under gdb | Projects |
| --- | --- | --- |
| pointer in, value out | strings & malloc | line reader (several files) |
| swap | arrays: bubble sort | libft + Makefile |
| static counter | structs | |
| factorial, fibonacci | linked list | |
| gcd (loops) | a crash, a leak | |
| | line reader (stdin) | |

The first column runs in the built-in interpreter (ints, pointers, loops,
recursion, statics), so it also works in the static build (`npm run build`,
no server). Everything else needs the local server, which compiles and traces
the program.

### Neovim (optional)

You don't need it: any editor works once you save. The plugin adds live,
unsaved edits and cursor sync. It's used from a local clone; add it from
`nvim/` (for lazy.nvim:
`{ dir = '<repo>/nvim', opts = { port = 5173 } }`), start the page with
`npm run dev`, then `:B42Connect` in nvim. `:B42Open` opens the current
project in the page.

## Scope

Deliberately limited to the 42 Common Core: C under the Norminette rules.
Its constraints (at most 25 lines per function, 4 parameters and 5 functions
per file, no `for`/`switch`/ternary) keep every machine small and uniform,
which is what makes this possible to draw at all.

## Layout

```
README.md             this file
src/                  the app (Vite + TypeScript, tree-sitter); skins in src/skins/
server/               the local server: compiles, traces under gdb, opens folders
test/                 unit and integration tests
nvim/                 the Neovim plugin
samples/line_reader/  a get_next_line-style line reader: an example, and the
                      fixture the acceptance tests run on
docs/SPEC.md          principles, metaphor, architecture, milestones
docs/VISUALS.md       the visual grammar: every picture, its Norm construct, what moves it
docs/OBJECTIVES.md    where it goes next
docs/SKINS.md         which skins the author has reviewed
docs/decisions/       every decision along the way, one file each, with the reason
docs/HANDOFF.md,      working notes for an agent picking this up
  CLAUDE.md
```

```sh
npm run check    # type-check
npm test         # unit tests, plus integration tests that run cc and gdb
```
