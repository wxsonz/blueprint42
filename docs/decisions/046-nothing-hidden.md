# nothing hidden: the printf buffer, the statement that died, `*p`'s real read, counted overflow

*2026-09-30* · **Status:** Accepted

- **Decision (author's goal: "visual feedback clearer, not hiding anything"):**
  - **printf's buffer** is drawn above the process box (`Skin.stdbuf`,
    `skins/stdbuf.ts`; prototyped in Minimal and Barebone): the bytes printf
    holds that haven't reached the terminal, as a C literal (`"hello\n"
    waiting`), how full it is of its 4096, and when it flushes (to a
    terminal: at each `\n`; to a pipe: when full or at exit). A flush shows
    what just left (`→ terminal`). Drawn only when the trace really read the
    buffer (the gdb engine); the interpreter draws nothing rather than guess.
  - **The statement that died** is crossed out in its stations, in the
    error colour, with its signal (`✕ SIGSEGV`); the running token isn't
    drawn over it. Every skin (the stations drawing is shared).
  - **`*p` is a read of the memory at p's address.** Its value flies from
    that memory's row (wherever it is drawn: `main.a` in the caller), and
    the station shows it (`*n = 3 + 1`). `*p = …` reads only p (where to
    write). With no cell for the address, `*p` stays as written and only p's
    read is shown.
  - **`a[i]`** of a local array with a plain index (a name or a number)
    reads the element, flying from the array's row, and `i`; `a[i] = …`
    reads only `i`. A computed index, or an array text that can't be read
    for certain, stays as written (draw less, never something false).
  - **Nothing is dropped silently.** Where something doesn't fit, a count
    says so: a row's older values (`+15 … 4 → 5`, and the history keeps the
    last 8 with the count of the rest), reads past 8 and writes past 10 in
    one statement (one `+n more` plate rides with the rest), and the IN
    dock's arguments (`+n more arguments`).
- **Why:** the picture is how the program is understood; a value that
  changes off screen, bytes waiting in a buffer, or a read shown from the
  wrong place tells the wrong story (SPEC principle 4, decision 042).
