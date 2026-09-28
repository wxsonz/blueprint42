# SPEC §6 trace granularity (measured)

*2026-09-27*

- **Answer:** Per-line stepping under gdb is fast enough for sandbox-sized
  inputs. gnl_v3 with `BUFFER_SIZE=4` on a 3-line input is about 600 stops
  (about 1,050 events) in about 1 s, including compile. That's roughly 600
  stops per second, so a 100-line input (~20k stops) would take about
  30 s. That's at the cap and needs `-finstrument-functions` or watchpoints
  if it matters (M5-sized inputs).
