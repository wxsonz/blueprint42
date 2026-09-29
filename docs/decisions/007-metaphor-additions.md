# metaphor additions (not in SPEC §2)

*2026-09-27* · **Status:** Accepted

- **Stack frame** is an inventory panel under its machine. Parameters are
  copper slots and locals are steel. The frame appears on call and dims to
  "RETURNED" (last values, read-only) after the return. Recursion stacks the
  panels and adds a ×n badge.
- **Pointer** is a red wire from the pointer slot to its pointee. A write
  through `*p` is a pulse travelling the wire. A wire into a frame that has
  returned is drawn dangling.
- **process** is a terminal box that calls `main` and shows the exit status.
- **Belts** are drawn one per caller→callee pair, not one per call site.
  The inspector lists the call sites. This keeps the grid readable; reconsider
  if per-site belts matter for M2 bindings.
