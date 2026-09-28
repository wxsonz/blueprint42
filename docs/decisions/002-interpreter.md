# in-browser interpreter instead of the gdb trace server (prototype only; kept)

*2026-09-27*

> Continued by [013-trace-server](013-trace-server.md).

- **Decision:** `proto/src/interp.ts` walks the tree-sitter AST for a
  Norminette-shaped C subset (int/char/long, pointers to variables, `if`,
  `while`, calls, recursion, `static` locals). Anything else stops with an
  honest message: external calls, arrays, pointer arithmetic, and constructs
  the Norminette forbids.
- **Why:** It needs no server and has no latency while typing. Principle 4
  still holds because every animated value is computed from the code.
  Replace it with the SPEC §3 gdb trace server at M3. It can't run real
  GNL (`read`, `malloc`).
