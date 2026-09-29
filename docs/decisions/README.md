# Decisions

Deviations from the [spec](../SPEC.md)'s recommended stack and answers to its
§6 open questions, one file each, numbered in the order they were made. A
new decision gets the next number and a short name (`038-what-changed.md`)
and a line here. When a later decision replaces one, the old one's
**Status** line says which, and so does this table.

| # | Date | Status | Decision |
| --- | --- | --- | --- |
| [001](001-prototype-first.md) | 2026-09-27 | Accepted | visual prototype in `proto/`, ahead of M0 |
| [002](002-interpreter.md) | 2026-09-27 | Accepted | in-browser interpreter instead of the gdb trace server (prototype only; kept) |
| [003](003-focus-keys.md) | 2026-09-27 | Superseded by 008 | focus keys are `Ctrl-h` / `Ctrl-l`, not `<C-w>h/l` |
| [004](004-rename-tracking.md) | 2026-09-27 | Accepted | SPEC §6 rename tracking (prototype answer) |
| [005](005-placement-v1.md) | 2026-09-27 | Superseded by 011 | SPEC §6 automatic placement |
| [006](006-sprite-art.md) | 2026-09-27 | Superseded by 009 | SPEC §6 sprite art direction |
| [007](007-metaphor-additions.md) | 2026-09-27 | Accepted | metaphor additions (not in SPEC §2) |
| [008](008-vim-editor-only.md) | 2026-09-27 | Accepted | vim only in the editor; the canvas is mouse-first (amends SPEC principle 2) |
| [009](009-skins.md) | 2026-09-27 | Accepted | skins instead of one Factorio-style look |
| [010](010-recursion-copies.md) | 2026-09-27 | Accepted | recursion spawns copies (amends the SPEC §2 metaphor) |
| [011](011-routing.md) | 2026-09-27 | Accepted | routing, and SPEC §6 automatic placement |
| [012](012-m3-before-m2.md) | 2026-09-27 | Accepted | M3 before M2 |
| [013](013-trace-server.md) | 2026-09-27 | Accepted | the trace server (M3) and the two engines |
| [014](014-trace-granularity.md) | 2026-09-27 | Accepted | SPEC §6 trace granularity (measured) |
| [015](015-gdb-picture.md) | 2026-09-27 | Accepted | what the gdb picture shows (principle 4 details) |
| [016](016-m2-author-layer.md) | 2026-09-27 | Accepted | M2 author layer and binding limits |
| [017](017-m4-truth-checks.md) | 2026-09-27 | Accepted | M4 truth checks |
| [018](018-m5-projects.md) | 2026-09-27 | Accepted | M5 open a real project |
| [019](019-belt-data.md) | 2026-09-27 | Accepted | Real data on belts, struct fields in frames |
| [020](020-fast-focus-playback.md) | 2026-09-27 | Accepted | Fast and Focus playback |
| [021](021-m55-design.md) | 2026-09-27 | Superseded by 025 | M5.5 inside a machine (the author's design) |
| [022](022-m55-built.md) | 2026-09-28 | Partly superseded by 025 | M5.5 as built |
| [023](023-m6-live-edits.md) | 2026-09-28 | Accepted | M6 live edits from any editor |
| [024](024-common-core.md) | 2026-09-28 | Accepted | the Common Core this tool targets |
| [025](025-enter-machine.md) | 2026-09-28 | Superseded by 026 | Enter the machine (replaces M5.5's in-place interior) |
| [026](026-machine-inside.md) | 2026-09-28 | Accepted | the machine is its inside (replaces "enter the machine") |
| [027](027-tidy-machines.md) | 2026-09-28 | Accepted | Tidy, closed machines, four more themes |
| [028](028-speed-zoom-lenses.md) | 2026-09-28 | Accepted | speed, zoom out, lenses |
| [029](029-windows-skins.md) | 2026-09-28 | Accepted | real windows, and XP / 7 / 8 skins |
| [030](030-mac-eras.md) | 2026-09-28 | Accepted | the Mac eras |
| [031](031-killfeed-duel.md) | 2026-09-28 | Accepted | kill feed, the duel, Barebone |
| [032](032-light-dark.md) | 2026-09-28 | Accepted | light and dark modes |
| [033](033-ps2-boot.md) | 2026-09-28 | Accepted | the PS2 boot screen, animated |
| [034](034-ps3-xmb.md) | 2026-09-28 | Accepted | the PS3 skin is the blue XMB |
| [035](035-ps3-tints.md) | 2026-09-28 | Accepted | PS3, second pass: XMB lines and focus, theme colours |
| [036](036-ps4-frame.md) | 2026-09-28 | Accepted | PS4 takes the PS3's window frame |
| [037](037-rename-blueprint42.md) | 2026-09-28 | Accepted | renamed blueprint42, examples, a fixture of our own |
| [038](038-repo-layout.md) | 2026-09-29 | Accepted | the app at the repo root, docs in docs/ |
| [039](039-smaller-files.md) | 2026-09-29 | Accepted | the three biggest files split along their seams |
| [040](040-visual-grammar.md) | 2026-09-29 | Accepted | toward a visual code editor, scoped to Norm C |
