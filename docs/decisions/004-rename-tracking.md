# SPEC §6 rename tracking (prototype answer)

*2026-09-27*

- **Decision:** If exactly one function vanishes and exactly one appears in
  the same re-parse, treat it as a rename: the machine keeps its position and
  pin. Otherwise vanished symbols are removed, or kept as *stale* if the
  buffer has a syntax error.
- **Why:** Typing a rename changes one name per debounced parse, so the 1:1
  case covers normal editing. Revisit if M1 shows false matches, for example
  when deleting one function while pasting another.
