# M5 open a real project

*2026-09-27* · **Status:** Accepted

- **Decision (author):** Saving is allowed but never automatic. Every save
  goes through a dialog that lists each file, whether it's new, `+/−`
  line counts and an expandable diff, and writes nothing until confirmed
  (Ctrl+S, the Save… button, or `:w` in vim). Unsaved work is backed up in
  browser storage ("hot exit") and restored only over the same disk text
  it was edited from.
- **Decision (author):** Opening a project behaves like VS Code:
  `npm run dev -- <folder>` opens it (like `code <folder>`), Open Folder…
  (Ctrl+O) browses folders through the local server, and the last folder
  reopens on the next start. Also: tabs, a file list (Ctrl+B), go-to-file
  (Ctrl+P), and reloading files changed on disk by another editor, unless
  they have unsaved edits here (then they're marked as a conflict).
  Ctrl+O and Ctrl+B stay vim's while the editor has focus in vim mode.
- **Decision:** Only `server/project.mjs` touches the author's files. It
  reads `.c`, `.h`, Makefiles and `.ft_blueprint/`, and skips `.git`,
  `node_modules`, other dot folders and files over 1 MB. It writes only:
  - inside a folder opened this session;
  - to those same kinds of files;
  - never through a symlink out of the folder;
  - never over a file whose mtime changed since the page loaded it, unless
    the author picks "Overwrite with mine".
  The routes sit behind the same localhost + same-origin + `x-ftb` guard as
  the trace server.
- **Decision:** Multi-file visuals. Each `.c` file is a module:
  - A collapsed module is one block that lists its doors, meaning its
    non-static functions. A door is marked when no header declares it.
  - An open module is a wall around its machines.
  - Calls between the same two hosts share one belt (a trunk) with a
    call-site count.
  - A belt passing a module's wall gets a door mark.
  - Modules start collapsed (SPEC), except the one with `main`.
  - Modules are packed in columns by the file-to-file call graph. Only
    auto-placed ones move. Dragging a machine inside a module pins that
    module, so re-packing never drags your arrangement away.
  - While running, a collapsed module lights up and shows which function is
    running inside and how deep. Playback never opens a module by itself.
- **Decision:** Ids across files. A function keeps `func:<name>`. Only a
  `static` function that another file also defines becomes
  `func:<name>@<file>`, and its machine keeps its place when that happens.
  Calls resolve like the linker: the file's own definition first, then the
  one non-static definition. A call to another file's static is a warning,
  not a belt.
- **Decision:** Building. The trace server receives the project's current
  buffers, saved or not, and builds a copy in a temp folder:
  - With a Makefile: `make CC="cc -g -O0 -D…"`, so the Makefile's own
    CFLAGS, `-Werror` and sub-makes (libft) apply.
  - Its `NAME` is the program. If `NAME` is a `.a`, the program is the
    driver `.ft_blueprint/main.c` linked against it.
  - Without a Makefile: `cc -Wall -Wextra -Werror -g -O0` on every `.c`,
    with `-I` for each header folder.
  - Only source-like files are copied, so data files such as `.ber` maps
    are not there yet.
  - A Makefile that drops `-g` (calls `cc` directly) gets a clear error.
- **Decision:** A library (libft, gnl) runs through a driver
  `.ft_blueprint/main.c`, offered by a button when there's no `main`. It's
  set aside if the project has its own `main`. Run settings (stdin, args,
  `-D`) live in `.ft_blueprint/run.json`.
- **Decision:** `.ft_blueprint/blueprint.json` (format v2) holds only what
  the author decided:
  - pinned machines, relative to their module;
  - pinned modules;
  - modules opened or closed against the default;
  - routes and sprites.
  Auto-placement is reproduced from the code, so the file doesn't churn in
  git. The browser keeps full positions for continuity. Blueprint v1
  (samples) still loads.
- **Decision:** gnl_v3 is also bundled as a read-only sample project (the
  untouched fixture files plus a driver and `run.json`). It shows modules
  in a static build and is the M5 acceptance input; saving it is refused.
