# the app at the repo root, docs in docs/

*2026-09-29*

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
