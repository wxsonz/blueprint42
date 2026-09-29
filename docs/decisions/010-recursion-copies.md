# recursion spawns copies (amends the SPEC §2 metaphor)

*2026-09-27* · **Status:** Accepted

- **Decision:** A recursive call spawns a copy of the function (`fact #2`,
  `fact #3`, …) next to its parent. The argument rides the belt into the new
  copy, the copy has its own frame, and on return the value rides back and
  the copy dissolves. The first live frame of a function is shown on its
  home node and each deeper one on the next copy. Copy slots are reserved
  per trace (max depth, capped at 10) so nothing moves during playback.
  When nothing is running, a dashed placeholder marks where the first copy
  will appear. The self-loop belt is gone. Mutual recursion uses the same
  hosts plus temporary belts. Copies can be selected but not dragged; they
  follow their home.
- **Why:** The author pictures recursion as building a new factory and
  carrying the value into it. One node with stacked frames hid the
  unwinding.
