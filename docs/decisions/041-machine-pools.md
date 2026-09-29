# a machine's storage in pools, with each row's past values

*2026-09-29* · **Status:** Accepted

- **Decision (author):** A machine reads as the life of one call: the IN
  dock top left (idle, running), then PARAMETERS (the copies it was called
  with), LOCALS (the Norm's declaration block), KEPT (statics), the
  stations, REACHED (memory it gets to through a pointer) and RETURN (the
  type, and the value when it leaves) at the bottom. Rows show what they
  held before, so data can be followed over time. The dock shows the
  engine's four states: idle, running, waiting (paused on a callee) and
  crashed.
- **Decision:** A pointer's struct fields move from under the pointer's row
  to REACHED, labelled `buf->len`. Own struct values keep their fields under
  their row. Slot keys don't change, so reads, writes and wires still find
  them.
- **Decision:** Every skin draws the pools with its existing frame part;
  `FrameInfo.title` names the pool and `RowInfo.past` carries the history.
  All five storage-table drawings (the kit's, Minimal, Aqua, Classic, Amp)
  draw the history, so every skin has it. The look per skin is for later.
- **Decision:** Labels write `->` with U+2011 (a non-breaking hyphen): code
  fonts join an ASCII `->` into one arrow glyph, which the author found
  confusing next to "points to" arrows. Canvas ignores a zero-width
  non-joiner, so that didn't work.
- **Why:** The single "FRAME" panel didn't say whether a row was a
  parameter, a local, a static or someone else's memory, and it showed only
  the value now.
