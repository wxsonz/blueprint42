# visual prototype in `proto/`, ahead of M0

*2026-09-27*

- **Decision:** Build a throwaway-able prototype in `proto/` that runs tiny
  pointer programs end to end (edit → parse → factory → animated playback),
  before the M0/M1 work.
- **Why:** The author asked for it. The visual design decides whether the
  tool is worth using ("like people prefer vscode over nvim"), so it gets
  tested first. It pulls an M3 feature (execution) forward on purpose. M0/M1
  can reuse or replace `proto/`.
