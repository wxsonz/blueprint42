# Tidy, closed machines, four more themes

*2026-09-28* · **Status:** Accepted

- **Decision (author):** A button puts the layout back to the auto layout
  (**Tidy**: unpins everything, drops hand-routed belts; Undo in the toast).
  **Insides / Closed** shows or hides every machine's inside; a closed
  machine is its motor plus the line it's on. One machine: double-click
  its title or motor.
- **Decision:** Layouts saved when machines were small are settled when
  they load (auto machines re-placed, colliding pinned ones freed) instead
  of drawing machines on top of each other.
- **Decision (author):** Four more themes: Blueprint, Factory floor, Game
  Boy, Synthwave. They share one implementation of the skin hooks
  (`skins/kit.ts`) driven by a theme spec (palette, fonts, card, floor,
  belt, flourishes). The original four keep their own files. The picker
  is a dropdown now.
