# toward a visual code editor, scoped to Norm C

*2026-09-29* · **Status:** Accepted

- **Decision (author):** In the long run the grid becomes a visual code
  editor as well as a view, and what it can write is Norm C. The first step
  is to define every visualization as a grammar (`docs/VISUALS.md`): each
  picture is tied to one Norm construct, one runtime event, and later one
  editing gesture.
- **Why (author):** The Norm is deterministic about code structure: 5
  functions per file, 4 named parameters, 5 locals declared first, 25 lines,
  one instruction per line, and only `if`/`else`/`while`/`return`/`break`/
  `continue`. A program is then a small tree with fixed kinds of nodes, which
  can be drawn and placed without losing anything. Writing to that structure
  is good practice for a 42 student in itself.
- **Consequence:** SPEC principle 1 ("the grid never generates or rewrites
  code") will need an amendment when editing is built. Until then it holds.
  The amendment should keep text as the source of truth: the grid's edits
  land in the editor as ordinary unsaved edits, and are never written to
  disk without the Save dialog.
- **Open:** Whether expressions are typed as text inside a station
  (recommended) or built from blocks. See `docs/VISUALS.md`.
