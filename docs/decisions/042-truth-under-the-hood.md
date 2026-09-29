# the picture obeys how C really works

*2026-09-29* · **Status:** Accepted

- **Decision (author):** A hard rule, added to SPEC principle 4: every design
  follows how C and the machine really work under the hood. No workaround,
  simplification or metaphor that contradicts the real behaviour, even when
  it would look clearer or be easier to build. When a picture can't show the
  truth yet, it shows less, never something false.
- **Examples:**
  - A parameter is a copy: it gets its own row in PARAMETERS.
  - A pointer passed down calls holds the same address in every copy, so
    each line goes straight to the origin; a chain is drawn only for a real
    pointer to a pointer.
  - Memory reached through a pointer belongs to someone else: REACHED, not
    the machine's own storage.
  - Locals start unset (`?`), because they are.
  - Output appears when the program really wrote it.
- **Why (author):** The tool is for learning what C does. A picture that
  tells an easier story teaches the wrong thing, and learners should be able
  to trust that what they see is what the machine does.
- **How to apply:** Before building a picture, check it against C's real
  semantics (and, where it matters, a real run under gdb). Where a picture
  and the truth disagree, the picture changes.
