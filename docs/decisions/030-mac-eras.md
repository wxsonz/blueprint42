# the Mac eras

*2026-09-28*

- **Decision (author):** Mac skins alongside the Windows ones: System 7,
  Mac OS 9 (Platinum), Mac OS X Leopard, OS X Yosemite, macOS Big Sur and
  macOS Tahoe (Liquid Glass). The existing Aqua skin covers 10.0–10.4.
  They're theme-kit specs in `skins/macos.ts`, sharing traffic lights,
  centred titles and title-bar stripes. Wallpapers are drawn, not copied
  images: the gray pattern, OS 9 blue, Aurora, a dusk mountain, coastal
  waves, and the lake. The skin list is ordered Windows, then Mac by era,
  then the rest.
- **Decision (author: "XP never had a square focus border"):** On the
  desktop skins, selection and attention speak the OS's language. A
  selected machine is the active window (active title bar), with no box
  and no hover outline. Focus mode's "look here" flashes the window's
  title bar and draws a ring along the window's own corners (square-bottomed
  on XP). Skins that paint whole windows set `solidMachines`, so the engine
  doesn't lay its square floor behind rounded corners.
