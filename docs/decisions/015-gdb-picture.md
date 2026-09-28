# what the gdb picture shows (principle 4 details)

*2026-09-27*

- Uninitialised locals show `?`, not stack garbage, until a value changes
  or the executed line assigns them (a regex over the source line). Params
  are always defined.
- Pointers resolve to what they point at: a variable (wire), an array
  element (`bufs[0]`), a heap block or offset into it (`#1`, `#1+10`), or a
  block that was freed (`freed #3`, drawn dangling). Anything else shows as
  a raw address.
- A write to a variable outside the running function is attributed to the
  running function's pointer that points at it (the wire it travels).
- With more than four live pointers, only the running function's wires and
  the focused function's wires are drawn. The rows still show every target
  as text.
- Long traces pick a playback speed that plays them in about 45 s.
- The GNL sample passes `-D GNL_INIT_CAP=8` (the fixture's own `#ifndef`
  knob) so the doubling shows on short lines. The fixture files are
  unchanged; the sandbox adds a small `main` after them.
