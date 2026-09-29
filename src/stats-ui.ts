// Nerd stats: what a gdb session is doing under the hood. The windows of
// steps the page holds (their size and how they were fetched), the server's
// savepoints (where, and their real memory), how fast the tracer went, and
// the page's own memory. Opened from the step-window banner.
import { esc } from './dom';
import { session, refreshInfo, windowSize } from './session';
import { S } from './state';

let timer = 0;

const n = (x: number) => x.toLocaleString('en-US');
const kb = (bytes: number) => (bytes >= 1 << 20 ? `${(bytes / (1 << 20)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const rate = (steps: number, ms: number) => (ms > 0 && steps > 0 ? `${n(Math.round((steps * 1000) / ms))} steps/s` : '—');
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
};

function el(): HTMLElement {
  let box = document.getElementById('stats-panel');
  if (!box) {
    box = document.createElement('div');
    box.id = 'stats-panel';
    box.className = 'stats-panel';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Trace stats');
    box.hidden = true;
    document.body.appendChild(box);
    box.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close]')) toggleStats(false);
    });
  }
  return box;
}

// The panel opens out of the step banner: right under it, left-aligned, as
// one piece (it falls back to the top right when the banner isn't there).
function anchor(box: HTMLElement): void {
  const banner = document.querySelector('.winnav')?.closest<HTMLElement>('.alert');
  box.classList.toggle('attached', !!banner);
  banner?.classList.add('stats-open');
  if (!banner) {
    box.style.left = box.style.top = box.style.width = '';
    return;
  }
  const r = banner.getBoundingClientRect();
  const width = Math.min(Math.max(r.width, 600), window.innerWidth - r.left - 16);
  box.style.left = `${r.left}px`;
  box.style.top = `${r.bottom - 1}px`;
  box.style.width = `${width}px`;
  banner.style.minWidth = `${width}px`; // the banner widens to meet it
}

function render(): void {
  const box = el();
  anchor(box);
  const w = S.trace?.window;
  const info = session.info;
  const size = windowSize();
  // the playback position as a step of the whole run
  let step: number | null = null;
  if (w && S.trace) {
    step = w.from;
    const end = Math.min(Math.floor(S.pos), S.trace.evs.length);
    for (let i = 0; i < end; i++) if (S.trace.evs[i].k === 'step') step++;
  }
  const windows = [...session.windows.values()].sort((a, b) => a.from - b.from);
  const spKb = info ? Object.values(info.kb).reduce<number>((a, x) => a + (x ?? 0), 0) : 0;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  box.innerHTML = `
    <header><b>Trace stats</b><button class="btn sm" data-close aria-label="Close">✕</button></header>
    ${!session.id ? '<p class="dim">No gdb session: this program runs in the interpreter, or hasn\'t run yet.</p>' : `
    <section><h4>Now</h4><dl>
      <dt>step</dt><dd>${step !== null ? n(step) : '—'}${w ? ` <span class="dim">(window ${n(w.from)}–${n(w.to)})</span>` : ''}</dd>
      <dt>run length</dt><dd>${info?.total != null ? `${n(info.total)} steps (it ended)` : w?.total != null ? `${n(w.total)} steps (it ended)` : `not ended yet${info?.at != null ? `, reached ${n(info.at)}` : ''}`}</dd>
      <dt>window size</dt><dd>${n(size)} steps</dd>
    </dl></section>
    <section><h4>Savepoints <span class="dim">on the server, every ${n(info?.every ?? 20000)} steps</span></h4>
      ${info ? `<p>${info.savepoints.length} saved, ${kb(spKb * 1024)} of real memory (pages not shared with the running program)</p>
      <div class="chips">${info.savepoints.map((s) => `<span class="chip" title="${info.kb[String(s)] != null ? `${info.kb[String(s)]} KB` : ''}">${n(s)}${info.kb[String(s)] != null ? ` · ${info.kb[String(s)]} KB` : ''}</span>`).join('')}</div>` : '<p class="dim">…</p>'}
    </section>
    <section><h4>Windows in this page <span class="dim">(last ${windows.length}, cached)</span></h4>
      <table><thead><tr><th>steps</th><th>size</th><th>fetch</th><th>started from</th><th>skipped</th><th>recorded</th></tr></thead><tbody>
      ${windows.map((x) => {
        const st = x.stats;
        const cur = w && x.from === w.from;
        return `<tr${cur ? ' class="cur"' : ''}><td>${n(x.from)}–${n(x.to)}</td><td>${kb(x.bytes)}</td><td>${n(x.ms)} ms</td><td>${st ? (st.start === 'here' ? 'where it was' : st.start === 'rerun' ? 'main (restarted)' : `savepoint ${n(st.start)}`) : '—'}</td><td>${st ? `${n(st.silentSteps)} in ${n(st.silentMs)} ms <span class="dim">${rate(st.silentSteps, st.silentMs)}</span>` : '—'}</td><td>${st ? `${n(st.recorded)} in ${n(st.recordMs)} ms <span class="dim">${rate(st.recorded, st.recordMs)}</span>` : '—'}</td></tr>`;
      }).join('')}
      </tbody></table>
    </section>
    <section><h4>Totals</h4><dl>
      <dt>session</dt><dd>${esc(session.id.slice(0, 8))} · opened ${ago(session.openedAt)} in ${n(session.openMs)} ms</dd>
      <dt>fetched</dt><dd>${n(session.fetches)} window${session.fetches === 1 ? '' : 's'}, ${kb(session.bytesTotal)} of trace JSON</dd>
      <dt>this window</dt><dd>${S.trace ? `${n(S.trace.evs.length)} events, ${n(S.trace.snaps.length)} snapshots` : '—'}</dd>
      <dt>page memory</dt><dd>${heap ? kb(heap) : '<span class="dim">not reported by this browser</span>'}</dd>
    </dl></section>`}`;
}

export function statsOpen(): boolean {
  return document.getElementById('stats-panel')?.hidden === false;
}

export function toggleStats(open?: boolean): void {
  const box = el();
  box.hidden = open === undefined ? !box.hidden : !open;
  clearInterval(timer);
  const banner = document.querySelector('.winnav')?.closest<HTMLElement>('.alert');
  const btn = document.querySelector<HTMLButtonElement>('button[data-win="stats"]');
  if (btn) btn.textContent = box.hidden ? 'Stats ▾' : 'Stats ▴';
  if (box.hidden) {
    banner?.classList.remove('stats-open');
    if (banner) banner.style.minWidth = '';
    return;
  }
  render();
  void refreshInfo().then(render);
  timer = window.setInterval(() => {
    if (box.hidden) return clearInterval(timer);
    void refreshInfo().then(render);
  }, 1500);
}

// the banner is rebuilt with the alerts and moves with the layout: keep up
export function reanchorStats(): void {
  if (statsOpen()) anchor(el());
}
window.addEventListener('resize', reanchorStats);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('stats-panel')?.hidden === false) toggleStats(false);
});
