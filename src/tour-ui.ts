// A guided tour on the page (docs/OBJECTIVES.md, nice to have 13): "▶ tour"
// by the speed when the sample has one; playing it pauses at each stop
// (main.ts's tick), frames the machine running there and shows its sentence
// in a card (next, end). A new run or another sample ends it.
import { esc } from './dom';
import { resolveTour } from './tour';
import { editor, S, toast, update } from './state';

export function renderTourButton(): void {
  let b = document.getElementById('tour-btn') as HTMLButtonElement | null;
  if (!b) {
    b = document.createElement('button');
    b.id = 'tour-btn';
    b.className = 'btn sm';
    b.textContent = '▶ tour';
    b.title = 'A guided tour of this sample: it plays, and pauses where there is something to see';
    b.addEventListener('click', startTour);
    document.querySelector('#playbar .tempo')?.prepend(b);
  }
  b.hidden = !!S.project || !S.sample.tour?.length || !S.trace;
}

function startTour(): void {
  const t = S.trace, m = S.model, stops = S.sample.tour;
  if (!t || !m || !stops?.length) return;
  const { steps, missed } = resolveTour(t, m, editor.state.doc.toString(), stops);
  if (missed.length) toast(`${missed.length} of the tour's stops aren't in this run (the code changed?): it goes without them`);
  if (!steps.length) return;
  update('tour', { tour: { steps, i: -1 }, pos: 0, playing: true, stepTarget: null });
  renderTourCard();
}

export function endTour(): void {
  if (!S.tour) return;
  update('tour', { tour: null });
  renderTourCard();
}

// the stop playback just crossed (main.ts pauses there), if any
export function tourStopIn(before: number, now: number): number | null {
  const tr = S.tour;
  const next = tr?.steps[tr.i + 1];
  if (!tr || !next || !(next.at > before + 1e-9 && next.at <= now)) return null;
  update('tour', { tour: { ...tr, i: tr.i + 1 } });
  renderTourCard();
  return next.at;
}

function renderTourCard(): void {
  let el = document.getElementById('tour');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tour';
    el.hidden = true;
    document.getElementById('grid-wrap')!.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
      if (!b) return;
      if (b.dataset.go === 'end') return endTour();
      update('tourNext', { playing: true });
    });
  }
  const tr = S.tour;
  const st = tr && tr.i >= 0 ? tr.steps[tr.i] : null;
  el.hidden = !tr;
  if (!tr) return;
  const last = tr.i === tr.steps.length - 1;
  el.innerHTML = st
    ? `<div class="tr-head"><span>tour ${tr.i + 1}/${tr.steps.length} · line ${st.line + 1} in ${esc(st.fn)}</span><button class="btn sm" data-go="end" title="End the tour">×</button></div><p>${esc(st.text)}</p><div class="tr-go">${last ? '<button class="btn sm" data-go="end">end the tour</button>' : '<button class="btn sm" data-go="next" title="Play on to the next stop">next ›</button>'}</div>`
    : `<div class="tr-head"><span>tour: playing to the first stop…</span><button class="btn sm" data-go="end" title="End the tour">×</button></div>`;
}
