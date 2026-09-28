# M5.5 as built

*2026-09-28*

- **Decision:** The interior hangs under the frame panel, as wide as its
  code needs (at most 12 cells). Auto-placed machines move aside: the
  column gets wider and the machines below move down. Pinned ones stay.
- **Decision:** Double-click a machine opens or closes it and still jumps to
  its code; double-click a statement inside jumps to that line. Right-click
  has Open/Close too.
- **Decision:** A switch's result is never computed by the tool. The
  interpreter reports it (`eval`); under gdb it is the next line the frame
  ran. While the frame sits on a switch its result shows as `…`.
- **Decision:** The readout replaces only names and one-level members
  (`buf->pos`) with their values at that moment. Calls, `sizeof` and array
  names stay as written, so `i < sizeof(size_t)` reads `8 < sizeof(size_t)`.
- **Decision:** A loop's count is for its current run (or its last one),
  not a total over the whole function call, so a nested loop starts again
  at ×0 each time round the outer one.
- **Decision:** One skin hook (`interior`) drawn by a shared function with
  each skin's palette, like crates, instead of three hooks per skin.
