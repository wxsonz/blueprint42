# Recording speed: gdb's stepping stays, for now

*2026-10-03* · **Status:** Accepted

- **Decision (author):** gdb's line stepping stays the recorder: about
  1,050 steps a second on this machine, so a 20,000-step window takes about
  19 s. Since decision 049 windows are recorded and converted ahead, so
  playback runs on without waiting at any speed a person can watch; the
  recording speed shows only when a run starts and after a jump far ahead.
  Revisit if those waits become the pain.
- **The ways past it, weighed** (`docs/OBJECTIVES.md`, "fast at any size",
  step 8):
  - Tuning `tracer.py` (read less per stop): at most about 1.5–2× faster,
    because stepping with nothing recorded runs 1,500–2,000 steps a second
    (decision 043). No design change.
  - `rr` (record once at close to full speed, then replay windows side by
    side): rr isn't in Arch's repositories (the AUR), needs
    `kernel.perf_event_paranoid` lowered from 2 to 1 and its Zen workaround
    on this Ryzen 7940HX, and `tracer.py` would drive rr's gdbserver
    instead of gdb. Large.
  - Compiler line hooks (the program reports its own lines; gdb reads
    memory only there): much faster, but the binary is no longer the plain
    `-g -O0` build, so it would have to be shown that the picture is still
    what runs (SPEC principle 4). Large.
- **SPEC §6, trace granularity** (first answered in decision 014): per-line
  stepping under gdb, in windows from savepoints (043), converted ahead
  (049).
