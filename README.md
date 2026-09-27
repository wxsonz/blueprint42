# ft_blueprint

> See what goes into what.

A keyboard-first code editor for 42 students where the program you type also
shows up as a **factory on a 2D grid**, Factorio-style: functions are
machines, calls are belts, buffers are conveyor strips with cursors riding on
them, heap blocks are chests. Run the code and the factory moves, using values
from the real execution, not from a diagram someone drew and hoped was right.

## Why

Reading C means building a machine in your head and running it there. For
straightforward code that's fine. For code that's been optimized hard (a
get_next_line with SWAR scans, a cursor instead of memmove, doubling growth and
a zeroed tail invariant), the mental model takes a long time to settle. The
author ends up writing pages of comments that are really describing a picture:
*"bytes before `pos` are leftovers…"*, *"re-scans only the bytes that chunk
just added…"*.

ft_blueprint gives that picture a place to live:

- **The author** places the design that's already in their head, ties it to
  real variables, and watches it run. If the picture and the run disagree,
  that's a bug or a misunderstanding, and either way it's worth knowing.
- **The evaluator** gets a 30-second animation instead of a 20-minute code tour.
- **The learner** sees pointers, heap lifetimes, `static` state and leaks,
  which are the parts of C that text hides best.

## Core idea in one line

**Text is the source of truth; the grid is a live view of it, plus a layout
the author arranges.** You never program by dragging blocks around. You type C
(vim keybinds), and the grid keeps up.

## Scope

Deliberately limited to the 42 Common Core: C under the Norminette rules first.
Its constraints (≤25 lines per function, ≤4 params, ≤5 functions per file,
no `for`/`switch`/ternary) keep every machine small and uniform, which is what
makes this possible to draw at all.

## Status

Pre-prototype. Start with [`SPEC.md`](SPEC.md). The current target is
**Milestone 0 → 1** (sandbox editor plus live grid view, no code execution yet).

## Layout

```
README.md        this file
SPEC.md          principles, metaphor, architecture, milestones
CLAUDE.md        working notes for an agent picking this up
samples/gnl_v3/  first built-in sandbox sample (author's own get_next_line v3)
```
