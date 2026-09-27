// tree-sitter-c → symbol model. Stable ids: func:<name>, static:<fn>.<var>, global:<name>.
import { Parser, Language, type Node, type Tree } from 'web-tree-sitter';
import tsWasm from 'web-tree-sitter/web-tree-sitter.wasm?url';
import cWasm from 'tree-sitter-c/tree-sitter-c.wasm?url';

export interface Var {
  name: string;
  type: string;
  line: number;
}

export interface CallSite {
  callee: string;
  line: number;
}

export interface FnInfo {
  id: string;
  name: string;
  ret: string;
  isStatic: boolean;
  params: Var[];
  locals: Var[]; // non-static locals, in declaration order
  statics: Var[]; // function-local statics (chests)
  calls: CallSite[]; // calls to functions defined in this buffer
  externals: string[]; // calls to anything else (read, malloc...)
  nameLine: number;
  nameCol: number;
  from: number; // char offsets of the whole definition
  to: number;
  startLine: number;
  endLine: number;
  broken: boolean; // subtree contains a parse error
  node: Node;
}

export interface Global {
  id: string;
  name: string;
  type: string;
  line: number;
  init: Node | null;
}

export interface Model {
  fns: FnInfo[];
  byName: Map<string, FnInfo>;
  globals: Global[];
  macros: Map<string, number>;
  error: { line: number; col: number } | null;
  tree: Tree;
}

/** Only expressions that can observe a value are allowed in a binding. */
export function validateBindingExpr(expr: string): string | null {
  if (!parser) return 'parser not initialised';
  if (!expr.trim()) return 'enter an expression';
  if (expr.length > 256) return 'expression is too long';
  const tree = parser.parse(`void __ftb_binding(void) { (void)(${expr}); }`)!;
  const root = tree.rootNode;
  if (root.hasError) return 'invalid C expression';
  const fn = root.namedChildren[0];
  const body = fn?.childForFieldName('body');
  if (!body || body.namedChildren.length !== 1 || body.namedChild(0)?.type !== 'expression_statement') return 'enter one expression';
  const forbidden = new Set(['call_expression', 'assignment_expression', 'update_expression', 'comma_expression', 'statement_expression', 'compound_literal_expression']);
  const visit = (n: Node): boolean => forbidden.has(n.type) || n.namedChildren.some((c) => !!c && visit(c));
  return visit(body) ? 'bindings cannot call functions or change program state' : null;
}

export interface BufferShape { type: string; data: string; markers: string[] }

/** Find the common char* + size_t buffer shape without relying on field names alone. */
export function bufferShapes(model: Model): BufferShape[] {
  const out: BufferShape[] = [];
  const seen = new Set<string>();
  const visit = (n: Node, parent?: Node) => {
    if (n.type === 'struct_specifier') {
      const body = n.childForFieldName('body');
      if (body) {
        const fields = body.namedChildren.filter((c): c is Node => !!c && c.type === 'field_declaration')
          .flatMap((d) => varsOf(d));
        const data = fields.find((f) => /\bchar\b/.test(f.type) && f.type.includes('*'));
        const markers = fields.filter((f) => /\bsize_t\b/.test(f.type) && /^(len|cap|pos|size|i|length|capacity|index)$/i.test(f.name)).map((f) => f.name);
        if (data && markers.length) {
          const tag = n.childForFieldName('name')?.text;
          const aliases = parent?.type === 'type_definition'
            ? [parent.text.match(/}\s*([A-Za-z_]\w*)\s*;/)?.[1]].filter((s): s is string => !!s)
            : [];
          for (const type of [...(tag ? [`struct ${tag}`] : []), ...aliases]) if (!seen.has(type)) {
            out.push({ type, data: data.name, markers });
            seen.add(type);
          }
        }
      }
    }
    for (const c of n.namedChildren) if (c) visit(c, n);
  };
  visit(model.tree.rootNode);
  return out;
}

let parser: Parser | null = null;

// Paths default to the bundled wasm URLs; tests pass filesystem paths.
export async function initParser(paths: { runtime?: string; grammar?: string } = {}): Promise<void> {
  await Parser.init({ locateFile: () => paths.runtime ?? tsWasm });
  const lang = await Language.load(paths.grammar ?? cWasm);
  parser = new Parser();
  parser.setLanguage(lang);
}

// Walk the declarator chain down to the identifier, collecting * and [].
export function declName(d: Node | null): { name: string; suffix: string; fnDecl: Node | null } {
  let suffix = '';
  let fnDecl: Node | null = null;
  while (d) {
    if (d.type === 'identifier' || d.type === 'field_identifier') return { name: d.text, suffix, fnDecl };
    if (d.type === 'pointer_declarator') suffix = '*' + suffix;
    else if (d.type === 'array_declarator') suffix += '[]';
    else if (d.type === 'function_declarator') fnDecl = fnDecl ?? d;
    d = d.childForFieldName('declarator') ?? (d.type === 'parenthesized_declarator' ? d.namedChild(0) : null);
  }
  return { name: '', suffix, fnDecl };
}

function baseType(n: Node): string {
  const parts: string[] = [];
  for (const c of n.namedChildren) {
    if (!c) continue;
    if (c.type === 'type_qualifier') parts.push(c.text);
  }
  const t = n.childForFieldName('type');
  if (t) parts.push(t.text);
  return parts.join(' ');
}

function isStaticDecl(n: Node): boolean {
  return n.namedChildren.some((c) => c?.type === 'storage_class_specifier' && c.text === 'static');
}

function joinType(base: string, suffix: string): string {
  return suffix ? `${base} ${suffix}` : base;
}

function varsOf(decl: Node): Var[] {
  const base = baseType(decl);
  const out: Var[] = [];
  for (const d of decl.childrenForFieldName('declarator')) {
    if (!d) continue;
    const { name, suffix } = declName(d);
    if (name) out.push({ name, type: joinType(base, suffix), line: d.startPosition.row });
  }
  return out;
}

function firstError(n: Node): Node | null {
  if (n.type === 'ERROR' || n.isMissing) return n;
  if (!n.hasError) return null;
  for (const c of n.children) {
    if (!c) continue;
    const e = firstError(c);
    if (e) return e;
  }
  return n;
}

export function parse(src: string): Model {
  if (!parser) throw new Error('parser not initialised');
  const tree = parser.parse(src)!;
  const root = tree.rootNode;
  const fns: FnInfo[] = [];
  const globals: Global[] = [];
  const macros = new Map<string, number>();

  const visitTop = (n: Node) => {
    if (n.type === 'preproc_def') {
      const name = n.childForFieldName('name')?.text;
      const val = n.childForFieldName('value')?.text.trim();
      if (name && val && /^-?(0x[0-9a-f]+|\d+)[ul]*$/i.test(val)) macros.set(name, Number.parseInt(val, val.toLowerCase().includes('0x') ? 16 : 10));
      else if (name && val && /^'.'$/.test(val)) macros.set(name, val.charCodeAt(1));
      return;
    }
    if (n.type.startsWith('preproc_')) {
      // #ifndef guards etc: definitions live inside them.
      for (const c of n.namedChildren) if (c) visitTop(c);
      return;
    }
    if (n.type === 'declaration') {
      const { fnDecl } = declName(n.childForFieldName('declarator'));
      if (fnDecl) return; // prototype
      for (const d of n.childrenForFieldName('declarator')) {
        if (!d) continue;
        const { name, suffix } = declName(d);
        if (!name) continue;
        globals.push({
          id: `global:${name}`, name, type: joinType(baseType(n), suffix),
          line: d.startPosition.row, init: d.type === 'init_declarator' ? d.childForFieldName('value') : null,
        });
      }
      return;
    }
    if (n.type !== 'function_definition') return;
    const { name, suffix, fnDecl } = declName(n.childForFieldName('declarator'));
    const body = n.childForFieldName('body');
    if (!name || !fnDecl || !body) return;
    const nameNode = fnDecl.childForFieldName('declarator')!;
    const params: Var[] = [];
    for (const p of fnDecl.childForFieldName('parameters')?.namedChildren ?? []) {
      if (!p || p.type !== 'parameter_declaration') continue;
      const d = declName(p.childForFieldName('declarator'));
      if (d.name) params.push({ name: d.name, type: joinType(baseType(p), d.suffix), line: p.startPosition.row });
    }
    const locals: Var[] = [];
    const statics: Var[] = [];
    for (const decl of body.descendantsOfType('declaration')) {
      if (!decl) continue;
      const into = isStaticDecl(decl) ? statics : locals;
      for (const v of varsOf(decl)) {
        // Block-scoped redeclarations collapse to one slot in this prototype.
        if (![...params, ...locals, ...statics].some((o) => o.name === v.name)) into.push(v);
      }
    }
    const calls: CallSite[] = [];
    for (const c of body.descendantsOfType('call_expression')) {
      const f = c?.childForFieldName('function');
      if (f?.type === 'identifier') calls.push({ callee: f.text, line: c!.startPosition.row });
    }
    fns.push({
      id: `func:${name}`, name, ret: joinType(baseType(n), suffix), isStatic: isStaticDecl(n),
      params, locals, statics, calls, externals: [],
      nameLine: nameNode.startPosition.row, nameCol: nameNode.startPosition.column,
      from: n.startIndex, to: n.endIndex, startLine: n.startPosition.row, endLine: n.endPosition.row,
      broken: n.hasError, node: n,
    });
  };
  for (const c of root.namedChildren) if (c) visitTop(c);

  const byName = new Map(fns.map((f) => [f.name, f]));
  for (const f of fns) {
    const ext = new Set<string>();
    f.calls = f.calls.filter((c) => (byName.has(c.callee) ? true : (ext.add(c.callee), false)));
    f.externals = [...ext];
  }
  const e = firstError(root);
  return {
    fns, byName, globals, macros, tree,
    error: e ? { line: e.startPosition.row, col: e.startPosition.column } : null,
  };
}
