# The visual grammar

Every picture blueprint42 draws, what C it stands for, and what makes it
move. The same table is meant to become the editor later: a picture you can
read is a picture you can place. This is only possible because the Norm keeps
C small and regular. Status marks: ✅ drawn today, 🟡 drawn but unclear or
partial, ⬜ not drawn yet.

## Why the Norm makes this possible

Plain C can't be edited as pictures without losing something. Norm C can,
because its shape is fixed:

| Norm rule (v4.1) | What it gives the grammar |
| --- | --- |
| At most 5 function definitions per `.c` file | A module has 5 machine slots |
| At most 4 named parameters; `void` if none | A machine has at most 4 input ports, all named |
| At most 5 variables per function, declared first, one per line, never initialised on the same line | Storage is a fixed block of at most 5 rows above the stations. A value is set by a statement, never by the declaration. |
| At most 25 lines per function | A machine holds at most 25 station rows (capacity) |
| One instruction or control structure per line; no assignment inside a condition | One station = one line = one action. A condition only reads. |
| No `for`, `do…while`, `switch`, `case`, `goto` or `?:` | Control flow is only `if` / `else if` / `else`, `while`, `return`, `break`, `continue` |
| Declarations only at the top; no VLAs | Storage never appears midway, and its size is known up front |
| Structs, typedefs, enums, unions (`s_`, `t_`, `e_`, `u_`) declared in headers | Types live in one place per project, not in machines |
| Globals only `static` or `const` (`g_`) | Every global is a chest: visible, and owned by a file |

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
| Return type | — | Not drawn: the parser reads it (`ret`) but `NodeInfo` doesn't carry it | a return | ⬜ | Pick from the types shelf |
| Locals | ≤ 5, declared first | Storage rows (int, ptr, NULL, unset, dangling), struct fields folded under their row | a write lands (flash) | ✅ | Drop a row into storage |
| A local `static` | Can initialise on its line | A chest | written | ✅ | — |
| `static` function | — | The word `static` in the title's meta line, in the skins that draw one (the kit's and a few others) | — | 🟡 not in every skin | Toggle |
| Line capacity | 25 | Not shown | — | ⬜ | A fill bar: lines used of 25 |
| Recursion | — | One copy per level, stacked; a reserved slot for the next copy | a call to itself | ✅ | — |
| Stale | — | Dimmed, keeps its place when the code stops parsing | a parse error | ✅ | — |

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
interpreter accepts them). They get no picture of their own and never will:
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
| An argument | A plate riding the belt into the callee | the call | ✅ | — |
| A pointer argument | A plate saying "same address · what it points at is below" | the call | ✅ | — |
| A return value | A plate riding back | the return | 🟡 the argument and the return plate differ only in colour and direction | — |
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

1. **Capacity** (module 5, machine 25 lines, ports 4, storage 5).
2. **Return type** drawn in the title (it's parsed already).
3. **Argument vs return plates**: different in shape, not just in colour.
4. **The types shelf** (structs, typedefs, enums, macro constants).
5. **Dereference**: where a `*p` or `p->f` value came from.
6. **Ownership** of heap blocks.
7. **Aliasing**: pointer arrows from rows to the memory they point at.
8. **Loop history**: past rounds' values.
9. **Output as it happens**, not only at exit.
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
