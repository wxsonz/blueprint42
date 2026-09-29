# The visual grammar

Every picture blueprint42 draws, what C it stands for, and what makes it
move. The same table is meant to become the editor later: a picture you can
read is a picture you can place. This is only possible because the Norm keeps
C small and regular. Status marks: ✅ drawn today, 🟡 drawn but unclear or
partial, ⬜ not drawn yet.

## Why the Norm makes this possible

Plain C can't be edited as pictures without losing something. Norm C can,
because its shape is fixed:

The rules come from the Norm (v4.1, `en.norm.pdf` in
[42school/norminette](https://github.com/42school/norminette)). The last
column is the error code of the checker that enforces each one, so the
checker can be the test for everything the grid writes later. Where the
PDF and the checker differ, this table follows what the checker does,
tested with norminette 3.3.59:

| Norm rule | What it gives the grammar | Checker |
| --- | --- | --- |
| At most 5 function **definitions** per `.c` file; prototypes don't count | A module has 5 machine slots | `TOO_MANY_FUNCS` |
| At most 4 named parameters; `void` if none | A machine has at most 4 input ports, all named | `TOO_MANY_ARGS`, `NO_ARGS_VOID` |
| At most 5 variables per function, a local `static` included | Storage has at most 5 rows, and a local chest takes one of them | `TOO_MANY_VARS_FUNC` |
| Declarations first, at function scope only (not inside an `if` or `while`), then one empty line | Storage is one block above the stations, never inside a branch | `VAR_DECL_START_FUNC`, `WRONG_SCOPE_VAR`, `NL_AFTER_VAR_DECL` |
| One declaration per line, never initialised on it (except `static` and `const`) | A value is set by a station, not by its row, except a chest's starting value | `MULT_DECL_LINE`, `DECL_ASSIGN_LINE` |
| At most 25 **physical lines** between the function's braces | The capacity bar counts lines, not stations. Declarations, the empty line after them, an inner block's braces, `else` and a statement wrapped onto two lines all use it up. | `TOO_MANY_LINES` |
| One instruction or control structure per line, one assignment per line, none inside a condition | One station = one action. A condition only reads. | `TOO_MANY_INSTR`, `MULT_ASSIGN_LINE`, `ASSIGN_IN_CONTROL` |
| A control structure's braces are optional around a single instruction | A branch with one station can be drawn without a block (and written without braces) | `MULT_IN_SINGLE_INSTR` |
| No `for`, `switch`, `case`, `goto`, labels or `?:`. `do…while` is rejected too, though the checker catches it indirectly (as scope and indent errors, not as a forbidden structure). | Control flow is only `if` / `else if` / `else`, `while`, `return`, `break`, `continue` | `FORBIDDEN_CS`, `GOTO_FBIDDEN`, `LABEL_FBIDDEN`, `TERNARY_FBIDDEN` |
| `return (x);`, with the parentheses | The shape a return station writes | `RETURN_PARENTHESIS` |
| No variable-length arrays | Storage size is known up front | `VLA_FORBIDDEN` |
| Structs, typedefs, enums and unions only in headers, at global scope, named `s_`, `t_`, `e_`, `u_` | Types live on one shelf per project, never in a machine or a `.c` file | `FORBIDDEN_STRUCT`, `FORBIDDEN_TYPEDEF`, `TYPE_NOT_GLOBAL`, `STRUCT_TYPE_NAMING` |
| Globals only `static` or `const`, named `g_` | Every global is a chest owned by a file | `GLOBAL_VAR_NAMING`, `GLOBAL_VAR_DETECTED` (a warning) |
| `#define` only for literal constants, uppercase, single line | Constants sit on the types shelf; no macro functions | `PREPROC_CONSTANT`, `MACRO_FUNC_FORBIDDEN`, `MACRO_NAME_CAPITAL` |

The PDF marks some rules with (*): the checker can't check them (an unused
header, a `#define` used to dodge the Norm, a comment justifying a bad
function). The grammar doesn't depend on any of them.

The rest of the Norm is layout: tabs, spaces, 80 columns, alignment, the 42
header. It decides how the code is *written*, not its structure, so it has
no picture. A grid that writes code has to follow it exactly, and the
checker says whether it did.

So a program is a small tree with fixed kinds of nodes at every level. The
only open-ended part is expressions: the right side of `=`, the condition,
the arguments. Those stay text (see [the one open question](#the-one-open-question)).

## Levels

A picture belongs to one level, and zooming moves between levels:

**Project → module (file) → machine (function) → station (statement) →
expression → value.**

Each section below is one level. The columns are:
- **Norm**: the rule that bounds it.
- **Picture**: what's drawn.
- **Moves when**: the real event that animates it (principle 4).
- **Edit later**: the gesture that would create or change it once the grid
  can write code. Nothing in this column exists yet.

### 1. Project

| Construct | Norm | Picture | Moves when | Status | Edit later |
| --- | --- | --- | --- | --- | --- |
| The project | Makefile rules `all`, `clean`, `fclean`, `re`, `$(NAME)` | The grid; the top bar's project chip | a build | ✅ | Open or create a folder |
| The program as it runs | — | The process box: the command line, stdout, the exit code | run, exit, crash | ✅ output appears only at exit | Args and stdin fields |
| A header's types | Declared in `.h` only | Nothing on the grid; struct fields appear in storage rows | — | ⬜ | A types shelf: drag a field in to add it |
| A macro constant | Literal values only, uppercase | Nothing | — | ⬜ | Constants on the types shelf |

#### Output: the printf buffer and the terminal (tracer built; the buffer's picture is next)

Author's design (2026-09-29). Above the process box (the terminal) sits a
**printf buffer** node, `stdout`'s buffer inside libc:

- `printf` (and `puts`, `putchar`…) put their text into the buffer. It
  appears there at the statement that called it.
- A **flush** moves the buffer's bytes into the terminal. When one happens
  depends on where stdout goes: to a terminal, at each `\n`; to a pipe or
  file (`./a.out | cat -e`), only when 4096 bytes fill up. Either way also at
  exit and on `fflush`.
- `write(1, …)` goes straight to the terminal, past the buffer.

So mixing them shows its real result: `printf("a"); write(1, "b", 1);
printf("\n");` prints `ba`, and you can see why. The terminal node says which
case it is showing (terminal or pipe), and the trace must really run that way:
today the tracer sends stdout to a file, which is the pipe case.

Truth comes from the run, not from a model of libc: the bytes that really
reached the output after each step, and the buffer's real contents
(`stdout`'s write pointers in glibc) read under gdb.

### 2. Module (a `.c` file)

| Construct | Norm | Picture | Moves when | Status | Edit later |
| --- | --- | --- | --- | --- | --- |
| A file, closed | ≤ 5 functions | A module block, with one door per public function | a frame inside is running or waiting | ✅ | Palette: new file |
| A file, open | ≤ 5 functions | A wall around its machines, with a title tab | a frame inside is live | ✅ | — |
| A public function | Prototype in a header | A door on the wall where a belt crosses it | a belt through it is live | ✅ | Toggle `static` on a machine |
| Capacity | 5 definitions | Not shown | — | ⬜ | 5 slots in the wall, filled or empty |
| A file-scope `static` | `static` or `const` only | A chest | written | ✅ | Drop a chest into the wall |

### 3. Machine (a function)

| Construct | Norm | Picture | Moves when | Status | Edit later |
| --- | --- | --- | --- | --- | --- |
| The function | ≤ 25 lines, a tab before its name | A machine: title (its name), storage, stations, memory floor | its frame is running, waiting, returned | ✅ | Palette: new machine |
| Parameters | ≤ 4, named | Input ports on the left; parameter rows in storage | a call arrives | ✅ | Drag a belt end onto an empty port |
| Return type | — | In the RETURN panel, with the value once it leaves | a return | ✅ | Pick from the types shelf |
| Locals | ≤ 5 (a local `static` counts), declared first | Storage rows (int, ptr, NULL, unset, dangling), struct fields folded under their row | a write lands (flash) | ✅ | Drop a row into storage |
| A local `static` | Can initialise on its line | A chest | written | ✅ | — |
| `static` function | — | The word `static` in the title's meta line, in the skins that draw one (the kit's and a few others) | — | 🟡 not in every skin | Toggle |
| Line capacity | 25 physical lines | Not shown | — | ⬜ | A fill bar: lines used of 25, counted the way the checker counts |
| Recursion | — | One copy per level, stacked; a reserved slot for the next copy | a call to itself | ✅ | — |
| Stale | — | Dimmed, keeps its place when the code stops parsing | a parse error | ✅ | — |

### Machine anatomy

Top to bottom, the life of one call:

| Part | What it holds | Status |
| --- | --- | --- |
| **IN dock** (the motor, top left) | Where a call arrives, in four states: *idle* (dim, not called), *running* (the call's arguments are here), *waiting* (it called another function and is paused until that returns), *crashed* (it died; the station that died is marked too). | ✅ Minimal and Barebone draw the dock (`skins/dock.ts`): the intake strip in the state's colour, IN and the state, the arguments *as they arrived* (PARAMETERS holds the copies as they are now), the last call's dimmed once it returned, "arguments not traced" for a call that began before the loaded window, the line and signal it died of. Other skins still draw their motor. |
| **PARAMETERS** | The function's own copies of its arguments. C passes by value: a plain value is copied in. A pointer's *address* is copied, and what it points at stays where it was (see REACHED). | ✅ |
| **LOCALS** | Its own variables, at most 5, declared first (Norm). They start unset (`?`): the Norm forbids initialising where you declare. | ✅ |
| **KEPT (static)** | Its statics, which outlive the call. Another machine that reaches them sees them under REACHED. | ✅ |
| **REACHED (through pointers)** | Memory it only reaches through a pointer, written as the C that gets there (`buf->len`). It belongs to someone else: writing it changes the caller's data. | ✅ struct fields, and the bytes behind each `char *` inside the panel, labelled with what they are and who allocated them (`data → heap #1 · malloc lr_grow:172`); only heap bytes are drawn so far |
| Stations | One per line of code (section 4). | ✅ |
| **RETURN** | The return type, and the value once it leaves (`void`: done). | ✅ |

Every row in a pool shows what it held before, dimmed, newest nearest:
`cap   ? → 0 → 8 → 16`. That's how the data changes over time.

A long run is shown a window of steps at a time (decision 043). A window's
first stop holds what already existed when it began: frames and heap blocks
drawn as present, never as a call or an allocation happening then, and the
output printed before it already in the terminal. A frame that began before
the window shows its locals' memory as it is (the trace didn't see which were
assigned).

A pointer row shows an address tag, not a value: a socket dot and what
lives at the address it holds (`bufs[0]`, `heap #1`, `main.n`). A `char *`'s
text is in its byte strip, not on its row. Minimal and Barebone draw tags;
other skins still print the value until the design settles.

A pointer's line goes to the address it holds, and nowhere else. Passing a
pointer down a call chain copies the address, so every copy's line goes
straight to the origin (`lr_grow`'s `buf` → `bufs[0]`), never through the
caller's pointer. A real chain (`t_reader **pp` → `buf` → `bufs[0]`) is drawn
only when a variable holds the address of another pointer. How the address
travelled is the belts' story, not the lines' (author's call, 2026-09-29).

Labels write C's `->` with a non-breaking hyphen, so code fonts don't join it
into one arrow glyph: a plain arrow means "points to", never "field of".

### 4. Station (a statement)

Inside a machine, each line is a station on a track. The Norm leaves nine
kinds:

| Construct | Picture | Moves when | Status | Edit later |
| --- | --- | --- | --- | --- |
| Assignment `x = e;` | A station; the expression fills with the values it read, the result flies to its row | the line runs | ✅ | Drag from a storage row to a station: `row = …` |
| A call as a statement `f(a);` | A station, with a belt out to the callee | the call | ✅ | Drag a belt from the station to a machine |
| `x++;` / `x--;` | A station | the line runs | ✅ | — |
| `if (c)` | A switch: the condition with its operands, `→ true/false`, the branch taken lit | the condition is read | ✅ | Palette: switch |
| `else if` / `else` | The other branch on the switch's track | — | ✅ | Add a branch to a switch |
| `while (c)` | A loop station, a back track, a count of rounds | each round | ✅ only the count, not past rounds | Palette: loop |
| `return e;` | A return station; the value rides back to the caller | the return | ✅ | — |
| `break;` / `continue;` | A jump station | the jump | ✅ | — |
| The closing `}` | The end station | the function falls off its end | ✅ | — |

Outside the Norm, the parser also handles `for` and `do…while` (the
interpreter accepts them; the Norm checker rejects both). They get no picture of their own and never will:
the grammar only covers what the Norm allows.

### 5. Expression

| Construct | Picture | Moves when | Status | Edit later |
| --- | --- | --- | --- | --- |
| A read | The value flies from its row into the station | the line runs | ✅ | — |
| The whole expression | Its text, with each name replaced by the value read (`6 == 8 → false`) | the line runs | ✅ | Typed as text in the station |
| A call inside an expression | A belt out; the return plate comes back into the expression | the call and its return | ✅ | — |
| A dereference `*p`, `p->f`, `a[i]` | The value read, not where it came from | — | 🟡 | — |

### 6. Values and memory

| Construct | Picture | Moves when | Status | Edit later |
| --- | --- | --- | --- | --- |
| An argument | A hexagonal plate (pointed ends) riding the belt into the callee | the call | ✅ | — |
| A pointer argument | A plate saying "same address · what it points at is below" | the call | ✅ | — |
| A return value | A plate riding back | the return | ✅ notched ends, the argument's reverse (Minimal and Barebone; other skins still differ only in colour) | — |
| A struct on a belt | A crate: its type, where it lives, its fields | the call or the return | ✅ | — |
| A byte buffer | A strip, with `pos`/`len`/`cap` markers moving | bytes written | ✅ | — |
| A heap block | A block on the heap shelf; freed ones go, leaked ones stay at exit | `malloc`, `free`, exit | ✅ | — |
| Who owns a heap block | Not shown | — | ⬜ | — |
| Two names for the same memory | Not shown | — | ⬜ | — |
| NULL, unset, dangling | Row kinds with their own look | the value changes | ✅ | — |

### 7. The author's layer (M2)

These are drawn by the author, bound to an expression, and never
generated:
- strips, markers, chests, drills, copies, stacks, trains;
- invariants (`pos <= len <= cap`), flagged at the step they first fail.

Unbound ones are dimmed and never animated. ✅

### 8. Around the grid

| Picture | What it tells | Status |
| --- | --- | --- |
| The kill feed | Who sent what to whom, newest on top | ✅ |
| The duel | A transfer between machines far apart | ✅ |
| The focus card | What went into a call and what came out | ✅ |
| Lenses | What's under the pointer, at readable size, when zoomed out | ✅ |
| Crossings | The line on top cuts a gap in the one below | ✅ |
| Count badges | How many times a belt ran | ✅ |

## Clarity rules

0. **The truth comes first (hard rule).** Every picture follows how C and
   the machine really work: what is copied, what is shared, where a pointer
   points, where memory lives, who owns it. No workaround or friendlier story
   that contradicts it. If the truth can't be drawn yet, draw less, never
   something false. The rules below never override this one.
1. **One picture, one meaning.** If two things look alike, one of them
   changes. If one thing looks two ways, pick one.
2. **The same meaning in every skin.** A skin changes the style, never the
   shape that tells you what something is. Status, direction and kind must
   read in Barebone as clearly as in the PS3.
3. **Every motion is a real event** (principle 4), and every event that
   matters to the program has a motion.
4. **Norm limits are visible as capacity.** The number of slots is the
   limit, so a full machine looks full.
5. **Readable at the zoom it's drawn at.** Below that, draw less, not smaller.

## To do, from this table

The 🟡 and ⬜ rows, in the order they matter for editing later:

1. **Capacity** (module 5 definitions, machine 25 physical lines, ports 4,
   storage 5 including local statics).
2. ~~Return type~~: done, in the RETURN panel.
3. **Argument vs return plates**: different in shape, not just in colour.
4. **The types shelf** (structs, typedefs, enums, macro constants).
5. **Dereference**: where a `*p` or `p->f` value came from.
6. **Ownership** of heap blocks.
7. **Aliasing**: pointer arrows from rows to the memory they point at.
8. **Loop history**: past values are shown per row now; past rounds of a
   loop as a whole are not.
9. **Output as it happens**: the printf buffer node and `write` going straight
   to the terminal (designed above, under Project).
10. **`static` functions** marked the same way in every skin.

Each one becomes a decision entry when it's built.

## Naming

"Ghost" is already taken: `Skin.ghost` draws the reserved slot of a recursive
copy. A machine that is planned but not in code yet is a **plan** (dimmed,
unbound, like an unbound sprite).

## The one open question

How far down does the picture go before it switches to text?

- **Statements down, expressions as text (recommended).** You place storage
  rows, stations, switches, loops, returns and belts. The expression inside
  a station is typed, one line, checked by the parser as you type. Norm C
  lines are short, so a one-line text field is enough, and typing an
  expression is faster than assembling it from blocks.
- **Everything as blocks**, down to operators, like Scratch. Everything can be
  done by mouse, but it's slow for anyone who can type, and it's a much
  larger grammar to draw.
