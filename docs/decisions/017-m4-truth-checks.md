# M4 truth checks

*2026-09-27*

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
