# M5.5 inside a machine (the author's design)

*2026-09-27*

- **Decision (author):** The canvas pane is renamed "Blueprint".
- **Decision (author):** A function's interior opens in place: the machine
  expands on the grid and neighbours move aside. Not an overlay, not a side
  panel.
- **Decision (author):** Every statement is a station. Conditions are
  switches that fork the track, loops are loop-backs with counts, and
  `return` is an exit. A token follows the running line, and each switch
  shows its operand values and result.
