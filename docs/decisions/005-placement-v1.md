# SPEC §6 automatic placement (superseded)

*2026-09-27*

> Superseded by [011-routing](011-routing.md).

- **Decision:** For first placement, use columns by BFS call depth from
  `main` (or from uncalled roots), 7 cells apart. A symbol added
  mid-session goes to the nearest free spot right of its first caller.
  Existing and pinned machines never move.
- **Why:** It's simple and stable. A Sugiyama pass may still be worth it for
  larger projects (M5).
