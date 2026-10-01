// Test cases on the page (docs/OBJECTIVES.md, nice to have 3): under the run
// settings, the list of cases; "Run all" traces each under gdb (stdout as a
// pipe: its bytes exactly) and says pass, fail (where), crashed or cut short.
// A case's name opens it: its stdin, arguments and -D become the run's.
// A project keeps them in .blueprint42/run.json (written with the Save
// dialog); a single file, in this browser.
import { judge, type TestCase, type Verdict } from './cases';
import { renderCompare } from './changes-ui';
import { convertGdb } from './gdb';
import { divergence } from './history';
import { buildFiles } from './workspace';
import { $, esc, store } from './dom';
import { requestTrace } from './gdb';
import { gdbRequest } from './main';
import { projectSaveSoon, renderRunFields, runChanged, sampleRunChanged } from './project-ui';
import { saveSoon } from './sample-ui';
import { editor, S, toast, update, updateRun } from './state';

const results = new Map<string, Verdict | 'running'>(); // by the case's name and settings
const keyOf = (c: TestCase) => JSON.stringify([c.name, c.stdin, c.args, c.defines, c.expect ?? null]);
const casesNow = (): TestCase[] => (S.project ? S.project.run.cases ?? [] : S.cases);

function setCases(list: TestCase[]): void {
  if (S.project) (updateRun('cases', { cases: list }), projectSaveSoon());
  else (update('cases', { cases: list }), saveSoon());
  renderCases();
}

function box(): HTMLElement {
  let el = document.getElementById('cases');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cases';
    el.className = 'cases';
    $('run-row').after(el);
    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>('[data-act]');
      if (!b) return;
      const i = Number(b.dataset.i);
      const list = casesNow();
      if (b.dataset.act === 'add') addCase();
      else if (b.dataset.act === 'all') void runAll();
      else if (b.dataset.act === 'del') setCases(list.filter((_, k) => k !== i));
      else if (b.dataset.act === 'open') openCase(list[i]);
      else if (b.dataset.act === 'vs') void compareWith(list[i]);
    });
    el.addEventListener('change', (e) => {
      const t = e.target as HTMLTextAreaElement;
      if (t.dataset.expect === undefined) return;
      const i = Number(t.dataset.expect);
      const list = casesNow().map((c, k) => (k === i ? { ...c, ...(t.value ? { expect: t.value } : { expect: undefined }) } : c));
      setCases(list.map((c) => (c.expect === undefined ? (({ expect: _e, ...rest }) => rest)(c) : c)));
    });
  }
  return el;
}

// the run as it's set now, as a case; the output it printed as expected if it exited
function addCase(): void {
  const p = S.project;
  const run = p ? p.run : { stdin: S.stdin, args: S.args, defines: S.defines };
  const t = S.trace;
  const out = t && !t.error && !t.truncated && t.exit ? (t.outText ?? t.stdout ?? '').replace(/\r\n/g, '\n') : undefined;
  const list = casesNow();
  setCases([...list, { name: `case ${list.length + 1}`, stdin: run.stdin, args: [...run.args], defines: [...run.defines], ...(out !== undefined ? { expect: out } : {}) }]);
}

function openCase(c: TestCase): void {
  if (S.project) {
    updateRun('openCase', { stdin: c.stdin, args: [...c.args], defines: [...c.defines] });
    runChanged();
  } else sampleRunChanged(() => update('openCase', { stdin: c.stdin, args: [...c.args], defines: [...c.defines] }));
  renderRunFields(); // the fields show the case's settings
}

let running = false;
async function runAll(): Promise<void> {
  if (running || !S.model) return;
  running = true;
  const model = S.model;
  const src = editor.state.doc.toString();
  try {
    for (const c of casesNow()) {
      results.set(keyOf(c), 'running');
      renderCases();
      const r = await requestTrace(gdbRequest(src, model, c, false));
      results.set(keyOf(c), r === 'unavailable' ? { status: 'error', detail: 'gdb isn\'t available (the trace server runs with `npm run dev`)' }
        : !r.ok ? { status: 'error', detail: r.compile ? 'it doesn\'t compile' : r.error ?? 'the run failed' }
        : judge(c, { stdout: r.stdout, exit: r.exit, signal: r.signal, truncated: r.truncated }));
      renderCases();
    }
  } finally {
    running = false;
    renderCases();
  }
}

// Two runs side by side (nice to have 7): trace the case under gdb and find
// the first step it parts from the run on the page (history.ts divergence)
async function compareWith(c: TestCase): Promise<void> {
  const t = S.trace;
  if (!t || !S.model) return;
  if (t.engine !== 'gdb') return void toast('Compare needs this run under gdb: switch the engine to gdb and run it');
  // (a window of a long run doesn't start at step 1: the steps wouldn't line up)
  if (t.window && t.window.from > 0) return void toast('Compare starts from the run\'s first step: go back to the first window');
  if (t.truncated || t.window?.more) toast('This run is cut short here: they are compared as far as it goes');
  const model = S.model;
  const src = editor.state.doc.toString();
  toast(`Tracing ${c.name}…`);
  // traced like the page's run (stdout a terminal or a pipe changes what a program does)
  const r = await requestTrace(gdbRequest(src, model, c, store.get('stdout') !== 'pipe'));
  if (S.trace !== t) return; // a new run came in meanwhile
  if (r === 'unavailable') return void toast('gdb isn\'t available (the trace server runs with `npm run dev`)');
  if (!r.ok) return void toast(r.compile ? `${c.name} doesn't compile` : r.error ?? 'the run failed');
  const other = convertGdb({ ...r, stdinText: r.stdinText ?? c.stdin }, model, S.project ? buildFiles(S.project) : src);
  update('compare', { compare: { name: c.name, len: other.evs.length, div: divergence(t, other) } });
  renderCompare();
}

const MARK: Record<string, string> = { pass: '✓', fail: '✗', crash: '✗', cut: '…', error: '!', ran: '•', running: '…' };

export function renderCases(): void {
  const el = box();
  const list = casesNow();
  const rows = list.map((c, i) => {
    const v = results.get(keyOf(c));
    const st = v === undefined ? '' : v === 'running' ? 'running' : v.status;
    return `<li class="${st}"><span class="mark">${MARK[st] ?? '·'}</span>
      <button class="link" data-act="open" data-i="${i}" title="Make this the run: its stdin, arguments and -D">${esc(c.name)}</button>
      <span class="why">${v === undefined ? (c.expect === undefined ? 'no expected output' : 'not run yet') : v === 'running' ? 'running…' : esc(v.detail)}</span>
      <button class="btn sm" data-act="vs" data-i="${i}" title="Run it beside this run: the first step they part, and how">vs</button>
      <button class="btn sm" data-act="del" data-i="${i}" title="Remove this case">×</button>
      <details><summary>expected output</summary><textarea data-expect="${i}" rows="3" spellcheck="false" placeholder="what it should print (empty: only that it runs)">${esc(c.expect ?? '')}</textarea></details></li>`;
  }).join('');
  const done = list.map((c) => results.get(keyOf(c))).filter((v): v is Verdict => !!v && v !== 'running');
  const pass = done.filter((v) => v.status === 'pass' || v.status === 'ran').length;
  el.innerHTML = `<div class="cases-head"><b>Test cases</b>${done.length ? `<span class="sum">${pass}/${list.length} pass</span>` : ''}
    <button class="btn sm" data-act="add" title="This run's stdin, arguments and -D as a case (and its output as expected, if it exited)">+ this run</button>
    <button class="btn sm" data-act="all" ${running || !list.length ? 'disabled' : ''} title="Trace every case under gdb and compare its output">Run all</button></div>
    ${list.length ? `<ul>${rows}</ul>` : '<p class="none">none yet: set the run, then “+ this run”</p>'}`;
}
