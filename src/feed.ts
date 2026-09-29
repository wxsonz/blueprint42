// The kill feed, the duel and focus mode's return card: the overlays that
// spell out a transfer in words and code. main.ts's frame calls them with
// what they read (the app state, the trace revision, the view, the editor).
import type { EditorView } from '@codemirror/view';
import { $, esc } from './dom';
import { fmtVal, type Payload, type Trace } from './interp';
import { clip, type GridView } from './render';
import { argLabel, frameAt, retLabel, returnCard, type ViewState } from './playback';
import type { Project } from './workspace';

export type FeedState = Pick<ViewState, 'model' | 'trace' | 'pos'> & { project: Project | null };

// One line for the readout: "hello\n" or {data "hel…", len 23, cap 40, pos 6}
export function payloadText(d: Payload): string {
  if (d.k === 'str') return clip(d.text, 24);
  return `{${d.fields.map((x) => `${x.name} ${x.text.startsWith('"') ? clip(x.text, 8) : x.text}`).join(', ')}}`;
}

// ---------------- the kill feed: who sent what to whom ----------------
// Calls, returns, and writes into memory another function owns, newest on
// top, each with its type and the value that went across. Built once per
// trace; redrawn only when the newest one changes.
interface Transfer { i: number; kind: 'call' | 'ret' | 'write'; from: string; to: string; data: string }
let transfers: { rev: number; list: Transfer[] } = { rev: -1, list: [] };
const FEED_COLORS = ['#2d89ef', '#00a300', '#e3008c', '#9f00a7', '#da532c', '#1e7145', '#b91d47', '#00aba9', '#603cba', '#e3a21a'];
const FEED_ACT = {
  call: '<svg viewBox="0 0 18 14" aria-label="calls"><path d="M1 7h14M10 2l5 5-5 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ret: '<svg viewBox="0 0 18 14" aria-label="returns to"><path d="M16 2v5H4M8 3L3 7l5 4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  write: '<svg viewBox="0 0 18 14" aria-label="writes into"><path d="M3 12l1.2-3.6L12 1.5l2.8 2.8L7 11.2zM3 12l3.6-1.2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>',
};
const clipFeed = (v: string, n = 28) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

function transfersOf(t: Trace, S: FeedState, traceRevision: number): Transfer[] {
  if (transfers.rev === traceRevision) return transfers.list;
  const list: Transfer[] = [];
  const name = (fn: string | null | undefined) => (!fn ? 'process' : S.model?.byName.get(fn)?.cname ?? fn);
  // the way C writes it: type, name, value
  const typed = (type: string | undefined, v: string, nm = '') => `${type ? `<i>${esc(type)}</i> ` : ''}${nm ? `${esc(nm)} = ` : ''}<b>${esc(clipFeed(v))}</b>`;
  t.evs.forEach((e, i) => {
    if (e.k === 'call') {
      const fn = S.model?.byName.get(e.fn);
      const snap = t.snaps[i + 1];
      const args = e.args.map((a, k) => typed(fn?.params[k]?.type, a.data ? payloadText(a.data) : argLabel(a.val, a.text, t, snap), a.name));
      list.push({ i, kind: 'call', from: name(e.caller), to: name(e.fn), data: args.join(' · ') || '<i>no arguments</i>' });
    } else if (e.k === 'ret') {
      const fn = S.model?.byName.get(e.fn);
      const v = e.data ? payloadText(e.data) : e.val.k === 'void' ? 'void' : retLabel(e.val, t);
      list.push({ i, kind: 'ret', from: name(e.fn), to: name(e.caller), data: typed(fn?.ret, v) });
    } else if (e.k === 'write' && e.frame !== null) {
      // only writes that land in memory another function owns
      const info = t.cells.get(e.cell);
      if (!info || info.frame === e.frame || info.frame === -2) return;
      const writer = t.snaps[i].stack.find((f) => f.id === e.frame)?.fn;
      const owner = info.frame === -1 ? info.owner : t.snaps[i + 1]?.stack.find((f) => f.id === info.frame)?.fn;
      if (!writer || !owner || writer === owner) return;
      list.push({ i, kind: 'write', from: name(writer), to: name(owner), data: `${esc(info.name)} = <b>${esc(clipFeed(fmtVal(e.val), 36))}</b>` });
    }
  });
  transfers = { rev: traceRevision, list };
  return list;
}

function feedIcon(n: string): string {
  let h = 7;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const parts = n.split('_').filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : n.slice(0, 2)) || '?';
  return `<span class="fn"><span class="ico" style="background:${FEED_COLORS[h % FEED_COLORS.length]}">${esc(initials)}</span>${esc(n)}</span>`;
}

let feedKey = '';
export function renderFeed(S: FeedState, traceRevision: number): void {
  const el = $('feed');
  const t = S.trace;
  if (!t || !t.evs.length) {
    if (feedKey) (el.innerHTML = ''), (feedKey = '');
    return;
  }
  const list = transfersOf(t, S, traceRevision);
  const at = Math.floor(S.pos);
  let lo = 0, hi = list.length - 1, last = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (list[m].i <= at) (last = m), (lo = m + 1);
    else hi = m - 1;
  }
  const key = `${traceRevision}|${last}`;
  if (key === feedKey) return;
  feedKey = key;
  const rows = list.slice(Math.max(0, last - 4), last + 1).reverse();
  const fade = [1, 0.82, 0.66, 0.5, 0.36];
  el.innerHTML = rows.map((r, n) => `<div class="kf ${r.kind}" data-i="${r.i}" style="opacity:${fade[n]}" title="jump here">${feedIcon(r.from)}<span class="act">${FEED_ACT[r.kind]}</span>${feedIcon(r.to)}<span class="data">${r.data}</span></div>`).join('');
}

// ---------------- the duel: a transfer between far-apart machines ----------------
// The renderer decides when (a sender or receiver off screen, view.duel);
// here it's spelled out: the caller's line with the call marked and the
// callee's signature with the values that arrived; or the return statement
// and the caller's line with the call replaced by what came back; or a
// write landing in memory another function owns. It stays up long enough
// to read, even in Fast mode.
const C_KW = new Set(['if', 'else', 'while', 'for', 'do', 'return', 'break', 'continue', 'static', 'const', 'struct', 'typedef', 'sizeof', 'unsigned', 'signed', 'goto', 'switch', 'case', 'default', 'enum', 'union', 'extern', 'volatile']);
const C_TY = /^(int|char|void|long|short|float|double|size_t|ssize_t|bool|t_\w+|s_\w+|u?int\d+_t)$/;
function hlC(code: string): string {
  return code.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*.*?\*\/|\/\/.*$|\b\d[\w.]*\b|\b[A-Za-z_]\w*\b|[^A-Za-z_0-9"'\/]+|\/)/g, (t, _m, off: number, all: string) => {
    const e = esc(t);
    if (t[0] === '"' || t[0] === "'") return `<span class="syn-str">${e}</span>`;
    if (t.startsWith('/*') || t.startsWith('//')) return `<span class="syn-com">${e}</span>`;
    if (/^\d/.test(t)) return `<span class="syn-num">${e}</span>`;
    if (/^[A-Za-z_]/.test(t)) {
      if (C_KW.has(t)) return `<span class="syn-kw">${e}</span>`;
      if (C_TY.test(t)) return `<span class="syn-ty">${e}</span>`;
      if (/^[A-Z][A-Z0-9_]+$/.test(t)) return `<span class="syn-mac">${e}</span>`;
      if (all.slice(off + t.length).trimStart().startsWith('(')) return `<span class="syn-fn">${e}</span>`;
    }
    return e;
  });
}

// A source line as the editor has it (project file, or the sample buffer).
function srcLine(S: FeedState, editor: EditorView, file: string | undefined, line: number): string {
  const text = S.project && file ? S.project.files.get(file)?.text : editor.state.doc.toString();
  return (text?.split('\n')[line] ?? '').trim();
}

// Where a frame was when event `i` happened: its latest line before i
// (not the closing brace gdb stops on just before a return).
function frameLine(t: Trace, frame: number, i: number, skipLine = -1): { line: number; file?: string } | null {
  for (let j = i - 1; j >= 0; j--) {
    const e = t.evs[j];
    if (e.frame === frame && e.k !== 'call' && e.k !== 'ret' && e.line !== skipLine) return { line: e.line, file: e.file };
  }
  return null;
}

// `callee(…)` inside a line: where it starts and ends (matching the parenthesis).
function callSpan(code: string, callee: string): [number, number] | null {
  const m = new RegExp(`\\b${callee}\\s*\\(`).exec(code);
  if (!m) return null;
  let depth = 0;
  for (let k = m.index + m[0].length - 1; k < code.length; k++) {
    if (code[k] === '(') depth++;
    else if (code[k] === ')' && --depth === 0) return [m.index, k + 1];
  }
  return null;
}

const DUEL_ICON = {
  call: '<svg viewBox="0 0 26 18"><path d="M1 9h21M15 3l7 6-7 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ret: '<svg viewBox="0 0 26 18"><path d="M3 2v7h19M17 3l6 6-6 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  write: '<svg viewBox="0 0 26 18"><path d="M3 15l1.5-4.5L16 1.5l3.5 3.5L8 14zM3 15l4.5-1.5M20 16h5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linejoin="round"/></svg>',
};

let duelShown: { key: string; since: number } | null = null;
export function renderDuel(now: number, S: FeedState, view: GridView, editor: EditorView): void {
  const el = $('duel');
  const t = S.trace;
  // Focus mode's return card is saying it already: one overlay at a time
  if (!stageCard.hidden) {
    el.hidden = true;
    duelShown = null;
    return;
  }
  const d = view.duel;
  if (!d || !t) {
    // keep the last one up long enough to read, then let it go
    if (duelShown && now - duelShown.since > 1500) {
      el.classList.add('out');
      if (now - duelShown.since > 1800) (el.hidden = true), (duelShown = null);
    }
    return;
  }
  const chip = el.querySelector<HTMLElement>('.chip');
  if (duelShown?.key === d.key && chip) {
    // it may have started fading out: the same event is back, so keep it up
    if (el.classList.contains('out') || el.hidden) (el.classList.remove('out'), (el.hidden = false));
    chip.style.left = `${Math.max(4, Math.min(96, d.p * 100))}%`;
    chip.parentElement!.style.setProperty('--p', `${d.p}`);
    return;
  }
  duelShown = { key: d.key, since: now };
  const name = (fn: string | null | undefined) => (!fn ? 'process' : S.model?.byName.get(fn)?.cname ?? fn);
  const head = (fn: string, at: { line: number } | null) => `<div class="d-head">${feedIcon(fn).replace('<span class="fn">', '').replace(/<\/span>$/, '')}${at ? `<span class="d-at">line ${at.line + 1}</span>` : ''}</div>`;
  const e = t.evs[d.i];
  let left = '', right = '', verb = '', what = '', say = '';
  const role = (title: string, sub: string) => `<div class="d-role"><b>${esc(title)}</b> <span>${esc(sub)}</span></div>`;
  if (e.k === 'call') {
    const callerFrame = t.snaps[d.i].stack.at(-1);
    const at = t.engine === 'interp' ? { line: e.line, file: e.file } : callerFrame ? frameLine(t, callerFrame.id, d.i) : null;
    const code = at ? srcLine(S, editor, at.file, at.line) : '';
    const fn = S.model?.byName.get(e.fn);
    const span = fn ? callSpan(code, fn.cname) : null;
    const body = span ? `${hlC(code.slice(0, span[0]))}<mark>${hlC(code.slice(span[0], span[1]))}</mark>${hlC(code.slice(span[1]))}` : hlC(code || `${e.fn}(…)`);
    left = `<div class="d-card send">${role('caller', `${name(e.caller)} makes the call${at ? ` on line ${at.line + 1}` : ''}`)}${head(name(e.caller), at)}<pre class="d-code">${body}</pre></div>`;
    const snap = t.snaps[d.i + 1];
    const params = (fn?.params ?? []).map((p, k) => {
      const a = e.args[k];
      const v = a ? (a.data ? payloadText(a.data) : argLabel(a.val, a.text, t, snap)) : '?';
      return `  ${hlC(`${p.type} ${p.name}`)} = <span class="val">${esc(v)}</span>`;
    });
    const sig = fn ? `${hlC(`${fn.isStatic ? 'static ' : ''}${fn.ret}`)}\n${hlC(fn.cname)}(${params.length ? `\n${params.join(',\n')}\n` : ''})` : esc(e.fn);
    right = `<div class="d-card recv">${role('called', `${name(e.fn)} starts with these values`)}${head(name(e.fn), fn ? { line: fn.nameLine } : null)}<pre class="d-code">${sig}</pre></div>`;
    verb = `calls ${DUEL_ICON.call}`;
    what = e.args.map((a) => `${a.name} = ${a.data ? payloadText(a.data) : argLabel(a.val, a.text, t, snap)}`).join(', ') || 'no arguments';
    say = `<b>${esc(name(e.caller))}</b> calls <b>${esc(name(e.fn))}</b>${e.args.length ? ` with ${esc(what)}` : ''}`;
  } else if (e.k === 'ret') {
    const fn = S.model?.byName.get(e.fn);
    const value = e.data ? payloadText(e.data) : e.val.k === 'void' ? 'void' : retLabel(e.val, t);
    const at = frameLine(t, e.frame!, d.i, fn?.endLine ?? -1);
    const code = at ? srcLine(S, editor, at.file, at.line) : '}';
    left = `<div class="d-card send">${role('returning', `${name(e.fn)} is done and hands back`)}${head(name(e.fn), at)}<pre class="d-code">${hlC(code)}\n<span class="syn-com">// </span>${hlC(fn?.ret ?? '')} <span class="val">${esc(value)}</span></pre></div>`;
    const st = t.snaps[d.i].stack;
    const k = st.findIndex((f) => f.id === e.frame);
    const caller = k > 0 ? st[k - 1] : null;
    const cat = caller ? frameLine(t, caller.id, d.i) : null;
    const ccode = cat ? srcLine(S, editor, cat.file, cat.line) : '';
    const span = fn ? callSpan(ccode, fn.cname) : null;
    const got = span ? `<span class="faint">${hlC(ccode)}</span>\n${hlC(ccode.slice(0, span[0]))}<span class="val">${esc(value)}</span>${hlC(ccode.slice(span[1]))}` : hlC(ccode || 'main');
    right = `<div class="d-card recv">${role('caller', `${name(e.caller)} gets it back here${cat ? ` (line ${cat.line + 1})` : ''}`)}${head(name(e.caller), cat)}<pre class="d-code">${got}</pre></div>`;
    verb = `returns ${DUEL_ICON.ret}`;
    what = value;
    say = `<b>${esc(name(e.fn))}</b> returns <b class="v">${esc(value)}</b> to <b>${esc(name(e.caller))}</b>`;
  } else if (e.k === 'write') {
    const info = t.cells.get(e.cell);
    const at = d.beatFrom !== undefined ? { line: t.evs[d.beatFrom].line, file: t.evs[d.beatFrom].file } : null;
    const writer = t.snaps[d.i].stack.find((f) => f.id === e.frame)?.fn;
    left = `<div class="d-card send">${role('writer', `${name(writer)} writes through a pointer`)}${head(name(writer), at)}<pre class="d-code">${hlC(at ? srcLine(S, editor, at.file, at.line) : '')}</pre></div>`;
    const oldCell = [...t.snaps[d.i].statics, ...t.snaps[d.i].stack.flatMap((f) => f.cells)].find((c) => c.id === e.cell);
    const owner = info?.frame === -1 ? info.owner : t.snaps[d.i + 1]?.stack.find((f) => f.id === info?.frame)?.fn;
    right = `<div class="d-card recv">${role('owner', `${name(owner)}'s ${info?.name ?? 'variable'} changes`)}${head(name(owner), null)}<pre class="d-code">${hlC(`${oldCell?.type ?? ''} ${info?.name ?? '?'}`)}${info?.frame === -1 ? ' <span class="syn-com">// static</span>' : ''}\n  <span class="old">${esc(oldCell ? fmtVal(oldCell.val) : '?')}</span>\n→ <span class="val">${esc(fmtVal(e.val))}</span></pre></div>`;
    verb = `writes into ${DUEL_ICON.write}`;
    what = `${info?.name ?? ''} = ${fmtVal(e.val)}`;
    say = `<b>${esc(name(writer))}</b> changes <b>${esc(name(owner))}</b>'s ${esc(info?.name ?? '')}: <span class="old">${esc(oldCell ? fmtVal(oldCell.val) : '?')}</span> ➜ <b class="v">${esc(fmtVal(e.val))}</b>`;
  } else return;
  el.className = d.kind;
  el.innerHTML = `<div class="d-say"><span class="t">${say}</span></div>${left}<div class="d-mid"><div class="d-verb">${verb}</div><div class="d-track" style="--p:${d.p}"><span class="chip" style="left:${Math.max(4, d.p * 100)}%">${esc(clipFeed(what, 36))}</span></div>${what.length > 36 ? `<div class="d-what" title="${esc(what)}">${esc(what)}</div>` : ''}</div>${right}`;
  el.hidden = false;
}

// ---------------- focus mode: a return's card ----------------
// Over the veiled grid, before the result travels back: what the function
// was called with and what it hands back — its return value, and whatever it
// changed through its pointers.
const stageCard = $<HTMLElement>('stage-card');
let stageCardKey = '';
export function renderStageCard(S: FeedState, traceRevision: number): void {
  const t = S.trace;
  const fr = t && t.evs.length ? frameAt(t, S.pos) : null;
  const ph = fr?.ph;
  if (!t || !fr || !ph || ph.parked !== 'card') {
    stageCard.hidden = true;
    stageCardKey = '';
    return;
  }
  // fade in and out at the ends of the wait
  const total = ph.lead > 0 ? ph.secs / ph.lead : 1;
  stageCard.style.opacity = String(Math.min(1, ph.secs / 0.3, (total - ph.secs) / 0.3));
  if (stageCardKey === `${traceRevision}|${fr.i}`) return;
  stageCardKey = `${traceRevision}|${fr.i}`;
  const c = returnCard(t, fr.i);
  if (!c) return void (stageCard.hidden = true);
  const name = (k: string | null) => (k ? S.model?.byName.get(k)?.cname ?? k : 'process');
  const fn = S.model?.byName.get(c.fn);
  // full names: a field under its variable reads buf->pos
  let parent = '';
  const rows = c.rows.map((r) => {
    if (!r.depth) parent = r.name;
    return { ...r, full: r.depth ? `${parent}->${r.name}` : r.name };
  });
  const typeOf = (n: string) => fn?.params.find((p) => p.name === n)?.type;
  const ret = c.ret[0];
  const gives = !ret || fn?.ret === 'void' ? '<span class="none">nothing (void)</span>'
    : c.ret.length > 1 ? `<span class="ty">${esc(fn?.ret ?? '')}</span> <b class="ret">{${c.ret.slice(1).map((r) => `${esc(r.name)}: ${esc(r.out ?? r.in)}`).join(', ')}}</b>`
    : `<span class="ty">${esc(fn?.ret ?? '')}</span> <b class="ret">${esc(ret.out ?? ret.in)}</b>`;
  const nChanged = rows.filter((r) => r.changed).length;
  // before | after, side by side; what changed is lit, what didn't is quiet
  const tr = (r: (typeof rows)[number]) => {
    const kind = r.changed ? 'chg' : r.out === undefined ? 'val' : 'same';
    const nm = `${r.depth ? '' : `<span class="ty">${esc(typeOf(r.name) ?? '')}</span> `}${esc(r.full)}`;
    const after = r.changed ? `<span class="arrow">➜</span><b>${esc(r.out ?? '')}</b><span class="tag">changed</span>`
      : r.out === undefined ? `<span class="note">${(typeOf(r.name) ?? '').includes('*') ? 'same address · what it points at is below' : 'a copy: the caller\'s own is untouched'}</span>`
      : `<span class="note">same</span>`;
    return `<tr class="${kind}${r.depth ? ' f' : ''}"><td class="n">${nm}</td><td class="b">${esc(r.in)}</td><td class="a">${after}</td></tr>`;
  };
  stageCard.innerHTML = `<div class="sc-title"><span class="t"><span class="fn">${esc(name(c.fn))}</span> <span class="k">is done and returns to</span> <span class="fn">${esc(name(c.caller))}</span></span></div>
    <div class="sc-gives"><span class="lbl">gives back</span> ${gives}</div>
    <table><thead><tr><th></th><th>before <span>(when called)</span></th><th>after <span>(now, at return)</span></th></tr></thead><tbody>
    ${rows.map(tr).join('') || '<tr><td class="n none" colspan="3">no arguments</td></tr>'}
    </tbody></table>
    <div class="sc-foot">${nChanged ? `${nChanged} value${nChanged === 1 ? '' : 's'} changed through its pointers` : 'nothing it could reach changed'}</div>`;
  stageCard.hidden = false;
}
