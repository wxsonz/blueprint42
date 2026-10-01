import { Compartment, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, highlightTrailingWhitespace, highlightWhitespace, keymap, lineNumbers, type DecorationSet } from '@codemirror/view';
import { HighlightStyle, bracketMatching, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentLess, insertTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { tags as t } from '@lezer/highlight';
import { vim, getCM } from '@replit/codemirror-vim';

// ---- execution line (driven by playback) ----
export const setExecLine = StateEffect.define<{ line: number; kind: 'exec' | 'error' } | null>();

const execField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setExecLine)) continue;
      if (!e.value || e.value.line >= tr.state.doc.lines) return Decoration.none;
      const l = tr.state.doc.line(e.value.line + 1);
      deco = Decoration.set([Decoration.line({ class: e.value.kind === 'error' ? 'cm-errLine' : 'cm-execLine' }).range(l.from)]);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ---- the Norm's marks (src/norm.ts normMarks): a dotted underline, the rule on hover ----
export const setNormMarks = StateEffect.define<{ line: number; col: number; rule: string; msg: string }[]>();

const normField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setNormMarks)) continue;
      const doc = tr.state.doc;
      const ranges = e.value.flatMap((m) => {
        if (m.line >= doc.lines) return [];
        const l = doc.line(m.line + 1);
        // a long line from where it passes 80 columns; the header, the first line; else the keyword
        const from = m.rule === 'LINE_TOO_LONG' ? l.from + colAt(l.text, m.col) : m.rule === 'INVALID_HEADER' ? l.from : Math.min(l.to, l.from + m.col);
        const word = /^[A-Za-z_?]\w*/.exec(l.text.slice(from - l.from))?.[0].length ?? 1;
        const to = m.rule === 'LINE_TOO_LONG' || m.rule === 'INVALID_HEADER' ? l.to : Math.min(l.to, from + word);
        return to > from ? [Decoration.mark({ class: 'cm-norm', attributes: { title: `${m.rule}: ${m.msg}` } }).range(from, to)] : [];
      });
      deco = Decoration.set(ranges, true);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// the character a display column (a tab reaching the next multiple of 4) falls in
function colAt(text: string, col: number): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    w = text[i] === '\t' ? (w + 4) & ~3 : w + 1;
    if (w > col) return i;
  }
  return text.length;
}

// Colours and fonts come from CSS variables, so each skin restyles the editor.
const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--ed-bg)', color: 'var(--ed-fg)' },
  '.cm-scroller': { fontFamily: 'var(--ed-font)', fontSize: 'var(--ed-size)', lineHeight: 'var(--ed-line, 1.55)' },
  '.cm-content': { caretColor: 'var(--ed-cursor)', padding: '8px 0' },
  '.cm-cursor': { borderLeftColor: 'var(--ed-cursor)', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'var(--ed-gutter)', color: 'var(--ed-gutter-fg)', border: 'none', borderRight: 'var(--ed-gutter-border, none)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ed-gutter-active)' },
  '.cm-activeLine': { backgroundColor: 'var(--ed-active)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--ed-sel) !important' },
  '.cm-fat-cursor': { background: 'var(--ed-cursor) !important', color: 'var(--ed-bg) !important' },
  '&:not(.cm-focused) .cm-fat-cursor': { background: 'none !important', outline: '1px solid var(--ed-cursor)', color: 'inherit !important' },
  '.cm-execLine': { backgroundColor: 'var(--ed-exec)', boxShadow: 'inset 3px 0 0 var(--ed-exec-bar)' },
  '.cm-errLine': { backgroundColor: 'var(--ed-err)', boxShadow: 'inset 3px 0 0 var(--ed-err-bar)' },
  '.cm-norm': { textDecoration: 'underline dotted var(--ed-norm, #d9a03a)', textDecorationThickness: '1.5px', textUnderlineOffset: '3px' },
  '.cm-matchingBracket': { backgroundColor: 'var(--ed-sel)', outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--ed-gutter)', color: 'var(--ed-fg)' },
  '.cm-panels input': { fontFamily: 'var(--ed-font)', color: 'var(--ed-fg)', background: 'transparent', border: 'none', outline: 'none' },
  '.cm-vim-panel': { padding: '2px 8px', fontFamily: 'var(--ed-font)' },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.modifier], color: 'var(--syn-kw)', fontWeight: 'var(--syn-kw-weight, normal)' },
  { tag: [t.typeName, t.standard(t.typeName)], color: 'var(--syn-type)' },
  { tag: t.definition(t.variableName), color: 'var(--syn-def)' },
  { tag: [t.function(t.variableName)], color: 'var(--syn-fn)' },
  { tag: t.variableName, color: 'var(--syn-var)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syn-num)' },
  { tag: [t.string, t.character], color: 'var(--syn-str)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--syn-com)', fontStyle: 'var(--syn-com-style, italic)' },
  { tag: [t.processingInstruction, t.macroName], color: 'var(--syn-macro)' },
  { tag: [t.operator, t.derefOperator], color: 'var(--syn-op)' },
  { tag: [t.punctuation, t.bracket], color: 'var(--syn-punct)' },
]);

export interface EditorHooks {
  onChange: (doc: string) => void;
  onCursor: (line: number, col: number) => void;
  onMode: (mode: string) => void;
}

const vimSlot = new Compartment();

// One EditorState per open file (M5): switching files swaps states, so each
// keeps its own undo history, selection and scroll target.
export function createState(doc: string, hooks: EditorHooks, useVim: boolean, extra: Extension[] = []): EditorState {
  return EditorState.create({
      doc,
      extensions: [
        vimSlot.of(useVim ? vim() : []),
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        history(),
        bracketMatching(),
        indentUnit.of('\t'),
        EditorState.tabSize.of(4),
        cpp(),
        syntaxHighlighting(highlight),
        theme,
        execField,
        normField,
        // Tab types a tab where the cursor is (indents only a selection);
        // Shift+Tab takes one indent off the line
        keymap.of([...defaultKeymap, ...historyKeymap, { key: 'Tab', run: typing(insertTab), shift: typing(indentLess) }]),
        // show tabs and trailing whitespace, like vim's listchars
        highlightWhitespace(),
        highlightTrailingWhitespace(),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) hooks.onChange(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            hooks.onCursor(line.number - 1, head - line.from);
          }
        }),
        ...extra,
      ],
  });
}

// A command for typing: in vim's normal or visual mode it steps aside (Tab
// isn't a vim edit there), in insert mode or without vim it runs.
function typing(cmd: (v: EditorView) => boolean) {
  return (v: EditorView) => {
    const vimState = (getCM(v) as { state?: { vim?: { insertMode?: boolean } } } | null)?.state?.vim;
    if (vimState && !vimState.insertMode) return false;
    return cmd(v);
  };
}

export function createEditor(parent: HTMLElement, doc: string, hooks: EditorHooks, useVim: boolean, extra: Extension[] = []): EditorView {
  const view = new EditorView({ parent, state: createState(doc, hooks, useVim, extra) });
  if (useVim) watchVim(view, hooks);
  return view;
}

// Show another file's state, with the vim setting the author has now.
export function swapState(view: EditorView, state: EditorState, useVim: boolean, hooks: EditorHooks): void {
  view.setState(state);
  view.dispatch({ effects: vimSlot.reconfigure(useVim ? vim() : []) });
  if (useVim) watchVim(view, hooks);
  else hooks.onMode('');
}

function watchVim(view: EditorView, hooks: EditorHooks): void {
  getCM(view)?.on('vim-mode-change', (e: { mode: string; subMode?: string }) => hooks.onMode(e.subMode ? `${e.mode} ${e.subMode}` : e.mode));
  hooks.onMode('normal');
}

export function setVim(view: EditorView, on: boolean, hooks: EditorHooks): void {
  view.dispatch({ effects: vimSlot.reconfigure(on ? vim() : []) });
  if (on) watchVim(view, hooks);
  else hooks.onMode('');
}

export function setDoc(view: EditorView, doc: string): void {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc }, selection: { anchor: 0 } });
}

export function jumpTo(view: EditorView, line: number, col: number, focus = true): void {
  const l = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
  const pos = Math.min(l.from + col, l.to);
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  if (focus) view.focus();
}
