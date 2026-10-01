// The end report on the page (docs/OBJECTIVES.md, nice to have 2): when
// playback reaches the run's end, a card says how it ended and what it left
// behind; each row jumps to its step (the malloc, the moment a block was lost,
// the crash). Closed with ×, until the next run.
import { esc } from './dom';
import { endReport } from './report';
import { S, traceRevision, update } from './state';

let shown = '';
let closedFor = -1;

function card(): HTMLElement {
  let el = document.getElementById('end-report');
  if (!el) {
    el = document.createElement('div');
    el.id = 'end-report';
    el.hidden = true;
    document.getElementById('grid-wrap')!.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-at],[data-close]');
      if (!b) return;
      if (b.dataset.close !== undefined) return void ((closedFor = traceRevision), renderReport());
      update('reportJump', { pos: Number(b.dataset.at) + 0.9, playing: false, stepTarget: null });
    });
  }
  return el;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function renderReport(): void {
  const el = card();
  const t = S.trace;
  const atEnd = !!t && t.evs.length > 0 && S.pos >= t.evs.length - 1e-6 && closedFor !== traceRevision;
  const key = atEnd ? `${traceRevision}` : '';
  if (key === shown) return;
  shown = key;
  if (!atEnd || !t) return void (el.hidden = true);
  const r = endReport(t);
  const step = (at: number | null, text: string) => (at === null ? esc(text) : `<button class="link" data-at="${at}" title="Go to step ${at + 1}">${esc(text)}</button>`);
  const head =
    r.ended === 'crash' ? `crashed: ${esc(r.crash!.msg)}, at ${step(r.crash!.at, `line ${r.crash!.line + 1}`)}` :
    r.ended === 'error' ? `stopped: ${esc(r.crash!.msg)}, at ${step(r.crash!.at, `line ${r.crash!.line + 1}`)}` :
    r.ended === 'cut' ? 'cut short: the trace stopped before the end (a step or time limit)' :
    r.exit !== null ? `exited with ${esc(r.exit)}` : 'ran to the end';
  const rows = r.leaks.map((l) => `<li>${step(l.allocAt, `${l.name}: ${l.size} B`)} malloc'd in ${esc(l.site)}${l.lostAt !== null ? `, ${step(l.lostAt, `lost at step ${l.lostAt + 1}`)} (${esc(l.lostWhy ?? '')})` : ', still pointed at when the program ended'}</li>`).join('');
  const leaks = r.ended === 'exit' ? (r.leaks.length ? `<p class="bad">${plural(r.leaks.length, 'block')} never freed: ${r.bytes} B</p><ul>${rows}</ul>` : '<p class="ok">every block malloc\'d was freed</p>')
    : r.ended === 'crash' || r.ended === 'error' ? '<p class="k">no leak report: the program didn\'t get to exit</p>' : '';
  el.innerHTML = `<div class="er-title"><span>The run's end</span><button class="btn sm" data-close title="Close">×</button></div><div class="er-body"><p class="end">${head}</p>${t.engine === 'gdb' ? leaks : '<p class="k">the interpreter has no heap: leaks show under gdb</p>'}</div>`;
  el.hidden = false;
}
