// Notes on the timeline on the page (docs/OBJECTIVES.md, nice to have 9):
// right-click the timeline to pin a note to that step; each one is a flag on
// the timeline (playbar.ts) and a row in the list under the test cases (a
// jump, the text, ×). A note whose step isn't where it was any more (an edit,
// another input) says so and doesn't jump.
import { esc } from './dom';
import { noteAt, noteHolds, type Note } from './notes';
import { projectSaveSoon } from './project-ui';
import { saveSoon } from './sample-ui';
import { S, traceRevision, update, updateRun } from './state';

export const notesNow = (): Note[] => (S.project ? S.project.run.notes ?? [] : S.notes);

function setNotes(list: Note[]): void {
  const sorted = [...list].sort((a, b) => a.at - b.at);
  if (S.project) (updateRun('notes', { notes: sorted }), projectSaveSoon());
  else (update('notes', { notes: sorted }), saveSoon());
  renderNotes();
}

function box(): HTMLElement {
  let el = document.getElementById('notes');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notes';
    el.className = 'cases notes';
    (document.getElementById('cases') ?? document.getElementById('run-row')!).after(el);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      const i = Number(b.dataset.i);
      const list = notesNow();
      if (b.dataset.act === 'del') setNotes(list.filter((_, k) => k !== i));
      else if (b.dataset.act === 'go') update('noteJump', { pos: list[i].at + 0.9, playing: false, stepTarget: null });
    });
  }
  return el;
}

let shown = '';
export function renderNotes(): void {
  const el = box();
  const list = notesNow();
  const t = S.trace;
  const key = JSON.stringify([traceRevision, list]);
  if (key === shown) return;
  shown = key;
  el.hidden = !list.length;
  const where = (n: Note) => `line ${n.line + 1}${n.fn ? ` in ${n.fn}` : ''}`;
  el.innerHTML = `<div class="cases-head"><b>Notes</b><span class="sum">right-click the timeline to add one</span></div><ul>${list.map((n, i) => {
    const holds = t ? noteHolds(t, n) : null;
    const go = holds ? `<button class="link" data-act="go" data-i="${i}" title="Go to step ${n.at + 1}">step ${n.at + 1}</button>` : `<span class="k">step ${n.at + 1}</span>`;
    const why = holds === false ? ` <span class="why">(it was at ${esc(where(n))}: this run is somewhere else at that step now)</span>` : holds === null && t ? ' <span class="why">(this run ends before it)</span>' : '';
    return `<li class="${holds ? '' : 'stale'}"><span class="mark">⚑</span>${go}<span class="why">${esc(n.text)}${why}</span><button class="btn sm" data-act="del" data-i="${i}" title="Remove this note">×</button></li>`;
  }).join('')}</ul>`;
}

// the input, where the timeline was right-clicked
export function askNote(at: number, x: number, y: number): void {
  const t = S.trace;
  if (!t || at < 0 || at >= t.evs.length) return;
  let el = document.getElementById('note-ask');
  if (!el) {
    el = document.createElement('div');
    el.id = 'note-ask';
    el.className = 'popup-input';
    document.body.appendChild(el);
  }
  el.style.left = `${Math.max(8, Math.min(x, innerWidth - 340))}px`;
  el.style.top = `${Math.max(8, y - 48)}px`;
  const now = notesNow().find((n) => n.at === at);
  el.innerHTML = `<label>note at step ${at + 1} <input spellcheck="false" maxlength="500" placeholder="the bug starts here" value="${esc(now?.text ?? '')}"></label>`;
  el.hidden = false;
  const input = el.querySelector('input')!;
  input.focus();
  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing here isn't the player's keys
    if (e.key === 'Escape') return void (el!.hidden = true);
    if (e.key !== 'Enter') return;
    const text = input.value.trim();
    const rest = notesNow().filter((n) => n.at !== at);
    setNotes(text ? [...rest, noteAt(t, at, text)] : rest);
    el!.hidden = true;
  });
  input.addEventListener('blur', () => setTimeout(() => (el!.hidden = true), 150));
}
