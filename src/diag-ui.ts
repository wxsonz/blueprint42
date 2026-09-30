// The diagnostics panel (dev builds): what a frame costs and what went wrong,
// without a script. Time in each paint pass and each skin hook, canvas calls
// by kind, the text memos' hit rates, the frame rate, hook errors and failed
// trace checks. Opened from the top bar's "diag" button; the profiler runs
// only while it's open. `__ftb.diag()` returns the same numbers.
import { esc } from './dom';
import { countCalls, diagReport, prof, profReset } from './diag';
import type { GridView } from './render';

let timer = 0;

export function diagOn(view: GridView, on: boolean): void {
  prof.on = on;
  profReset();
  countCalls(on ? view.g : null);
}

export function initDiagPanel(view: GridView): void {
  const bar = document.getElementById('btn-help')?.parentElement;
  if (!bar) return;
  const btn = document.createElement('button');
  btn.id = 'btn-diag';
  btn.className = 'btn';
  btn.textContent = 'diag';
  btn.title = 'Diagnostics (dev): what a frame costs, and what went wrong';
  bar.insertBefore(btn, document.getElementById('btn-help'));
  const box = document.createElement('div');
  box.id = 'diag-panel';
  box.className = 'stats-panel';
  box.hidden = true;
  document.body.appendChild(box);
  const render = () => {
    const r = diagReport();
    const rows = (o: Record<string, number>, unit: string) => Object.entries(o).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}${unit}</td></tr>`).join('') || '<tr><td>—</td></tr>';
    box.innerHTML = `<div class="head"><b>Diagnostics</b><span>${r.frames} frames, ${r.fps} a second</span><button class="btn sm" data-copy>copy JSON</button><button class="btn sm" data-close>×</button></div>
      <div class="cols">
        <section><h4>paint passes (ms a frame)</h4><table>${rows(r.passMs, '')}</table></section>
        <section><h4>skin hooks (ms a frame)</h4><table>${r.hooks.map((h) => `<tr><td>${esc(h.hook)} ×${h.perFrame}</td><td class="n">${h.ms}</td></tr>`).join('') || '<tr><td>—</td></tr>'}</table></section>
        <section><h4>canvas calls (a frame)</h4><table>${rows(r.canvasCalls, '')}</table></section>
        <section><h4>text memos (hits)</h4><table><tr><td>fits</td><td class="n">${esc(r.memo.fitText)}</td></tr><tr><td>widths</td><td class="n">${esc(r.memo.widths)}</td></tr></table>
          <h4>hook errors</h4>${r.errors.length ? `<ul>${r.errors.map((e) => `<li><b>${esc(e.where)}</b> ×${e.count}: ${esc(e.message)}<br><small>${esc(e.given)}</small></li>`).join('')}</ul>` : '<p>none</p>'}
          <h4>trace checks</h4>${r.checks.length ? `<ul>${r.checks.map((c) => `<li><b>${esc(c.check)}</b>${c.at !== null ? ` at event ${c.at}` : ''}: ${esc(c.detail)}</li>`).join('')}</ul>` : '<p>all passed</p>'}</section>
      </div>`;
  };
  const open = (on: boolean) => {
    box.hidden = !on;
    btn.setAttribute('aria-pressed', String(on));
    diagOn(view, on);
    clearInterval(timer);
    if (on) (render(), (timer = window.setInterval(render, 500)));
  };
  btn.addEventListener('click', () => open(box.hidden === true));
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-close]')) open(false);
    if (t.closest('[data-copy]')) void navigator.clipboard?.writeText(JSON.stringify(diagReport(), null, 2));
  });
}
