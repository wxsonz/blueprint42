# real windows, and XP / 7 / 8 skins

*2026-09-28*

- **Decision (author):** Classic's machines and files are real windows:
  a title bar across the whole top with caption buttons, a gray client
  area for a machine, and the dark app workspace for a file (an MDI parent
  holding its functions' windows). There's no turquoise inside them any
  more. `WallInfo.kind` tells skins which is which.
- **Decision (author):** Three more skins: Windows XP (Luna), Windows 7
  (Aero), Windows 8 (Metro). The theme kit gained window chrome
  (`Theme.window`: frame, title bar, caption buttons, progress bar) and a
  cached wallpaper helper (`backdrop`). Wallpapers are drawn, not images:
  Bliss, Harmony, and the Metro start purple. Metro gives each machine its
  own tile colour from its name.
