// A tiny interpreter for a Norminette-shaped C subset, walking the tree-sitter
// AST. Prototype stand-in for the gdb trace server (M3): every value it emits
// is computed from the code, never invented (principle 4).
import type { Node } from 'web-tree-sitter';
import type { FnInfo, Model } from './parse';
import type { BoundValue, Sprite } from './blueprint';

export type V =
  | { k: 'int'; v: number }
  | { k: 'ptr'; to: number | null; label?: string } // label: "bufs[0]", "#2+4", "freed #3"
  | { k: 'raw'; text: string } // structs, arrays, pointers into unknown memory
  | { k: 'undef' }
  | { k: 'void' };

// A struct member as the picture shows it (gdb engine).
export interface SnapField {
  name: string;
  type: string;
  val: V;
  str?: string; // a char * member's text, quoted
}

export interface SnapCell {
  id: number;
  name: string;
  type: string;
  val: V;
  str?: string; // a char *'s text, quoted: what it points at, not where
  fields?: SnapField[]; // a struct's members, or the members of the struct it points at
  bytes?: number[]; // a heap block's first bytes (gdb engine, up to 48)
}

// What rides a belt with a call or a return, beyond the bare value: the text
// a char * points at, or the struct (by value or behind a pointer).
export type Payload =
  | { k: 'str'; text: string }
  | { k: 'struct'; type: string; via?: string; fields: { name: string; text: string }[] };

export interface SnapFrame {
  id: number;
  fn: string;
  cells: SnapCell[];
}

export interface Snap {
  stack: SnapFrame[];
  statics: SnapCell[]; // function-local statics and globals
  heap: SnapCell[]; // live malloc blocks (gdb engine only)
  bound?: Record<string, BoundValue>;
}

interface EvBase {
  line: number;
  file?: string; // project-relative (M5); absent for a single buffer
  frame: number | null; // frame executing when the event happened
}

export type Ev = EvBase &
  (
    | { k: 'call'; fn: string; caller: string | null; args: { name: string; val: V; text: string; data?: Payload }[] }
    | { k: 'write'; cell: number; val: V; via: number | null; text: string }
    | { k: 'eval'; text: string; result: boolean }
    | { k: 'ret'; fn: string; caller: string | null; val: V; data?: Payload }
    | { k: 'error'; msg: string }
    | { k: 'step' } // a line executed (gdb engine)
    | { k: 'alloc'; cell: number; size: number }
    | { k: 'free'; cell: number }
  );

export interface CellInfo {
  name: string;
  owner: string; // function name, '' for globals, 'heap' for malloc blocks
  frame: number; // -1 for statics/globals, -2 for heap blocks
}

export interface Trace {
  engine: 'interp' | 'gdb';
  evs: Ev[];
  snaps: Snap[]; // snaps[i] = state before evs[i], snaps[i + 1] = after it
  cells: Map<number, CellInfo>;
  exit: V | null;
  error: { msg: string; line: number; file?: string } | null;
  truncated: boolean;
  stdout?: string;
  args?: string[]; // the command-line arguments it ran with (gdb engine)
  heapSlots?: Map<number, number>; // heap cell -> shelf slot, stable for the block's life
  leaks?: { cell: number; size: number; line: number | null; file?: string }[];
  warnings?: string[];
}

const MAX_STEPS = 20000;
const MAX_EVENTS = 4000;
const MAX_DEPTH = 200;

class RtErr extends Error {
  constructor(msg: string, public line: number) {
    super(msg);
  }
}
class RetSig {
  constructor(public val: V, public line: number) {}
}
class BreakSig {}
class ContSig {}
class Truncate {}

interface Cell {
  id: number;
  name: string;
  type: string;
  frame: number;
  val: V;
}

interface Frame {
  id: number;
  fn: FnInfo;
  names: Map<string, number>;
}

const isPtrType = (t: string) => t.includes('*') || t.includes('[]');

function wrap(type: string, n: number): number {
  n = Math.trunc(n);
  if (/\bchar\b/.test(type)) return type.includes('unsigned') ? n & 255 : ((n + 128) & 255) - 128;
  if (/size_t|long/.test(type)) return n;
  if (type.includes('unsigned')) return n >>> 0;
  return n | 0;
}

export function fmtVal(v: V, type = ''): string {
  switch (v.k) {
    case 'int':
      if (v.v >= 18446744073709550000) return 'SIZE_MAX';
      if (/\bchar\b/.test(type) && v.v >= 32 && v.v < 127) return `'${String.fromCharCode(v.v)}'`;
      if (/\bchar\b/.test(type) && v.v === 10) return `'\\n'`;
      if (/\bchar\b/.test(type) && v.v === 0) return `'\\0'`;
      return String(v.v);
    case 'ptr':
      return v.label ? `→${v.label}` : v.to === null ? 'NULL' : '→';
    case 'raw':
      return v.text;
    case 'undef':
      return '?';
    case 'void':
      return 'void';
  }
}

// The small interpreter can observe simple variables already present in each
// snapshot. It cannot inspect structs, arrays or external memory.
export function evaluateInterpreterBindings(trace: Trace, sprites: Sprite[]): Trace {
  if (!sprites.length) return trace;
  return {
    ...trace,
    snaps: trace.snaps.map((snap) => {
      const bound: Record<string, BoundValue> = Object.create(null);
      for (const sprite of sprites) {
        const binding = sprite.binding;
        let result: BoundValue = { bound: false };
        if (binding && !['strip', 'stack', 'train'].includes(sprite.kind) && /^[A-Za-z_]\w*$/.test(binding.expr)) {
          const frame = binding.scope === 'fn' ? [...snap.stack].reverse().find((f) => f.fn === binding.fn) : undefined;
          const cell = binding.scope === 'fn'
            ? frame?.cells.find((c) => c.name === binding.expr) ?? snap.statics.find((c) => c.name === binding.expr && trace.cells.get(c.id)?.owner === binding.fn)
            : snap.statics.find((c) => c.name === binding.expr && trace.cells.get(c.id)?.owner === '');
          if (cell && cell.val.k !== 'undef') {
            result = { bound: true, value: fmtVal(cell.val, cell.type) };
            if (cell.val.k === 'int') result.number = cell.val.v;
          }
        }
        bound[sprite.id] = result;
      }
      return { ...snap, bound };
    }),
  };
}

function parseNumber(text: string, line: number): number {
  // tree-sitter-c folds a leading minus into the literal ("-7").
  if (/^[-+]/.test(text)) return (text[0] === '-' ? -1 : 1) * parseNumber(text.slice(1), line);
  const t = text.replace(/[uUlL]+$/, '');
  if (/^0x[0-9a-f]+$/i.test(t)) return Number.parseInt(t, 16);
  if (/^0[0-7]+$/.test(t)) return Number.parseInt(t, 8);
  if (/^\d+$/.test(t)) return Number.parseInt(t, 10);
  throw new RtErr(`floating point (${text}) is not in this prototype`, line);
}

function parseChar(text: string): number {
  const body = text.slice(1, -1);
  if (!body.startsWith('\\')) return body.charCodeAt(0);
  const esc: Record<string, number> = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, "'": 39, '"': 34, a: 7, b: 8, f: 12, v: 11 };
  return esc[body[1]] ?? body.charCodeAt(1);
}

const NORM_FORBIDDEN: Record<string, string> = {
  for_statement: 'for',
  switch_statement: 'switch',
  conditional_expression: 'the ternary operator',
  goto_statement: 'goto',
  do_statement: 'do … while',
};

export function run(model: Model): Trace {
  const cells = new Map<number, Cell>();
  const info = new Map<number, CellInfo>();
  const statics: number[] = [];
  const staticNames = new Map<string, number>(); // "fn.name" or ".name" for globals
  const stack: Frame[] = [];
  const evs: Ev[] = [];
  const snaps: Snap[] = [];
  let nextId = 1;
  let steps = 0;

  const newCell = (name: string, type: string, frame: number, owner: string, val: V): number => {
    const id = nextId++;
    cells.set(id, { id, name, type, frame, val });
    info.set(id, { name, owner, frame });
    return id;
  };

  const snapCell = (id: number): SnapCell => {
    const c = cells.get(id)!;
    return { id, name: c.name, type: c.type, val: c.val };
  };

  const snapshot = (): Snap => ({
    stack: stack.map((f) => ({ id: f.id, fn: f.fn.name, cells: [...f.names.values()].map(snapCell) })),
    statics: statics.map(snapCell),
    heap: [],
  });

  const top = () => stack[stack.length - 1] ?? null;

  const emit = (e: Ev) => {
    if (evs.length >= MAX_EVENTS) throw new Truncate();
    // Effects are applied before emit, so the "before" state is the previous
    // snapshot; only the very first event needs one taken here.
    if (!snaps.length) snaps.push(snapshot());
    evs.push(e);
    snaps.push(snapshot());
  };

  const lineOf = (n: Node) => n.startPosition.row;

  const lookup = (name: string, line: number): number => {
    const f = top();
    const local = f?.names.get(name);
    if (local !== undefined) return local;
    const st = (f && staticNames.get(`${f.fn.name}.${name}`)) ?? staticNames.get(`.${name}`);
    if (st !== undefined) return st;
    throw new RtErr(`\`${name}\` is not declared here`, line);
  };

  const store = (id: number, v: V, line: number): V => {
    const c = cells.get(id)!;
    let out: V = v;
    if (isPtrType(c.type)) {
      if (v.k === 'int' && v.v === 0) out = { k: 'ptr', to: null };
      else if (v.k !== 'ptr') throw new RtErr(`storing a non-pointer into pointer \`${c.name}\``, line);
    } else {
      if (v.k === 'ptr') throw new RtErr(`storing a pointer into \`${c.name}\` (${c.type})`, line);
      if (v.k === 'int') out = { k: 'int', v: wrap(c.type, v.v) };
    }
    c.val = out;
    return out;
  };

  const read = (id: number, line: number): V => {
    const c = cells.get(id)!;
    if (c.val.k === 'undef') throw new RtErr(`\`${c.name}\` is read before it was ever set`, line);
    return c.val;
  };

  const asInt = (v: V, line: number, what: string): number => {
    if (v.k === 'int') return v.v;
    if (v.k === 'ptr') throw new RtErr(`pointer arithmetic (${what}) is not in this prototype`, line);
    throw new RtErr(`using a ${v.k} value in ${what}`, line);
  };

  const truthy = (v: V, line: number): boolean => {
    if (v.k === 'ptr') return v.to !== null;
    return asInt(v, line, 'a condition') !== 0;
  };

  const unparen = (n: Node): Node => {
    while (n.type === 'parenthesized_expression' && n.namedChild(0)) n = n.namedChild(0)!;
    return n;
  };

  // Resolve an lvalue to a cell. `via` is the pointer variable written through, if any.
  const lvalue = (n: Node): { id: number; via: number | null } => {
    n = unparen(n);
    const line = lineOf(n);
    if (n.type === 'identifier') return { id: lookup(n.text, line), via: null };
    if (n.type === 'pointer_expression' && n.child(0)?.type === '*') {
      const arg = unparen(n.childForFieldName('argument')!);
      const p = evalExpr(arg);
      if (p.k !== 'ptr') throw new RtErr(`\`${arg.text}\` is not a pointer`, line);
      if (p.to === null) throw new RtErr(`dereferencing NULL (\`${n.text}\`)`, line);
      if (!cells.has(p.to) || !liveCell(p.to)) throw new RtErr(`\`${arg.text}\` points into a frame that already returned`, line);
      return { id: p.to, via: arg.type === 'identifier' ? lookup(arg.text, line) : null };
    }
    throw new RtErr(`can't assign to \`${n.text}\` in this prototype`, line);
  };

  const liveCell = (id: number): boolean => {
    const c = cells.get(id)!;
    return c.frame === -1 || stack.some((f) => f.id === c.frame);
  };

  const evalExpr = (n: Node): V => {
    const line = lineOf(n);
    switch (n.type) {
      case 'number_literal':
        return { k: 'int', v: parseNumber(n.text, line) };
      case 'char_literal':
        return { k: 'int', v: parseChar(n.text) };
      case 'true':
        return { k: 'int', v: 1 };
      case 'false':
        return { k: 'int', v: 0 };
      case 'null':
        return { k: 'ptr', to: null };
      case 'identifier': {
        const m = model.macros.get(n.text);
        if (m !== undefined) return { k: 'int', v: m };
        if (n.text === 'NULL') return { k: 'ptr', to: null };
        return read(lookup(n.text, line), line);
      }
      case 'parenthesized_expression':
        return evalExpr(n.namedChild(0)!);
      case 'binary_expression': {
        const op = n.childForFieldName('operator')!.type;
        const L = n.childForFieldName('left')!;
        const R = n.childForFieldName('right')!;
        if (op === '&&') return { k: 'int', v: truthy(evalExpr(L), line) && truthy(evalExpr(R), line) ? 1 : 0 };
        if (op === '||') return { k: 'int', v: truthy(evalExpr(L), line) || truthy(evalExpr(R), line) ? 1 : 0 };
        const a = evalExpr(L);
        const b = evalExpr(R);
        if ((op === '==' || op === '!=') && (a.k === 'ptr' || b.k === 'ptr')) {
          const pa = a.k === 'ptr' ? a.to : asInt(a, line, op) === 0 ? null : NaN;
          const pb = b.k === 'ptr' ? b.to : asInt(b, line, op) === 0 ? null : NaN;
          return { k: 'int', v: (pa === pb) === (op === '==') ? 1 : 0 };
        }
        const x = asInt(a, line, `\`${n.text}\``);
        const y = asInt(b, line, `\`${n.text}\``);
        const bool = (c: boolean): V => ({ k: 'int', v: c ? 1 : 0 });
        switch (op) {
          case '+': return { k: 'int', v: x + y };
          case '-': return { k: 'int', v: x - y };
          case '*': return { k: 'int', v: Math.imul(x, y) };
          case '/':
            if (y === 0) throw new RtErr(`division by zero in \`${n.text}\``, line);
            return { k: 'int', v: Math.trunc(x / y) };
          case '%':
            if (y === 0) throw new RtErr(`modulo by zero in \`${n.text}\``, line);
            return { k: 'int', v: x % y };
          case '<': return bool(x < y);
          case '>': return bool(x > y);
          case '<=': return bool(x <= y);
          case '>=': return bool(x >= y);
          case '==': return bool(x === y);
          case '!=': return bool(x !== y);
          case '&': return { k: 'int', v: x & y };
          case '|': return { k: 'int', v: x | y };
          case '^': return { k: 'int', v: x ^ y };
          case '<<': return { k: 'int', v: x << y };
          case '>>': return { k: 'int', v: x >> y };
        }
        throw new RtErr(`operator ${op} is not in this prototype`, line);
      }
      case 'unary_expression': {
        const op = n.childForFieldName('operator')!.type;
        const v = evalExpr(n.childForFieldName('argument')!);
        if (op === '!') return { k: 'int', v: truthy(v, line) ? 0 : 1 };
        const x = asInt(v, line, op);
        if (op === '-') return { k: 'int', v: -x };
        if (op === '~') return { k: 'int', v: ~x };
        return { k: 'int', v: x };
      }
      case 'pointer_expression': {
        if (n.child(0)?.type === '&') {
          const arg = unparen(n.childForFieldName('argument')!);
          return { k: 'ptr', to: lvalue(arg).id };
        }
        return read(lvalue(n).id, line);
      }
      case 'assignment_expression': {
        const { id, via } = lvalue(n.childForFieldName('left')!);
        const op = n.childForFieldName('operator')!.type;
        let v = evalExpr(n.childForFieldName('right')!);
        if (op !== '=') {
          const cur = asInt(read(id, line), line, op);
          const r = asInt(v, line, op);
          const bin: Record<string, (a: number, b: number) => number> = {
            '+=': (a, b) => a + b, '-=': (a, b) => a - b, '*=': (a, b) => Math.imul(a, b),
            '/=': (a, b) => Math.trunc(a / b), '%=': (a, b) => a % b,
            '&=': (a, b) => a & b, '|=': (a, b) => a | b, '^=': (a, b) => a ^ b,
            '<<=': (a, b) => a << b, '>>=': (a, b) => a >> b,
          };
          if ((op === '/=' || op === '%=') && r === 0) throw new RtErr(`division by zero in \`${n.text}\``, line);
          v = { k: 'int', v: bin[op](cur, r) };
        }
        const out = store(id, v, line);
        const left = n.childForFieldName('left')!.text;
        emit({ k: 'write', line, frame: top()?.id ?? null, cell: id, val: out, via, text: `${left} = ${fmtVal(out, cells.get(id)!.type)}` });
        return out;
      }
      case 'update_expression': {
        const arg = n.childForFieldName('argument')!;
        const { id, via } = lvalue(arg);
        const op = n.childForFieldName('operator')!.type;
        const old = asInt(read(id, line), line, op);
        const out = store(id, { k: 'int', v: op === '++' ? old + 1 : old - 1 }, line);
        emit({ k: 'write', line, frame: top()?.id ?? null, cell: id, val: out, via, text: `${n.text} → ${arg.text} = ${fmtVal(out, cells.get(id)!.type)}` });
        const prefix = n.child(0)?.type === op;
        return prefix ? out : { k: 'int', v: old };
      }
      case 'call_expression': {
        const fnNode = n.childForFieldName('function')!;
        const fn = model.byName.get(fnNode.text);
        if (!fn) throw new RtErr(`\`${fnNode.text}\` isn't defined here; external calls need the real trace server (M3)`, line);
        const argNodes = (n.childForFieldName('arguments')?.namedChildren ?? []).filter((a): a is Node => !!a && a.type !== 'comment');
        const args = argNodes.map((a) => ({ val: evalExpr(a), text: a.text }));
        return callFn(fn, args, line);
      }
      case 'cast_expression': {
        const v = evalExpr(n.childForFieldName('value')!);
        const t = n.childForFieldName('type')!.text;
        if (v.k === 'int' && !isPtrType(t)) return { k: 'int', v: wrap(t, v.v) };
        return v;
      }
      case 'comma_expression':
        evalExpr(n.childForFieldName('left')!);
        return evalExpr(n.childForFieldName('right')!);
    }
    if (NORM_FORBIDDEN[n.type]) throw new RtErr(`the Norminette forbids ${NORM_FORBIDDEN[n.type]}`, line);
    throw new RtErr(`\`${n.type.replace(/_/g, ' ')}\` is not in this prototype`, line);
  };

  const exec = (n: Node): void => {
    if (++steps > MAX_STEPS) throw new RtErr('step limit reached — infinite loop?', lineOf(n));
    const line = lineOf(n);
    switch (n.type) {
      case 'compound_statement':
        for (const c of n.namedChildren) if (c && c.type !== 'comment') exec(c);
        return;
      case 'declaration': {
        if (n.namedChildren.some((c) => c?.type === 'storage_class_specifier' && c.text === 'static')) return;
        for (const d of n.childrenForFieldName('declarator')) {
          if (!d || d.type !== 'init_declarator') continue;
          const nameNode = d.childForFieldName('declarator')!;
          const id = lookup(declNameText(nameNode), line);
          const out = store(id, evalExpr(d.childForFieldName('value')!), line);
          const c = cells.get(id)!;
          emit({ k: 'write', line, frame: top()?.id ?? null, cell: id, val: out, via: null, text: `${c.type} ${c.name} = ${fmtVal(out, c.type)}` });
        }
        return;
      }
      case 'expression_statement':
        if (n.namedChild(0)) evalExpr(n.namedChild(0)!);
        return;
      case 'return_statement': {
        const e = n.namedChild(0);
        throw new RetSig(e ? evalExpr(e) : { k: 'void' }, line);
      }
      case 'if_statement': {
        const cond = n.childForFieldName('condition')!;
        const r = truthy(evalExpr(cond), line);
        emit({ k: 'eval', line, frame: top()?.id ?? null, text: `if ${cond.text}`, result: r });
        if (r) exec(n.childForFieldName('consequence')!);
        else {
          const alt = n.childForFieldName('alternative');
          if (alt) exec(alt.type === 'else_clause' ? alt.namedChild(0)! : alt);
        }
        return;
      }
      case 'else_clause':
        exec(n.namedChild(0)!);
        return;
      case 'while_statement': {
        const cond = n.childForFieldName('condition')!;
        for (;;) {
          const r = truthy(evalExpr(cond), line);
          emit({ k: 'eval', line, frame: top()?.id ?? null, text: `while ${cond.text}`, result: r });
          if (!r) return;
          try {
            exec(n.childForFieldName('body')!);
          } catch (s) {
            if (s instanceof BreakSig) return;
            if (!(s instanceof ContSig)) throw s;
          }
        }
      }
      case 'break_statement':
        throw new BreakSig();
      case 'continue_statement':
        throw new ContSig();
      case 'comment':
      case ';':
        return;
    }
    if (NORM_FORBIDDEN[n.type]) throw new RtErr(`the Norminette forbids ${NORM_FORBIDDEN[n.type]}`, line);
    throw new RtErr(`\`${n.type.replace(/_/g, ' ')}\` is not in this prototype`, line);
  };

  const callFn = (fn: FnInfo, args: { val: V; text: string }[], line: number): V => {
    if (fn.broken) throw new RtErr(`\`${fn.name}\` has a syntax error`, line);
    if (args.length !== fn.params.length)
      throw new RtErr(`\`${fn.name}\` takes ${fn.params.length} argument(s), got ${args.length}`, line);
    if (stack.length >= MAX_DEPTH) throw new RtErr(`recursion deeper than ${MAX_DEPTH} — stack overflow?`, line);
    const caller = top();
    const frame: Frame = { id: nextId++, fn, names: new Map() };
    fn.params.forEach((p, i) => {
      const id = newCell(p.name, p.type, frame.id, fn.name, { k: 'undef' });
      frame.names.set(p.name, id);
      store(id, args[i].val, line);
    });
    for (const l of fn.locals) {
      if (!frame.names.has(l.name)) frame.names.set(l.name, newCell(l.name, l.type, frame.id, fn.name, { k: 'undef' }));
    }
    stack.push(frame);
    emit({
      k: 'call', line, frame: frame.id, fn: fn.name, caller: caller?.fn.name ?? null,
      args: fn.params.map((p, i) => ({ name: p.name, val: cells.get(frame.names.get(p.name)!)!.val, text: args[i].text })),
    });
    let result: V = { k: 'void' };
    let retLine = fn.endLine;
    try {
      exec(fn.node.childForFieldName('body')!);
    } catch (s) {
      if (!(s instanceof RetSig)) throw s;
      result = s.val;
      retLine = s.line;
    }
    stack.pop();
    emit({ k: 'ret', line: retLine, frame: frame.id, fn: fn.name, caller: caller?.fn.name ?? null, val: result });
    return result;
  };

  let exit: V | null = null;
  let error: Trace['error'] = null;
  let truncated = false;
  try {
    // Statics and globals exist before main starts (zero-initialised or constant).
    for (const g of model.globals) {
      const id = newCell(g.name, g.type, -1, '', isPtrType(g.type) ? { k: 'ptr', to: null } : { k: 'int', v: 0 });
      statics.push(id);
      staticNames.set(`.${g.name}`, id);
      if (g.init) store(id, evalExpr(g.init), g.line);
    }
    for (const f of model.fns) {
      for (const s of f.statics) {
        const id = newCell(s.name, s.type, -1, f.name, isPtrType(s.type) ? { k: 'ptr', to: null } : { k: 'int', v: 0 });
        statics.push(id);
        staticNames.set(`${f.name}.${s.name}`, id);
        const init = findStaticInit(f, s.name);
        if (init) store(id, evalExpr(init), s.line);
      }
    }
    const main = model.byName.get('main');
    if (!main) throw new RtErr('no main()', 0);
    snaps.push(snapshot());
    exit = callFn(main, [], main.nameLine);
  } catch (e) {
    if (e instanceof Truncate) truncated = true;
    else if (e instanceof RtErr) {
      error = { msg: e.message, line: e.line };
      if (evs.length < MAX_EVENTS) emit({ k: 'error', line: e.line, frame: top()?.id ?? null, msg: e.message });
    } else if (e instanceof BreakSig || e instanceof ContSig) {
      error = { msg: 'break/continue outside a loop', line: 0 };
    } else throw e;
  }
  if (!snaps.length) snaps.push(snapshot());
  return { engine: 'interp', evs, snaps, cells: info, exit, error, truncated };
}

function declNameText(d: Node): string {
  while (d.type !== 'identifier') {
    const next = d.childForFieldName('declarator');
    if (!next) break;
    d = next;
  }
  return d.text;
}

function findStaticInit(f: FnInfo, name: string): Node | null {
  for (const decl of f.node.descendantsOfType('declaration')) {
    if (!decl) continue;
    for (const d of decl.childrenForFieldName('declarator')) {
      if (d?.type === 'init_declarator' && declNameText(d.childForFieldName('declarator')!) === name) return d.childForFieldName('value');
    }
  }
  return null;
}
