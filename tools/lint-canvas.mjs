#!/usr/bin/env node
// A canvas state change without its restore (docs/OBJECTIVES.md, step 9;
// oxlint has no such rule): in each function, calls to `x.save()` and
// `x.restore()` on the same context balance, and no `return` leaves a save
// open (unless a `finally` closes it). A function that balances elsewhere on
// purpose says so: `// lint-canvas: balanced elsewhere` inside it.
//   node tools/lint-canvas.mjs [files or folders…]   (default: src)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseSync } from 'oxc-parser';
import { REPO } from './lib/serve.mjs';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : [join(REPO, 'src')];
const files = [];
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).forEach((f) => walk(join(p, f))) : /\.(ts|mjs)$/.test(p) && !p.endsWith('.d.ts') && files.push(p));
roots.forEach(walk);

const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const problems = [];
const lineOf = (src, pos) => src.slice(0, pos).split('\n').length;
const text = (src, n) => src.slice(n.start, n.end);

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { program, errors } = parseSync(file, src);
  if (errors.length) continue; // the compiler says what's wrong with it
  const check = (fn) => {
    const body = fn.body;
    if (!body || body.type !== 'BlockStatement') return;
    if (/lint-canvas: balanced elsewhere/.test(text(src, body))) return;
    const calls = []; // { kind: 'save'|'restore'|'return', ctx, pos, fin, early }
    // a restore right before a return closes the save for that path only:
    // counted at the return, not against the function's other restore
    const early = new Set();
    const markEarly = (stmts) => stmts.forEach((st, i) => {
      const nx = stmts[i + 1];
      if (st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression' && st.expression.callee.property?.name === 'restore' && nx?.type === 'ReturnStatement') early.add(st.expression.start);
    });
    const visit = (n, inFinally) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) return n.forEach((x) => visit(x, inFinally));
      if (n !== body && FN.has(n.type)) return; // nested functions are checked on their own
      if (n.type === 'BlockStatement' || n.type === 'SwitchCase') markEarly(n.body ?? n.consequent ?? []);
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && ['save', 'restore'].includes(n.callee.property.name) && n.arguments.length === 0) {
        calls.push({ kind: n.callee.property.name, ctx: text(src, n.callee.object), pos: n.start, fin: inFinally, early: early.has(n.start) });
      }
      if (n.type === 'ReturnStatement') calls.push({ kind: 'return', pos: n.start });
      if (n.type === 'TryStatement') {
        visit(n.block, inFinally);
        visit(n.handler, inFinally);
        visit(n.finalizer, true);
        return;
      }
      for (const [k, v] of Object.entries(n)) if (k !== 'parent' && v && typeof v === 'object') visit(v, inFinally);
    };
    visit(body, false);
    if (!calls.some((c) => c.kind === 'save' || c.kind === 'restore')) return;
    const byCtx = new Map();
    for (const c of calls) {
      if (!c.ctx) continue;
      const n = byCtx.get(c.ctx) ?? byCtx.set(c.ctx, { save: 0, restore: 0, fin: 0, early: 0 }).get(c.ctx);
      n[c.kind]++;
      if (c.fin && c.kind === 'restore') n.fin++;
      if (c.early) n.early++;
    }
    const where = `${relative(REPO, file)}:${lineOf(src, fn.start)}`;
    for (const [ctx, n] of byCtx) {
      // more saves than restores leaves one open; more restores is fine only
      // for those that close a save on an early return's path
      if (n.save > n.restore || n.restore - n.early > n.save) problems.push(`${where}: ${ctx}.save() ×${n.save} but ${ctx}.restore() ×${n.restore}`);
    }
    // a return with a save open: count what's open at each return, in reading order
    const sorted = [...calls].sort((a, b) => a.pos - b.pos);
    const open = new Map();
    for (const c of sorted) {
      if (c.kind === 'save') open.set(c.ctx, (open.get(c.ctx) ?? 0) + 1);
      else if (c.kind === 'restore') open.set(c.ctx, (open.get(c.ctx) ?? 0) - 1);
      else if (c.kind === 'return') {
        for (const [ctx, k] of open) if (k > 0 && !(byCtx.get(ctx)?.fin > 0)) problems.push(`${relative(REPO, file)}:${lineOf(src, c.pos)}: returns with ${ctx}.save() open (restore it first, or in a finally)`);
      }
    }
  };
  const all = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(all);
    if (FN.has(n.type)) check(n);
    for (const [k, v] of Object.entries(n)) if (k !== 'parent' && v && typeof v === 'object') all(v);
  };
  all(program);
}

for (const p of problems) console.log(p);
console.log(problems.length ? `\n${problems.length} canvas save/restore problem(s)` : `canvas save/restore: ${files.length} files, all balanced`);
process.exit(problems.length ? 1 : 0);
