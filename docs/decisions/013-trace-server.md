# the trace server (M3) and the two engines

*2026-09-27*

- **Decision:**
  - The tracer (`proto/server/tracer.py`) runs inside gdb's Python API and
    steps line by line. It records the user stack with values, calls,
    return values (finish breakpoints), and `malloc`/`calloc`/`realloc`/
    `free` called directly from user code, so libc's own allocations (e.g.
    printf's buffer) are ignored.
  - `proto/server/trace.mjs` compiles with `cc -Wall -Wextra -Werror -g
    -O0` in a throwaway temp directory. It is served as Vite middleware
    (`POST /api/trace` on the dev and preview servers) instead of a
    separate process, so `npm run dev` stays one command.
  - The app has two engines: the in-browser interpreter (instant, a C
    subset) and gdb (the real thing). **Auto** uses gdb whenever the code
    calls something it doesn't define (`read`, `malloc`, `printf`…).
- **Why:** The interpreter can't run GNL and must never fake it (principle
  4). Keeping the interpreter gives instant feedback on small programs and
  works in a static build with no server.
- **Security:** the endpoint compiles and runs code, so it only answers
  same-origin requests from localhost that carry an `x-ftb` header.
  Another site can't set that header without a CORS preflight, which is
  never answered. Runs are time-capped. The compiled program is not
  sandboxed beyond that; it's the author's own code on their own machine.
