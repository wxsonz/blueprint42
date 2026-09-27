// M4 truth checks: author-declared invariants on sprites, evaluated over the
// sampled values of a trace. Nothing here touches the running program; it
// only reads what the tracer already recorded.
//
// Grammar (one invariant per line):
//   [on return:] term (op term)+        e.g. pos <= len <= cap
//   [on return:] zero after term        bytes from term to the strip's end are 0
//   [on return:] zero after term for n  the n bytes starting at term are 0
// term: a marker label, `length`/`size` (the strip's length), `value` (a bound
// number), or an integer, optionally ± an integer (len - 1).
// op: < <= == != >= >
// "on return:" checks only right after a function returns, for invariants a
// function may break mid-way and must restore (like a class invariant).
import type { BoundValue, Sprite } from './blueprint';
import type { Trace } from './interp';

type Op = '<' | '<=' | '==' | '!=' | '>=' | '>';
type Term = { name: string; offset: number } | { value: number };
type Body = { kind: 'cmp'; terms: Term[]; ops: Op[] } | { kind: 'zero'; from: Term; count: Term | null };
export interface Check {
  text: string;
  onReturn: boolean;
  body: Body;
}

export interface Violation {
  sprite: string;
  invariant: string;
  builtin: boolean; // a marker leaving its strip: a picture/run mismatch
  at: number; // first snapshot index where it is false (state after evs[at - 1])
  end: number; // first snapshot index where it holds again (or snaps.length)
  line: number | null; // the source line that made it false (0-based)
  detail: string; // "pos 24 > len 23"
}

const TERM = /^\s*(?:([A-Za-z_]\w*)\s*(?:([+-])\s*(\d+))?|(-?\d+))\s*/;
const OP = /^\s*(<=|>=|==|!=|<|>)\s*/;

function parseTerm(s: string): { term: Term; rest: string } | null {
  const m = TERM.exec(s);
  if (!m || !m[0].trim()) return null;
  const term: Term = m[4] !== undefined ? { value: Number(m[4]) } : { name: m[1], offset: m[3] ? (m[2] === '-' ? -1 : 1) * Number(m[3]) : 0 };
  return { term, rest: s.slice(m[0].length) };
}

export function parseInvariant(text: string): Check | string {
  let s = text.trim();
  if (!s) return 'empty invariant';
  if (s.length > 100) return 'invariant is too long';
  let onReturn = false;
  const on = /^on\s+return\s*:\s*/i.exec(s);
  if (on) {
    onReturn = true;
    s = s.slice(on[0].length);
  }
  const zero = /^zero\s+after\s+(.+?)(?:\s+for\s+(.+))?$/i.exec(s);
  if (zero) {
    const t = parseTerm(zero[1]);
    if (!t || t.rest.trim()) return 'use: zero after <marker> [for <n>]';
    let count: Term | null = null;
    if (zero[2] !== undefined) {
      const c = parseTerm(zero[2]);
      if (!c || c.rest.trim()) return 'use: zero after <marker> for <n>';
      count = c.term;
    }
    return { text: text.trim(), onReturn, body: { kind: 'zero', from: t.term, count } };
  }
  const terms: Term[] = [];
  const ops: Op[] = [];
  let t = parseTerm(s);
  if (!t) return 'expected a marker name or a number';
  terms.push(t.term);
  s = t.rest;
  while (s.trim()) {
    const o = OP.exec(s);
    if (!o) return `unexpected "${s.trim()}"`;
    ops.push(o[1] as Op);
    t = parseTerm(s.slice(o[0].length));
    if (!t) return 'expected a marker name or a number after the comparison';
    terms.push(t.term);
    s = t.rest;
  }
  if (!ops.length) return 'compare at least two things, e.g. pos <= len';
  return { text: text.trim(), onReturn, body: { kind: 'cmp', terms, ops } };
}

// Variables a sprite's sample offers: its markers by label, the strip length,
// and a bound number as `value`.
function varsOf(v: BoundValue): Record<string, number> {
  const vars: Record<string, number> = Object.create(null);
  for (const m of v.markers ?? []) if (Number.isFinite(m.index)) vars[m.label] = m.index;
  if (Number.isFinite(v.length)) vars.length = vars.size = v.length!;
  if (Number.isFinite(v.number)) vars.value = v.number!;
  return vars;
}

const termValue = (t: Term, vars: Record<string, number>): number | null =>
  'value' in t ? t.value : t.name in vars ? vars[t.name] + t.offset : null;
const termText = (t: Term) => ('value' in t ? String(t.value) : `${t.name}${t.offset ? (t.offset > 0 ? ` + ${t.offset}` : ` - ${-t.offset}`) : ''}`);

const cmp = (a: number, op: Op, b: number) =>
  op === '<' ? a < b : op === '<=' ? a <= b : op === '==' ? a === b : op === '!=' ? a !== b : op === '>=' ? a >= b : a > b;
const NOT: Record<Op, string> = { '<': '≥', '<=': '>', '==': '≠', '!=': '=', '>=': '<', '>': '≤' };

// true / false with a reason / null when the sample can't decide (unbound, missing marker).
export function evaluate(check: Check, v: BoundValue | undefined): { ok: boolean; detail: string } | null {
  if (!v?.bound || v.error) return null;
  const vars = varsOf(v);
  if (check.body.kind === 'zero') {
    const from = termValue(check.body.from, vars);
    const count = check.body.count ? termValue(check.body.count, vars) : null;
    if (from === null || !Array.isArray(v.bytes) || (check.body.count && count === null)) return null;
    const stripEnd = Math.min(v.bytes.length, Number.isFinite(v.length) ? v.length! : v.bytes.length);
    const end = count !== null ? Math.min(stripEnd, from + count) : stripEnd;
    for (let i = Math.max(0, from); i < end; i++) {
      if (v.bytes[i] !== 0) return { ok: false, detail: `byte ${i} is 0x${v.bytes[i].toString(16).padStart(2, '0')} (after ${termText(check.body.from)} = ${from})` };
    }
    return { ok: true, detail: '' };
  }
  const { terms, ops } = check.body;
  const vals = terms.map((t) => termValue(t, vars));
  if (vals.some((x) => x === null)) return null;
  for (let i = 0; i < ops.length; i++) {
    if (!cmp(vals[i]!, ops[i], vals[i + 1]!)) {
      return { ok: false, detail: `${termText(terms[i])} ${vals[i]} ${NOT[ops[i]]} ${termText(terms[i + 1])} ${vals[i + 1]}` };
    }
  }
  return { ok: true, detail: '' };
}

// The line that produced snapshot `at`: the last line executed before it.
function culpritLine(trace: Trace, at: number): number | null {
  let seenStep = false;
  for (let j = at - 1; j >= 0; j--) {
    const e = trace.evs[j];
    if (e.k === 'step') {
      if (seenStep) return e.line; // the step before the one that sampled
      seenStep = true;
    } else if (e.k === 'write' || e.k === 'eval' || e.k === 'ret') return e.line;
  }
  return trace.evs[at - 1]?.line ?? null;
}

export function findViolations(trace: Trace | null, sprites: Sprite[]): Violation[] {
  if (!trace) return [];
  const out: Violation[] = [];
  const n = trace.snaps.length;
  for (const sprite of sprites) {
    const checks: { check: Check; builtin: boolean }[] = [];
    for (const text of sprite.invariants ?? []) {
      const c = parseInvariant(text);
      if (typeof c !== 'string') checks.push({ check: c, builtin: false });
    }
    // Built-in picture check: a strip's markers stay on the strip.
    if (sprite.kind === 'strip') {
      for (const m of sprite.markers ?? []) {
        const c = parseInvariant(`0 <= ${m.label} <= length`);
        if (typeof c !== 'string') checks.push({ check: { ...c, text: `${m.label} stays on the strip` }, builtin: true });
      }
    }
    for (const { check, builtin } of checks) {
      let open: Violation | null = null;
      for (let k = 0; k < n; k++) {
        if (check.onReturn && !(k > 0 && trace.evs[k - 1]?.k === 'ret')) continue;
        const r = evaluate(check, trace.snaps[k].bound?.[sprite.id]);
        if (r && !r.ok) {
          if (!open) {
            open = { sprite: sprite.id, invariant: check.text, builtin, at: k, end: n, line: culpritLine(trace, k), detail: r.detail };
            out.push(open);
          }
        } else if (open) {
          open.end = k;
          open = null;
        }
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Calls the static graph did not predict (a call through a function pointer).
export function surpriseCalls(trace: Trace | null, predicted: (caller: string, callee: string) => boolean): { at: number; caller: string; callee: string; line: number }[] {
  const out: { at: number; caller: string; callee: string; line: number }[] = [];
  const seen = new Set<string>();
  trace?.evs.forEach((e, i) => {
    if (e.k !== 'call' || !e.caller || predicted(e.caller, e.fn)) return;
    const key = `${e.caller}>${e.fn}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Report the call site: the last line executed before entering the callee.
    let line = e.line;
    for (let j = i - 1; j >= 0; j--) {
      const p = trace!.evs[j];
      if (p.k === 'step' || p.k === 'write' || p.k === 'eval') {
        line = p.line;
        break;
      }
    }
    out.push({ at: i + 1, caller: e.caller, callee: e.fn, line });
  });
  return out;
}
