# vim only in the editor; the canvas is mouse-first (amends SPEC principle 2)

*2026-09-27*

- **Decision:** Vim keybindings are an editor option (the "Vim" toggle, on by
  default, remembered per browser). The canvas works like a normal node
  editor:
  - Middle-drag, or dragging empty space, pans. The wheel zooms at the
    pointer.
  - Click selects a function or a call. Dragging a function moves and pins
    it. Dragging a call re-routes it through the point you drop it on.
  - Double-click jumps to code (a function), resets a route (a call) or fits
    the view (empty space). Right-click opens a context menu.
  - Canvas keys are the usual player ones: Space, ←/→, Shift+←/→, Home/End
    and F.
  - The `hjkl` cursor, `m`-to-move, number-key toolbox and `Ctrl-h`/`Ctrl-l`
    focus keys are removed.
- **Why:** The author's direction: vim was meant for the text editor, not the
  picture. It replaces "every UI action needs a key binding" in CLAUDE.md
  and the "mouse is optional" half of SPEC principle 2. SPEC.md itself was
  not edited.
