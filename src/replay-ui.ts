// The replay on the page (docs/OBJECTIVES.md, nice to have 10): a button by
// the speed exports this run as one HTML file; a page that is a replay boots
// from it (main.ts) instead of running anything.
import { $, esc } from './dom';
import { setReadOnly } from './editor';
import { makeReplay, type readReplay, withReplay } from './replay';
import { currentSaved, loadSample } from './sample-ui';
import { editor, S, toast, update } from './state';

export function initReplayButton(): void {
  if (S.replay) return;
  const b = document.createElement('button');
  b.id = 'export-replay';
  b.className = 'btn sm';
  b.textContent = '⤓ replay';
  b.title = 'Save this run as one HTML file that plays it anywhere: no server, no gdb (it shows this run as recorded, it doesn\'t run the code again)';
  b.addEventListener('click', () => void exportReplay());
  document.querySelector('#playbar .tempo')?.appendChild(b);
}

async function exportReplay(): Promise<void> {
  const t = S.trace;
  if (S.project) return void toast('A replay is made from a single file or a sample for now: a project isn\'t exported yet');
  if (!t) return void toast('Nothing to export: there is no run yet');
  toast('Building the replay player… (the first time takes a little while)');
  let player: string;
  try {
    const res = await fetch('/api/replay/player', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ftb': '1' }, body: '{}' });
    const j = (await res.json()) as { ok: boolean; html?: string; error?: string };
    if (!j.ok || !j.html) throw new Error(j.error ?? 'no player');
    player = j.html;
  } catch (e) {
    return void toast(`The replay player needs the trace server (npm run dev or npm run preview): ${String(e).slice(0, 160)}`);
  }
  const title = S.sample.file;
  const html = withReplay(player, makeReplay({ title, made: new Date().toISOString(), sample: S.sample.key, saved: currentSaved(), skin: S.skin.id, pos: S.pos }, t));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = `${title.replace(/\.[ch]$/, '')}-replay.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  toast(`Saved ${a.download} (${(html.length / 1e6).toFixed(1)} MB)`);
}

// boot from a replay: its sample with its code, layout and trace, read-only
export function startReplay(r: NonNullable<ReturnType<typeof readReplay>>): void {
  update('replay', { replay: { title: r.title, made: r.made, trace: r.run } });
  loadSample(r.sample, false, r.saved);
  setReadOnly(editor);
  // what would run something (or open other code) isn't here: this is a recording
  document.documentElement.dataset.replay = '';
  $<HTMLTextAreaElement>('stdin').readOnly = true;
  update('replay', { pos: Math.min(r.pos, r.run.evs.length), playing: false });
  $('file-name').innerHTML = `${esc(r.title)} <span class="replay-tag" title="Recorded ${esc(r.made)}: this page plays that run, it doesn't run the code">replay</span>`;
}
