# A linter: Oxlint, and a canvas save/restore check

*2026-10-01* · **Status:** Accepted

- **Decision:** `npm run lint` (and `npm run check`, after `tsc`) runs
  Oxlint with type information (`.oxlintrc.json`: `eqeqeq`, `no-shadow`,
  `typescript/no-floating-promises`) and `tools/lint-canvas.mjs` (a canvas
  `save()` without its `restore()`, or a `return` with one open).
  `oxlint`, `oxlint-tsgolint` and `oxc-parser` are dev dependencies.
- **Why not ESLint:** TypeScript 7 (this repo's compiler, the native port)
  has no JavaScript API, and `typescript-eslint` needs it (its peer range
  ends at TypeScript 6.0). Oxlint parses TypeScript itself and runs its
  type-aware rules on tsgolint, which is built on the same native
  TypeScript, so the linter and the compiler agree about the code.
- **Rules left off:** `no-unused-expressions` flags every comma sequence
  (`if (x) (a = b), g.fill();`), a style this codebase uses on purpose;
  unused values are TypeScript's `noUnusedLocals`.
- **What it found on day one:** 27 shadowed names (among them a loop index
  shadowing the gdb converter's stop counter, and a local `px` hiding the
  `px()` helper) and one floating promise, all fixed.
- **The canvas rule** is path-aware only as far as a restore right before a
  return; a function that balances elsewhere on purpose says
  `// lint-canvas: balanced elsewhere`.
