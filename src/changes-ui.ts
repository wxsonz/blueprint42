// "When did this change?" on the page (docs/OBJECTIVES.md, nice to have 1):
// a storage row's right-click menu asks; the timeline marks every change
// (playbar.ts); a chip beside it counts them and steps to the previous or next
// one, where the statement that did it is the one lit.
import { esc } from './dom';
import { changesOf } from './history';
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
