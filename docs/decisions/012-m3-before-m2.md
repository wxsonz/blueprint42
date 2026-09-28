# M3 before M2

*2026-09-27*

- **Decision:** Build real execution (the gdb trace server) before the
  toolbox and bindings. SPEC §4 is amended. M3's acceptance check keeps
  what execution alone can show; the strip parts (`pos` chasing `len`)
  moved to M2's.
- **Why:** M2's strips and markers only mean something with real values.
  Built first, they would all be unbound placeholders.
