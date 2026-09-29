# focus keys are `Ctrl-h` / `Ctrl-l`, not `<C-w>h/l`

*2026-09-27* · **Status:** Superseded by [008-vim-editor-only](008-vim-editor-only.md)


- **Decision:** `Ctrl-l` focuses the grid and `Ctrl-h` (from the grid) goes
  back to the editor, in the style of vim-tmux-navigator.
- **Why:** Browsers reserve `Ctrl-W` (close tab) and pages can't reliably
  intercept it, so one missed keystroke loses the session. `Ctrl-h` is only
  captured while the grid has focus, so it's still backspace in insert mode.
