# the app at the repo root, docs in docs/

*2026-09-29* · **Status:** Accepted

- **Decision:** The app moved from `proto/` to the repo root (`src/`,
  `server/`, `test/`, `nvim/`, `package.json`), so a clone runs with
  `npm install && npm run dev` where it lands. `SPEC.md` and `HANDOFF.md`
  moved to `docs/`; `DECISIONS.md` became `docs/decisions/`, one numbered
  file per decision with a short name, and an index. `README.md` and
  `CLAUDE.md` stay at the root, where GitHub and Claude Code look for them.
- **Why:** The repo is public now, and people expect a project to run from
  its root. One file per decision keeps each one short to read and link, and
  the number keeps their order. Old entries still say `proto/`: they are
  history and were left as written.
- **Decision:** Each decision has a **Status** line (Accepted, or superseded
  by a later one, linked), mirrored in the index. The two entries dated
  2026-10-02 were wrong (their commits are from 2026-09-28) and are fixed.
- **Decision:** The Neovim plugin stays in `nvim/`, described as optional.
  Since M6 the page takes changes from any editor on save (it polls the open
  folder); the plugin only adds unsaved text and cursor sync. Moving its
  `lua/` and `plugin/` to the root would make it installable with one line
  from a plugin manager, at the price of a busier root, which isn't worth
  it for an extra.
- **Decision:** `HANDOFF.md` stays in `docs/`, with a pointer from
  `CLAUDE.md`, not merged into it: `CLAUDE.md` is loaded into every agent
  session, so it stays short.
