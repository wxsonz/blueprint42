# renamed blueprint42, examples, a fixture of our own

*2026-10-02*

- The project is **blueprint42** (the name, the page title, the package, the
  nvim plugin: `:B42Connect`/`:B42Open`/`:B42Disconnect`, with the old
  `:Ftb…` commands and `require('ft_blueprint')` kept as aliases).
- The tool's folder in a project is `.blueprint42/`. A project saved before
  the rename still opens: `.ft_blueprint/` files stand in for missing
  `.blueprint42/` ones (shown under the new name as not yet on disk, so a
  save creates the new file); the old folder is never written. Tested.
- The samples on the top bar are one **Examples** dropdown, grouped by what
  they need: the browser alone (pointer, swap, static counter, factorial,
  fibonacci, gcd), real C under gdb (strings & malloc, bubble sort, structs,
  a linked list, a crash, a leak), reading input (the line reader on stdin),
  and projects (the line reader as three files with a driver main; a small
  libft built by its own Makefile's sub-make). Each shows one thing the
  blueprint can do. All fifteen were run in the page: the interpreter ones
  and gdb ones finish with the expected exit codes, the crash stops on
  SIGSEGV, the leak reports its one block.
- The author's get_next_line is private: it's out of the examples, out of
  the bundle and untracked (kept locally, ignored). The acceptance tests
  moved to `samples/line_reader/`, a get_next_line-style reader written for
  this repo to the same shape (10 functions, 4 static, a function-local
  static table of `t_reader`, a doubling buffer zero past its text, reads of
  BUFFER_SIZE), so every test still checks what it did; values that differ
  for this reader (its reset zeroes the 23 bytes it held) were taken from
  real runs. The invariant test caught a real transient in the first draft:
  resetting `len` before `pos` left `pos > len` for one statement; `pos` is
  reset first now.
- A single file gets run settings too, not only a project: the `args` and
  `-D` fields under stdin are always shown, kept per example in this
  browser with the rest of its state, and sent to the trace server (which
  already took both). A `main(int ac, char **av)` reading `av[1]` could
  not be given an argument before, so it died on a NULL `av[1]`.
- The PS4 band was too wide and stuttered. Its thickness is about halved
  (the flared ends 5–10% of the view's height, the body 2–3%), a pass takes
  16 s instead of 12, and while the page is idle a full-bleed background
  keeps repainting at 30 fps (the grid still rests at 15): at 15 fps the
  band's sweep, a few hundred pixels a second, jumped ~20 px a frame. The
  band itself costs ~0.2 ms a frame, so the jumps, not the drawing, were
  the lag.
- Skins still in progress are marked: a ⚠ badge at the top right of their
  thumbnail in the picker (with a tooltip), and listed in the README. The
  list is `WIP` in `skins/index.ts`: Windows 8, Yosemite, Big Sur, Tahoe,
  PS5, Game Boy, GameCube, Wii, Switch (a light/dark variant shares its
  base's mark). Remove an id when its polish pass is done.
- Leopard and the "Just for fun" skins (Amp, Blueprint, Factory,
  Synthwave) are marked in progress too.
- The stdin / args / -D labels used the pane title bar's text colours
  (`--head-fg`), pale in skins whose title bars are dark (Seven, XP…), but
  they sit on the pane's body: they use `--fg` / `--fg-dim` now. Checked in
  all 33 skins (contrast 3.3:1 at the lowest, Game Boy's hint line).
- Four fixes from running a `main(int ac, char **av)` with an argument:
  - The process box printed `$ ./a.out` whatever the arguments: the trace
    server echoes the arguments it ran with, and every skin's prompt shows
    them (`$ ./a.out 200`, quoted when needed).
  - It showed the last lines of output with no sign of the rest: the
    prompt row now says how many lines are above (`+2 ↑`, or a line saying
    so in the terminal-style skins).
  - `av` was an address: for a `char **` the tracer reads the strings it
    points at (up to the NULL that ends the list, 8 at most) and it shows
    as `{"./a.out", "200"}`, in storage and on belts. The program is run
    as `./a.out` (a bash exec-wrapper setting argv[0]), as from a
    terminal, not as the temp path it was built at.
  - `(void)ac;` stayed "never reached": the compiler drops it, so gdb never
    stops there. A plain statement is now counted as run when the frame
    reaches the next statement in its block (no goto under the Norminette).
- The process box grows with what the program printed, so the whole
  output shows: 13 px per line past the first two, up to 12 lines (past
  that, a count of the lines above). Its height comes from the run's
  output, so routing, clicks, the heap shelf under it and focus framing
  all use it (`procH` in `machine.ts`).
