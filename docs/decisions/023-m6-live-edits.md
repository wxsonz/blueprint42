# M6 live edits from any editor

*2026-09-28*

- **Decision (author):** The web app doesn't care where a change is made;
  it applies it to the view. So the bridge is editor-agnostic: a local
  push/stream API that any editor can use, with nvim as the first client,
  instead of the app attaching to nvim's RPC socket.
- **Decision:** The in-app editor stays editable. When an editor pushes a
  file, that text replaces the page's (the latest change wins, with a note
  if the page had its own edits there).
- **Decision:** An editor's unsaved text is never written by the tool. It
  shows as unsaved in the page; saving is `:w` in nvim (or the page's own
  confirmed Save). Quitting nvim without saving reverts the page to disk.
- **Decision:** Transport is plain HTTP on the existing dev server: POSTs
  and one long-lived POST stream of newline-separated JSON, behind the same
  guard as the other routes. The nvim side uses `curl`, so the plugin has
  no dependencies beyond Neovim 0.10.
- **Decision:** The page follows the editor's cursor and current file, and
  a double-click on the grid moves the editor's cursor (SPEC's one reverse
  channel, now to nvim too).
