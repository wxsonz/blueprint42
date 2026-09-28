// tree-sitter-c → symbol model. Stable ids: func:<name>, static:<fn>.<var>, global:<name>.
// A project (M5) parses each file on its own and links them: a `static`
// function whose name another file also defines becomes func:<name>@<file>.
import { Parser, Language, type Node, type Tree } from 'web-tree-sitter';
import tsWasm from 'web-tree-sitter/web-tree-sitter.wasm?url';
import cWasm from 'tree-sitter-c/tree-sitter-c.wasm?url';

export interface Var {
  name: string;
  type: string;
  line: number;
  fields?: Var[]; // members, when the type is a struct or a pointer to one
}

export interface CallSite {
  callee: string;
  line: number;
}

export interface FnInfo {
  id: string;
  name: string; // graph key: the C name, or name@file for a colliding static
  cname: string; // the identifier in the source
  file: string; // project-relative path ('' for a single buffer)
  ret: string;
  isStatic: boolean;
  params: Var[];
  locals: Var[]; // non-static locals, in declaration order
  statics: Var[]; // function-local statics (chests)
  calls: CallSite[]; // calls to functions defined in this buffer / project (callee = key)
  externals: string[]; // calls to anything else (read, malloc...)
  declared?: boolean; // project: a header declares its prototype
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
  file: string;
  type: string;
  line: number;
  init: Node | null;
}

export interface Model {
  fns: FnInfo[];
  byName: Map<string, FnInfo>; // by key
  globals: Global[];
  macros: Map<string, number>;
  error: { line: number; col: number; file?: string } | null;
  tree: Tree;
  trees: Tree[]; // every parsed file, headers included
  project: boolean;
  files: string[]; // project: the .c files that hold functions (one module each)
  warnings: { file: string; line: number; msg: string }[];
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
  for (const t of model.trees) visit(t.rootNode);
  return out;
}

// Struct definitions by every name they go by: `struct s_reader` and `t_reader`.
export function structTable(trees: Tree[]): Map<string, Var[]> {
  const byTag = new Map<string, Var[]>();
  const aliases = new Map<string, string>(); // typedef name -> "struct tag" (or the body's own key)
  let anon = 0;
  const visit = (n: Node) => {
    if (n.type === 'type_definition') {
      const spec = n.childForFieldName('type');
      if (spec?.type === 'struct_specifier' || spec?.type === 'union_specifier') {
        const kw = spec.type === 'union_specifier' ? 'union' : 'struct';
        const tag = spec.childForFieldName('name')?.text;
        const key = tag ? `${kw} ${tag}` : `${kw} <anon ${anon++}>`;
        const body = spec.childForFieldName('body');
        if (body) byTag.set(key, fieldsIn(body));
        for (const d of n.childrenForFieldName('declarator')) {
          const { name, suffix } = declName(d);
          if (name && !suffix) aliases.set(name, key);
        }
        return;
      }
    }
    if (n.type === 'struct_specifier' || n.type === 'union_specifier') {
      const tag = n.childForFieldName('name')?.text;
      const body = n.childForFieldName('body');
      if (tag && body) byTag.set(`${n.type === 'union_specifier' ? 'union' : 'struct'} ${tag}`, fieldsIn(body));
    }
    for (const c of n.namedChildren) if (c) visit(c);
  };
  for (const t of trees) visit(t.rootNode);
  const out = new Map(byTag);
  for (const [alias, key] of aliases) {
    const f = byTag.get(key);
    if (f) out.set(alias, f);
  }
  return out;
}

function fieldsIn(body: Node): Var[] {
  return body.namedChildren.filter((c): c is Node => !!c && c.type === 'field_declaration').flatMap((d) => varsOf(d));
}

// `t_reader *buf`, `const struct s_x *p`, `t_vars v` → the struct's fields.
// Arrays and pointers to pointers stay rows of their own.
export function fieldsOfType(type: string, table: Map<string, Var[]>): Var[] | undefined {
  const t = type.replace(/\b(const|volatile|restrict)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.includes('[')) return undefined;
  const stars = (t.match(/\*/g) ?? []).length;
  if (stars > 1) return undefined;
  const base = t.replace(/\*/g, '').trim();
  const f = table.get(base);
  return f?.length ? f : undefined;
}

function attachFields(fns: FnInfo[], trees: Tree[]): void {
  const table = structTable(trees);
  if (!table.size) return;
  for (const f of fns) {
    f.params = f.params.map((v) => ({ ...v, fields: fieldsOfType(v.type, table) }));
    f.locals = f.locals.map((v) => ({ ...v, fields: fieldsOfType(v.type, table) }));
  }
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
    if (d.type === 'identifier' || d.type === 'field_identifier' || d.type === 'type_identifier') return { name: d.text, suffix, fnDecl };
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

interface Unit {
  fns: FnInfo[];
  globals: Global[];
  macros: Map<string, number>;
  protos: Set<string>;
  tree: Tree;
  error: { line: number; col: number } | null;
}

function parseUnit(src: string, file: string): Unit {
  if (!parser) throw new Error('parser not initialised');
  const tree = parser.parse(src)!;
  const root = tree.rootNode;
  const fns: FnInfo[] = [];
  const globals: Global[] = [];
  const macros = new Map<string, number>();
  const protos = new Set<string>();

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
      const { name: proto, fnDecl } = declName(n.childForFieldName('declarator'));
      if (fnDecl) {
        if (proto) protos.add(proto);
        return; // prototype
      }
      for (const d of n.childrenForFieldName('declarator')) {
        if (!d) continue;
        const { name, suffix } = declName(d);
        if (!name) continue;
        globals.push({
          id: `global:${name}`, name, file, type: joinType(baseType(n), suffix),
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
      id: `func:${name}`, name, cname: name, file, ret: joinType(baseType(n), suffix), isStatic: isStaticDecl(n),
      params, locals, statics, calls, externals: [],
      nameLine: nameNode.startPosition.row, nameCol: nameNode.startPosition.column,
      from: n.startIndex, to: n.endIndex, startLine: n.startPosition.row, endLine: n.endPosition.row,
      broken: n.hasError, node: n,
    });
  };
  for (const c of root.namedChildren) if (c) visitTop(c);
  const e = firstError(root);
  return { fns, globals, macros, protos, tree, error: e ? { line: e.startPosition.row, col: e.startPosition.column } : null };
}

// Give every function its graph key and resolve call sites the way the
// linker would: a name means this file's own definition first, then the one
// non-static definition anywhere; anything else is external.
function link(fns: FnInfo[]): Model['warnings'] {
  const warnings: Model['warnings'] = [];
  const byC = new Map<string, FnInfo[]>();
  for (const f of fns) byC.set(f.cname, [...(byC.get(f.cname) ?? []), f]);
  for (const group of byC.values()) {
    const globalOnes = group.filter((f) => !f.isStatic);
    for (const f of group) {
      const unique = group.length === 1 || (!f.isStatic && globalOnes.length === 1);
      f.name = unique ? f.cname : `${f.cname}@${f.file}`;
      f.id = `func:${f.name}`;
    }
  }
  for (const f of fns) {
    const ext = new Set<string>();
    const calls: CallSite[] = [];
    for (const c of f.calls) {
      const group = byC.get(c.callee) ?? [];
      const target = group.find((g) => g.file === f.file) ?? (group.filter((g) => !g.isStatic).length === 1 ? group.find((g) => !g.isStatic) : undefined);
      if (target) calls.push({ callee: target.name, line: c.line });
      else {
        ext.add(c.callee);
        if (group.length) warnings.push({ file: f.file, line: c.line, msg: `${c.callee} is static in ${group[0].file}; the linker will not find it from ${f.file}` });
      }
    }
    f.calls = calls;
    f.externals = [...ext];
  }
  return warnings;
}

export function parse(src: string): Model {
  const u = parseUnit(src, '');
  link(u.fns);
  attachFields(u.fns, [u.tree]);
  return {
    fns: u.fns, byName: new Map(u.fns.map((f) => [f.name, f])), globals: u.globals, macros: u.macros,
    tree: u.tree, trees: [u.tree], project: false, files: [], warnings: [], error: u.error,
  };
}

export interface SourceFile {
  path: string;
  text: string;
}

// Parsing is per file and cached by text, so an edit re-parses one file.
const unitCache = new Map<string, { text: string; unit: Unit }>();

export function parseProject(sources: SourceFile[]): Model {
  const parsed: { path: string; unit: Unit }[] = [];
  for (const s of sources) {
    if (!/\.[ch]$/.test(s.path)) continue;
    let hit = unitCache.get(s.path);
    if (!hit || hit.text !== s.text) {
      hit = { text: s.text, unit: parseUnit(s.text, s.path) };
      unitCache.set(s.path, hit);
    }
    // Cached units keep their raw call sites; link() works on copies.
    const u = hit.unit;
    parsed.push({ path: s.path, unit: { ...u, fns: u.fns.map((f) => ({ ...f })) } });
  }
  const cUnits = parsed.filter((p) => p.path.endsWith('.c')).map((p) => p.unit);
  const fns = cUnits.flatMap((u) => u.fns);
  const warnings = link(fns);
  attachFields(fns, parsed.map((p) => p.unit.tree));
  const headerProtos = new Set(parsed.filter((p) => p.path.endsWith('.h')).flatMap((p) => [...p.unit.protos]));
  for (const f of fns) f.declared = f.isStatic || f.cname === 'main' || headerProtos.has(f.cname);
  const macros = new Map<string, number>();
  for (const { unit } of parsed) for (const [k, v] of unit.macros) if (!macros.has(k)) macros.set(k, v);
  const broken = parsed.find((p) => p.unit.error);
  return {
    fns, byName: new Map(fns.map((f) => [f.name, f])), globals: cUnits.flatMap((u) => u.globals), macros,
    tree: parsed[0]?.unit.tree ?? parser!.parse('')!, trees: parsed.map((p) => p.unit.tree), project: true,
    files: [...new Set(fns.map((f) => f.file))], warnings,
    error: broken ? { ...broken.unit.error!, file: broken.path } : null,
  };
}
