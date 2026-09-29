# Enter the machine (replaces M5.5's in-place interior)

*2026-09-28* · **Status:** Superseded by [026-machine-inside](026-machine-inside.md)

- **Decision (author):** The inside of a function is a main feature, not a
  side panel. Double-click enters the machine: it becomes a room filling
  the Blueprint pane, with the factory faint around it; Esc leaves. This
  replaces "expand in place" from 2026-09-27.
- **Decision (author):** Inside, playback is slow for that function's
  statements and skips everything else.
- **Decision:** A statement's reads are the names it uses (not the plain
  target of `=`), valued from the snapshot at its stop. `i++` and `&x`
  are shown as written. Its writes are what differs at the next stop. Both
  come straight from the trace, and nothing is evaluated.
- **Decision:** Pointed-at bytes live on a memory floor along the bottom
  of the room (legible at 24 cells wide), not inside the frame panel. Sibling
  integer fields named like indices (`pos`, `len`, `cap`, `size`, `start`,
  `end`, `i`…) mark their position on it. That is a naming heuristic, and
  it only draws values that are really there.
- **Decision:** The room reuses existing skin hooks (wall, frame, strip,
  interior, door, plate, pulse) rather than adding new ones, so every skin
  has it at once.
