// "When did this change?" on the page (docs/OBJECTIVES.md, nice to have 1):
// a storage row's right-click menu asks; the timeline marks every change
// (playbar.ts); a chip beside it counts them and steps to the previous or next
// one, where the statement that did it is the one lit.
import { esc } from './dom';
import { changesOf, explainValue, searchTrace } from './history';
import { S, timeline, toast, update } from './state';

function chip(): HTMLElement {
  let el = document.getElementById('changes');
  if (!el) {
    el = document.createElement('div');
    el.id = 'changes';
    el.className = 'changes';
    el.hidden = true;
    timeline.after(el);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (!b) return;
      if (b.dataset.go === 'close') return void (update('hideChanges', { changes: null }), renderChanges());
      jumpChange(b.dataset.go === 'next' ? 1 : -1);
    });
  }
  return el;
}

export function showChanges(fn: string, name: string): void {
  const t = S.trace;
  if (!t) return;
  const list = changesOf(t, { fn, name });
  update('showChanges', { changes: { label: `${name} (${fn})`, list } });
  renderChanges();
  if (!list.length) toast(`${name} never changes in this run`);
}

// play to the change: near the end of the event that made it, so its
// statement is lit and the new value has landed
export function jumpChange(dir: 1 | -1): void {
  const list = S.changes?.list ?? [];
  if (!list.length) return;
  const now = S.pos;
  const c = dir > 0 ? list.find((x) => x.at + 0.9 > now + 1e-6) : [...list].reverse().find((x) => x.at + 0.9 < now - 1e-6);
  if (!c) return;
  update('jumpChange', { pos: c.at + 0.9, playing: false, stepTarget: null });
  renderChanges();
}

let shown = '';
export function renderChanges(): void {
  const el = chip();
  const ch = S.changes;
  if (!ch) return void ((el.hidden = true), (shown = ''));
  const k = ch.list.filter((x) => x.at + 0.9 <= S.pos + 1e-6).length;
  // (called every frame with the playbar: only a new count rewrites it)
  const key = `${ch.label}|${k}|${ch.list.length}`;
  if (key === shown && !el.hidden) return;
  shown = key;
  el.hidden = false;
  el.innerHTML = `<span class="what">${esc(ch.label)}</span><span class="n">${ch.list.length ? `${k}/${ch.list.length} changes` : 'never changes'}</span>
    <button class="btn sm" data-go="prev" title="The change before">‹</button><button class="btn sm" data-go="next" title="The next change">›</button><button class="btn sm" data-go="close" title="Stop marking it">×</button>`;
}

// "Why is this value what it is?" (nice to have 4): a card where the row was
// clicked, from explainValue, with the step it points at.
export function showExplain(fn: string, name: string, x: number, y: number): void {
  const t = S.trace;
  if (!t) return;
  const ex = explainValue(t, S.pos, fn, name);
  if (!ex) return;
  let el = document.getElementById('explain');
  if (!el) {
    el = document.createElement('div');
    el.id = 'explain';
    document.getElementById('grid-wrap')!.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-at],[data-close]');
      if (!b) return;
      if (b.dataset.close !== undefined) return void (el!.hidden = true);
      update('explainJump', { pos: Number(b.dataset.at) + 0.9, playing: false, stepTarget: null });
    });
  }
  const wrap = document.getElementById('grid-wrap')!.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x - wrap.left, wrap.width - 380))}px`;
  el.style.top = `${Math.max(8, Math.min(y - wrap.top + 12, wrap.height - 160))}px`;
  el.className = ex.what;
  el.innerHTML = `<div class="ex-title"><span>${esc(name)} in ${esc(fn)}</span><button class="btn sm" data-close title="Close">×</button></div>
    <p>${esc(ex.text)}</p>${ex.at !== null ? `<button class="link" data-at="${ex.at}">go to step ${ex.at + 1}${ex.line !== null ? ` (line ${ex.line + 1})` : ''}</button>` : ''}`;
  el.hidden = false;
}

// Search the trace (nice to have 5): a box after the timeline. Enter goes to
// the next match, Shift+Enter the one before, Escape clears; matches are
// marked on the timeline (playbar.ts).
export function initSearch(): void {
  const input = document.createElement('input');
  input.id = 'trace-search';
  input.placeholder = 'search: i == 3, a function, line 52, malloc…';
  input.spellcheck = false;
  input.title = 'Search the trace: a condition (i == 3, p == NULL: where it becomes true), a function (its calls), line 52, malloc, free, write, read. Enter: next, Shift+Enter: previous, Esc: clear';
  const note = document.createElement('span');
  note.id = 'trace-search-note';
  timeline.after(input, note);
  const run = () => {
    const t = S.trace;
    const q = input.value.trim();
    if (!t || !q) return void (update('search', { search: null }), (note.textContent = ''));
    const r = searchTrace(t, S.model?.fns.map((f) => f.name) ?? [], q);
    update('search', { search: { query: q, at: r.at, note: r.note } });
    note.textContent = r.note;
  };
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing here isn't the player's keys
    if (e.key === 'Escape') return void ((input.value = ''), run(), input.blur());
    if (e.key !== 'Enter') return;
    const at = S.search?.at ?? [];
    const now = S.pos;
    const i = e.shiftKey ? [...at].reverse().find((x) => x + 0.9 < now - 1e-6) : at.find((x) => x + 0.9 > now + 1e-6);
    if (i !== undefined) update('searchJump', { pos: i + 0.9, playing: false, stepTarget: null });
  });
}

// a new trace: the search runs again on it
export function searchAgain(): void {
  const input = document.getElementById('trace-search') as HTMLInputElement | null;
  if (input?.value.trim()) input.dispatchEvent(new Event('input'));
}

// "Pause here when…": a small field where the statement was clicked; Enter
// sets the breakpoint's condition (`len > cap`, `p == NULL`), empty: always
export function askCondition(fn: string, line: number, x: number, y: number): void {
  let el = document.getElementById('bp-cond') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'bp-cond';
    document.getElementById('grid-wrap')!.appendChild(el);
  }
  const wrap = document.getElementById('grid-wrap')!.getBoundingClientRect();
  el.style.left = `${Math.max(8, Math.min(x - wrap.left, wrap.width - 300))}px`;
  el.style.top = `${Math.max(8, y - wrap.top + 10)}px`;
  const now = S.breaks.find((b) => b.fn === fn && b.line === line);
  el.innerHTML = `<label>pause at line ${line + 1} when <input spellcheck="false" placeholder="len > cap   (empty: always)" value="${esc(now?.cond ?? '')}"></label><span class="err" hidden></span>`;
  el.hidden = false;
  const input = el.querySelector('input')!;
  const err = el.querySelector<HTMLElement>('.err')!;
  input.focus();
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') return void (el!.hidden = true);
    if (e.key !== 'Enter') return;
    const cond = input.value.trim() || null;
    if (cond && !/^\s*[A-Za-z_]\w*\s*(==|!=|<=|>=|<|>)\s*(-?\d+|NULL|[A-Za-z_]\w*)\s*$/.test(cond)) {
      err.hidden = false;
      err.textContent = 'a variable, ==, !=, <, <=, >, >=, then a number, NULL or a variable';
      return;
    }
    update('break', { breaks: [...S.breaks.filter((b) => !(b.fn === fn && b.line === line)), { fn, line, cond }] });
    el!.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => (el!.hidden = true), 150));
}
