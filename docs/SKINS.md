# Skins: review status

Who may change what. The author reviews skins one at a time and guides each
one. An agent working on skins reads this first and updates it when done.
**Reviewed** means the author has guided a skin to their design standard,
not that it's frozen: it changes whenever the author asks for a change to
it. What an agent doesn't do is restyle a reviewed skin on its own
initiative (a sweep across skins, a "while I'm here" tweak).

| Status | Meaning |
| --- | --- |
| **reviewed** | The author has guided it to their design standard. Change it when the author asks; don't restyle it unasked. Engine-wide changes (a new picture every skin draws) still apply, drawn in its style. |
| **pending** | Not reviewed yet. Agents may improve it, staying true to the skin's era and palette, and log what they changed below. |
| **WIP ⚠** | Every skin that is not reviewed: marked work-in-progress in the picker (`REVIEWED` in `src/skins/index.ts` lists the exceptions). |

## Status

| Skin | Ids | Group | Status | Agent passes (newest last) |
| --- | --- | --- | --- | --- |
| PS1 | `ps1` | PlayStation | **reviewed** | the newer pictures built from the skin's own parts (2026-09-30, `Theme.look`): the IN dock is one of its storage panels (title IN, a state row, the arguments as rows), its state shown only by the skin's own light; tags and plates are its plates; capacity is its progress bar; printf buffer (2026-09-30): one of its storage panels titled printf, the head's capacity how full it is, where stdout goes and what's waiting as rows, the dock's own light lit while bytes wait; the dock's `from` row (the caller's line, which call of the function) and `+n more` arguments instead of dropping them (2026-09-30) |
| PS2 | `ps2` | PlayStation | **reviewed** | brightened at the author's request (2026-09-29): surfaces around `#101010` instead of black, dim and faint text raised, near-white softened; the viewer's windows and panels solid, matching the editor; the viewport's space stays the deepest black; accents and the boot scene kept; GPU cubes (GFX Full) as clear glass with no edges, no highlights, nothing inside, and a cheaper frame (2026-09-29); belt as an AV cable (2026-09-30): a shaded rubber cord, a ridged collar at the source, a plug with a metal tip at the destination (the arrow); the moving lights unchanged; door as a bulkhead port: a vented plate with slit grille either side of a metal-lined socket the cord passes through, a blue light while running; the newer pictures built from the skin's own parts (2026-09-30, `Theme.look`): the IN dock is one of its storage panels (title IN, a state row, the arguments as rows), its state shown only by the skin's own light; tags and plates are its plates; capacity is its progress bar; printf buffer (2026-09-30): one of its storage panels titled printf, the head's capacity how full it is, where stdout goes and what's waiting as rows, the dock's own light lit while bytes wait; the dock's `from` row (the caller's line, which call of the function) and `+n more` arguments instead of dropping them (2026-09-30) |
| PS3 | `ps3` | PlayStation | **reviewed** | the newer pictures built from the skin's own parts (2026-09-30, `Theme.look`): the IN dock is one of its storage panels (title IN, a state row, the arguments as rows), its state shown only by the skin's own light; tags and plates are its plates; capacity is its progress bar; printf buffer (2026-09-30): one of its storage panels titled printf, the head's capacity how full it is, where stdout goes and what's waiting as rows, the dock's own light lit while bytes wait; the dock's `from` row (the caller's line, which call of the function) and `+n more` arguments instead of dropping them (2026-09-30); focus mode's veil is the sky's own dark end, so dimming keeps the picked theme colour (a fixed navy turned other colours purple) (2026-10-01) |
| PS4 | `ps4` | PlayStation | **reviewed** | the newer pictures built from the skin's own parts (2026-09-30, `Theme.look`): the IN dock is one of its storage panels (title IN, a state row, the arguments as rows), its state shown only by the skin's own light; tags and plates are its plates; capacity is its progress bar; printf buffer (2026-09-30): one of its storage panels titled printf, the head's capacity how full it is, where stdout goes and what's waiting as rows, the dock's own light lit while bytes wait; the dock's `from` row (the caller's line, which call of the function) and `+n more` arguments instead of dropping them (2026-09-30) |
| PS5 | `ps5` | PlayStation | WIP ⚠ | scrollbars, toggles, belts, corners |
| Minimal | `minimal`, `minimal-light` | Simple | **reviewed** | scrollbars, toggles; belts (reverted: the author wants its original simple belt); IN dock prototype (`skins/dock.ts`); pointer address tags; argument/return plate shapes; Norm capacity; the author's reviewed skins; all others are WIP (2026-09-30), while PS1–PS4 adopt their pictures; nothing hidden (2026-09-30, decision 046): printf buffer node (`Skin.stdbuf`, `skins/stdbuf.ts`), `+n more arguments` on the dock; stdin node and stderr in the terminal (2026-09-30); the heap bar (2026-09-30, `skins/heapbar.ts`): heap cards replacing the shelf, struct watches, LOST blocks |
| Barebone | `barebone`, `barebone-light` | Simple | **reviewed** | scrollbars, toggles; belts (reverted: the author wants its original simple belt); IN dock prototype (`skins/dock.ts`); pointer address tags; argument/return plate shapes; Norm capacity; the author's reviewed skins; all others are WIP (2026-09-30), while PS1–PS4 adopt their pictures; nothing hidden (2026-09-30, decision 046): printf buffer node (`Skin.stdbuf`, `skins/stdbuf.ts`), `+n more arguments` on the dock; stdin node and stderr in the terminal (2026-09-30); the heap bar (2026-09-30, `skins/heapbar.ts`): heap cards replacing the shelf, struct watches, LOST blocks |
| Classic (Windows 3.1) | `classic` | Windows | WIP ⚠ | scrollbars, toggles, belts |
| XP | `xp` | Windows | WIP ⚠ | scrollbars, toggles, belts, corners |
| Seven | `seven` | Windows | WIP ⚠ | scrollbars, toggles, belts, corners |
| Metro (8) | `metro`, `metro-light` | Windows | WIP ⚠ | scrollbars, toggles, belts |
| System 7 | `system7` | Mac | WIP ⚠ | scrollbars, toggles, belts |
| Platinum (OS 8/9) | `platinum` | Mac | WIP ⚠ | scrollbars, toggles, belts, corners |
| Aqua | `aqua` | Mac | WIP ⚠ | scrollbars, toggles, belts, corners |
| Leopard | `leopard` | Mac | WIP ⚠ | scrollbars, toggles, belts, corners |
| Yosemite | `yosemite` | Mac | WIP ⚠ | scrollbars, toggles, belts, corners |
| Big Sur | `bigsur`, `bigsur-dark` | Mac | WIP ⚠ | scrollbars, toggles, belts, corners |
| Tahoe | `tahoe`, `tahoe-dark` | Mac | WIP ⚠ | scrollbars, toggles, belts, corners |
| Game Boy | `gameboy` | Nintendo | WIP ⚠ | scrollbars, toggles, belts |
| GameCube | `gamecube` | Nintendo | WIP ⚠ | scrollbars, toggles, belts, corners |
| Wii | `wii`, `wii-dark` | Nintendo | WIP ⚠ | scrollbars, toggles, belts, corners |
| Switch | `switch`, `switch-dark` | Nintendo | WIP ⚠ | scrollbars, toggles, belts, corners |
| Amp | `amp` | Just for fun | WIP ⚠ | scrollbars, toggles, belts, corners |
| Blueprint | `blueprint` | Just for fun | WIP ⚠ | scrollbars, toggles, belts, corners |
| Factory | `factory` | Just for fun | WIP ⚠ | scrollbars, toggles, belts, corners |
| Synthwave | `synthwave` | Just for fun | WIP ⚠ | scrollbars, toggles, belts, corners |

Minimal and Barebone are the plain skins on purpose: a hairline belt with
simple marching dashes. Don't decorate them.

The scrollbar and toggle pass (2026-09-29, commit e5f3ef6) touched every
skin's CSS, the reviewed ones included. The author hasn't looked at those
parts yet.

## Prototyping new pictures

A new engine picture (a part of the machine, a new kind of line) is
prototyped in **Minimal and Barebone only** (the author's call, 2026-09-29).
When it settles it is rebuilt *from each skin's own parts* (its panels,
plates, progress bar, lights), not recoloured and not given new invented
ornament (`Theme.look` in `kit.ts`: `cap`, `tag`, `plate`, `dock`). PS1–PS4
have theirs.
Other skins get it through the engine and their existing parts, untouched,
until the design settles; only then does a pass give them their own look.

## Rules for any skin pass

- Look lives in skins (`src/skins/*.ts`, `src/skins/consoles/*.ts`,
  `src/styles/*.css`), never in the engine. Kit-based skins style belts
  through `Theme.belt` (`src/skins/kit.ts`); hand-written skins implement
  `Skin.belt` themselves.
- Meaning never changes per skin (`docs/VISUALS.md`, clarity rules): live vs
  idle, direction, selected and hovered, the count badge, a custom-routed
  belt. They must read as clearly in every skin.
- Keep it cheap to paint. Barebone is the fastest skin, and must stay so.
- Check it in the real app: switch the *canvas* skin with the dev hook
  (`window.__ftb.applySkin(__ftb.SKINS.find((s) => s.id === 'xp'))`), not
  just the page's `data-skin`, and screenshot a sample with live belts.
- Add a line to "Agent passes" above for each skin you changed.
