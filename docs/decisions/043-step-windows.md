# long runs in windows of steps, from savepoints

*2026-09-29* · **Status:** Accepted

- **Decision (author):** A run too long to trace at once is looked at a
  window of steps at a time ("steps 100,000–120,000"). gdb stepping is
  deterministic, and within one run step k is simply the k-th step, so a
  window is exactly those steps of that run.
- **Decision (author):** Checkpoints, like a game world saving as it is
  explored. The trace server keeps one gdb session per program
  (`server/trace.mjs` sessions, `tracer.py` serve mode). Every 20,000 steps
  the run leaves a savepoint: a gdb checkpoint (a forked copy of the stopped
  program, ~70 KB of real memory each, measured) plus the tracer's own state.
  A window starts from the nearest savepoint, or from where the program
  already is. The page caches the last six windows (`src/session.ts`) and
  plays on into the next at a window's end.
- **Decision (author):** A nerd stats panel (`src/stats-ui.ts`, "Stats" on
  the window banner) shows: the step now, the run's length, the savepoints
  with their memory, each cached window's size, fetch time, where it started
  from, and skip and record rates, and the page's memory.
- **Truth:**
  - A window's first stop carries the frames and heap blocks that already
    existed as `pre`: they are there, not called or allocated now.
  - Output written before the window is kept, so the terminal starts with it.
  - A `pre` frame's locals show their memory as it is, because the trace
    didn't see which ones were assigned.
  - Checked stop for stop, restored against walked from the start: push_swap,
    heap (with allocations after the savepoint) and output (output before
    the window, then the exit).
- **Found on the way:**
  - With savepoints around, a program that exits makes gdb switch to one of
    them without an exit event, and it may carry on the stepping command on
    it. The tracer notices by the process id changing, reads `$_exitcode`,
    and drops that savepoint.
  - Recording, not skipping, is the cost: about 1,000 steps a second,
    against about 1,500–2,000 silent. Faster skipping was tried and
    rejected: counting breakpoints on every line landed on a different line
    than `step` at the same count (wrong step numbers); gdb's `step N` was
    exact but only 1.5× faster.
- **Also:** a caller whose bytes didn't change is no longer re-read or
  re-sent, memory is read in bulk per stop, and snapshots share unchanged
  frames. files-1024 went from 87 s / 82 MB to 40 s / 4.7 MB.
