# M2 author layer and binding limits

*2026-09-27*

- **Decision:** Place strip, marker, chest, drill, inserter (copy), stack,
  and train sprites by dragging from the dock. The inserter was added in
  review because the M2 acceptance picture needs one. They stay where the author puts them and sit
  alongside function frame rows. Selecting a sprite opens its binding form;
  right-click offers Bind and Remove. A typed struct with `char *` data and
  named `size_t` fields can suggest a strip with markers, but the author
  chooses whether to add it.
- **Why:** Dock dragging follows the mouse-first canvas model, and keeping
  the frame row preserves the complete execution record beside the author's
  more focused view.
- **Decision:** Bindings accept only read-only identifiers with field and
  array-index access, such as `buf->data` or `bufs[fd].pos`. Both the browser
  parser and blueprint import validate them. Calls, writes, and arbitrary C
  expressions are excluded. The gdb tracer samples at most 256 bytes per
  strip per stop; capacity and marker indices still use full values.
- **Why:** Gdb expression evaluation must not alter the program being
  observed. The byte cap keeps the per-step timeline bounded while showing
  enough contents for small 42 buffers.
- **Decision:** Blueprint download/upload contains node positions, call
  waypoints, and sprites only; source and stdin remain local to each sample.
  Bindings rerun the trace and clear previous values until new samples arrive.
- **Why:** Text stays the source of truth, and stale values must never appear
  under an edited expression.
