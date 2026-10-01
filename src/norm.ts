// The Norm's limits as capacity (docs/VISUALS.md, "Why the Norm makes this
// possible"), counted the way norminette counts them:
// - TOO_MANY_LINES: more than 25 physical lines between a function's braces;
// - TOO_MANY_ARGS: more than 4 named parameters;
// - TOO_MANY_VARS_FUNC: more than 5 variables, a local static included;
// - TOO_MANY_FUNCS: more than 5 function definitions in a .c file
//   (prototypes don't count).
import type { Node, Tree } from 'web-tree-sitter';
import type { FnInfo, Model } from './parse';

export const NORM = { lines: 25, params: 4, vars: 5, fns: 5 } as const;

export interface Cap {
  used: number;
  max: number;
}

export interface FnCaps {
  lines: Cap;
  params: Cap;
  vars: Cap;
}

const memo = new WeakMap<FnInfo, FnCaps>();

export function fnCaps(fn: FnInfo): FnCaps {
  const hit = memo.get(fn);
  if (hit) return hit;
  const body = fn.node.childForFieldName('body');
  const lines = body ? Math.max(0, body.endPosition.row - body.startPosition.row - 1) : 0;
  const caps: FnCaps = {
    lines: { used: lines, max: NORM.lines },
    params: { used: fn.params.length, max: NORM.params },
    vars: { used: fn.locals.length + fn.statics.length, max: NORM.vars },
  };
  memo.set(fn, caps);
  return caps;
}

// Definitions in one file ('' for a single buffer).
export function fileCap(model: Model, file: string): Cap {
  return { used: model.fns.filter((f) => f.file === file).length, max: NORM.fns };
}

// The Norm's other rules (docs/OBJECTIVES.md, nice to have 8), as norminette
// 3.3 checks them (its rule names; lines and columns 0-based):
// - LINE_TOO_LONG: wider than 80 columns, a tab reaching the next multiple of 4;
// - FORBIDDEN_CS (for, switch, case), GOTO_FBIDDEN, LABEL_FBIDDEN;
// - DO_WHILE: the Norm forbids do … while too. norminette doesn't name it (it
//   misreads the loop and reports the `while` line's scope instead), so this
//   one is the Norm's word, not norminette's;
// - TERNARY_FBIDDEN: `?:` (in a #define it's allowed, and tree-sitter doesn't
//   parse a macro's body as an expression);
// - VAR_DECL_START_FUNC: a declaration in a function's body that doesn't come
//   right after its `{` or another declaration (a blank line or a statement
//   before it); WRONG_SCOPE_VAR: one inside an inner block;
// - INVALID_HEADER: the file doesn't start with the 42 header, matched with
//   norminette's own pattern.
export interface NormMark {
  rule: string;
  line: number;
  col: number;
  msg: string;
}

const HEADER = /\/\* \*{74} \*\/.\/\*.*\*\/.\/\*.*\*\/.\/\*.{3}([^ ]*).*\*\/.\/\*.*\*\/.\/\*   By: ([^ ]*).*\*\/.\/\*.*\*\/.\/\*   Created: ([^ ]* [^ ]*) by ([^ ]*).*\*\/.\/\*   Updated: ([^ ]* [^ ]*) by ([^ ]*).*\*\/.\/\*.*\*\/.\/\* \*{74} \*\/./s;

const CS: Record<string, [string, string]> = {
  for_statement: ['FORBIDDEN_CS', 'for is forbidden: use while'],
  switch_statement: ['FORBIDDEN_CS', 'switch is forbidden: use if / else if'],
  case_statement: ['FORBIDDEN_CS', 'case is forbidden'],
  goto_statement: ['GOTO_FBIDDEN', 'goto is forbidden'],
  labeled_statement: ['LABEL_FBIDDEN', 'labels are forbidden'],
  do_statement: ['DO_WHILE', 'do … while is forbidden: use while'],
  conditional_expression: ['TERNARY_FBIDDEN', 'ternaries (?:) are forbidden'],
};

const markMemo = new WeakMap<Tree, NormMark[]>();

export function normMarks(tree: Tree, text: string): NormMark[] {
  const hit = markMemo.get(tree);
  if (hit) return hit;
  const out: NormMark[] = [];
  const lines = text.split('\n');
  // the header: the file's leading comments, joined as norminette joins them
  const top: string[] = [];
  for (const c of tree.rootNode.children) {
    if (c.type !== 'comment') break;
    top.push(c.text);
  }
  if (!HEADER.test(top.length ? `${top.join('\n')}\n` : '')) out.push({ rule: 'INVALID_HEADER', line: 0, col: 0, msg: 'no 42 header at the top of the file' });
  lines.forEach((l, i) => {
    let w = 0;
    for (const ch of l) w = ch === '\t' ? (w + 4) & ~3 : w + 1;
    if (w > 80) out.push({ rule: 'LINE_TOO_LONG', line: i, col: 80, msg: `${w} columns wide: the Norm allows 80 (a tab is 4)` });
  });
  const walk = (n: Node, fnBody: Node | null): void => {
    const cs = CS[n.type];
    // (a ternary is marked at its `?`, as norminette marks it)
    const at = n.type === 'conditional_expression' ? n.children.find((c) => c?.type === '?') ?? n : n;
    if (cs) out.push({ rule: cs[0], line: at.startPosition.row, col: at.startPosition.column, msg: cs[1] });
    if (n.type === 'declaration' && fnBody && n.parent && n.parent.type === 'compound_statement') {
      if (n.parent.id !== fnBody.id) out.push({ rule: 'WRONG_SCOPE_VAR', line: n.startPosition.row, col: n.startPosition.column, msg: 'declarations go at the start of the function, not in an inner block' });
      else {
        const prev = n.previousSibling; // `{` or the child before
        const ok = !!prev && (prev.type === '{' || prev.type === 'declaration') && n.startPosition.row - prev.endPosition.row <= 1;
        if (!ok) out.push({ rule: 'VAR_DECL_START_FUNC', line: n.startPosition.row, col: n.startPosition.column, msg: 'declarations go together at the start of the function' });
      }
    }
    const body = n.type === 'function_definition' ? n.childForFieldName('body') : fnBody;
    for (const c of n.namedChildren) if (c) walk(c, body);
  };
  walk(tree.rootNode, null);
  out.sort((a, b) => a.line - b.line || a.col - b.col);
  markMemo.set(tree, out);
  return out;
}
