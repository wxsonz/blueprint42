import { diagReport, reportCheck } from './diag';
import { askNote, renderNotes } from './notes-ui';
import { readReplay } from './replay';
import { renderMinimap } from './minimap';
import { weightOf } from './skins/weight';
import { initReplayButton, startReplay } from './replay-ui';
import { askCondition, initSearch, renderChanges, renderCompare, searchAgain, showChanges, showExplain } from './changes-ui';
import { breakHits } from './history';
import { validateTrace } from './validate';
import { diagOn, initDiagPanel } from './diag-ui';
import { reportHookError } from './diag';
import { setGlassTint } from './gfx/scenes/ps2';
import { renderLegend } from './legend';
import { beatStarts } from './beats';
import { machineSize } from './machine';
import { connectLive } from './live';
import { Vim } from '@replit/codemirror-vim';
import { createEditor, setNormMarks, setVim, type EditorHooks } from './editor';
import { evaluateInterpreterBindings, run, type Ev, type Trace } from './interp';
import type { Sprite, SpriteKind } from './blueprint';
import { folded, shut } from './layout';
import { convertGdb, type GdbRequest, type GResult } from './gdb';
import { initGfxButton } from './gfx/ui';
import { closeSession, onLoading, prefetch, session, traceWindow, WINDOW_MAX, windowSize } from './session';
import { toggleStats } from './stats-ui';
import { initParser, parse, textOf, unitTree, type Model } from './parse';
import { normMarks } from './norm';
import { animMode, prepareStage, computeBelts, durationAt, frameAt, setAnimMode, spriteWorldRect, staged, type AnimMode, type Entity } from './playback';
import { activeHostRect, entityAt, foldAt, stationAt, machineHeadAt, stageRect, slotAt } from './hit';
import { SAMPLE_PROJECTS } from './samples';
import { buildFiles, fsCall, isDirty, isSource, projectModel, splitArgs } from './workspace';
import { SKINS, SKIN_FONTS, SKIN_GROUPS, isWip, otherMode } from './skins';
import type { IconKind, Skin } from './skins/types';
import { $, esc, store } from './dom';
import { LEGEND, S, alerts, canvas, debounce, editor, gridPane, inspector, layout, loadingSample, menu, modelRevision, overlay, setDebounce, setEditor, setLastInspectorKey, setLastPbKey, setModelRevision, setTraceRevision, timeline, toast, traceRevision, view, update, updateRun } from './state';
import { renderDuel, renderFeed, renderStageCard } from './feed';
import { paintPage, setUiZoom, stepUiZoom, ui } from './page';
import { renderAlerts, renderDock, renderInspector, renderLiveStatus, renderSampleTabs, renderStatus, renderTestsMenu, violations } from './panels';
import { renderPlaybar } from './playbar';
import { dirtyFiles, liveFrom, onLive, openAt, openFolder, openFolderDialog, openSaveDialog, quickOpen, refreshMeta, renderLive, renderProjectChrome, runChanged, sampleRunChanged, setLiveEditors, switchFile, toggleExplorer, writeProjectBackup } from './project-ui';
import { bindingsChanged, exportBlueprint, importBlueprint, loadSample, revertSample, saveSoon, setAllShut, tidy, toggleShut } from './sample-ui';
import './styles/base.css';
import './styles/amp.css';
import './styles/classic.css';
import './styles/aqua.css';
import './styles/minimal.css';
import './styles/minimal-light.css';
import './styles/barebone.css';
import './styles/barebone-light.css';
import './styles/metro-light.css';
import './styles/bigsur-dark.css';
import './styles/tahoe-dark.css';
import './styles/blueprint.css';
import './styles/factory.css';
import './styles/gameboy.css';
import './styles/synthwave.css';
import './styles/xp.css';
import './styles/seven.css';
import './styles/metro.css';
import './styles/system7.css';
import './styles/platinum.css';
import './styles/leopard.css';
import './styles/yosemite.css';
import './styles/bigsur.css';
import './styles/tahoe.css';
import './styles/ps1.css';
import './styles/ps2.css';
import './styles/ps3.css';
import './styles/ps4.css';
import './styles/ps5.css';
import './styles/wii.css';
import './styles/wii-dark.css';
import './styles/gamecube.css';
import './styles/switch.css';
import './styles/switch-dark.css';

// ---------------- state ----------------
// S, the layout and the DOM handles live in state.ts.
const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 12, 20];
const FOCUS_MAX = 1.5; // focus scenes never play faster than this, whatever the speed

function renderAnimMode(): void {
  document.querySelectorAll<HTMLButtonElement>('#anim-mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === animMode())));
}

function setMode(m: AnimMode): void {
  // keep the same event on screen: positions are in events, only durations change
  setAnimMode(m);
  store.set('anim', m);
  lastFollowEv = -1;
  renderAnimMode();
  showSpeed();
  toast(m === 'focus' ? 'Focus: calls and returns are staged — the rest dims, the data travels 2–3 times' : 'Fast: every step once, the camera only pans');
}

// Long real traces pick a speed that plays them in about two minutes (at most 3×).
function autoSpeed(trace: Trace): void {
  const total = trace.evs.reduce((a, e, i) => a + durationAt(trace, S.model, i) / (staged(e) ? Math.min(S.speed, FOCUS_MAX) : 1), 0);
  // statements animate inside the machines: never so fast they can't be followed
  update('autoSpeed', { speed: SPEEDS.find((sp) => total / sp <= 120 || sp >= 3) ?? 3 });
  showSpeed();
}

// ---- speed: − and +, a click opens presets and a field, the wheel changes it ----
const SPEED_MIN = 0.1;
const SPEED_MAX = 50;
const fmtSpeed = (v: number) => `${Number(v.toFixed(2))}×`;

function showSpeed(): void {
  const read = $('pb-speed');
  read.textContent = fmtSpeed(S.speed);
  // Focus stages calls and returns at no more than FOCUS_MAX: say so
  const capped = animMode() === 'focus' && S.speed > FOCUS_MAX;
  read.classList.toggle('capped', capped);
  read.title = capped ? `${fmtSpeed(S.speed)}; Focus stages calls, returns and pointer writes at ${fmtSpeed(FOCUS_MAX)} at most` : 'Speed: click to pick or type one, scroll to change';
  if (!$('speed-menu').hidden) renderSpeedMenu();
}

function setSpeedTo(v: number): void {
  if (!Number.isFinite(v)) return;
  update('setSpeedTo', { speed: Math.max(SPEED_MIN, Math.min(SPEED_MAX, Math.round(v * 100) / 100)) });
  showSpeed();
}

function renderSpeedMenu(): void {
  const box = $('speed-menu');
  box.innerHTML = `<div class="grid">${SPEEDS.map((v) => `<button role="menuitemradio" data-speed="${v}" aria-checked="${v === S.speed}">${fmtSpeed(v)}</button>`).join('')}</div>
    <label>or type <input id="speed-typed" type="number" min="${SPEED_MIN}" max="${SPEED_MAX}" step="0.25" value="${S.speed}"> ×</label>
    <div class="note">Scroll over the speed to change it. Focus stages calls and returns at ${fmtSpeed(FOCUS_MAX)} at most.</div>`;
}

function toggleSpeedMenu(open = $('speed-menu').hidden): void {
  const box = $('speed-menu');
  box.hidden = !open;
  $('pb-speed').setAttribute('aria-expanded', String(open));
  if (open) renderSpeedMenu();
}

// the skin picker's light / medium / heavy (src/skins/weight.ts)
function weightBadge(id: string): string {
  const w = weightOf(id);
  return w ? ` <span class="wt ${w.cls}" title="${esc(w.title)}">${w.cls}</span>` : '';
}

// ---------------- analysis ----------------
// The buffer (a sample) or every file of the open project.
export function currentSrc(): string {
  return editor.state.doc.toString();
}

// The Norm's marks in the editor: the file it shows, as last parsed (a file
// that isn't C, or whose parse is older than the text, gets none)
export function renderNormMarks(): void {
  const p = S.project;
  const tree = p ? (/\.[ch]$/.test(p.active) ? unitTree(p.active) : null) : S.model?.tree ?? null;
  const text = editor.state.doc.toString();
  const marks = tree && textOf(tree) === text ? normMarks(tree, text) : [];
  editor.dispatch({ effects: setNormMarks.of(marks) });
}

export function analyze(src: string, fresh: boolean): void {
  const model = S.project ? projectModel(S.project) : parse(src);
  setModelRevision(modelRevision + 1);
  if (fresh) layout.reset();
  // an open machine whose code changed size: make room again
  // a machine is as big as its code: when an edit resizes one, make room again
  const sizes = (m: Model | null) => (m ? m.fns.map((f) => `${f.name}:${JSON.stringify(machineSize(f))}`).join('|') : '');
  const before = sizes(S.model);
  const renamed = layout.sync(model);
  if (S.model && sizes(model) !== before) layout.reflow(model);
  if (renamed.size) {
    for (const sprite of S.sprites) if (sprite.binding?.scope === 'fn' && sprite.binding.fn) {
      const next = renamed.get(`func:${sprite.binding.fn}`);
      if (next?.startsWith('func:')) sprite.binding.fn = next.slice(5);
    }
    saveSoon();
  }
  const sel = S.selected;
  if (sel?.k === 'node' && renamed.has(sel.id)) update('parsed', { selected: { k: 'node', id: renamed.get(sel.id)! } }); // a renamed function stays selected
  if (sel?.k === 'node' && !layout.nodes.has((S.selected as { id: string }).id)) update('parsed', { selected: null });
  update('parsed', { model });
  renderNormMarks();
  const engine = engineFor(model);
  cancelGdb();
  if (S.replay) applyTrace(S.replay.trace, fresh); // (the run it recorded: no engine runs here)
  else if (engine === 'interp') {
    applyTrace(evaluateInterpreterBindings(run(model), S.sprites), fresh);
    if (fresh) autoSpeed(S.trace!);
  }
  else {
    applyTrace(null, fresh);
    if (engine === 'gdb') startGdb(src, model, fresh);
  }
  renderAlerts();
  renderStatus();
  if (fresh) {
    view.resize();
    view.home(S, true);
  }
}

// The run goes on past this window: start tracing the next one now, so
// playback carries on into it instead of stopping at the edge.
function prefetchNext(): void {
  const w = S.trace?.window;
  if (w?.more) prefetch(w.to);
}

// Another stretch of the run (gdb sessions): fetch the window that holds step
// `step` (from the page's cache, or the session), and put playback on it.
let windowLoading = false;
export async function loadWindow(step: number, play_ = false): Promise<void> {
  const model = S.model;
  if (!model || !session.id || windowLoading) return;
  const size = windowSize();
  const total = S.trace?.window?.total ?? null;
  const target = Math.max(0, total !== null ? Math.min(step, total) : step);
  const from = Math.floor(target / size) * size;
  windowLoading = true;
  update('loadWindow', { gdb: { status: 'running' } });
  renderAlerts();
  try {
    const r = await traceWindow(JSON.parse(session.key), from);
    if (S.model !== model) return;
    if (r === 'unavailable' || !r.ok) {
      toast(r === 'unavailable' ? 'the trace server is not running' : `window ${from}: ${r.error ?? 'failed'}`);
      update('loadWindow', { gdb: { status: 'done' } });
      return;
    }
    update('loadWindow', { gdb: { status: 'done', ms: r.ms } });
    if (r.window && r.window.to < from && !r.truncated) {
      // the run ended before that step: show its last window instead
      toast(`the run ends at step ${r.window.to.toLocaleString('en-US')}`);
      windowLoading = false;
      return loadWindow(r.window.to, play_);
    }
    const p = S.project;
    applyTrace(convertGdb({ ...r, stdinText: r.stdinText ?? (p ? p.run.stdin : S.stdin) }, model, p ? buildFiles(p) : editor.state.doc.toString()), true);
    prefetchNext();
    // the event where step `target` is: each 'step' event is one step of the run
    let n = from;
    const evs = S.trace!.evs;
    let i = 0;
    for (; i < evs.length && n < target; i++) if (evs[i].k === 'step') n++;
    update('loadWindow', { pos: i });
    if (play_) update('loadWindow', { playing: true });
  } finally {
    windowLoading = false;
    renderAlerts();
    renderStatus();
  }
}

export function applyTrace(trace: Trace | null, fresh: boolean): void {
  const oldN = S.trace?.evs.length ?? 0;
  const atEnd = S.trace !== null && S.pos >= oldN;
  update('applyTrace', { trace });
  if (S.changes) update('applyTrace', { changes: null }), renderChanges(); // marks of the last run don't belong to this one
  if (S.compare) update('applyTrace', { compare: null }), renderCompare();
  searchAgain();
  // dev: does the trace hold together? (src/validate.ts; failures in the diagnostics panel)
  if (import.meta.env.DEV && trace) setTimeout(() => { if (S.trace === trace) for (const p of validateTrace(trace)) reportCheck(p); }, 0);
  prepareStage(trace); // focus mode sizes each return's card before playing it
  setTraceRevision(traceRevision + 1);
  setLastInspectorKey('');
  renderNotes(); // (whether each note's step is still where it was)
  const n = trace?.evs.length ?? 0;
  update('applyTrace', { pos: fresh ? 0 : atEnd ? n : Math.min(S.pos, n) });
  update('applyTrace', { stepTarget: null });
  if (!trace) update('applyTrace', { playing: false });
}

// ---------------- engines: the interpreter, or the real thing under gdb ----------------
export function engineFor(model: Model): 'interp' | 'gdb' | 'none' {
  if (model.error || !model.byName.has('main')) return 'none';
  if (model.project) return 'gdb'; // the interpreter reads one buffer
  if (S.engine !== 'auto') return S.engine;
  return model.fns.some((f) => f.externals.length) ? 'gdb' : 'interp';
}

// Compile and run again now: a new parse, and under gdb a new build and a new
// session (the old one is dropped, even when the request looks the same).
export function rebuild(): void {
  closeSession();
  analyze(currentSrc(), false);
  toast(S.model && engineFor(S.model) === 'gdb' ? 'rebuilding and running under gdb…' : 'parsed and run again');
}

let gdbTimer = 0;
let gdbAbort: AbortController | null = null;
export function cancelGdb(): void {
  clearTimeout(gdbTimer);
  gdbAbort?.abort();
  gdbAbort = null;
  if (S.gdb.status === 'running') update('cancelGdb', { gdb: { status: 'idle' } });
}

// the steps playback pauses on, worked out once per trace and set of breakpoints
let breakMemo: { t: Trace | null; key: string; hits: number[] } = { t: null, key: '', hits: [] };
function breakHitsNow(): number[] {
  const key = JSON.stringify(S.breaks);
  if (breakMemo.t !== S.trace || breakMemo.key !== key) breakMemo = { t: S.trace, key, hits: S.trace ? breakHits(S.trace, S.breaks) : [] };
  return breakMemo.hits;
}

// What the trace server is asked to run: this file or the open project, with
// these run settings (the page's own, or a test case's).
export function gdbRequest(src: string, model: Model, cfg: { stdin: string; args: string[]; defines: string[] }, terminal: boolean, files = S.project ? buildFiles(S.project) : null): GdbRequest {
  const p = S.project;
  return p
    ? {
      project: { files: files! }, defines: cfg.defines, stdin: cfg.stdin, args: cfg.args,
      fns: [...new Set(model.fns.map((f) => f.cname))], maxSteps: 20000, maxSeconds: 8, terminal,
      // the tracer knows functions by C name and file, not by key
      bindings: S.sprites.map((sp) => {
        const fn = sp.binding?.fn ? model.byName.get(sp.binding.fn) : undefined;
        return fn && sp.binding ? { ...sp, binding: { ...sp.binding, fn: fn.cname, file: fn.file } } : sp;
      }),
    }
    : { src, files: S.sample.files, defines: cfg.defines, args: cfg.args, stdin: cfg.stdin, fns: model.fns.map((f) => f.name), maxSteps: 20000, maxSeconds: 8, bindings: S.sprites, terminal };
}

export function startGdb(src: string, model: Model, fresh: boolean): void {
  update('startGdb', { gdb: { status: 'running' } });
  gdbTimer = window.setTimeout(async () => {
    const ac = new AbortController();
    gdbAbort = ac;
    let r: GResult | 'unavailable';
    const p = S.project;
    const files = p ? buildFiles(p) : null;
    try {
      r = await traceWindow(gdbRequest(src, model, p ? p.run : { stdin: S.stdin, args: S.args, defines: S.defines }, store.get('stdout') !== 'pipe', files), 0, ac.signal);
    } catch {
      return; // superseded by a newer edit
    }
    if (ac.signal.aborted || S.model !== model) return;
    gdbAbort = null;
    if (r === 'unavailable') {
      update('startGdb', { gdb: { status: 'unavailable' } });
      applyTrace(null, fresh);
    } else if (!r.ok) {
      update('startGdb', { gdb: { status: 'error', compile: r.compile, error: r.error } });
      applyTrace(null, fresh);
    } else {
      update('startGdb', { gdb: { status: 'done', ms: r.ms } });
      applyTrace(convertGdb({ ...r, stdinText: r.stdinText ?? (p ? p.run.stdin : S.stdin) }, model, files ?? src), fresh);
      prefetchNext();
      if (fresh) {
        autoSpeed(S.trace!);
        view.home(S); // close enough to see the machines work
        setTimeout(() => play(), 300);
      }
    }
    renderAlerts();
    renderStatus();
  }, fresh ? 0 : 450);
}

function renderEngines(): void {
  const box = $('engines');
  const opts: [typeof S.engine, string, string][] = [
    ['auto', 'Auto', 'Interpreter for self-contained code, gdb when it calls read/malloc/printf…'],
    ['interp', 'Interp', 'Instant in-browser interpreter (a C subset)'],
    ['gdb', 'gdb', 'Compile with cc -Wall -Wextra -Werror and step it under gdb'],
  ];
  box.innerHTML = opts.map(([id, label, title]) => `<button data-id="${id}" aria-pressed="${S.engine === id}" title="${esc(title)}">${label}</button>`).join('');
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => {
      update('setEngine', { engine: b.dataset.id as typeof S.engine });
      store.set('engine', S.engine);
      renderEngines();
      analyze(editor.state.doc.toString(), false);
    }),
  );
}

// ---------------- playback ----------------
export const N = () => S.trace?.evs.length ?? 0;

export function play(): void {
  if (!S.trace) return toast(S.model?.error ? 'fix the syntax error first' : 'nothing to run: this code has no main()');
  if (S.pos >= N()) update('play', { pos: 0 });
  update('play', { stepTarget: null });
  update('play', { playing: true });
}

function togglePlay(): void {
  if (S.playing) update('togglePlay', { playing: false });
  else play();
}

function stepFwd(): void {
  if (!S.trace) return;
  if (S.stepTarget !== null) update('stepFwd', { pos: S.stepTarget });
  const i = Math.floor(S.pos + 1e-9);
  if (i >= N()) return;
  update('stepFwd', { pos: i });
  update('stepFwd', { stepTarget: i + 1 });
  update('stepFwd', { playing: true });
}

function stepBack(): void {
  if (!S.trace) return;
  update('stepBack', { playing: false });
  update('stepBack', { stepTarget: null });
  update('stepBack', { pos: Math.max(0, Math.ceil(S.pos - 1e-9) - 1) });
}

const isCallish = (e: Ev) => e.k === 'call' || e.k === 'ret';

// ←/→ move one statement (beat) at a time, whichever machine runs it.
function beats(): number[] {
  return S.trace && S.model ? beatStarts(S.trace, S.model) : [];
}
function nextBeat(): void {
  const starts = beats();
  if (!S.trace || !starts.length) return stepFwd();
  const from = S.stepTarget ?? S.pos;
  const cur = [...starts].reverse().find((b) => b <= from + 1e-9);
  const next = starts.find((b) => b > from + 1e-9);
  // play the current beat to its end (the next one's start), then stop
  if (cur !== undefined && next !== undefined) {
    update('nextBeat', { pos: Math.max(S.pos, cur) });
    update('nextBeat', { stepTarget: next });
    update('nextBeat', { playing: true });
  } else if (next !== undefined) seek(next);
  else stepFwd();
}
function prevBeat(): void {
  const starts = beats();
  update('prevBeat', { playing: false });
  update('prevBeat', { stepTarget: null });
  const prev = [...starts].reverse().find((b) => b < S.pos - 1e-9);
  update('prevBeat', { pos: prev ?? 0 });
}

function nextCall(): void {
  if (!S.trace) return;
  const from = S.stepTarget ?? Math.ceil(S.pos - 1e-9);
  const j = S.trace.evs.findIndex((e, k) => k >= from && isCallish(e));
  if (j < 0) return seek(N());
  update('nextCall', { pos: j });
  update('nextCall', { stepTarget: j + 1 });
  update('nextCall', { playing: true });
}

function prevCall(): void {
  if (!S.trace) return;
  update('prevCall', { playing: false });
  update('prevCall', { stepTarget: null });
  const cur = Math.ceil(S.pos - 1e-9);
  for (let j = cur - 2; j >= 0; j--) if (isCallish(S.trace.evs[j])) return void update('prevCall', { pos: j + 1 });
  update('prevCall', { pos: 0 });
}

function seek(p: number): void {
  update('seek', { playing: false });
  update('seek', { stepTarget: null });
  update('seek', { pos: Math.max(0, Math.min(p, N())) });
}

// one preset up or down from wherever it is (a typed 4× goes to 5× or 3×)
function setSpeed(dir: number): void {
  const next = dir > 0 ? SPEEDS.find((v) => v > S.speed + 1e-9) : [...SPEEDS].reverse().find((v) => v < S.speed - 1e-9);
  setSpeedTo(next ?? S.speed);
}

function restart(): void {
  if (!S.trace) return toast(S.model?.error ? 'fix the syntax error first' : 'nothing to run: no main()');
  update('restart', { pos: 0 });
  play();
}

// ---------------- entity actions ----------------
export function gotoCode(e: Entity | null): void {
  if (!e || !S.model) return;
  if (e.k === 'node') {
    const f = layout.nodes.get(e.id)?.fn;
    if (f) openAt(f.file, f.nameLine, f.nameCol);
  } else if (e.k === 'static') {
    const f = S.model.byName.get(e.fn);
    const v = f?.statics.find((x) => x.name === e.name);
    if (v) openAt(f!.file, v.line, 0);
  } else if (e.k === 'belt') {
    const b = computeBelts(layout, S.model, S.trace).find((x) => x.key === e.key);
    if (b?.lines.length) openAt(b.srcFile, b.lines[0], 0);
    else gotoCode({ k: 'node', id: 'func:main' });
  } else if (e.k === 'module') {
    const first = S.model.fns.filter((f) => f.file === e.file).sort((a, b) => a.startLine - b.startLine)[0];
    openAt(e.file, first?.nameLine ?? 0, first?.nameCol ?? 0);
  } else gotoCode({ k: 'node', id: 'func:main' });
}

export function toggleModule(file: string): void {
  const m = layout.modules.get(file);
  if (!m || !S.model) return;
  layout.setCollapsed(file, !m.collapsed, S.model);
  saveSoon();
  const r = layout.moduleRect(file);
  view.ensureVisible(r.x, r.y, Math.min(r.w, view.w / view.cs - 3), Math.min(r.h, view.h / view.cs - 3));
}

// Fold or unfold a struct's fields in a frame; auto-placed machines make room.
function toggleFold(t: { fn: string; name: string }): void {
  const key = `${t.fn}.${t.name}`;
  if (folded.has(key)) folded.delete(key);
  else folded.add(key);
  if (S.model) layout.reflow(S.model);
  setLastInspectorKey('');
  saveSoon();
}

function setAllModules(collapsed: boolean): void {
  if (!S.model) return;
  for (const f of layout.modules.keys()) layout.setCollapsed(f, collapsed, S.model);
  saveSoon();
  view.fit(S);
}

function unpin(id: string): void {
  if (!S.model) return;
  layout.unpin(id, S.model);
  saveSoon();
  toast('handed back to auto-placement');
}

function resetRoute(key: string): void {
  layout.waypoints.delete(key);
  saveSoon();
  toast('route reset');
}

export function placeSprite(kind: SpriteKind, wx: number, wy: number, preset: Partial<Sprite> = {}): Sprite {
  const id = `sprite:${crypto.randomUUID()}`;
  const sprite: Sprite = { id, kind, x: Math.round(wx), y: Math.round(wy), ...preset };
  S.sprites.push(sprite);
  update('placeSprite', { selected: { k: 'sprite', id } });
  update('placeSprite', { legend: null });
  setLastInspectorKey('');
  saveSoon();
  bindingsChanged();
  return sprite;
}

export function removeSprite(id: string): void {
  update('removeSprite', { sprites: S.sprites.filter((s) => s.id !== id) });
  if (S.selected?.k === 'sprite' && S.selected.id === id) update('removeSprite', { selected: null });
  setLastInspectorKey('');
  saveSoon();
  bindingsChanged();
}

// ---------------- mouse ----------------
type Drag =
  | { k: 'pan'; x: number; y: number; moved: boolean }
  | { k: 'node'; id: string; ox: number; oy: number; moved: boolean }
  | { k: 'belt'; key: string; moved: boolean }
  | { k: 'sprite'; id: string; ox: number; oy: number; moved: boolean }
  | { k: 'module'; file: string; ox: number; oy: number; moved: boolean };
let drag: Drag | null = null;
let lastPanAt = 0;
let pendingFold: { fn: string; name: string } | null = null;

function localXY(e: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function setCursorStyle(): void {
  canvas.style.cursor =
    drag?.k === 'pan' ? 'grabbing' :
    drag?.k === 'node' || drag?.k === 'belt' || drag?.k === 'module' ? 'move' :
    S.hovered?.k === 'node' || S.hovered?.k === 'belt' || S.hovered?.k === 'module' ? 'move' :
    S.hovered ? 'pointer' : 'default';
}

function bindMouse(): void {
  canvas.addEventListener('pointerdown', (e) => {
    hideMenu();
    gridPane.focus({ preventScroll: true });
    const [x, y] = localXY(e);
    if (e.button === 1) {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = { k: 'pan', x: e.clientX, y: e.clientY, moved: false };
      return setCursorStyle();
    }
    if (e.button !== 0) return;
    // the heap bar sits over the grid: its header folds it, its cards are its own
    const onBar = view.heapBarAt(x, y);
    if (onBar === 'head') return view.toggleHeapBar();
    if (onBar) return;
    canvas.setPointerCapture(e.pointerId);
    const [wx, wy] = view.toWorld(x, y);
    const hit = entityAt(S, wx, wy);
    pendingFold = hit?.k === 'node' ? foldAt(S, wx, wy) : null;
    update('select', { selected: hit, legend: null });
    if (hit?.k === 'sprite') {
      const sprite = S.sprites.find((s) => s.id === hit.id)!;
      drag = { k: 'sprite', id: hit.id, ox: wx - sprite.x, oy: wy - sprite.y, moved: false };
    } else if (hit?.k === 'node' && (hit.copy ?? 1) > 1) drag = null; // copies follow their home
    else if (hit?.k === 'node') {
      const n = layout.nodes.get(hit.id)!;
      drag = { k: 'node', id: hit.id, ox: wx - n.place.x, oy: wy - n.place.y, moved: false };
    } else if (hit?.k === 'belt') drag = { k: 'belt', key: hit.key, moved: false };
    else if (hit?.k === 'module') {
      const m = layout.modules.get(hit.file)!;
      drag = { k: 'module', file: hit.file, ox: wx - m.x, oy: wy - m.y, moved: false };
    } else if (!hit) drag = { k: 'pan', x: e.clientX, y: e.clientY, moved: false };
    else drag = null;
    setCursorStyle();
  });

  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = localXY(e);
    const [wx, wy] = view.toWorld(x, y);
    if (drag?.k === 'pan') {
      view.panPx(e.clientX - drag.x, e.clientY - drag.y);
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 0) drag.moved = true;
      drag.x = e.clientX;
      drag.y = e.clientY;
      lastPanAt = performance.now();
    } else if (drag?.k === 'node') {
      if (layout.setPos(drag.id, Math.round(wx - drag.ox), Math.round(wy - drag.oy))) drag.moved = true;
    } else if (drag?.k === 'module') {
      const m = layout.modules.get(drag.file);
      const nx = Math.round(wx - drag.ox), ny = Math.round(wy - drag.oy);
      if (m && (m.x !== nx || m.y !== ny) && layout.moveModule(drag.file, nx, ny)) drag.moved = true;
    } else if (drag?.k === 'belt') {
      const p = { x: Math.floor(wx) + 0.5, y: Math.floor(wy) + 0.5 };
      const cur = layout.waypoints.get(drag.key);
      if (!cur || cur.x !== p.x || cur.y !== p.y) {
        layout.waypoints.set(drag.key, p);
        drag.moved = true;
      }
    } else if (drag?.k === 'sprite') {
      const spriteId = drag.id;
      const sprite = S.sprites.find((s) => s.id === spriteId);
      if (sprite) {
        const nx = Math.round(wx - drag.ox), ny = Math.round(wy - drag.oy);
        if (sprite.x !== nx || sprite.y !== ny) {
          sprite.x = nx; sprite.y = ny; drag.moved = true;
        }
      }
    } else {
      update('hover', { hovered: entityAt(S, wx, wy) });
    }
    // a statement longer than its station shows: the whole of it, on hover
    const at = !drag && !view.heapBarAt(x, y) ? stationAt(S, wx, wy) : null;
    showTip(at?.st.full ? { text: at.st.full, x: e.clientX, y: e.clientY } : null);
    setCursorStyle();
  });

  const end = () => {
    if (pendingFold && !(drag && 'moved' in drag && drag.moved)) toggleFold(pendingFold);
    pendingFold = null;
    if (drag?.k === 'node' && drag.moved) {
      toast('pinned: auto-layout won’t move it (right-click → Unpin)');
      // Arranging inside a module pins the module too, so re-flowing the
      // others around its new wall never drags this one away.
      const n = layout.nodes.get(drag.id);
      const m = n?.file ? layout.modules.get(n.file) : undefined;
      if (m && S.model) (m.pinned = true), layout.pack(S.model);
    }
    if (drag?.k === 'module' && drag.moved) toast('module pinned where you put it (right-click → Unpin)');
    if ((drag?.k === 'node' || drag?.k === 'belt' || drag?.k === 'sprite' || drag?.k === 'module') && drag.moved) saveSoon();
    if (drag?.k === 'pan' && !drag.moved && S.selected === null) update('end', { legend: null });
    drag = null;
    setCursorStyle();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    showTip(null);
    if (!drag) update('end', { hovered: null });
  });
  canvas.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('application/x-ftb-sprite')) e.preventDefault();
  });
  canvas.addEventListener('drop', (e) => {
    const kind = e.dataTransfer?.getData('application/x-ftb-sprite') as SpriteKind | undefined;
    if (!kind || !['strip', 'marker', 'chest', 'drill', 'copy', 'stack', 'train'].includes(kind)) return;
    e.preventDefault();
    const [x, y] = localXY(e);
    const [wx, wy] = view.toWorld(x, y);
    placeSprite(kind, wx, wy);
  });
  // Middle-click must not paste or start autoscroll.
  canvas.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
  canvas.addEventListener('auxclick', (e) => e.button === 1 && e.preventDefault());

  canvas.addEventListener('dblclick', (e) => {
    const [wx, wy] = view.toWorld(...localXY(e));
    const hit = entityAt(S, wx, wy);
    if (!hit) return view.fit(S);
    if (hit.k === 'belt' && layout.waypoints.has(hit.key)) return resetRoute(hit.key);
    if (hit.k === 'module') return toggleModule(hit.file);
    if (hit.k === 'node') {
      // a statement inside a machine: jump to its line
      const at = stationAt(S, wx, wy);
      const fn = at ? S.model?.byName.get(at.fn) : undefined;
      if (at && fn) return openAt(fn.file, at.line, 0);
      // its title or motor: show or hide the inside
      const head = machineHeadAt(S, wx, wy);
      if (head) return toggleShut(head);
    }
    gotoCode(hit);
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.ctrlKey) return; // Ctrl+wheel zooms the whole app (see setUiZoom)
      const [x, y] = localXY(e);
      if (e.shiftKey) return view.panPx(-e.deltaY, 0);
      const d = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      view.zoomAt(x, y, Math.exp(-d * 0.0015));
      lastPanAt = performance.now();
    },
    { passive: false },
  );

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const [x, y] = localXY(e);
    const [wx, wy] = view.toWorld(x, y);
    const hit = entityAt(S, wx, wy);
    update('end', { selected: hit });
    const items: [string, () => void][] = [];
    if (hit?.k === 'node') {
      items.push(['Go to code', () => gotoCode(hit)]);
      // a struct's row: watch it on the heap bar (it stays in its frame; the
      // bar only shows it), in skins that draw the bar
      const row = foldAt(S, wx, wy);
      const skin = S.skin;
      if (row && skin.heapBar) {
        const key = `${row.fn}|${row.name}`;
        items.push([view.watches.has(key) ? `Stop watching ${row.name}` : `Watch ${row.name} on the heap bar`, () => void (view.watches.has(key) ? view.watches.delete(key) : view.watches.add(key))]);
      }
      // a statement: pause playback on it (when a condition holds, if one is given)
      const sta = stationAt(S, wx, wy);
      if (sta) {
        const has = S.breaks.find((b) => b.fn === sta.fn && b.line === sta.line);
        if (has) items.push([`Stop pausing at line ${sta.line + 1}`, () => update('unbreak', { breaks: S.breaks.filter((b) => b !== has) })]);
        else items.push([`Pause here (line ${sta.line + 1})`, () => update('break', { breaks: [...S.breaks, { fn: sta.fn, line: sta.line, cond: null }] })]);
        items.push([has?.cond ? `Pause here when… (now: ${has.cond})` : 'Pause here when…', () => askCondition(sta.fn, sta.line, e.clientX, e.clientY)]);
      }
      // any variable's row: every step it changed, on the timeline
      const slot = slotAt(S, wx, wy);
      if (slot && S.trace) items.push([`When did ${slot.name} change?`, () => showChanges(slot.fn, slot.name)]);
      if (slot && S.trace) items.push([`Why is ${slot.name} this value?`, () => showExplain(slot.fn, slot.name, e.clientX, e.clientY)]);
      const nm = layout.nodes.get(hit.id)?.name;
      if (nm) items.push([shut.has(nm) ? 'Show inside' : 'Hide inside', () => toggleShut(nm)]);
      if (layout.nodes.get(hit.id)?.place.pinned) items.push(['Unpin (auto-place)', () => unpin(hit.id)]);
    } else if (hit?.k === 'sprite') {
      items.push(['Bind…', () => { update('bind', { selected: hit }); setLastInspectorKey(''); renderInspector(); inspector.querySelector<HTMLInputElement>('[name="expr"]')?.focus(); }]);
      items.push(['Remove', () => removeSprite(hit.id)]);
    } else if (hit?.k === 'belt') {
      items.push(['Go to call site', () => gotoCode(hit)]);
      if (layout.waypoints.has(hit.key)) items.push(['Reset route', () => resetRoute(hit.key)]);
    } else if (hit?.k === 'module') {
      const m = layout.modules.get(hit.file);
      items.push([m?.collapsed ? 'Open module' : 'Close module', () => toggleModule(hit.file)]);
      items.push(['Go to file', () => gotoCode(hit)]);
      if (m?.pinned && S.model) items.push(['Unpin (auto-place)', () => (layout.unpinModule(hit.file, S.model!), saveSoon())]);
    } else if (hit) items.push(['Go to code', () => gotoCode(hit)]);
    // a machine inside an open module can close its module from here too
    const inFile = hit?.k === 'node' ? layout.nodes.get(hit.id)?.file : undefined;
    if (inFile && !layout.modules.get(inFile)?.collapsed) items.push([`Close ${inFile.slice(inFile.lastIndexOf('/') + 1)}`, () => toggleModule(inFile)]);
    if (!hit) {
      items.push(['Tidy layout', tidy]);
      items.push(['Show all insides', () => setAllShut(false)]);
      items.push(['Hide all insides', () => setAllShut(true)]);
    }
    if (!hit && layout.modules.size) {
      items.push(['Open all modules', () => setAllModules(false)]);
      items.push(['Close all modules', () => setAllModules(true)]);
    }
    items.push(['Fit view', () => view.fit(S)]);
    showMenu(e.clientX, e.clientY, items);
  });
}

// The hover tip (a statement in full): page coordinates, next to the pointer.
function showTip(t: { text: string; x: number; y: number } | null): void {
  const el = document.getElementById('tip');
  if (!el) return;
  if (!t) return void (el.hidden = true);
  if (el.textContent !== t.text) el.textContent = t.text;
  el.hidden = false;
  const r = el.parentElement!.getBoundingClientRect();
  el.style.left = `${Math.min(t.x - r.left + 14, r.width - el.offsetWidth - 8)}px`;
  el.style.top = `${t.y - r.top + 18}px`;
}

function showMenu(x: number, y: number, items: [string, () => void][]): void {
  menu.innerHTML = items.map(([label], i) => `<button data-i="${i}">${esc(label)}</button>`).join('');
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  // x, y and the rect are window pixels; left/top are in the app's zoomed px
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 4) / ui.zoom}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 4) / ui.zoom}px`;
  menu.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => {
      hideMenu();
      items[Number(b.dataset.i)][1]();
    }),
  );
}
function hideMenu(): void {
  menu.hidden = true;
}

// ---------------- keyboard (conventional, canvas only) ----------------
// VS Code's keys, except where vim (in the editor) owns them: Ctrl+O is
// vim's jump back and Ctrl+B its page up.
function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey && e.key === 'Enter' && overlay.hidden) {
    e.preventDefault();
    return e.shiftKey ? rebuild() : restart();
  }
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
  const vimOwns = S.vim && editor.hasFocus;
  if (mod && e.key.toLowerCase() === 's') {
    e.preventDefault();
    return overlay.hidden ? openSaveDialog() : undefined;
  }
  if (mod && overlay.hidden && e.key.toLowerCase() === 'o' && !vimOwns) {
    e.preventDefault();
    return void openFolderDialog();
  }
  if (mod && overlay.hidden && e.key.toLowerCase() === 'p' && S.project) {
    e.preventDefault();
    return quickOpen();
  }
  if (mod && overlay.hidden && e.key.toLowerCase() === 'b' && S.project && !vimOwns) {
    e.preventDefault();
    return toggleExplorer();
  }
  if (!overlay.hidden) {
    if (e.key === 'Escape' || (e.key === '?' && overlay.dataset.kind === 'help')) {
      e.preventDefault();
      closeOverlay();
    }
    return;
  }
  if (!gridPane.contains(document.activeElement) || (document.activeElement as HTMLElement | null)?.closest('input, textarea, select, button, [contenteditable="true"]') || e.metaKey || e.altKey) return;
  const k = e.key;
  let handled = true;
  if (k === ' ') togglePlay();
  else if (k === 'ArrowRight') (e.shiftKey ? nextCall : nextBeat)();
  else if (k === 'ArrowLeft') (e.shiftKey ? prevCall : prevBeat)();
  else if (k === 'Home') seek(0);
  else if (k === 'End') seek(N());
  else if (k === 'Escape') update('escape', { selected: null, legend: null }), hideMenu(), toggleLegend(false);
  else if (k === 'f' || k === 'F') view.fit(S);
  else if (k === 'm' || k === 'M') setMode(animMode() === 'fast' ? 'focus' : 'fast');
  else if (k === '+' || k === '=') view.zoomAt(view.w / 2, view.h / 2, 1.2);
  else if (k === '-') view.zoomAt(view.w / 2, view.h / 2, 1 / 1.2);
  else if (k === '?') openHelp();
  else handled = false;
  if (handled) e.preventDefault();
}

// ---------------- skins ----------------
async function applySkin(skin: Skin): Promise<void> {
  update('applySkin', { skin });
  document.documentElement.dataset.skin = skin.id;
  store.set('skin', skin.id);
  renderSkinPicker();
  renderTints();
  renderDock();
  await Promise.all((SKIN_FONTS[skin.id] ?? []).map((f) => document.fonts.load(f).catch(() => null)));
  renderDock();
  setLastPbKey('');
  if (!$('legend').hidden) renderLegend($('legend'), skin); // its drawings are the skin's
}

// The Legend overlay: the real drawings, as this skin draws them.
function toggleLegend(open = $('legend').hidden): void {
  const el = $('legend');
  el.hidden = !open;
  $('btn-legend').setAttribute('aria-pressed', String(open));
  if (open) renderLegend(el, S.skin);
}

// Skins with theme colours (the PS3's XMB) get a row of swatches on the top
// bar; picking one fades the canvas (the skin) and the chrome (CSS variables
// that transition) to it. The choice is remembered per skin, in this browser.
function renderTints(): void {
  const box = $('tints');
  const sk = S.skin;
  const root = document.documentElement.style;
  if (!sk.tints?.length || !sk.tint) {
    box.hidden = true;
    box.innerHTML = '';
    return;
  }
  const saved = store.get(`tint.${sk.id}`);
  let cur = sk.tints.some((t) => t.id === saved) ? saved! : sk.tints[0].id;
  const set = (id: string, instant: boolean) => {
    cur = id;
    // at load, jump straight to it: no fade from the default colour
    if (instant) root.setProperty('transition', 'none');
    for (const [k, v] of Object.entries(sk.tint!(id, instant))) root.setProperty(k, v);
    if (instant) {
      void getComputedStyle(document.documentElement).getPropertyValue('--xmb-mid'); // settle before transitions return
      root.removeProperty('transition');
    }
    // each drop's place from the right: the current one first, then the rest in order
    let k = 1;
    box.querySelectorAll<HTMLElement>('button').forEach((b) => {
      const on = b.dataset.id === id;
      b.setAttribute('aria-checked', `${on}`);
      b.style.setProperty('--i', `${on ? 0 : k++}`);
    });
  };
  box.innerHTML = `<span class="row">${sk.tints.map((t) => `<button role="radio" data-id="${esc(t.id)}" title="${esc(t.name)}" style="--c:${esc(t.colour)}"></button>`).join('')}</span>`;
  box.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-id]');
    if (!b || b.dataset.id === cur) return;
    store.set(`tint.${sk.id}`, b.dataset.id!);
    set(b.dataset.id!, false);
    renderDock(); // its icons take the new colour
  };
  box.style.setProperty('--n', `${sk.tints.length}`);
  box.hidden = false;
  set(cur, true);
}

// A little live preview of a skin: its floor with its machine on it, drawn
// by the skin itself, once.
const skinPreviews = new Map<string, string>();
function skinPreview(sk: Skin): string {
  const hit = skinPreviews.get(sk.id);
  if (hit) return hit;
  const W = 72, H = 44, dpr = 2;
  const c = document.createElement('canvas');
  c.width = W * dpr;
  c.height = H * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const z = 0.42;
  try {
    sk.background({ g, z, cs: 40 * z, time: 0, vw: W, vh: H }, 0, 0);
    sk.node({ g, z, cs: 40 * z, time: 0, vw: W, vh: H }, { x: 9, y: 6, w: 54, h: 32 }, {
      name: 'main', state: 'running', waitingOn: null, frames: 1, stale: false, pinned: false, isStatic: false, params: 0,
      selected: false, hovered: false, editing: false, hasFrame: false, copy: 1, inPorts: [], outPorts: [],
    });
  } catch {
    /* a preview is a nicety */
  }
  const url = c.toDataURL();
  skinPreviews.set(sk.id, url);
  return url;
}

// The skin picker: a button showing the current one; a grid of every skin,
// each with its preview, name and a line about it. Skins that come in light
// and dark get a ☀/☾ button, and the chosen mode carries over.
function renderSkinPicker(): void {
  const box = $<HTMLButtonElement>('skins');
  const list = $('skin-list');
  const base = S.skin.variantOf ?? S.skin.id;
  box.innerHTML = `<img src="${skinPreview(S.skin)}" alt=""><span>${esc(S.skin.name)}</span><span class="caret">▾</span>`;
  box.title = S.skin.blurb;
  const pick = (id: string) => {
    let next = SKINS.find((s) => s.id === id)!;
    const other = otherMode(next);
    const want = store.get('mode');
    if (other && want && next.mode !== want) next = other;
    list.hidden = true;
    void applySkin(next);
  };
  box.onclick = () => {
    if (!list.hidden) return void (list.hidden = true);
    const bases = SKINS.filter((s) => !s.variantOf);
    const placed = new Set(SKIN_GROUPS.flatMap((g) => g.ids));
    const groups = [...SKIN_GROUPS, { name: 'Other', blurb: '', ids: bases.filter((s) => !placed.has(s.id)).map((s) => s.id) }]
      .map((g) => ({ ...g, skins: g.ids.map((id) => bases.find((s) => s.id === id)).filter((s): s is Skin => !!s) }))
      .filter((g) => g.skins.length);
    const card = (s: Skin) =>
      `<button class="sk${s.id === base ? ' on' : ''}" data-id="${s.id}" role="option" aria-selected="${s.id === base}"><img src="${skinPreview(s)}" alt="">${isWip(s) ? '<span class="wip" title="Work in progress: this skin isn’t polished yet" aria-label="work in progress">⚠</span>' : ''}<span class="nm">${esc(s.name)}${otherMode(s) ? ' <span class="md" title="light and dark">☀☾</span>' : ''}${weightBadge(s.id)}</span><span class="bl">${esc(s.blurb)}</span></button>`;
    list.innerHTML =
      `<nav class="grp-jump">${groups.map((g, i) => `<button data-g="${i}"${g.skins.some((s) => s.id === base) ? ' class="on"' : ''}>${esc(g.name)}</button>`).join('')}</nav>` +
      groups.map((g, i) => `<h5 class="grp" id="skin-grp-${i}">${esc(g.name)}${g.blurb ? ` <span>${esc(g.blurb)}</span>` : ''}</h5>${g.skins.map(card).join('')}`).join('');
    list.querySelectorAll<HTMLButtonElement>('.sk').forEach((b) => b.addEventListener('click', () => pick(b.dataset.id!)));
    list.querySelectorAll<HTMLButtonElement>('.grp-jump button').forEach((b) =>
      b.addEventListener('click', () => {
        const h = list.querySelector<HTMLElement>(`#skin-grp-${b.dataset.g}`);
        const nav = list.querySelector<HTMLElement>('.grp-jump');
        if (h) list.scrollTo({ top: h.offsetTop - (nav?.offsetHeight ?? 0) - 8, behavior: 'smooth' });
      }),
    );
    list.hidden = false;
    // open at the current skin's group
    list.querySelector<HTMLElement>('.sk.on')?.scrollIntoView({ block: 'nearest' });
  };
  const btn = $<HTMLButtonElement>('skin-mode');
  const other = otherMode(S.skin);
  btn.hidden = !other;
  if (other) {
    btn.textContent = S.skin.mode === 'dark' ? '☀' : '☾';
    btn.title = S.skin.mode === 'dark' ? 'Light mode' : 'Dark mode';
    btn.onclick = () => {
      store.set('mode', other.mode ?? '');
      void applySkin(other);
    };
  }
}

// ---------------- vim toggle ----------------
export const hooks: EditorHooks = {
  onChange: (doc) => {
    if (loadingSample) return;
    const p = S.project;
    if (p) {
      const f = p.files.get(p.active);
      if (f) {
        const was = isDirty(f);
        f.text = doc;
        if (was !== isDirty(f)) renderProjectChrome();
      }
    }
    saveSoon();
    clearTimeout(debounce);
    setDebounce(window.setTimeout(() => analyze(doc, false), 150));
  },
  onCursor: (line, col) => {
    update('editorCursor', { cursor: { line, col } });
    const active = S.project?.active;
    const f = S.model?.fns.find((x) => (!S.project || x.file === active) && line >= x.startLine && line <= x.endLine);
    update('editorCursor', { editorFn: f?.name ?? null });
  },
  onMode: (m) => {
    update('editorMode', { mode: m });
  },
};

function toggleVim(): void {
  update('toggleVim', { vim: !S.vim });
  store.set('vim', S.vim ? 'on' : 'off');
  setVim(editor, S.vim, hooks);
  renderVimToggle();
  editor.focus();
}

function renderVimToggle(): void {
  const t = $('vim-toggle');
  t.setAttribute('aria-pressed', String(S.vim));
  t.title = S.vim ? 'Vim keys on — click for standard editing' : 'Standard editing — click for Vim keys';
}

// ---------------- overlays ----------------
function openHelp(): void {
  const K = (keys: string[], what: string) => `<div class="k"><span>${keys.map((x) => `<kbd>${esc(x)}</kbd>`).join(' ')}</span><span>${what}</span></div>`;
  overlay.innerHTML = `<div class="dlg" role="dialog" aria-label="Help">
    <div class="dlg-title"><span>How it works</span><span class="grow"></span><button class="x" id="dlg-close" aria-label="Close">×</button></div>
    <div class="dlg-body">
      <div class="cols">
        <div><h4>Canvas</h4>
          ${K(['Middle-drag'], 'pan')}${K(['Drag empty space'], 'pan')}${K(['Wheel'], 'zoom at the pointer')}
          ${K(['Click'], 'select a function or call')}${K(['Drag function'], 'move it (it stays put)')}${K(['Drag call'], 're-route it')}
          ${K(['Double-click'], 'jump to code (a statement: its line) · reset route · fit')}${K(['←/→'], 'one statement')}${K(['Shift+←/→'], 'one call')}${K(['Right-click'], 'more')}
        </div>
        <div><h4>Playback (canvas focused)</h4>
          ${K(['Space'], 'play / pause')}${K(['←', '→'], 'step')}${K(['Shift', '←/→'], 'previous / next call')}
          ${K(['Home', 'End'], 'start / end')}${K(['F'], 'fit view')}${K(['M'], 'fast ⇄ focus animation')}${K(['Ctrl', 'Enter'], 'run from the start (anywhere)')}${K(['Ctrl', 'Shift', 'Enter'], 'compile and run again')}
          <h4>Editor</h4>
          ${K(['vim'], 'toggle in the editor header')}${K([':w'], 'save… (project) · run from the start (sample)')}
          <h4>Projects</h4>
          ${K(['Ctrl', 'S'], 'save… — always asks first')}${K(['Ctrl', 'O'], 'open a folder')}${K(['Ctrl', 'P'], 'go to a file')}${K(['Ctrl', 'B'], 'show / hide files')}
          ${K(['Double-click file'], 'open / close a module')}
        </div>
      </div>
      <div class="legend">${LEGEND.slice(0, 5).map((l) => `<canvas data-kind="${l.kind}"></canvas><div><b>${esc(l.name)}</b> <span class="c">${esc(l.c)}</span><br>${esc(l.text)}</div>`).join('')}</div>
    </div></div>`;
  overlay.hidden = false;
  overlay.dataset.kind = 'help';
  overlay.querySelectorAll<HTMLCanvasElement>('canvas[data-kind]').forEach((c) => drawIcon(c, c.dataset.kind as IconKind, 34));
  $('dlg-close').addEventListener('click', closeOverlay);
}
export function closeOverlay(): void {
  overlay.hidden = true;
  overlay.dataset.kind = '';
}

export function drawIcon(c: HTMLCanvasElement, kind: IconKind, size: number): void {
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, size, size);
  S.skin.icon(g, kind, size);
}

// ---------------- main loop ----------------
let lastT = performance.now();
let lastFollowEv = -1;
let lastStage = '';
// Paused and still (no input, the camera at rest): redraw about 15 times a
// second instead of 60, so an idle page doesn't keep the CPU busy.
let lastInputAt = 0;
let lastDrawAt = 0;
let lastPageAt = 0;
for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown', 'input']) window.addEventListener(ev, () => (lastInputAt = performance.now()), { capture: true, passive: true });

// Adaptive sharpness: while things move, watch the frame rate; if frames
// take too long for a second, paint fewer canvas pixels (one step at a time,
// down to 0.75×); when there's room again, step back up.
const SCALES = [2, 1.5, 1.25, 1, 0.75];
let qSince = 0;
let qSlow = 0;
let qFast = 0;
let qLast = 0;
let qTold = false;
let qDownAt = 0; // when sharpness last went down
let qGood = 0; // good seconds in a row since
function adaptQuality(now: number): void {
  const moving = S.playing || !view.settled() || now - lastInputAt < 400;
  const dt = now - qLast;
  qLast = now;
  if (!moving || dt > 250) return; // idle or a hiccup (tab switch): no signal
  if (dt > 28) qSlow++;
  else if (dt < 18) qFast++;
  if (now - qSince < 1000) return;
  const screen = window.devicePixelRatio || 1;
  const cur = view.pixelScale;
  const frames = qSlow + qFast;
  if (frames > 10 && qSlow / frames > 0.6) {
    const next = SCALES.find((s) => s < cur - 0.01);
    if (next !== undefined) {
      view.scale = next;
      view.resize();
      qDownAt = now;
      qGood = 0;
      if (!qTold) (qTold = true), toast(`drawing at ${next}× sharpness to keep it smooth`);
    }
  } else if (frames > 30 && qFast / frames > 0.95 && cur < screen) {
    // back up only after a while, and several good seconds in a row: every
    // change reallocates the canvas (a hitch), so it mustn't see-saw
    if (++qGood >= 3 && now - qDownAt > 10000) {
      const up = [...SCALES].reverse().find((s) => s > cur + 0.01 && s <= screen);
      if (up !== undefined) (view.scale = up), view.resize();
      qGood = 0;
    }
  } else qGood = 0;
  qSince = now;
  qSlow = qFast = 0;
}

// A frame that throws is reported once (src/diag.ts) and skipped: the loop,
// and so playback, keeps going. Skin hooks have their own guard
// (src/skins/guard.ts), so what lands here is the engine's.
let frozen = false; // dev tools (tools/pixcmp): the loop stops drawing, so only the tool's frames reach the grid
function frame(now: number): void {
  requestAnimationFrame(frame);
  if (frozen) return;
  try {
    tick(now);
  } catch (e) {
    // skin hooks are guarded one by one (src/skins/guard.ts); this catches the engine's own
    reportHookError('engine', 'frame', e, []);
  }
}

function tick(now: number): void {
  if (!S.playing && now - lastInputAt > 400 && view.settled() && !S.skin.busy?.() && now - lastDrawAt < 66) {
    // idle: the grid rests at 15 fps, but a page-wide background that moves
    // (PS3's wave, PS4's band) keeps 30 so its motion doesn't stutter
    if (S.skin.fullBleed && now - lastPageAt >= 33) (lastPageAt = now), paintPage(now, S, view);
    // a GPU background moves on its own at 30, the grid over it untouched
    else if (now - lastPageAt >= 33 && view.animateGfx(S.skin, now)) lastPageAt = now;
    lastT = now;
    return;
  }
  lastDrawAt = now;
  adaptQuality(now);
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const t = S.trace;
  if (S.playing && t) {
    const n = t.evs.length;
    const i = Math.floor(S.pos);
    if (i >= n) update('advance', { playing: false });
    else {
      const before = S.pos;
      // spend this frame's time across as many events as it covers (inside a
      // machine, events elsewhere are only a few milliseconds long)
      let left = dt;
      for (let guard = 0; left > 0 && S.pos < n && guard < 20000; guard++) {
        const j = Math.floor(S.pos);
        const e = t.evs[j];
        const rate = staged(e) ? Math.min(S.speed, FOCUS_MAX) : S.speed;
        const d = durationAt(t, S.model, j);
        const need = ((j + 1 - S.pos) * d) / rate;
        if (need <= left) {
          update('advance', { pos: j + 1 });
          left -= need;
          if (S.stepTarget !== null && S.pos >= S.stepTarget) break;
        } else {
          update('advance', { pos: S.pos + ((left * rate) / d) });
          left = 0;
        }
      }
      // M4: freeze on the step where an invariant first breaks.
      const hit = violations().find((v) => v.at > before + 1e-9 && v.at <= S.pos);
      if (hit) {
        update('invariantBroke', { pos: hit.at, playing: false, stepTarget: null });
        toast(`stopped: ${hit.invariant} broke — ${hit.detail}`);
        // Bring the broken sprite into view, clear of the alert banner.
        const sp = S.sprites.find((x) => x.id === hit.sprite);
        if (sp) {
          const r = spriteWorldRect(sp, S.trace?.snaps[hit.at]?.bound?.[sp.id]);
          view.ensureVisible(r.x, r.y - 2, r.w, r.h + 2, Math.max(2.5, (view.h * 0.28) / view.cs));
        }
      }
      // a breakpoint: pause where a marked statement is reached (and its condition holds)
      const bp = S.breaks.length ? breakHitsNow().find((h) => h > before + 1e-9 && h <= S.pos) : undefined;
      if (bp !== undefined) {
        update('breakpoint', { pos: bp, playing: false, stepTarget: null });
        const e = S.trace!.evs[bp];
        const b = S.breaks.find((x) => x.line === e.line);
        toast(`paused at line ${e.line + 1}${b?.cond ? `: ${b.cond}` : ''}`);
      }
      if (S.stepTarget !== null && S.pos >= S.stepTarget) {
        update('stepDone', { pos: S.stepTarget, stepTarget: null, playing: false });
      }
      if (S.pos >= n) {
        update('runEnd', { pos: n, playing: false });
        // the run goes on past this window: fetch the next and keep playing
        if (t.window?.more && S.stepTarget === null) void loadWindow(t.window.to, true);
      }
    }
  }
  // Follow the running function, but never fight the author's own panning
  // (nor frame it under the kill feed).
  if (S.follow && t && S.playing && !drag && now - lastPanAt > 2500) {
    const feed = document.getElementById('feed');
    view.insetRight = feed && feed.childElementCount ? feed.offsetWidth + 16 : 0;
    const i = Math.floor(S.pos);
    // Focus: the camera follows the scene — the sender while its data is
    // read, both while it travels, the receiver while it's held there.
    // Fast: only pan, never zoom.
    const ph = i < t.evs.length && staged(t.evs[i]) ? frameAt(t, S.pos).ph : null;
    const stageKey = ph ? `${i}|${ph.parked ?? 'move'}` : '';
    if (ph && stageKey !== lastStage) {
      lastStage = stageKey;
      lastFollowEv = i;
      // a write through a pointer is a short hop: keep both ends in view throughout
      const which = t.evs[i].k === 'write' ? 'both' : ph.parked === 'read' || ph.parked === 'card' ? 'src' : ph.parked === 'hold' ? 'dst' : 'both';
      const r = stageRect(S, i, which);
      if (r) view.focusOn(r, ph.parked ? 2.6 : 1.6);
    } else if (!ph && i !== lastFollowEv && i < t.evs.length) {
      lastFollowEv = i;
      lastStage = '';
      const r = activeHostRect(S);
      if (r) view.ensureVisible(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    }
  }
  update('violations', { violations: violations() });
  // a page-wide background (PS3, PS4) is the whole window of GPU work: it
  // moves slowly, so 30 fps while playing too, as when idle
  if (!S.skin.fullBleed || now - lastPageAt >= 30) (lastPageAt = now), paintPage(now, S, view);
  view.draw(S, S.skin, now);
  renderStageCard(S, traceRevision);
  renderPlaybar();
  renderMinimap(view, () => (lastPanAt = performance.now()));
  renderFeed(S, traceRevision);
  renderDuel(now, S, view, editor);
  renderInspector();
  renderLiveStatus();
}

// ---------------- boot ----------------
async function boot(): Promise<void> {
  document.documentElement.dataset.skin = S.skin.id;
  await initParser();
  setEditor(createEditor($('editor'), S.sample.src, hooks, S.vim));
  Vim.defineEx('write', 'w', () => (S.project ? openSaveDialog() : restart()));
  Vim.defineEx('sample', 'sa', (_cm: unknown, p: { args?: string[] }) => loadSample(p.args?.[0]));

  $('vim-toggle').addEventListener('click', toggleVim);
  renderVimToggle();
  connectLive(onLive, () => {
    setLiveEditors([]);
    renderLive();
  });
  $('btn-help').addEventListener('click', openHelp);
  $('btn-revert').addEventListener('click', revertSample);
  const lineLinks = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-seek], a[data-line], a[data-open-file]');
    if (!a) return;
    if (a.dataset.seek !== undefined) seek(Number(a.dataset.seek));
    if (a.dataset.line !== undefined) openAt(a.dataset.file || undefined, Number(a.dataset.line), 0);
    if (a.dataset.openFile !== undefined) switchFile(a.dataset.openFile);
  };
  alerts.addEventListener('click', lineLinks);
  onLoading.fn = renderAlerts; // a window of steps started loading: say so, with its time
  // window navigation (gdb sessions)
  alerts.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-win]');
    const w = S.trace?.window;
    if (!b || !w) return;
    if (b.dataset.win === 'prev') void loadWindow(Math.max(0, w.from - windowSize()));
    else if (b.dataset.win === 'next') void loadWindow(w.to);
    else if (b.dataset.win === 'stats') toggleStats();
  });
  alerts.addEventListener('keydown', (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-goto]');
    if (!input || e.key !== 'Enter') return;
    const step = Number(input.value);
    if (Number.isInteger(step) && step >= 0) void loadWindow(step);
  });
  inspector.addEventListener('click', lineLinks);
  $('btn-open').addEventListener('click', () => void openFolderDialog());
  $('btn-files').addEventListener('click', toggleExplorer);
  $('btn-save').addEventListener('click', openSaveDialog);
  $<HTMLInputElement>('run-args').addEventListener('change', (e) => {
    const args = splitArgs((e.target as HTMLInputElement).value).slice(0, 32);
    if (!S.project) return sampleRunChanged(() => update('args', { args }));
    updateRun('args', { args });
    runChanged();
  });
  // steps per window (gdb sessions): a new size starts the session again
  const winInput = $<HTMLInputElement>('run-window');
  winInput.value = String(windowSize());
  winInput.addEventListener('change', () => {
    const v = Math.round(Number(winInput.value) / 1000) * 1000;
    if (!(v >= 1000 && v <= WINDOW_MAX)) {
      toast(`window: 1,000 to ${WINDOW_MAX.toLocaleString('en-US')} steps`);
      return void (winInput.value = String(windowSize()));
    }
    store.set('windowSteps', String(v));
    winInput.value = String(v);
    closeSession();
    if (!S.project) return sampleRunChanged(() => {});
    runChanged();
  });
  // compile and run again by hand, without waiting for an edit to do it
  $('run-again').addEventListener('click', rebuild);
  // stdout as a terminal (line-buffered) or a pipe (fully buffered): the run
  // really goes that way, so printf's buffer behaves as it would there
  const ttyBtn = $('run-tty');
  const showTty = () => {
    const pipe = store.get('stdout') === 'pipe';
    ttyBtn.setAttribute('aria-pressed', String(!pipe));
    $('run-tty-label').textContent = pipe ? 'stdout: pipe' : 'stdout: terminal';
  };
  showTty();
  ttyBtn.addEventListener('click', () => {
    store.set('stdout', store.get('stdout') === 'pipe' ? 'terminal' : 'pipe');
    showTty();
    if (!S.project) return sampleRunChanged(() => {});
    runChanged();
  });
  $<HTMLInputElement>('run-defs').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const defs = input.value.split(/[\s,]+/).map((d) => d.replace(/^-D/, '')).filter(Boolean);
    const bad = defs.find((d) => !/^[A-Za-z_]\w*(=[\w.+-]*)?$/.test(d));
    if (bad) return toast(`-D ${bad}: use NAME or NAME=value`);
    if (!S.project) return sampleRunChanged(() => update('defines', { defines: defs.slice(0, 32) }));
    updateRun('defines', { defines: defs.slice(0, 32) });
    runChanged();
  });
  window.addEventListener('beforeunload', (e) => {
    if (!S.project || S.project.readOnly) return;
    writeProjectBackup(S.project);
    // the backup keeps edits across a reload; closing still deserves a warning
    if (dirtyFiles().some((f) => isSource(f.path) && !liveFrom.has(f.path))) e.preventDefault();
  });
  $('btn-blueprint-save').addEventListener('click', exportBlueprint);
  $('btn-blueprint-load').addEventListener('click', () => $<HTMLInputElement>('blueprint-file').click());
  $<HTMLInputElement>('blueprint-file').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.[0]) void importBlueprint(input.files[0]);
    input.value = '';
  });
  renderEngines();
  $<HTMLTextAreaElement>('stdin').addEventListener('input', (e) => {
    const value = (e.target as HTMLTextAreaElement).value;
    if (S.project) {
      updateRun('stdin', { stdin: value });
      return runChanged();
    }
    sampleRunChanged(() => update('stdin', { stdin: value }));
  });
  $('btn-fit').addEventListener('click', () => view.fit(S));
  $('btn-legend').addEventListener('click', () => toggleLegend());
  $('legend').addEventListener('click', (e) => (e.target as HTMLElement).closest('[data-close]') && toggleLegend(false));
  $('btn-tidy').addEventListener('click', tidy);
  document.addEventListener('pointerdown', (e) => {
    const list = $('skin-list');
    if (!list.hidden && !(e.target as HTMLElement).closest('#skin-list, #skins')) list.hidden = true;
    const ex = $('example-list');
    if (!ex.hidden && !(e.target as HTMLElement).closest('#example-list, #examples')) (ex.hidden = true), $('examples').setAttribute('aria-expanded', 'false');
    const tl = $('test-list');
    if (!tl.hidden && !(e.target as HTMLElement).closest('#test-list, #tests')) (tl.hidden = true), $('tests').setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $('skin-list').hidden = true;
    $('example-list').hidden = true;
    $('examples').setAttribute('aria-expanded', 'false');
    $('test-list').hidden = true;
    $('tests').setAttribute('aria-expanded', 'false');
    toggleSpeedMenu(false);
  });
  $('feed').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.kf');
    if (row) seek(Number(row.dataset.i));
  });
  document.querySelectorAll<HTMLButtonElement>('#insides button').forEach((b) => b.addEventListener('click', () => setAllShut(b.dataset.v === 'hide')));
  const followBtn = $('btn-follow');
  followBtn.setAttribute('aria-pressed', String(S.follow));
  followBtn.addEventListener('click', () => {
    update('toggleFollow', { follow: !S.follow });
    followBtn.setAttribute('aria-pressed', String(S.follow));
  });
  overlay.addEventListener('mousedown', (e) => e.target === overlay && closeOverlay());
  document.addEventListener('mousedown', (e) => !menu.contains(e.target as Node) && hideMenu());

  document.querySelectorAll<HTMLButtonElement>('.pb-buttons button').forEach((b) =>
    b.addEventListener('click', () => {
      ({ start: () => seek(0), back: stepBack, play: togglePlay, step: stepFwd, end: () => seek(N()) } as Record<string, () => void>)[b.dataset.act!]();
    }),
  );
  setAnimMode(store.get('anim') === 'focus' ? 'focus' : 'fast');
  renderAnimMode();
  document.querySelectorAll<HTMLButtonElement>('#anim-mode button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode as AnimMode)));
  $('spd-down').addEventListener('click', () => setSpeed(-1));
  $('spd-up').addEventListener('click', () => setSpeed(1));
  $('pb-speed').addEventListener('click', () => toggleSpeedMenu());
  $('speed').addEventListener('wheel', (e) => {
    e.preventDefault();
    if (Math.abs(e.deltaY) < 1) return;
    setSpeed(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  const speedMenu = $('speed-menu');
  speedMenu.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-speed]');
    if (!b) return;
    setSpeedTo(Number(b.dataset.speed));
    toggleSpeedMenu(false);
  });
  speedMenu.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    if (input.id === 'speed-typed') setSpeedTo(Number(input.value));
  });
  speedMenu.addEventListener('keydown', (e) => {
    e.stopPropagation(); // typing here isn't the player's keys
    if (e.key === 'Enter') {
      setSpeedTo(Number((e.target as HTMLInputElement).value));
      toggleSpeedMenu(false);
    } else if (e.key === 'Escape') toggleSpeedMenu(false);
  });
  document.addEventListener('pointerdown', (e) => {
    if (!speedMenu.hidden && !$('speed').contains(e.target as Node)) toggleSpeedMenu(false);
  });
  let scrubbing = false;
  const scrub = (e: PointerEvent) => {
    const r = timeline.getBoundingClientRect();
    seek(Math.round(((e.clientX - r.left) / r.width) * N()));
  };
  timeline.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // (right-click: a note)
    scrubbing = true;
    timeline.setPointerCapture(e.pointerId);
    scrub(e);
  });
  timeline.addEventListener('pointermove', (e) => scrubbing && scrub(e));
  timeline.addEventListener('pointerup', () => (scrubbing = false));
  timeline.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const r = timeline.getBoundingClientRect();
    askNote(Math.min(N() - 1, Math.floor(((e.clientX - r.left) / r.width) * N())), e.clientX, e.clientY);
  });

  bindMouse();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', () => view.resize());
  try {
    const z = Number(localStorage.getItem('ftb.zoom'));
    setUiZoom(z > 0 ? z : 1, view, hideMenu);
  } catch {
    setUiZoom(1, view, hideMenu);
  }
  $('ui-zoom-in').addEventListener('click', () => stepUiZoom(1, view, hideMenu));
  $('ui-zoom-out').addEventListener('click', () => stepUiZoom(-1, view, hideMenu));
  $('ui-zoom-read').addEventListener('click', () => setUiZoom(1, view, hideMenu));
  let wheelAcc = 0;
  window.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // a mouse notch is one step; a trackpad pinch adds up small deltas
      wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      if (Math.abs(wheelAcc) < 50) return;
      stepUiZoom(wheelAcc < 0 ? 1 : -1, view, hideMenu);
      wheelAcc = 0;
    },
    { passive: false },
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '=' || e.key === '+') stepUiZoom(1, view, hideMenu);
      else if (e.key === '-' || e.key === '_') stepUiZoom(-1, view, hideMenu);
      else if (e.key === '0') setUiZoom(1, view, hideMenu);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
  new ResizeObserver(() => view.resize()).observe($('grid-wrap'));

  renderSampleTabs();
  renderTestsMenu();
  renderSkinPicker();
  initGfxButton(view, () => S.skin);
  showSpeed();
  $('file-name').textContent = S.sample.file;
  // a replay file (src/replay.ts): its skin, its run, and no server at all
  const replay = readReplay();
  if (replay) await applySkin(SKINS.find((k) => k.id === replay.skin) ?? S.skin);
  else await applySkin(S.skin);
  await document.fonts.ready;
  view.resize();
  if (replay) {
    startReplay(replay);
    requestAnimationFrame(frame);
    initSearch();
    // (a handle for the frame comparison, tools/replaycmp.mjs)
    Object.assign(window, { __ftb: { S, view, layout, editor, applySkin, SKINS, freeze: (on = true) => void (frozen = on) } });
    return;
  }
  initReplayButton();
  // Like VS Code: the folder named on the command line, else the last one open.
  const initial = await fsCall<{ path: string | null }>('initial', {}).catch(() => 'unavailable' as const);
  const last = store.get('lastProject') ?? '';
  let opened = false;
  if (initial !== 'unavailable' && initial.path) opened = await openFolder(initial.path);
  else if (initial !== 'unavailable' && last.startsWith('folder:')) opened = await openFolder(last.slice(7));
  else if (last.startsWith('sample:') && SAMPLE_PROJECTS.some((x) => x.key === last.slice(7))) (loadSample(last.slice(7)), (opened = true));
  if (!opened) loadSample(store.get('lastSample') ?? S.sample.key);
  requestAnimationFrame(frame);
  editor.focus();
  // Dev-only handle for the headless screenshot checks.
  if (import.meta.env.DEV) Object.assign(window, { __ftb: { S, view, layout, editor, computeBelts, openFolder, switchFile, refreshMeta, dirtyFiles, stageRect, applySkin, SKINS, glass: setGlassTint, freeze: (on = true) => void (frozen = on),
    // diagnostics: what a frame costs, what went wrong (on: start or stop the profiler)
    // (stopping returns what was counted, then clears it)
    diag: (on?: boolean) => { const r = diagReport(); if (on !== undefined) diagOn(view, on); return on ? diagReport() : r; } } });
  initSearch();
  if (import.meta.env.DEV) initDiagPanel(view);
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 10px 10px;color:#e2473b;background:#000;padding:10px">${esc(String(err?.stack ?? err))}</pre>`);
});
