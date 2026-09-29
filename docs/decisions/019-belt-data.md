# Real data on belts, struct fields in frames

*2026-09-27* · **Status:** Accepted

- **Decision (author):** What rides a belt is the real data, not the
  argument's name:
  - A `char *` travels as its text (`"hello\n"`).
  - A struct, by value or behind a pointer, travels as a crate: its type,
    where it lives (`t_gnl @ →bufs[0]`), and its fields with values.
  - An `int *` shows what it points at (`→a = 3`).
  Returns work the same way: `get_next_line` hands back `"hello\n"`. The
  playbar reads the same way (`gnl_consume({data "hel…", len 23, …}, 21)`).
- **Decision:** A struct variable (or pointer to one) unfolds in its frame
  into one row per field, with live values. A field that changed on this
  step is lit. Fields come from the struct definitions in the code
  (typedef aliases included), so frame sizes are known before a run and
  the layout is stable. Rows are open by default, capped at 6 fields plus
  "+n more". Clicking a struct row folds it, and auto-placed machines
  reflow. Folds are saved with the layout (`folded` in the blueprint).
- **Decision:** The tracer follows a struct pointer one level (the
  pointee's fields only; `lst->next` stays an address). A record is
  rebuilt when anything it shows changes: the pointee's bytes and the text
  behind its `char *` fields, not just the pointer. Strings are cut to a
  readable length instead of shrunk to fit.
- **Decision:** Amp draws data in VT323. Its pixel font has capitals only,
  which turned `hello` into `HELLO`. That misreports the data, and strips
  had the same problem.
