import { baseName } from './skins/util';
import { beatNow, beatStarts, computeText, writesOf } from './beats';
import { machineSize } from './machine';
import { planOf } from './interior';
import { connectLive, liveReplay, liveReveal, type LiveMsg } from './live';
import { EditorView } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import { createEditor, createState, jumpTo, setDoc, setExecLine, setVim, swapState, type EditorHooks } from './editor';
import { evaluateInterpreterBindings, fmtVal, run, type Ev, type Payload, type Trace } from './interp';
import { isSafeBindingExpr, parseBlueprint, serializeBlueprint, type Blueprint, type Sprite, type SpriteKind } from './blueprint';
import { doorsOf, folded, footprint, Layout, shut } from './layout';
import { convertGdb, requestTrace, type GResult } from './gdb';
import { findViolations, parseInvariant, surpriseCalls, type Violation } from './invariants';
import { bufferShapes, initParser, parse, validateBindingExpr, type Model, type Var } from './parse';
import { GridView, activeHostRect, animMode, clip, prepareStage, returnCard, computeBelts, entKey, durationAt, entityAt, foldAt, frameAt, pointeeName, argLabel, retLabel, setAnimMode, stationAt, machineHeadAt, spriteWorldRect, stageRect, staged, type AnimMode, type Entity, type ViewState } from './render';
import { buildScene } from './route';
import { SAMPLES, SAMPLE_PROJECTS, type Sample, type SampleProject } from './samples';
import {
  BP_JSON, DRIVER, META, RUN_JSON, buildFiles, fromFiles, fsCall, hash, isDirty, isSource, joinArgs, lineDiff, parseRun, projectModel,
  runEmpty, save, serializeRun, splitArgs, type Listing, type Opened, type PFile, type Project,
} from './workspace';
import { SKINS, SKIN_FONTS, SKIN_GROUPS, otherMode } from './skins';
import type { IconKind, Skin } from './skins/types';
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

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(`ftb.${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      localStorage.setItem(`ftb.${k}`, v);
    } catch {
      /* private window etc. */
    }
  },
};

// ---------------- state ----------------
const layout = new Layout();
const S: ViewState & {
  playing: boolean;
  speed: number;
  stepTarget: number | null;
  follow: boolean;
  legend: IconKind | null;
  sample: Sample;
  mode: string;
  vim: boolean;
  skin: Skin;
  cursor: { line: number; col: number };
  engine: 'auto' | 'interp' | 'gdb';
  stdin: string;
  gdb: { status: 'idle' | 'running' | 'done' | 'unavailable' | 'error'; compile?: GResult['compile']; error?: string; ms?: number };
  sprites: Sprite[];
  project: Project | null; // M5: an open folder (or a bundled sample project)
} = {
  layout,
  model: null,
  trace: null,
  pos: 0,
  selected: null,
  hovered: null,
  editorFn: null,
  playing: false,
  speed: 1,
  stepTarget: null,
  follow: true,
  legend: null,
  sample: SAMPLES[0],
  mode: 'normal',
  vim: store.get('vim') !== 'off',
  skin: SKINS.find((s) => s.id === store.get('skin')) ?? SKINS[0],
  cursor: { line: 0, col: 0 },
  engine: (['auto', 'interp', 'gdb'].includes(store.get('engine') ?? '') ? store.get('engine') : 'auto') as 'auto' | 'interp' | 'gdb',
  stdin: '',
  gdb: { status: 'idle' },
  sprites: [],
  project: null,
};

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
  toast(m === 'focus' ? 'Focus: calls and returns are staged — the rest dims, the data travels 2–3 times' : 'Fast: every step once, the camera only pans');
}

// Long real traces pick a speed that plays them in about two minutes (at most 3×).
function autoSpeed(trace: Trace): void {
  const total = trace.evs.reduce((a, e, i) => a + durationAt(trace, S.model, i) / (staged(e) ? Math.min(S.speed, FOCUS_MAX) : 1), 0);
  // statements animate inside the machines: never so fast they can't be followed
  S.speed = SPEEDS.find((sp) => total / sp <= 120 || sp >= 3) ?? 3;
  $('pb-speed').textContent = `${S.speed}×`;
}

const LEGEND: { kind: IconKind; name: string; c: string; live: boolean; text: string }[] = [
  { kind: 'node', name: 'Function', c: 'function definition', live: true, text: 'One per function. Shows whether it is running, waiting on a callee, or idle.' },
  { kind: 'belt', name: 'Call', c: 'f(a, b)', live: true, text: 'Caller → callee. Arguments ride in, the return value rides back. Animated while the call is in progress. Drag it to re-route.' },
  { kind: 'frame', name: 'Stack frame', c: 'parameters + locals', live: true, text: 'Attached under its function. Appears on call; after the return it stays dimmed with the last values.' },
  { kind: 'wire', name: 'Pointer', c: 'T *p', live: true, text: 'Runs from a pointer to what it points at. A write through *p travels along it.' },
  { kind: 'chest', name: 'Static', c: 'static / global variable', live: true, text: 'Lives for the whole program, not one call. Tethered to the function that owns it.' },
  { kind: 'strip', name: 'Strip', c: 'array with indices', live: true, text: 'Drag onto the grid; bind bytes, length and markers in the inspector.' },
  { kind: 'chest', name: 'Chest', c: 'value or storage', live: true, text: 'Drag onto the grid and bind a value.' },
  { kind: 'marker' as IconKind, name: 'Marker', c: 'cursor or index', live: true, text: 'Standalone card showing a bound index. To make a cursor ride a strip, add it in that strip’s Markers field.' },
  { kind: 'drill', name: 'Drill', c: 'input fd', live: true, text: 'Drag onto the grid and bind its source.' },
  { kind: 'copy', name: 'Inserter', c: 'memcpy / copy loop', live: true, text: 'Drag onto the grid and bind what the copy is moving, e.g. the bytes left (n) in gnl_copy.' },
  { kind: 'train', name: 'Train', c: 'linked list', live: true, text: 'Drag onto the grid and bind a pointer.' },
  { kind: 'stack', name: 'Stack', c: 'stack A / B', live: true, text: 'Drag onto the grid and bind a value.' },
];

// ---------------- DOM ----------------
const canvas = $<HTMLCanvasElement>('grid');
const view = new GridView(canvas);
const gridPane = $<HTMLElement>('grid-pane');
const editorPane = $<HTMLElement>('editor-pane');
const inspector = $<HTMLElement>('inspector');
const alerts = $<HTMLElement>('alerts');
const overlay = $<HTMLElement>('overlay');
const toastEl = $<HTMLElement>('toast');
const timeline = $<HTMLCanvasElement>('timeline');
const menu = $<HTMLElement>('menu');

const decl = (type: string, name: string) => (type.endsWith('*') ? type + name : `${type} ${name}`);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let toastTimer = 0;
function toast(msg: string, action?: { label: string; run: () => void }): void {
  toastEl.textContent = msg;
  toastEl.classList.toggle('act', !!action);
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      toastEl.hidden = true;
      action.run();
    });
    toastEl.append(' ', b);
  }
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), action ? 6000 : 2000);
}

// ---------------- analysis ----------------
let debounce = 0;
let editor: ReturnType<typeof createEditor>;

// The buffer (a sample) or every file of the open project.
function currentSrc(): string {
  return editor.state.doc.toString();
}

function analyze(src: string, fresh: boolean): void {
  const model = S.project ? projectModel(S.project) : parse(src);
  modelRevision++;
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
  if (sel?.k === 'node' && renamed.has(sel.id)) S.selected = { k: 'node', id: renamed.get(sel.id)! };
  if (sel?.k === 'node' && !layout.nodes.has((S.selected as { id: string }).id)) S.selected = null;
  S.model = model;
  const engine = engineFor(model);
  cancelGdb();
  if (engine === 'interp') {
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

function applyTrace(trace: Trace | null, fresh: boolean): void {
  const oldN = S.trace?.evs.length ?? 0;
  const atEnd = S.trace !== null && S.pos >= oldN;
  S.trace = trace;
  prepareStage(trace); // focus mode sizes each return's card before playing it
  traceRevision++;
  lastInspectorKey = '';
  const n = trace?.evs.length ?? 0;
  S.pos = fresh ? 0 : atEnd ? n : Math.min(S.pos, n);
  S.stepTarget = null;
  if (!trace) S.playing = false;
}

// ---------------- engines: the interpreter, or the real thing under gdb ----------------
function engineFor(model: Model): 'interp' | 'gdb' | 'none' {
  if (model.error || !model.byName.has('main')) return 'none';
  if (model.project) return 'gdb'; // the interpreter reads one buffer
  if (S.engine !== 'auto') return S.engine;
  return model.fns.some((f) => f.externals.length) ? 'gdb' : 'interp';
}

let gdbTimer = 0;
let gdbAbort: AbortController | null = null;
function cancelGdb(): void {
  clearTimeout(gdbTimer);
  gdbAbort?.abort();
  gdbAbort = null;
  if (S.gdb.status === 'running') S.gdb = { status: 'idle' };
}

function startGdb(src: string, model: Model, fresh: boolean): void {
  S.gdb = { status: 'running' };
  gdbTimer = window.setTimeout(async () => {
    const ac = new AbortController();
    gdbAbort = ac;
    let r: GResult | 'unavailable';
    const p = S.project;
    const files = p ? buildFiles(p) : null;
    try {
      r = await requestTrace(
        p
          ? {
            project: { files: files! }, defines: p.run.defines, stdin: p.run.stdin, args: p.run.args,
            fns: [...new Set(model.fns.map((f) => f.cname))], maxSteps: 20000, maxSeconds: 8,
            // the tracer knows functions by C name and file, not by key
            bindings: S.sprites.map((sp) => {
              const fn = sp.binding?.fn ? model.byName.get(sp.binding.fn) : undefined;
              return fn && sp.binding ? { ...sp, binding: { ...sp.binding, fn: fn.cname, file: fn.file } } : sp;
            }),
          }
          : { src, files: S.sample.files, defines: S.sample.defines, stdin: S.stdin, fns: model.fns.map((f) => f.name), maxSteps: 20000, maxSeconds: 8, bindings: S.sprites },
        ac.signal,
      );
    } catch {
      return; // superseded by a newer edit
    }
    if (ac.signal.aborted || S.model !== model) return;
    gdbAbort = null;
    if (r === 'unavailable') {
      S.gdb = { status: 'unavailable' };
      applyTrace(null, fresh);
    } else if (!r.ok) {
      S.gdb = { status: 'error', compile: r.compile, error: r.error };
      applyTrace(null, fresh);
    } else {
      S.gdb = { status: 'done', ms: r.ms };
      applyTrace(convertGdb(r, model, files ?? src), fresh);
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
      S.engine = b.dataset.id as typeof S.engine;
      store.set('engine', S.engine);
      renderEngines();
      analyze(editor.state.doc.toString(), false);
    }),
  );
}

// ---------------- per-sample work, kept in this browser ----------------
interface Saved {
  src: string;
  stdin?: string;
  places: [string, number, number, boolean][];
  waypoints: [string, number, number][];
  sprites?: Sprite[];
  folded?: string[];
  shut?: string[];
}

function readSaved(key: string): Saved | null {
  try {
    const raw = store.get(`sample.${key}`);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

const saveTimers = new Map<string, number>();
function saveSoon(): void {
  if (S.project) return projectSaveSoon();
  const key = S.sample.key;
  clearTimeout(saveTimers.get(key));
  const saved: Saved = {
    src: editor.state.doc.toString(),
    stdin: S.stdin,
    places: [...layout.nodes.values()].map((n) => [n.id, n.place.x, n.place.y, n.place.pinned]),
    waypoints: [...layout.waypoints].map(([k, w]) => [k, w.x, w.y]),
    sprites: structuredClone(S.sprites),
    folded: [...folded],
    shut: [...shut],
  };
  saveTimers.set(key, window.setTimeout(() => {
    store.set(`sample.${key}`, JSON.stringify(saved));
    saveTimers.delete(key);
    if (S.sample.key === key) renderRevert();
  }, 400));
}

function applySavedLayout(saved: Saved): void {
  for (const [id, x, y, pinned] of saved.places) {
    const n = layout.nodes.get(id);
    if (n) n.place = { x, y, pinned };
  }
  for (const [k, x, y] of saved.waypoints) layout.waypoints.set(k, { x, y });
  for (const k of saved.shut ?? []) shut.add(k);
  if (saved.folded?.length || saved.shut?.length) {
    for (const k of saved.folded ?? []) folded.add(k);
    if (S.model) layout.reflow(S.model);
  }
  settle();
}

// A layout saved when machines were smaller can overlap now: lay it out again.
function settle(): void {
  renderInsides();
  if (!S.model) return;
  const moved = layout.settle(S.model);
  if (moved) toast(`rearranged ${moved} machine${moved === 1 ? '' : 's'} that overlapped`);
}

// Back to the auto layout (with an undo for a few seconds).
function tidy(): void {
  if (!S.model) return;
  const was = new Map([...layout.nodes].map(([id, n]) => [id, { ...n.place }]));
  const wp = new Map(layout.waypoints);
  const mods = new Map([...layout.modules].map(([f, m]) => [f, { ...m }]));
  layout.tidy(S.model);
  saveSoon();
  view.fit(S);
  toast('tidied: every machine back to its auto place', {
    label: 'Undo',
    run: () => {
      for (const [id, p] of was) {
        const n = layout.nodes.get(id);
        if (n) n.place = p;
      }
      layout.waypoints.clear();
      for (const [k, v] of wp) layout.waypoints.set(k, v);
      for (const [f, m] of mods) layout.modules.set(f, m);
      saveSoon();
    },
  });
}

// Show or hide the insides of one machine, or of all of them.
function toggleShut(fn: string): void {
  if (!S.model) return;
  if (shut.has(fn)) shut.delete(fn);
  else shut.add(fn);
  layout.reflow(S.model);
  lastInspectorKey = '';
  saveSoon();
  renderInsides();
}
function setAllShut(closed: boolean): void {
  if (!S.model) return;
  for (const f of S.model.fns) {
    if (closed) shut.add(f.name);
    else shut.delete(f.name);
  }
  layout.reflow(S.model);
  saveSoon();
  renderInsides();
  view.fit(S);
}
function renderInsides(): void {
  const all = !!S.model?.fns.length && S.model.fns.every((f) => shut.has(f.name));
  document.querySelectorAll<HTMLButtonElement>('#insides button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === 'hide' ? all : !all)));
}

function blueprint(): Blueprint {
  if (S.project) return layout.toBlueprint(S.sprites, true);
  return {
    version: 1,
    nodes: Object.fromEntries([...layout.nodes.values()].map((n) => [n.id, { x: n.place.x, y: n.place.y, pinned: n.place.pinned }])),
    waypoints: Object.fromEntries([...layout.waypoints].map(([k, p]) => [k, { x: p.x, y: p.y }])),
    sprites: S.sprites,
  };
}

function exportBlueprint(): void {
  const data = new Blob([serializeBlueprint(blueprint())], { type: 'application/json' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${S.project?.name ?? S.sample.key}.blueprint.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBlueprint(file: File): Promise<void> {
  try {
    if (file.size > 200_000) throw new Error('Blueprint is too large');
    const bp = parseBlueprint(await file.text());
    if (S.project && S.model) (layout.applyBlueprint(bp, S.model, false), settle());
    else {
      for (const [id, p] of Object.entries(bp.nodes)) {
        const n = layout.nodes.get(id);
        if (n) n.place = { ...p };
      }
      layout.waypoints.clear();
      for (const [id, p] of Object.entries(bp.waypoints)) layout.waypoints.set(id, p);
    }
    S.sprites = bp.sprites;
    S.selected = null;
    bindingsChanged();
    saveSoon();
    view.fit(S);
    toast(`loaded ${bp.sprites.length} sprite${bp.sprites.length === 1 ? '' : 's'}`);
  } catch (e) { toast(`Blueprint: ${(e as Error).message}`); }
}

function renderRevert(): void {
  if (S.project) return void ($<HTMLButtonElement>('btn-revert').hidden = true);
  const saved = readSaved(S.sample.key);
  const edited = !!saved && (saved.src !== S.sample.src || (saved.stdin ?? '') !== (S.sample.stdin ?? '') || saved.places.some((p) => p[3]) || saved.waypoints.length > 0 || !!saved.sprites?.length);
  $<HTMLButtonElement>('btn-revert').hidden = !edited;
}

function revertSample(): void {
  clearTimeout(saveTimers.get(S.sample.key));
  saveTimers.delete(S.sample.key);
  store.set(`sample.${S.sample.key}`, '');
  loadSample(S.sample.key, true);
  toast('back to the original sample (Ctrl+Z in the editor undoes this)');
}

function loadSample(key: string | undefined, pristine = false): void {
  const sp = SAMPLE_PROJECTS.find((x) => x.key === key);
  if (sp) return openSampleProject(sp);
  const s = SAMPLES.find((x) => x.key === key || x.title === key) ?? (key ? SAMPLES[Number(key) - 1] : undefined);
  if (!s) return toast(`no sample “${key}” — try ${SAMPLES.map((x) => x.key).join(', ')}`);
  if (S.project) leaveProject();
  S.sample = s;
  S.selected = null;
  store.set('lastSample', s.key);
  const saved = pristine ? null : readSaved(s.key);
  S.sprites = saved?.sprites ? parseSavedSprites(saved.sprites) : [];
  const src = saved?.src ?? s.src;
  S.stdin = saved?.stdin ?? s.stdin ?? '';
  $<HTMLTextAreaElement>('stdin').value = S.stdin;
  $('file-name').textContent = s.file;
  renderSampleTabs();
  loadingSample = true;
  setDoc(editor, src);
  loadingSample = false;
  clearTimeout(debounce);
  analyze(src, true);
  renderProjectChrome();
  if (saved) {
    applySavedLayout(saved);
    view.home(S, true);
  }
  renderRevert();
  if (S.trace) setTimeout(() => play(), 450);
}

function parseSavedSprites(sprites: Sprite[]): Sprite[] {
  try { return parseBlueprint({ version: 1, nodes: {}, waypoints: {}, sprites }).sprites; }
  catch { return []; }
}

function bindingsChanged(): void {
  lastInspectorKey = '';
  if (!S.model) return;
  const engine = engineFor(S.model);
  if (engine === 'interp') applyTrace(evaluateInterpreterBindings(run(S.model), S.sprites), false);
  else if (engine === 'gdb') {
    cancelGdb();
    applyTrace(null, false);
    startGdb(editor.state.doc.toString(), S.model, false);
    renderAlerts();
  }
}

// ---------------- projects (M5) ----------------
// A project's unsaved work lives in the page, backed up to this browser
// ("hot exit"), and reaches disk only through the Save dialog.

interface ProjectSaved {
  layout: Blueprint; // every position, for continuity
  bpBase: string; // hash of blueprint.json on disk when this was saved
  buffers: Record<string, { text: string; base: string | null }>; // unsaved files, over this disk text
  run: Project['run'];
  runBase: string;
  tabs: string[];
  active: string;
}

const projectStore = (p: Project) => `project.${p.key}`;
function readProjectSaved(p: Project): ProjectSaved | null {
  try {
    const raw = store.get(projectStore(p));
    return raw ? (JSON.parse(raw) as ProjectSaved) : null;
  } catch {
    return null;
  }
}

// The editor has the active file's newest text.
function syncActive(): void {
  const p = S.project;
  const f = p?.files.get(p.active);
  if (f) f.text = editor.state.doc.toString();
}

let projectSaveTimer = 0;
function projectSaveSoon(): void {
  const p = S.project;
  if (!p) return;
  clearTimeout(projectSaveTimer);
  projectSaveTimer = window.setTimeout(() => {
    if (S.project === p) writeProjectBackup(p);
  }, 400);
}

function writeProjectBackup(p: Project): void {
  if (S.project === p) syncActive();
  const buffers: ProjectSaved['buffers'] = {};
  for (const f of p.files.values()) {
    if (!isSource(f.path) || !isDirty(f) || liveFrom.has(f.path)) continue; // an editor's unsaved text lives in that editor
    buffers[f.path] = { text: f.text, base: f.disk === null ? null : hash(f.disk) };
  }
  const saved: ProjectSaved = {
    layout: layout.toBlueprint(S.sprites, true), bpBase: hash(p.files.get(BP_JSON)?.disk ?? ''),
    buffers, run: p.run, runBase: hash(p.files.get(RUN_JSON)?.disk ?? ''), tabs: p.tabs, active: p.active,
  };
  store.set(projectStore(p), JSON.stringify(saved));
  if (S.project === p) renderProjectChrome();
}

function stateFor(f: PFile) {
  return (f.state ??= createState(f.text, hooks, S.vim));
}

const mainFileOf = (p: Project) =>
  [...p.files.values()].find((f) => f.path.endsWith('.c') && f.path !== DRIVER && /^\s*int\s+main\s*\(/m.test(f.text))?.path ??
  (p.files.has(DRIVER) ? DRIVER : [...p.files.keys()].filter((k) => k.endsWith('.c')).sort()[0] ?? [...p.files.keys()][0]);

function leaveProject(): void {
  const p = S.project;
  if (!p) return;
  store.set('lastProject', '');
  clearTimeout(projectSaveTimer);
  writeProjectBackup(p);
  stopPolling();
  S.project = null;
  cancelGdb();
  layout.reset();
  // a fresh state: the sample must not share the project file's undo history
  loadingSample = true;
  swapState(editor, createState('', hooks, S.vim), S.vim, hooks);
  loadingSample = false;
  const kept = [...p.files.values()].filter(isDirty).length;
  if (kept && !p.readOnly) toast(`${p.name}: ${kept} unsaved file${kept === 1 ? '' : 's'} kept in this browser — reopen to save`);
}

async function openFolder(path: string): Promise<boolean> {
  let r: Opened | 'unavailable';
  try {
    r = await fsCall<Opened>('open', { dir: path });
  } catch (e) {
    toast(`Open Folder: ${(e as Error).message}`);
    return false;
  }
  if (r === 'unavailable') {
    toast('opening a folder needs the local server (npm run dev)');
    return false;
  }
  const recent = [r.root, ...readRecent().filter((x) => x !== r.root)].slice(0, 8);
  store.set('recent', JSON.stringify(recent));
  loadProject(fromFiles(r.root, r.name, r.files, r.truncated));
  return true;
}

function readRecent(): string[] {
  try {
    const v = JSON.parse(store.get('recent') ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function openSampleProject(sp: SampleProject): void {
  loadProject(fromFiles(null, sp.name, Object.entries(sp.files).map(([path, text]) => ({ path, text, mtime: null }))));
}

function loadProject(p: Project): void {
  if (S.project) leaveProject();
  S.project = p;
  S.selected = null;
  S.sprites = [];
  store.set('lastProject', p.root ? `folder:${p.root}` : `sample:${SAMPLE_PROJECTS.find((x) => x.name === p.name)?.key ?? ''}`);
  // Hot exit: unsaved buffers come back only over the disk text they were edited from.
  const saved = readProjectSaved(p);
  let restored = 0;
  for (const [path, b] of Object.entries(saved?.buffers ?? {})) {
    const f = p.files.get(path);
    if (f && f.disk !== null && hash(f.disk) === b.base) (f.text = b.text), restored++;
    else if (!f && b.base === null) (p.files.set(path, { path, text: b.text, disk: null, mtime: null, state: null }), restored++);
  }
  if (saved && saved.runBase === hash(p.files.get(RUN_JSON)?.disk ?? '')) p.run = saved.run;
  p.active = saved?.active && p.files.has(saved.active) ? saved.active : mainFileOf(p);
  p.tabs = (saved?.tabs ?? []).filter((t) => p.files.has(t));
  if (!p.tabs.includes(p.active)) p.tabs.push(p.active);
  loadingSample = true;
  swapState(editor, stateFor(p.files.get(p.active)!), S.vim, hooks);
  loadingSample = false;
  renderRunFields();
  cancelGdb();
  clearTimeout(debounce);
  analyze('', true);
  // The committed blueprint, then this browser's newer layout made on top of it.
  const bpDisk = p.files.get(BP_JSON)?.disk ?? null;
  if (bpDisk && S.model) {
    try {
      const bp = parseBlueprint(bpDisk);
      layout.applyBlueprint(bp, S.model, false);
      S.sprites = bp.sprites;
    } catch (e) {
      toast(`${BP_JSON}: ${(e as Error).message} — ignored`);
    }
  }
  if (saved && saved.bpBase === hash(bpDisk ?? '') && S.model) {
    try {
      const bp = parseBlueprint(saved.layout);
      layout.applyBlueprint(bp, S.model, true);
      S.sprites = bp.sprites;
    } catch {
      /* an old backup format: the committed blueprint stands */
    }
  }
  if (S.sprites.length) bindingsChanged();
  settle();
  renderInsides();
  view.home(S, true);
  renderProjectChrome();
  renderAlerts();
  renderStatus();
  startPolling();
  // an editor may already have unsaved text in this folder
  if (p.root) void liveReplay().then((ms) => S.project === p && ms.forEach(onLive));
  if (restored) toast(`restored ${restored} unsaved file${restored === 1 ? '' : 's'} from this browser`);
  else if (p.truncated) toast('large folder: only the first 800 source files were loaded');
}

function closeProject(): void {
  leaveProject();
  loadSample(store.get('lastSample') ?? SAMPLES[0].key);
}

function switchFile(path: string, at?: { line: number; col: number }): void {
  const p = S.project;
  const f = p?.files.get(path);
  if (!p || !f) return;
  if (p.active !== path) {
    const cur = p.files.get(p.active);
    if (cur) (cur.state = editor.state), (cur.text = editor.state.doc.toString());
    p.active = path;
    if (!p.tabs.includes(path)) p.tabs.push(path);
    loadingSample = true;
    swapState(editor, stateFor(f), S.vim, hooks);
    loadingSample = false;
    lastExec = ''; // mark the running line again, in this file
    renderProjectChrome();
    projectSaveSoon();
  }
  if (at) jumpTo(editor, at.line, at.col);
}

// Jump to a place in the code: another file in a project, else this buffer.
function openAt(file: string | undefined, line: number, col = 0): void {
  if (S.project && file) switchFile(file, { line, col });
  else jumpTo(editor, line, col);
  // the connected editors (nvim…) go there too
  if (S.project?.root && file && liveEditors.length) void liveReveal(S.project.root, file, line, col);
}

// ---- M6: live edits from any editor (the nvim plugin, …) ----
// The page doesn't care where an edit comes from: an editor's unsaved text
// for a file is applied like typing here, and the latest change wins.
let liveEditors: string[] = [];
const liveFrom = new Map<string, string>(); // project path → the editor whose unsaved text it shows
const liveOutside = new Set<string>();

function renderLive(): void {
  const el = $('st-live');
  el.hidden = !liveEditors.length;
  el.innerHTML = liveEditors.length ? `<span class="ok">●</span> live: ${esc(liveEditors.join(', '))}` : '';
  el.title = 'edits in these editors show here as you type';
}

// New text for a project file, as a minimal change so cursors and scroll stay put.
function setFileText(p: Project, f: PFile, text: string): void {
  if (f.path === p.active) {
    const old = editor.state.doc.toString();
    let a = 0;
    while (a < old.length && a < text.length && old[a] === text[a]) a++;
    let b = 0;
    while (b < old.length - a && b < text.length - a && old[old.length - 1 - b] === text[text.length - 1 - b]) b++;
    editor.dispatch({ changes: { from: a, to: old.length - b, insert: text.slice(a, text.length - b) } }); // onChange re-parses
  } else {
    f.text = text;
    f.state = null;
    renderProjectChrome();
    clearTimeout(debounce);
    debounce = window.setTimeout(() => analyze('', false), 150);
  }
}

function onLive(m: LiveMsg): void {
  if (m.k === 'ping') return;
  if (m.k === 'hello' || m.k === 'editors') {
    liveEditors = m.editors;
    return renderLive();
  }
  if (m.k === 'open') return void openFolder(m.dir);
  const p = S.project;
  if (!p?.root || m.root !== p.root || !m.rel) {
    if (m.k === 'edit' && m.text !== undefined && !liveOutside.has(m.path)) {
      liveOutside.add(m.path);
      toast(`${m.source} is editing ${baseName(m.path)}, outside the open folder (:FtbOpen there opens its folder here)`);
    }
    return;
  }
  syncActive();
  const rel = m.rel;
  let f = p.files.get(rel);
  if (m.k === 'close') {
    // the editor dropped its unsaved text: back to what's on disk
    if (!f || !liveFrom.has(rel)) return;
    liveFrom.delete(rel);
    if (f.disk !== null) return setFileText(p, f, f.disk);
    p.files.delete(rel);
    p.tabs = p.tabs.filter((t) => t !== rel);
    if (p.active === rel) switchFile(p.tabs[0] ?? [...p.files.keys()].find(isSource) ?? '');
    renderProjectChrome();
    return analyze('', false);
  }
  if (m.text !== undefined && f?.text !== m.text) {
    if (!f) p.files.set(rel, (f = { path: rel, text: m.text, disk: null, mtime: null, state: null }));
    else if (isDirty(f) && !liveFrom.has(rel)) toast(`${rel}: your edits here were replaced by ${m.source}'s`);
    setFileText(p, f, m.text);
  }
  if (f && m.text !== undefined) {
    if (isDirty(f)) liveFrom.set(rel, m.source);
    else liveFrom.delete(rel);
  }
  // follow the editor's cursor (without taking the keyboard)
  if (f && m.line !== undefined) {
    if (p.active !== rel) switchFile(rel);
    if (p.active === rel) jumpTo(editor, m.line, m.col ?? 0, false);
  }
}

function closeTab(path: string): void {
  const p = S.project;
  if (!p || p.tabs.length <= 1) return;
  const i = p.tabs.indexOf(path);
  p.tabs = p.tabs.filter((t) => t !== path);
  if (p.active === path) switchFile(p.tabs[Math.max(0, i - 1)]);
  renderProjectChrome();
  projectSaveSoon();
}

// Bring the derived .ft_blueprint files up to date with the run settings and
// the author's layout; unchanged content keeps the disk text (not dirty).
function refreshMeta(): void {
  const p = S.project;
  if (!p) return;
  syncActive();
  const setMeta = (path: string, text: string | null, create: boolean) => {
    const f = p.files.get(path);
    if (f) f.text = text ?? f.disk ?? '';
    else if (create && text !== null) p.files.set(path, { path, text, disk: null, mtime: null, state: null });
  };
  const runDisk = p.files.get(RUN_JSON)?.disk;
  let sameRun = false;
  try {
    sameRun = runDisk != null && JSON.stringify(parseRun(runDisk)) === JSON.stringify(p.run);
  } catch { /* a hand-broken run.json is rewritten on save */ }
  setMeta(RUN_JSON, sameRun ? null : serializeRun(p.run), !runEmpty(p.run));
  const bp = layout.toBlueprint(S.sprites, false, S.model?.byName.get('main')?.file);
  const authored = Object.keys(bp.nodes).length + Object.keys(bp.modules ?? {}).length + Object.keys(bp.waypoints).length + bp.sprites.length + (bp.folded?.length ?? 0) > 0;
  const bpText = serializeBlueprint(bp) + '\n';
  const bpDisk = p.files.get(BP_JSON)?.disk;
  let sameBp = false;
  try {
    sameBp = bpDisk != null && serializeBlueprint(parseBlueprint(bpDisk)) + '\n' === bpText;
  } catch { /* rewritten on save */ }
  setMeta(BP_JSON, sameBp ? null : bpText, authored);
}

function dirtyFiles(): PFile[] {
  const p = S.project;
  if (!p) return [];
  refreshMeta();
  return [...p.files.values()].filter(isDirty).sort((a, b) => a.path.localeCompare(b.path));
}

// A new driver main for a project that has none (a library: libft, gnl…).
function createDriver(): void {
  const p = S.project;
  if (!p || p.files.has(DRIVER)) return;
  const headers = [...p.files.keys()].filter((k) => k.endsWith('.h') && !k.includes('/')).sort();
  const text = `${headers.map((h) => `#include "${h}"`).join('\n')}${headers.length ? '\n\n' : ''}int\tmain(void)\n{\n\treturn (0);\n}\n`;
  p.files.set(DRIVER, { path: DRIVER, text, disk: null, mtime: null, state: null });
  switchFile(DRIVER, { line: headers.length ? headers.length + 3 : 2, col: 1 });
  analyze('', false);
  toast(`${DRIVER} created (not saved) — it runs your code; Ctrl+S to keep it`);
}

// ---- polling: edits made on disk (nvim, git) show up here ----
let pollTimer = 0;
let polling = false;
function startPolling(): void {
  stopPolling();
  if (S.project?.root) pollTimer = window.setInterval(() => void pollOnce(), 2000);
}
function stopPolling(): void {
  clearInterval(pollTimer);
}

async function pollOnce(): Promise<void> {
  const p = S.project;
  if (!p?.root || polling || document.hidden) return;
  polling = true;
  try {
    const known = Object.fromEntries([...p.files.values()].filter((f) => f.mtime !== null).map((f) => [f.path, f.mtime!]));
    const r = await fsCall<{ changed: { path: string; text: string; mtime: number }[]; removed: string[] }>('poll', { root: p.root, known }).catch(() => 'unavailable' as const);
    if (r === 'unavailable' || S.project !== p) return;
    let changed = false;
    syncActive();
    for (const nf of r.changed) {
      const f = p.files.get(nf.path);
      if (!f) {
        p.files.set(nf.path, { path: nf.path, text: nf.text, disk: nf.text, mtime: nf.mtime, state: null });
        changed = true;
        continue;
      }
      if (f.disk === nf.text) {
        f.mtime = nf.mtime; // touched, same content
        continue;
      }
      if (f.text === nf.text) {
        // saved elsewhere (nvim) with the text we already show: clean now
        f.disk = nf.text;
        f.mtime = nf.mtime;
        delete f.conflict;
        liveFrom.delete(f.path);
        changed = true;
        continue;
      }
      if (isDirty(f) && !f.path.startsWith(`${META}/`)) {
        if (f.conflict?.mtime !== nf.mtime) toast(`${nf.path} changed on disk while you have unsaved edits here`);
        f.conflict = { text: nf.text, mtime: nf.mtime };
        changed = true;
        continue;
      }
      f.disk = f.text = nf.text;
      f.mtime = nf.mtime;
      delete f.conflict;
      if (f.path === RUN_JSON) (p.run = parseRun(nf.text)), renderRunFields();
      if (f.path === p.active) {
        const head = Math.min(editor.state.selection.main.head, nf.text.length);
        editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: nf.text }, selection: { anchor: head } });
      } else f.state = null;
      changed = true;
    }
    for (const path of r.removed) {
      const f = p.files.get(path);
      if (!f) continue;
      if (!isDirty(f) && path !== p.active) {
        p.files.delete(path);
        p.tabs = p.tabs.filter((t) => t !== path);
      } else (f.disk = null), (f.mtime = null);
      changed = true;
    }
    if (changed) {
      analyze('', false);
      renderProjectChrome();
    }
  } finally {
    polling = false;
  }
}

function renderRunFields(): void {
  const p = S.project;
  const stdin = $<HTMLTextAreaElement>('stdin');
  if (document.activeElement !== stdin) stdin.value = p ? p.run.stdin : S.stdin;
  $('run-row').hidden = !p;
  $('stdin-info').textContent = p ? `run settings, saved as ${RUN_JSON}` : 'fed to the program when it runs under gdb';
  if (!p) return;
  const args = $<HTMLInputElement>('run-args');
  const defs = $<HTMLInputElement>('run-defs');
  if (document.activeElement !== args) args.value = joinArgs(p.run.args);
  if (document.activeElement !== defs) defs.value = p.run.defines.join(' ');
}

function runChanged(): void {
  projectSaveSoon();
  if (S.model && engineFor(S.model) === 'gdb') {
    cancelGdb();
    startGdb(currentSrc(), S.model, false);
    renderAlerts();
  }
}

// ---- chrome: project chip, tabs, explorer, save button ----
let explorerOpen = store.get('explorer') !== 'off';

function renderProjectChrome(): void {
  const p = S.project;
  const chip = $('project-chip');
  chip.hidden = !p;
  $('btn-files').hidden = !p;
  $('btn-files').setAttribute('aria-pressed', String(explorerOpen));
  $('btn-save').hidden = !p;
  $('file-name').hidden = !!p;
  $('tabs').hidden = !p;
  $('explorer').hidden = !p || !explorerOpen;
  renderSampleTabs();
  renderRunFields();
  // a project always runs under gdb: the interpreter reads one buffer
  $('engines').querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.disabled = !!p && b.dataset.id !== 'gdb';
    b.setAttribute('aria-pressed', String(p ? b.dataset.id === 'gdb' : b.dataset.id === S.engine));
  });
  if (!p) {
    document.title = 'ft_blueprint';
    return;
  }
  const dirty = p.readOnly ? [...p.files.values()].filter((f) => isDirty(f) && isSource(f.path)).length : dirtyFiles().length;
  chip.innerHTML = `<button aria-pressed="true" title="${esc(p.root ?? 'bundled sample project (read-only)')}">${dirty ? '<span class="dirty-dot">●</span> ' : ''}${esc(p.name)}${p.readOnly ? ' <span class="c">(sample)</span>' : ''}<span class="x" data-close title="Close folder">✕</span></button>`;
  chip.querySelector('[data-close]')!.addEventListener('click', (e) => {
    e.stopPropagation();
    closeProject();
  });
  chip.querySelector('button')!.addEventListener('click', () => void openFolderDialog());
  $('btn-save').textContent = dirty ? `Save… (${dirty})` : 'Save…';
  document.title = `${dirty ? '● ' : ''}${p.name} — ft_blueprint`;
  // tabs
  const tabs = $('tabs');
  tabs.innerHTML = p.tabs.map((path) => {
    const f = p.files.get(path);
    const name = path.slice(path.lastIndexOf('/') + 1);
    return `<span class="tab" role="tab" data-path="${esc(path)}" aria-selected="${path === p.active}" title="${esc(path)}">${f?.conflict ? '<span class="warn" title="changed on disk">⚠</span>' : ''}${esc(name)}${f && isDirty(f) ? ' <span class="dirty-dot">●</span>' : ''}${p.tabs.length > 1 ? '<span class="close" data-x title="Close tab (the file stays in the project)">×</span>' : ''}</span>`;
  }).join('');
  tabs.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.addEventListener('mousedown', (e) => {
    const path = t.dataset.path!;
    if ((e.target as HTMLElement).closest('[data-x]') || e.button === 1) {
      e.preventDefault();
      return closeTab(path);
    }
    if (e.button === 0) switchFile(path);
  }));
  // explorer: folders as headers, files indented under them
  if (!explorerOpen) return;
  const counts = new Map<string, number>();
  for (const f of S.model?.fns ?? []) counts.set(f.file, (counts.get(f.file) ?? 0) + 1);
  const paths = [...p.files.keys()].filter((k) => isSource(k) || /(^|\/)(Makefile|makefile|GNUmakefile)$/.test(k) || k.startsWith(`${META}/`)).sort((a, b) => {
    const da = a.includes('/') ? a.slice(0, a.lastIndexOf('/')) : '';
    const db = b.includes('/') ? b.slice(0, b.lastIndexOf('/')) : '';
    return da === db ? a.localeCompare(b) : da.localeCompare(db);
  });
  let lastDir = '';
  const rows: string[] = [];
  for (const path of paths) {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (dir !== lastDir) rows.push(`<div class="dir">${esc(dir)}/</div>`);
    lastDir = dir;
    const f = p.files.get(path)!;
    const n = counts.get(path);
    rows.push(`<button data-path="${esc(path)}" style="--depth:${dir ? 1 : 0}" aria-current="${path === p.active}" title="${esc(path)}"><span class="n">${esc(path.slice(path.lastIndexOf('/') + 1))}</span>${isDirty(f) ? '<span class="dirty-dot">●</span>' : ''}${n ? `<span class="m">${n} fn</span>` : ''}</button>`);
  }
  const ex = $('explorer');
  ex.innerHTML = rows.join('');
  ex.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => {
    const path = b.dataset.path!;
    if (path.startsWith(`${META}/`) && path.endsWith('.json')) return toast(`${path} is written from the run settings and the layout`);
    switchFile(path);
  }));
}

function toggleExplorer(): void {
  explorerOpen = !explorerOpen;
  store.set('explorer', explorerOpen ? 'on' : 'off');
  renderProjectChrome();
}

// ---- dialogs ----
function showDialog(title: string, body: string, kind: string): HTMLElement {
  overlay.innerHTML = `<div class="dlg" role="dialog" aria-label="${esc(title)}"><div class="dlg-title"><span>${esc(title)}</span><span class="grow"></span><button class="x" data-close aria-label="Close">×</button></div><div class="dlg-body">${body}</div></div>`;
  overlay.dataset.kind = kind;
  overlay.hidden = false;
  overlay.querySelector('[data-close]')!.addEventListener('click', closeOverlay);
  return overlay.querySelector('.dlg')!;
}

// Saving always asks: which files, what changes, and what changed on disk meanwhile.
function openSaveDialog(): void {
  const p = S.project;
  if (!p) return toast('samples live in this browser — Export blueprint to keep a layout');
  const dirty = dirtyFiles();
  if (!dirty.length) return toast('no unsaved changes');
  if (p.readOnly) return toast(`${p.name} is a bundled sample and read-only — Open Folder… to work on real files`);
  const rows = dirty.map((f, i) => {
    const d = lineDiff(f.disk ?? '', f.text);
    return `<label><input type="checkbox" data-i="${i}" checked> <span>${esc(f.path)}</span>
      <span class="stat">${f.disk === null ? 'new file · ' : ''}<span class="a">+${d.added}</span> <span class="r">−${d.removed}</span></span>
      ${f.conflict ? '<span class="conf">⚠ changed on disk since you opened it</span>' : ''}
      <a data-diff="${i}">diff</a></label><pre class="diff" data-for="${i}" hidden>${d.text.split('\n').map((l) => `<span class="${l.startsWith('+ ') ? 'a' : l.startsWith('- ') ? 'r' : ''}">${esc(l)}</span>`).join('\n')}</pre>`;
  }).join('');
  const dlg = showDialog('Save to disk', `<p class="hint">Nothing is written until you confirm. ${esc(p.root ?? '')}</p>
    <div class="files">${rows}</div>
    <div class="row-btns"><span class="note">Enter saves · Esc cancels</span><button class="btn" data-cancel>Cancel</button><button class="btn" data-save>Save selected</button></div>`, 'save');
  dlg.querySelectorAll<HTMLElement>('[data-diff]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    const pre = dlg.querySelector<HTMLElement>(`pre[data-for="${a.dataset.diff}"]`)!;
    pre.hidden = !pre.hidden;
  }));
  const selected = () => [...dlg.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].filter((c) => c.checked).map((c) => dirty[Number(c.dataset.i)].path);
  const go = async (force: boolean, paths = selected()) => {
    if (!paths.length) return closeOverlay();
    let r;
    try {
      r = await save(p, paths, force);
    } catch (e) {
      return toast(`Save failed: ${(e as Error).message}`);
    }
    if (r === 'unavailable') return toast('saving needs the local server (npm run dev)');
    if (r.conflicts.length) return showConflicts(p, r.conflicts, paths);
    closeOverlay();
    toast(`saved ${r.saved.length} file${r.saved.length === 1 ? '' : 's'}`);
    writeProjectBackup(p);
    renderProjectChrome();
  };
  dlg.querySelector('[data-cancel]')!.addEventListener('click', closeOverlay);
  dlg.querySelector('[data-save]')!.addEventListener('click', () => void go(false));
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !(e.target as HTMLElement).closest('a')) {
      e.preventDefault();
      void go(false);
    }
  });
  dlg.querySelector<HTMLButtonElement>('[data-save]')!.focus();
}

function showConflicts(p: Project, conflicts: { path: string; mtime: number | null; text: string | null }[], paths: string[]): void {
  const dlg = showDialog('Changed on disk', `<p class="hint">These files changed on disk after you opened them (another editor, git…). Nothing was saved.</p>
    <div class="files">${conflicts.map((c) => `<label><span>${esc(c.path)}</span> <span class="conf">${c.text === null ? 'deleted on disk' : 'edited on disk'}</span></label>`).join('')}</div>
    <div class="row-btns"><button class="btn" data-cancel>Cancel</button><button class="btn" data-theirs title="Drop your edits to these files and load the disk version">Use disk version</button><button class="btn" data-mine title="Write your version over the disk version">Overwrite with mine</button></div>`, 'conflict');
  dlg.querySelector('[data-cancel]')!.addEventListener('click', closeOverlay);
  dlg.querySelector('[data-theirs]')!.addEventListener('click', () => {
    for (const c of conflicts) {
      const f = p.files.get(c.path);
      if (!f) continue;
      f.disk = c.text;
      f.mtime = c.mtime;
      f.text = c.text ?? '';
      f.state = null;
      delete f.conflict;
      if (f.path === p.active) {
        loadingSample = true;
        swapState(editor, stateFor(f), S.vim, hooks);
        loadingSample = false;
      }
    }
    closeOverlay();
    analyze('', false);
    writeProjectBackup(p);
  });
  dlg.querySelector('[data-mine]')!.addEventListener('click', async () => {
    const r = await save(p, paths, true).catch((e: Error) => (toast(`Save failed: ${e.message}`), null));
    if (!r || r === 'unavailable') return;
    closeOverlay();
    toast(`saved ${r.saved.length} file${r.saved.length === 1 ? '' : 's'} (overwrote the disk version)`);
    writeProjectBackup(p);
    renderProjectChrome();
  });
}

// VS Code-style folder picker, served by the local server (the browser
// can't hand a real path to the page).
async function openFolderDialog(dir?: string): Promise<void> {
  let listing: Listing | 'unavailable';
  try {
    listing = await fsCall<Listing>('list', { dir: dir ?? S.project?.root ?? store.get('lastDir') ?? '' });
  } catch (e) {
    if (dir !== undefined) return toast((e as Error).message);
    listing = await fsCall<Listing>('list', { dir: '' }).catch(() => 'unavailable' as const);
  }
  if (listing === 'unavailable') {
    const body = `<p class="hint">Opening a folder needs the local server. Start it with <code>npm run dev -- ~/path/to/project</code>, or try the bundled project:</p>
      <div class="pick">${SAMPLE_PROJECTS.map((sp) => `<button data-sample="${sp.key}">${esc(sp.title)}<span class="tag">${esc(sp.blurb)}</span></button>`).join('')}</div>`;
    const dlg = showDialog('Open Folder', body, 'open');
    dlg.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((b) => b.addEventListener('click', () => (closeOverlay(), loadSample(b.dataset.sample))));
    return;
  }
  const L = listing;
  store.set('lastDir', L.dir);
  const recent = readRecent().filter((r) => r !== L.dir);
  const items: { label: string; tag: string; act: () => void }[] = [];
  if (L.parent) items.push({ label: '..', tag: 'up', act: () => void openFolderDialog(L.parent!) });
  for (const d of L.dirs) items.push({ label: `${d}/`, tag: '', act: () => void openFolderDialog(`${L.dir}/${d}`) });
  const body = `<input class="path" value="${esc(L.dir)}" spellcheck="false" aria-label="Folder path">
    <div class="pick">${items.map((it, i) => `<button data-i="${i}">${esc(it.label)}<span class="tag">${esc(it.tag)}</span></button>`).join('') || '<div class="empty">no sub-folders</div>'}</div>
    ${recent.length ? `<h4 style="margin-top:12px">Recent</h4><div class="pick">${recent.map((r) => `<button data-recent="${esc(r)}">${esc(r)}</button>`).join('')}</div>` : ''}
    <div class="row-btns"><span class="note">${L.project ? 'this folder has C sources' : 'no .c/.h/Makefile here'} · Enter goes to the typed path · Ctrl+Enter opens it</span>
    <button class="btn" data-cancel>Cancel</button><button class="btn" data-open>Open ${esc(L.dir.slice(L.dir.lastIndexOf('/') + 1) || '/')}</button></div>`;
  const dlg = showDialog('Open Folder', body, 'open');
  const input = dlg.querySelector<HTMLInputElement>('input.path')!;
  dlg.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.addEventListener('click', () => items[Number(b.dataset.i)].act()));
  dlg.querySelectorAll<HTMLButtonElement>('[data-recent]').forEach((b) => b.addEventListener('click', async () => {
    if (await openFolder(b.dataset.recent!)) closeOverlay();
  }));
  dlg.querySelector('[data-cancel]')!.addEventListener('click', closeOverlay);
  dlg.querySelector('[data-open]')!.addEventListener('click', async () => {
    if (await openFolder(L.dir)) closeOverlay();
  });
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const path = input.value.trim().replace(/^~(?=$|\/)/, L.home);
    if (e.ctrlKey || e.metaKey) {
      if (await openFolder(path)) closeOverlay();
    } else void openFolderDialog(path);
  });
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

// Ctrl+P: go to a file by typing part of its path.
function quickOpen(): void {
  const p = S.project;
  if (!p) return;
  const all = [...p.files.keys()].filter((k) => !(k.startsWith(`${META}/`) && k.endsWith('.json'))).sort();
  const dlg = showDialog('Go to file', `<input class="path" placeholder="type part of a file name" spellcheck="false"><div class="pick"></div>`, 'quick');
  const input = dlg.querySelector<HTMLInputElement>('input')!;
  const list = dlg.querySelector<HTMLElement>('.pick')!;
  let hits: string[] = [];
  let sel = 0;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    hits = all.filter((k) => {
      let i = 0;
      for (const ch of k.toLowerCase()) if (ch === q[i]) i++;
      return i === q.length;
    }).slice(0, 50);
    sel = Math.min(sel, Math.max(0, hits.length - 1));
    list.innerHTML = hits.map((h, i) => `<button data-i="${i}" class="${i === sel ? 'on' : ''}">${esc(h)}${p.files.get(h) && isDirty(p.files.get(h)!) ? '<span class="tag">●</span>' : ''}</button>`).join('') || '<div class="empty">no match</div>';
    list.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => b.addEventListener('click', () => (closeOverlay(), switchFile(hits[Number(b.dataset.i)]), editor.focus())));
  };
  input.addEventListener('input', () => ((sel = 0), render()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') (sel = Math.min(hits.length - 1, sel + 1)), render(), e.preventDefault();
    else if (e.key === 'ArrowUp') (sel = Math.max(0, sel - 1)), render(), e.preventDefault();
    else if (e.key === 'Enter' && hits[sel]) {
      e.preventDefault();
      closeOverlay();
      switchFile(hits[sel]);
      editor.focus();
    }
  });
  render();
  input.focus();
}

// ---------------- playback ----------------
const N = () => S.trace?.evs.length ?? 0;

function play(): void {
  if (!S.trace) return toast(S.model?.error ? 'fix the syntax error first' : 'nothing to run: this code has no main()');
  if (S.pos >= N()) S.pos = 0;
  S.stepTarget = null;
  S.playing = true;
}

function togglePlay(): void {
  if (S.playing) S.playing = false;
  else play();
}

function stepFwd(): void {
  if (!S.trace) return;
  if (S.stepTarget !== null) S.pos = S.stepTarget;
  const i = Math.floor(S.pos + 1e-9);
  if (i >= N()) return;
  S.pos = i;
  S.stepTarget = i + 1;
  S.playing = true;
}

function stepBack(): void {
  if (!S.trace) return;
  S.playing = false;
  S.stepTarget = null;
  S.pos = Math.max(0, Math.ceil(S.pos - 1e-9) - 1);
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
    S.pos = Math.max(S.pos, cur);
    S.stepTarget = next;
    S.playing = true;
  } else if (next !== undefined) seek(next);
  else stepFwd();
}
function prevBeat(): void {
  const starts = beats();
  S.playing = false;
  S.stepTarget = null;
  const prev = [...starts].reverse().find((b) => b < S.pos - 1e-9);
  S.pos = prev ?? 0;
}

function nextCall(): void {
  if (!S.trace) return;
  const from = S.stepTarget ?? Math.ceil(S.pos - 1e-9);
  const j = S.trace.evs.findIndex((e, k) => k >= from && isCallish(e));
  if (j < 0) return seek(N());
  S.pos = j;
  S.stepTarget = j + 1;
  S.playing = true;
}

function prevCall(): void {
  if (!S.trace) return;
  S.playing = false;
  S.stepTarget = null;
  const cur = Math.ceil(S.pos - 1e-9);
  for (let j = cur - 2; j >= 0; j--) if (isCallish(S.trace.evs[j])) return void (S.pos = j + 1);
  S.pos = 0;
}

function seek(p: number): void {
  S.playing = false;
  S.stepTarget = null;
  S.pos = Math.max(0, Math.min(p, N()));
}

function setSpeed(dir: number): void {
  const i = SPEEDS.indexOf(S.speed);
  S.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))];
  $('pb-speed').textContent = `${S.speed}×`;
}

function restart(): void {
  if (!S.trace) return toast(S.model?.error ? 'fix the syntax error first' : 'nothing to run: no main()');
  S.pos = 0;
  play();
}

// ---------------- entity actions ----------------
function gotoCode(e: Entity | null): void {
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

function toggleModule(file: string): void {
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
  lastInspectorKey = '';
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

function placeSprite(kind: SpriteKind, wx: number, wy: number, preset: Partial<Sprite> = {}): Sprite {
  const id = `sprite:${crypto.randomUUID()}`;
  const sprite: Sprite = { id, kind, x: Math.round(wx), y: Math.round(wy), ...preset };
  S.sprites.push(sprite);
  S.selected = { k: 'sprite', id };
  S.legend = null;
  lastInspectorKey = '';
  saveSoon();
  bindingsChanged();
  return sprite;
}

function removeSprite(id: string): void {
  S.sprites = S.sprites.filter((s) => s.id !== id);
  if (S.selected?.k === 'sprite' && S.selected.id === id) S.selected = null;
  lastInspectorKey = '';
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
    canvas.setPointerCapture(e.pointerId);
    const [wx, wy] = view.toWorld(x, y);
    const hit = entityAt(S, wx, wy);
    pendingFold = hit?.k === 'node' ? foldAt(S, wx, wy) : null;
    S.selected = hit;
    S.legend = null;
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
      S.hovered = entityAt(S, wx, wy);
    }
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
    if (drag?.k === 'pan' && !drag.moved && S.selected === null) S.legend = null;
    drag = null;
    setCursorStyle();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    if (!drag) S.hovered = null;
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
    S.selected = hit;
    const items: [string, () => void][] = [];
    if (hit?.k === 'node') {
      items.push(['Go to code', () => gotoCode(hit)]);
      const nm = layout.nodes.get(hit.id)?.name;
      if (nm) items.push([shut.has(nm) ? 'Show inside' : 'Hide inside', () => toggleShut(nm)]);
      if (layout.nodes.get(hit.id)?.place.pinned) items.push(['Unpin (auto-place)', () => unpin(hit.id)]);
    } else if (hit?.k === 'sprite') {
      items.push(['Bind…', () => { S.selected = hit; lastInspectorKey = ''; renderInspector(); inspector.querySelector<HTMLInputElement>('[name="expr"]')?.focus(); }]);
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

function showMenu(x: number, y: number, items: [string, () => void][]): void {
  menu.innerHTML = items.map(([label], i) => `<button data-i="${i}">${esc(label)}</button>`).join('');
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  // x, y and the rect are window pixels; left/top are in the app's zoomed px
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 4) / uiZoom}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 4) / uiZoom}px`;
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
    return restart();
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
  else if (k === 'Escape') (S.selected = null), (S.legend = null), hideMenu();
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
  S.skin = skin;
  document.documentElement.dataset.skin = skin.id;
  store.set('skin', skin.id);
  renderSkinPicker();
  renderDock();
  await Promise.all((SKIN_FONTS[skin.id] ?? []).map((f) => document.fonts.load(f).catch(() => null)));
  renderDock();
  lastPbKey = '';
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
      `<button class="sk${s.id === base ? ' on' : ''}" data-id="${s.id}" role="option" aria-selected="${s.id === base}"><img src="${skinPreview(s)}" alt=""><span class="nm">${esc(s.name)}${otherMode(s) ? ' <span class="md" title="light and dark">☀☾</span>' : ''}</span><span class="bl">${esc(s.blurb)}</span></button>`;
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
const hooks: EditorHooks = {
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
    debounce = window.setTimeout(() => analyze(doc, false), 150);
  },
  onCursor: (line, col) => {
    S.cursor = { line, col };
    const active = S.project?.active;
    const f = S.model?.fns.find((x) => (!S.project || x.file === active) && line >= x.startLine && line <= x.endLine);
    S.editorFn = f?.name ?? null;
  },
  onMode: (m) => {
    S.mode = m;
  },
};
let loadingSample = false;

function toggleVim(): void {
  S.vim = !S.vim;
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
          ${K(['Home', 'End'], 'start / end')}${K(['F'], 'fit view')}${K(['M'], 'fast ⇄ focus animation')}${K(['Ctrl', 'Enter'], 'run from the start (anywhere)')}
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
function closeOverlay(): void {
  overlay.hidden = true;
  overlay.dataset.kind = '';
}

function drawIcon(c: HTMLCanvasElement, kind: IconKind, size: number): void {
  const dpr = window.devicePixelRatio || 1;
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = `${size}px`;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  g.clearRect(0, 0, size, size);
  S.skin.icon(g, kind, size);
}

// ---------------- panels ----------------
function renderSampleTabs(): void {
  const nav = $('samples');
  const openSample = S.project?.readOnly ? SAMPLE_PROJECTS.find((x) => x.name === S.project!.name) : undefined;
  nav.innerHTML = [
    ...SAMPLES.map((s) => `<button data-key="${s.key}" aria-pressed="${!S.project && s === S.sample}" title="${esc(s.blurb)}">${esc(s.title)}</button>`),
    ...SAMPLE_PROJECTS.map((s) => `<button data-key="${s.key}" aria-pressed="${openSample === s}" title="${esc(s.blurb)}">${esc(s.title)}</button>`),
  ].join('');
  nav.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => loadSample(b.dataset.key)));
}

function renderDock(): void {
  const dock = $('dock');
  dock.innerHTML = LEGEND.map((l, i) => `<button class="slot${S.legend === l.kind ? ' on' : ''}${i >= 5 ? ' placeable' : ''}" data-i="${i}" ${i >= 5 ? 'draggable="true"' : ''} title="${esc(l.name)} — ${i >= 5 ? 'drag onto the grid' : esc(l.c)}"><canvas></canvas></button>`).join('');
  dock.querySelectorAll<HTMLButtonElement>('.slot').forEach((b) => {
    const l = LEGEND[Number(b.dataset.i)];
    drawIcon(b.querySelector('canvas')!, l.kind === ('marker' as IconKind) ? 'strip' : l.kind, 26);
    if (Number(b.dataset.i) >= 5) b.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('application/x-ftb-sprite', l.kind);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });
    b.addEventListener('click', () => {
      S.legend = S.legend === l.kind ? null : l.kind;
      if (S.legend) S.selected = null;
      renderDock();
    });
  });
}

const ICON = {
  warn: '<svg class="ico" viewBox="0 0 16 16"><path d="M8 1l7.5 13h-15z M7.2 6v4.2h1.6V6z M7.2 11.3v1.6h1.6v-1.6z" fill-rule="evenodd"/></svg>',
  err: '<svg class="ico" viewBox="0 0 16 16"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.8 3.5h1.6v5H7.2zm0 6.3h1.6v1.6H7.2z" fill-rule="evenodd"/></svg>',
  info: '<svg class="ico" viewBox="0 0 16 16"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.8 3h1.6v1.6H7.2zm0 3h1.6v5H7.2z" fill-rule="evenodd"/></svg>',
};

function renderAlerts(): void {
  const out: string[] = [];
  const m = S.model;
  const al = (kind: keyof typeof ICON, html: string) => out.push(`<div class="alert ${kind}">${ICON[kind]}<div>${html}</div></div>`);
  const p = S.project;
  // a link to a line, in whichever file it is
  const at = (line: number, file?: string, label?: string) =>
    `<a data-line="${line}"${file ? ` data-file="${esc(file)}"` : ''}>${label ?? `${file ? `${esc(file)}:` : 'line '}${line + 1}`}</a>`;
  if (m?.error) al('warn', `<b>Syntax error</b> at ${at(m.error.line, m.error.file)}. The picture keeps its last shape; nothing runs until it parses.`);
  else if (m && !m.byName.has('main'))
    al('info', p && !p.files.has(DRIVER)
      ? `<b>Structure view.</b> No <code>main()</code> — a library? Give it a driver to run it.<br><button class="btn sm" data-driver>Create ${esc(DRIVER)}</button>`
      : `<b>Structure view.</b> No <code>main()</code>, so nothing runs.`);
  if (p?.driverIgnored) al('info', `<b>${esc(DRIVER)} is set aside:</b> the project has its own <code>main()</code>.`);
  for (const w of m?.warnings ?? []) al('warn', `<b>Link:</b> ${esc(w.msg)} (${at(w.line, w.file)})`);
  for (const f of p ? [...p.files.values()].filter((x) => x.conflict) : []) al('warn', `<b>${esc(f.path)} changed on disk</b> while you have unsaved edits here. Saving will ask which version wins.`);
  const g = S.gdb;
  const defines = p ? p.run.defines : S.sample.defines ?? [];
  if (g.status === 'running') al('info', `<b>Running under gdb…</b> ${p?.files.has('Makefile') ? 'building with your <code>Makefile</code>' : 'compiling with <code>cc -Wall -Wextra -Werror</code>'}${defines.length ? ` <code>${defines.map((d) => `-D${esc(d)}`).join(' ')}</code>` : ''}`);
  if (g.status === 'unavailable') al('warn', `<b>No trace server.</b> Real execution runs inside <code>npm run dev</code> (or <code>npm run preview</code>); a static build can only use the interpreter.`);
  if (g.status === 'error' && g.compile) {
    const errs = g.compile.diagnostics.filter((d) => d.severity === 'error');
    const first = errs[0];
    al('err', first
      ? `<b>Compile failed</b> at ${at(first.line, first.file || undefined)}: ${esc(first.msg)}${errs.length > 1 ? ` <span class="c">(+${errs.length - 1} more)</span>` : ''}`
      : `<b>Compile failed.</b> <code>${esc(g.compile.text.split('\n').find((l) => /error/i.test(l)) ?? g.compile.text.split('\n')[0] ?? '')}</code>`);
  } else if (g.status === 'error') al('err', `<b>Can't run it:</b> ${esc(g.error ?? 'unknown error')}`);
  if (S.trace?.error) al('err', `<b>Stopped</b> at ${at(S.trace.error.line, S.trace.error.file)}: ${esc(S.trace.error.msg)}`);
  if (S.trace?.truncated) al('warn', `<b>Trace truncated</b> at ${S.trace.evs.length} steps.`);
  const leaks = S.trace?.leaks ?? [];
  if (leaks.length) {
    const bytes = leaks.reduce((a, l) => a + l.size, 0);
    al('warn', `<b>Leak at exit:</b> ${leaks.length} block${leaks.length > 1 ? 's' : ''}, ${bytes} B never freed (${leaks.map((l) => `${esc(S.trace!.cells.get(l.cell)?.name ?? '?')}${l.line !== null ? ` from ${at(l.line, l.file)}` : ''}`).join(', ')}).`);
  }
  for (const w of S.trace?.warnings ?? []) al('warn', esc(w));
  // M4: invariants that broke, and calls the static picture didn't predict
  const vs = violations();
  const byInv = new Map<string, Violation[]>();
  for (const v of vs) {
    const k = `${v.sprite}|${v.invariant}`;
    if (!byInv.has(k)) byInv.set(k, []);
    byInv.get(k)!.push(v);
  }
  for (const list of byInv.values()) {
    const v = list[0];
    const sp = S.sprites.find((x) => x.id === v.sprite);
    const where = `<a data-seek="${v.at}"${v.line !== null ? ` data-line="${v.line}"` : ''}${v.file ? ` data-file="${esc(v.file)}"` : ''}>step ${v.at}${v.line !== null ? `, ${v.file ? `${esc(v.file)}:` : 'line '}${v.line + 1}` : ''}</a>`;
    al('err', `<b>${v.builtin ? 'Picture mismatch' : 'Invariant broken'}:</b> <code>${esc(v.invariant)}</code> on ${esc(sp?.label || sp?.binding?.expr || 'sprite')} — first at ${where}: ${esc(v.detail)}${list.length > 1 ? ` <span class="c">(${list.length} times)</span>` : ''}`);
  }
  for (const c of surpriseCalls(S.trace, (a, b) => a === b || !!S.model?.byName.get(a)?.calls.some((x) => x.callee === b)))
    al('warn', `<b>Unpredicted call:</b> <code>${esc(c.caller)} → ${esc(c.callee)}</code> at <a data-seek="${c.at}" data-line="${c.line}"${c.file ? ` data-file="${esc(c.file)}"` : ''}>${c.file ? `${esc(c.file)}:` : 'line '}${c.line + 1}</a> is not in the code's call graph — a function pointer?`);
  alerts.innerHTML = out.join('');
  alerts.querySelector('[data-driver]')?.addEventListener('click', createDriver);
}

function renderStatus(): void {
  const m = S.model;
  const belts = m?.fns.reduce((a, f) => a + new Set(f.calls.map((c) => c.callee)).size, 0) ?? 0;
  const statics = m?.fns.reduce((a, f) => a + f.statics.length, 0) ?? 0;
  $('st-parse').innerHTML = !m
    ? ''
    : m.error
      ? `<span class="bad">syntax error, ${m.error.file ? `${esc(m.error.file)}:` : 'line '}${m.error.line + 1}</span>`
      : `<span class="ok">parsed</span> · ${m.project ? `${m.files.length} file${m.files.length === 1 ? '' : 's'} · ` : ''}${m.fns.length} function${m.fns.length === 1 ? '' : 's'} · ${belts} call${belts === 1 ? '' : 's'}${statics ? ` · ${statics} static` : ''}`;
  const t = S.trace;
  $('st-trace').innerHTML = !t
    ? ''
    : t.error
      ? `<span class="bad">runtime error</span> · ${t.evs.length} steps`
      : `${t.engine === 'gdb' ? `gdb${S.gdb.ms ? ` ${S.gdb.ms} ms` : ''} · ` : ''}${t.evs.length} steps · ${t.truncated ? '<span class="bad">truncated</span>' : `<span class="ok">exit ${t.exit ? fmtVal(t.exit) : '?'}</span>`}`;
  $('grid-info').textContent = S.project ? `${S.project.name}${S.project.root ? '' : ' (sample)'}` : m ? `${S.sample.file}` : '';
}

let lastStatusKey = '';
function renderLiveStatus(): void {
  const f = gridPane.contains(document.activeElement) ? 'canvas' : 'editor';
  const key = `${f}|${S.mode}|${S.vim}|${S.cursor.line}:${S.cursor.col}|${Math.round(view.cam.zoom * 100)}`;
  if (key === lastStatusKey) return;
  lastStatusKey = key;
  const modeEl = $('st-mode');
  if (S.vim) {
    modeEl.hidden = false;
    modeEl.textContent = (S.mode || 'normal').toUpperCase();
    modeEl.className = `mode ${(S.mode || 'normal').split(' ')[0]}`;
  } else modeEl.hidden = true;
  $('st-pos').textContent = `Ln ${S.cursor.line + 1}, Col ${S.cursor.col + 1}`;
  editorPane.classList.toggle('focused', f === 'editor');
  gridPane.classList.toggle('focused', f === 'canvas');
  $('st-hint').textContent = f === 'canvas' ? 'Space play · ←/→ step · middle-drag pan · wheel zoom' : 'Ctrl+Enter run';
}

let lastInspectorKey = '';
let traceRevision = 0;
let modelRevision = 0;

// M4: invariant violations for the current trace and sprites, recomputed only
// when either changes (invariants are checked client-side on sampled values).
let violationCache = { key: '', list: [] as Violation[] };
function violations(): Violation[] {
  const key = `${traceRevision}|${JSON.stringify(S.sprites.map((sp) => [sp.id, sp.kind, sp.invariants, sp.markers?.map((m) => m.label)]))}`;
  if (key !== violationCache.key) {
    violationCache = { key, list: findViolations(S.trace, S.sprites) };
    queueMicrotask(renderAlerts);
  }
  return violationCache.list;
}
const suggestions: { fn: string; expr: string; lengthExpr: string; markers: { expr: string; label: string }[]; label: string }[] = [];

function suggestionButtons(vars: Var[], fn: string): string {
  suggestions.length = 0;
  if (!S.model) return '';
  for (const v of vars) {
    const shape = bufferShapes(S.model).find((s) => new RegExp(`(^|\\W)${s.type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`).test(v.type));
    if (!shape) continue;
    const index = S.model.byName.get(fn)?.params.some((p) => p.name === 'fd') ? 'fd' : '0';
    const base = v.type.includes('*') ? `${v.name}->` : v.type.includes('[]') ? `${v.name}[${index}].` : `${v.name}.`;
    const expr = `${base}${shape.data}`;
    const markers = shape.markers.map((field) => ({ expr: `${base}${field}`, label: field }));
    const cap = markers.find((m) => /^(cap|capacity|size)$/i.test(m.label)) ?? markers.find((m) => /^(len|length)$/i.test(m.label));
    if (!cap) continue;
    suggestions.push({ fn, expr, lengthExpr: cap.expr, markers, label: v.name });
  }
  if (!suggestions.length) return '';
  // Once a strip with that binding exists, say so instead of offering a duplicate.
  const placed = (x: (typeof suggestions)[number]) =>
    (S.sprites ?? []).some((sp) => sp.kind === 'strip' && sp.binding?.fn === x.fn && sp.binding?.expr === x.expr);
  return `<div class="suggestions"><div class="hint">Suggested from struct fields</div>${suggestions.map((s, i) => placed(s)
    ? `<span class="hint">✓ ${esc(s.label)} strip placed</span>`
    : `<button class="btn sm" data-suggest="${i}">Add ${esc(s.label)} strip + markers</button>`).join('')}</div>`;
}

function bindSuggestionButtons(): void {
  inspector.querySelectorAll<HTMLButtonElement>('[data-suggest]').forEach((b) => b.addEventListener('click', () => {
    const s = suggestions[Number(b.dataset.suggest)];
    if (!s) return;
    const node = layout.nodes.get(`func:${s.fn}`);
    const place = freeSuggestionPlace(node);
    // Offer the ordering the field names imply (pos <= len <= cap); the author edits or removes it.
    const order = ['pos', 'len', 'cap'].filter((l) => s.markers.some((m) => m.label === l));
    const invariants = order.length >= 2 ? [order.join(' <= ')] : undefined;
    const sprite = placeSprite('strip', place.x, place.y, { label: `${s.label} buffer`, binding: { scope: 'fn', fn: s.fn, expr: s.expr }, lengthExpr: s.lengthExpr, markers: s.markers, invariants });
    const r = spriteWorldRect(sprite);
    view.ensureVisible(r.x, r.y, r.w, r.h, 1);
    // The inspector skips re-rendering while it has focus; release it so the
    // suggestion turns into "placed" instead of offering a duplicate.
    b.blur();
    lastInspectorKey = '';
    renderInspector();
    toast('suggested strip placed — edit its binding in the inspector');
  }));
}

function freeSuggestionPlace(node: ReturnType<Layout['nodes']['get']>): { x: number; y: number } {
  const x = node?.place.x ?? 0;
  const y = node?.place.y ?? 0;
  const below = node ? footprint(node).y + footprint(node).h + 1 : 2;
  const occupied = [
    ...layout.visible().map((n) => footprint(n)),
    ...buildScene(layout, S.model, S.trace).obstacles,
    ...S.sprites.map((sp) => spriteWorldRect(sp)),
  ];
  const free = (cx: number, cy: number) => {
    const test = { x: cx, y: cy, w: 8.2, h: 2.35 }; // largest bound strip footprint
    return !occupied.some((o) => test.x < o.x + o.w + 0.5 && o.x < test.x + test.w + 0.5 && test.y < o.y + o.h + 0.5 && o.y < test.y + test.h + 0.5);
  };
  for (let ring = 0; ring < 24; ring++) {
    const candidates: [number, number][] = [
      [x, below + ring * 4], [x, y - 4 - ring * 4],
      [x + 7 + ring * 5, y], [x - 9 - ring * 5, y],
    ];
    const found = candidates.find(([cx, cy]) => free(cx, cy));
    if (found) return { x: found[0], y: found[1] };
  }
  return { x, y: below + 96 };
}

function renderSpriteInspector(id: string, bound: { bound: boolean; value?: string; number?: number; length?: number; error?: string } | undefined): void {
  const sprite = S.sprites.find((s) => s.id === id);
  if (!sprite) return void (inspector.hidden = true);
  const b = sprite.binding;
  inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(sprite.label || sprite.kind)}</span><span class="k">${esc(sprite.kind)}</span></div>
    <form class="ins-body sprite-form">
      <label>Label<input name="label" value="${esc(sprite.label ?? '')}" maxlength="100" placeholder="${esc(sprite.kind)}"></label>
      <label>Scope<select name="scope"><option value="fn" ${b?.scope !== 'global' ? 'selected' : ''}>Function frame</option><option value="global" ${b?.scope === 'global' ? 'selected' : ''}>Global</option></select></label>
      <label>Function<select name="fn">${(S.model?.fns ?? []).map((f) => `<option value="${esc(f.name)}" ${f.name === (b?.fn ?? S.model?.fns[0]?.name) ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>
      <label>Expression<input name="expr" value="${esc(b?.expr ?? '')}" placeholder="buf-&gt;data" spellcheck="false"></label>
      ${sprite.kind === 'marker' ? '<p class="hint">This card shows an index. For a cursor that rides a strip, edit the strip’s Markers field.</p>' : ''}
      ${sprite.kind === 'strip' ? `<label>Length expression<input name="length" value="${esc(sprite.lengthExpr ?? '')}" placeholder="buf-&gt;cap" spellcheck="false"></label>
      <label>Markers <span class="hint">one label = expression per line</span><textarea name="markers" rows="4" spellcheck="false" placeholder="pos = buf-&gt;pos">${esc(sprite.markers?.map((m) => `${m.label} = ${m.expr}`).join('\n') ?? '')}</textarea></label>` : ''}
      <label>Invariants <span class="hint">one per line — e.g. pos &lt;= len &lt;= cap, on return: zero after len for 8</span><textarea name="invariants" rows="3" spellcheck="false" placeholder="${sprite.kind === 'strip' ? 'pos &lt;= len &lt;= cap' : 'value &gt;= 0'}">${esc((sprite.invariants ?? []).join('\n'))}</textarea></label>
      <div class="binding-status">${bound?.bound ? `Observed: ${esc(bound.value ?? String(bound.number ?? 'value'))}${bound.length !== undefined ? ` · length ${bound.length}` : ''}` : bound?.error ? esc(bound.error) : b ? 'No live value at this step' : 'Unbound — dimmed on the grid'}</div>
      <div class="sprite-actions"><button class="btn sm" type="submit">Apply binding</button><button class="btn sm" type="button" data-remove>Remove</button></div>
    </form>`;
  const form = inspector.querySelector<HTMLFormElement>('form')!;
  const scope = form.elements.namedItem('scope') as HTMLSelectElement;
  const fn = form.elements.namedItem('fn') as HTMLSelectElement;
  const sync = () => { fn.disabled = scope.value === 'global'; };
  scope.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const get = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value.trim();
    const expr = get('expr');
    const length = sprite.kind === 'strip' ? get('length') : '';
    const markerLines = sprite.kind === 'strip' ? get('markers').split(/\n/).map((x) => x.trim()).filter(Boolean) : [];
    const check = (x: string) => isSafeBindingExpr(x) ? validateBindingExpr(x) : 'use an identifier with field and index access only';
    if (expr && check(expr)) return toast(`Expression: ${check(expr)}`);
    if (length && check(length)) return toast(`Length: ${check(length)}`);
    const markers: { expr: string; label: string }[] = [];
    for (const line of markerLines) {
      const m = /^([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(line);
      if (!m || check(m[2])) return toast(`Marker: ${m ? check(m[2]) : 'use label = expression'}`);
      markers.push({ label: m[1], expr: m[2] });
    }
    if (markers.length > 16) return toast('At most 16 markers');
    sprite.label = get('label');
    sprite.binding = expr ? { scope: scope.value as 'fn' | 'global', ...(scope.value === 'fn' ? { fn: fn.value } : {}), expr } : undefined;
    sprite.lengthExpr = length || undefined;
    sprite.markers = markers;
    const invariants = get('invariants').split(/\n/).map((x) => x.trim()).filter(Boolean);
    for (const inv of invariants) {
      const r = parseInvariant(inv);
      if (typeof r === 'string') return toast(`Invariant “${inv}”: ${r}`);
    }
    if (invariants.length > 8) return toast('At most 8 invariants');
    sprite.invariants = invariants.length ? invariants : undefined;
    saveSoon();
    bindingsChanged();
    inspector.querySelector<HTMLElement>('[name="expr"]')?.blur();
    lastInspectorKey = '';
    renderInspector();
    toast(expr ? 'binding applied' : 'sprite is unbound');
  });
  form.querySelector<HTMLButtonElement>('[data-remove]')!.addEventListener('click', () => removeSprite(id));
}

function renderInspector(): void {
  const fr = S.trace && S.trace.evs.length ? frameAt(S.trace, S.pos) : null;
  const key = `${S.legend}|${entKey(S.selected)}:${S.selected?.k === 'node' ? S.selected.copy ?? 1 : ''}|${fr ? `${fr.si}` : ''}|${traceRevision}|${modelRevision}|${S.skin.id}|${S.selected?.k === 'module' ? `${layout.modules.get(S.selected.file)?.collapsed}${layout.modules.get(S.selected.file)?.pinned}` : ''}`;
  if (key === lastInspectorKey) return;
  if (inspector.contains(document.activeElement)) return;
  lastInspectorKey = key;

  if (S.legend) {
    const l = LEGEND.find((x) => x.kind === S.legend)!;
    inspector.hidden = false;
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(l.name)}</span><span class="k">legend</span></div>
      <div class="ins-body"><div class="row"><span class="l">C</span><span class="v">${esc(l.c)}</span></div><p>${esc(l.text)}</p>
      ${['strip', 'chest', 'marker', 'drill', 'copy', 'train', 'stack'].includes(l.kind) ? '<div class="foot"><span>drag from dock onto grid</span></div>' : ''}</div>`;
    return;
  }
  const e = S.selected;
  if (!e) {
    inspector.hidden = true;
    return;
  }
  inspector.hidden = false;
  const snap = fr?.snap ?? null;
  const row = (l: string, v: string) => `<div class="row"><span class="l">${l}</span><span class="v">${v}</span></div>`;
  if (e.k === 'sprite') {
    renderSpriteInspector(e.id, fr?.snap.bound?.[e.id]);
  } else if (e.k === 'node') {
    const node = layout.nodes.get(e.id);
    if (!node) return void (inspector.hidden = true);
    const f = node.fn;
    const copy = e.copy ?? 1;
    const all = snap?.stack.filter((x) => x.fn === node.name) ?? [];
    const frames = copy > 1 ? all.slice(copy - 1, copy) : all.slice(0, 1);
    const top = snap?.stack[snap.stack.length - 1];
    const state = !frames.length ? 'idle' : top?.fn === node.name ? 'running' : 'waiting';
    const waitingOn = state === 'waiting' ? snap!.stack[snap!.stack.indexOf(frames[frames.length - 1]) + 1]?.fn : null;
    const callers = S.model?.fns.filter((g) => g.calls.some((c) => c.callee === node.name)).map((g) => g.name) ?? [];
    const sig = f ? `${f.isStatic ? 'static ' : ''}${decl(f.ret, f.name)}(${f.params.map((p) => decl(p.type, p.name)).join(', ') || 'void'})` : node.name;
    const recursive = !!f?.calls.some((c) => c.callee === node.name);
    // A pointer's label ("bufs[0]", "#1+10", "freed #2") is more precise than the cell it lands in.
    const vals = frames[0]?.cells.map((c) => `${c.name} = ${c.val.k === 'ptr' && c.val.to !== null && !c.val.label ? `→${pointeeName(S.trace, c.val.to, frames[0])}` : fmtVal(c.val, c.type)}`).join(' · ');
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(copy > 1 ? `${node.name} #${copy}` : node.name)}</span><span class="k">${copy > 1 ? 'recursive copy' : 'function'}</span></div>
      <div class="ins-body"><div class="sig">${esc(sig)}</div>
      ${row('state', `<span class="state ${state}">${state}${waitingOn ? ` on ${esc(waitingOn)}` : ''}</span>${frames.length > 1 ? ` · ${frames.length} frames` : ''}${node.stale ? ' · stale' : ''}`)}
      ${vals ? row('frame', esc(vals)) : ''}
      ${recursive ? row('recursion', copy > 1 ? `call depth ${copy} — spawned by ${esc(node.name)} #${copy - 1}` : 'each call spawns a copy') : ''}
      ${f?.file ? row('file', `<a data-open-file="${esc(f.file)}">${esc(f.file)}</a>`) : ''}
      ${row('calls', esc([...new Set(f?.calls.map((c) => c.callee))].join(', ') || '—'))}
      ${row('called by', esc(callers.join(', ') || (node.name === 'main' ? 'process' : '—')))}
      ${f?.externals.length ? row('external', esc(f.externals.join(', '))) : ''}
      ${suggestionButtons([...f?.params ?? [], ...f?.locals ?? []], f?.name ?? '')}
      <div class="foot"><span>double-click a statement → its line</span><span>${node.place.pinned ? 'pinned by you' : 'auto-placed'}</span></div></div>`;
    bindSuggestionButtons();
  } else if (e.k === 'static') {
    const id = S.trace ? [...S.trace.cells].find(([, c]) => c.frame === -1 && c.owner === e.fn && c.name === e.name)?.[0] : undefined;
    const c = id !== undefined ? snap?.statics.find((x) => x.id === id) : null;
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(e.name)}</span><span class="k">static</span></div>
      <div class="ins-body">${row('owner', esc(e.fn))}${row('value', c ? esc(fmtVal(c.val, c.type)) : '—')}
      <p>Lives for the whole program, not just one call.</p>${suggestionButtons(S.model?.byName.get(e.fn)?.statics.filter((v) => v.name === e.name) ?? [], e.fn)}</div>`;
    bindSuggestionButtons();
  } else if (e.k === 'module') {
    const m = layout.modules.get(e.file);
    if (!m || !S.model) return void (inspector.hidden = true);
    const fns = S.model.fns.filter((f) => f.file === e.file);
    const doors = doorsOf(fns);
    const into = new Set<string>();
    const from = new Set<string>();
    for (const f of S.model.fns) for (const c of f.calls) {
      const to = S.model.byName.get(c.callee)?.file;
      if (f.file === e.file && to && to !== e.file) into.add(to);
      if (to === e.file && f.file !== e.file) from.add(f.file);
    }
    const inside = snap?.stack.filter((x) => S.model!.byName.get(x.fn)?.file === e.file) ?? [];
    const top = snap?.stack.at(-1);
    const state = !inside.length ? 'idle' : S.model.byName.get(top?.fn ?? '')?.file === e.file ? 'running' : 'waiting';
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(e.file)}</span><span class="k">module</span></div>
      <div class="ins-body">
      ${row('state', `<span class="state ${state}">${state}${inside.length ? ` in ${esc(S.model.byName.get(inside.at(-1)!.fn)?.cname ?? '')}` : ''}</span>${inside.length > 1 ? ` · ${inside.length} frames` : ''}`)}
      ${row('functions', `${fns.length}${fns.some((f) => f.isStatic) ? ` · ${fns.filter((f) => f.isStatic).length} static` : ''}`)}
      ${row('doors', doors.map((d) => `${esc(d.cname)}${d.declared === false ? ' <span class="soon" title="no prototype in any header">(no prototype)</span>' : ''}`).join(', ') || '—')}
      ${row('calls into', esc([...into].join(', ') || '—'))}
      ${row('called from', esc([...from].join(', ') || '—'))}
      <div class="sprite-actions"><button class="btn sm" data-toggle>${m.collapsed ? 'Open module' : 'Close module'}</button><button class="btn sm" data-goto>Go to file</button></div>
      <div class="foot"><span>double-click → ${m.collapsed ? 'open' : 'close'}</span><span>drag → move</span><span>${m.pinned ? 'pinned by you' : 'auto-placed'}</span></div></div>`;
    inspector.querySelector('[data-toggle]')!.addEventListener('click', () => {
      toggleModule(e.file);
      lastInspectorKey = '';
    });
    inspector.querySelector('[data-goto]')!.addEventListener('click', () => gotoCode(e));
  } else if (e.k === 'proc') {
    const t = S.trace;
    inspector.innerHTML = `<div class="ins-title"><span class="n">process</span><span class="k">the OS</span></div>
      <div class="ins-body"><p>Calls <code>main</code> and keeps its return value as the exit status.</p>
      ${row('exit', t && S.pos >= t.evs.length && t.exit ? esc(fmtVal(t.exit)) : '—')}</div>`;
  } else {
    const b = computeBelts(layout, S.model, S.trace).find((x) => x.key === e.key);
    if (!b) return void (inspector.hidden = true);
    const hostName = (k: string) => (k.startsWith('mod:') ? k.slice(4) : k);
    const sites = b.lines.slice(0, 12).map((l) => `<a data-line="${l}" data-file="${esc(b.srcFile)}">${b.srcFile ? `${esc(b.srcFile.slice(b.srcFile.lastIndexOf('/') + 1))}:` : 'line '}${l + 1}</a>`).join(', ') + (b.lines.length > 12 ? ` +${b.lines.length - 12}` : '');
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(hostName(b.from) || 'process')} → ${esc(hostName(b.to))}</span><span class="k">${b.fromHost.startsWith('mod:') || b.toHost.startsWith('mod:') ? 'trunk' : 'call'}</span></div>
      <div class="ins-body">${b.toHost.startsWith('mod:') || b.fromHost.startsWith('mod:') ? row('delivers to', esc(b.callees.map((c) => S.model?.byName.get(c)?.cname ?? c).join(', '))) : ''}
      ${b.lines.length ? row('call sites', sites) : ''}
      ${row('route', b.custom ? 'yours' : 'auto')}
      <div class="foot"><span>drag → re-route</span>${b.custom ? '<span>double-click → reset</span>' : ''}</div></div>`;
  }
}

// ---------------- playbar ----------------
function describe(e: Ev, trace: Trace): string {
  const f = (s: string) => `<span class="fn">${esc(s)}</span>`;
  switch (e.k) {
    case 'call':
      return `${f(e.caller ?? 'process')} <span class="arrow">→</span> ${f(e.fn)}(${e.args.map((a) => (a.data ? `<span class="ptr">${esc(payloadText(a.data))}</span>` : a.val.k === 'ptr' ? `<span class="ptr">${esc(a.text)}</span>` : esc(fmtVal(a.val)))).join(', ')})`;
    case 'ret':
      return `${f(e.fn)} <span class="arrow">returns</span> <span class="ret">${e.data ? esc(payloadText(e.data)) : e.val.k === 'void' ? 'void' : esc(e.val.k === 'ptr' ? (e.val.to === null ? 'NULL' : `→${pointeeName(trace, e.val.to, null)}`) : fmtVal(e.val))}</span> <span class="arrow">to</span> ${f(e.caller ?? 'process')}`;
    case 'write':
      return e.via !== null ? `<span class="ptr">${esc(e.text)}</span> <span class="arrow">→</span> ${esc(pointeeName(trace, e.cell, null))}` : esc(e.text);
    case 'eval':
      return `${esc(e.text)} <span class="${e.result ? 'ret' : 'no'}">${e.result ? 'true' : 'false'}</span>`;
    case 'error':
      return `<span class="err">${esc(e.msg)}</span>`;
    case 'step':
      return `<span class="no">line ${e.line + 1}</span>`;
    case 'alloc':
      return `malloc <span class="arrow">→</span> <span class="ret">${esc(trace.cells.get(e.cell)?.name ?? '?')}</span> (${e.size} B)`;
    case 'free':
      return `free(<span class="ptr">${esc(trace.cells.get(e.cell)?.name ?? '?')}</span>)`;
  }
}

// One line for the readout: "hello\n" or {data "hel…", len 23, cap 40, pos 6}
function payloadText(d: Payload): string {
  if (d.k === 'str') return clip(d.text, 24);
  return `{${d.fields.map((x) => `${x.name} ${x.text.startsWith('"') ? clip(x.text, 8) : x.text}`).join(', ')}}`;
}

let lastPbKey = '';
let lastExec = '';
// During a statement the playbar tells it with its values and what it wrote.
function roomLine(): { html: string; ev: Ev | null; key: string } | null {
  const t = S.trace;
  if (!t || !S.model || !t.evs.length) return null;
  const bn = beatNow(t, S.model, S.pos);
  if (!bn) return null;
  const b = bn.beat;
  const fn = S.model.byName.get(b.fn);
  if (!fn) return null;
  const st = planOf(fn).stations[b.station];
  const ev = t.evs[b.from];
  const code = esc(bn.phase === 'read' ? st.text : computeText(b, fn, t) || st.text);
  const res = b.kind === 'switch' && b.result !== undefined && bn.phase === 'write' ? ` <span class="arrow">→</span> <span class="ret">${b.result}</span>` : '';
  const wrote = bn.phase === 'write' ? writesOf(b, fn, t).slice(0, 4).map((w) => `${w.key.slice(2).replace('.', '->')}${w.index !== undefined ? `[${w.index}]` : ''} = ${w.text}`) : [];
  return {
    html: `<span class="fn">${esc(fn.cname)}</span> <span class="no">l.${st.line + 1}</span> ${code}${res}${wrote.length ? ` <span class="arrow">⇒</span> ${esc(wrote.join(', '))}` : ''}`,
    ev, key: `${b.from}|${bn.phase}`,
  };
}

function renderPlaybar(): void {
  const t = S.trace;
  const n = N();
  const fr = t && n ? frameAt(t, S.pos) : null;
  const inRoom = roomLine();
  const ev = inRoom ? inRoom.ev : fr ? (fr.ev ?? (fr.i > 0 ? t!.evs[fr.i - 1] : null)) : null;
  const key = `${Math.floor(S.pos)}|${!!fr?.ev}|${S.playing}|${n}|${t?.exit ? 1 : 0}|${inRoom?.key ?? ''}`;
  if (key !== lastPbKey) {
    lastPbKey = key;
    const idx = fr ? (fr.ev ? fr.i + 1 : fr.i) : 0;
    $('pb-step').textContent = t
      ? `${t.engine === 'gdb' ? 'gdb  ' : ''}${String(idx).padStart(2, '0')} / ${String(n).padStart(2, '0')}${S.pos >= n && n ? '  done' : ''}`
      : S.gdb.status === 'running' ? 'running under gdb…' : 'no trace';
    $('pb-event').innerHTML = inRoom ? inRoom.html : ev ? describe(ev, t!) : t ? '<span class="no">ready — press play</span>' : '<span class="no">nothing to run</span>';
    $('play-icon').innerHTML = S.playing ? '<path d="M3 2h4v12H3zM9 2h4v12H9z"/>' : '<path d="M4 2v12l10-6z"/>';
    $('play-icon').closest('button')?.classList.toggle('playing', S.playing);
    document.querySelectorAll<HTMLButtonElement>('.pb-buttons button').forEach((b) => (b.disabled = !t));
  }
  const diag = !t ? S.gdb.compile?.diagnostics.find((d) => d.severity === 'error') : undefined;
  const brokeHere = t && !S.playing && Number.isInteger(S.pos) ? violations().find((v) => v.at === S.pos && v.line !== null) : undefined;
  const markFile = (brokeHere ? brokeHere.file : ev ? ev.file : diag?.file) || undefined;
  const execKey = `${brokeHere ? `v${brokeHere.line}` : ev ? `${ev.line}|${ev.k === 'error' ? 'e' : 'x'}` : diag ? `c${diag.line}` : ''}|${markFile ?? ''}|${S.project?.active ?? ''}`;
  if (execKey !== lastExec) {
    lastExec = execKey;
    let mark: { line: number; kind: 'exec' | 'error' } | null = brokeHere ? { line: brokeHere.line!, kind: 'error' } : ev ? { line: ev.line, kind: ev.k === 'error' ? 'error' : 'exec' } : diag ? { line: diag.line, kind: 'error' } : null;
    // In a project the running line may be in another file: follow it there
    // like a debugger, unless the author is typing.
    const p = S.project;
    if (mark && p && markFile && markFile !== p.active) {
      if ((S.playing || !editor.hasFocus) && p.files.has(markFile)) {
        switchFile(markFile);
        lastExec = `${execKey.slice(0, execKey.lastIndexOf('|'))}|${p.active}`;
      } else mark = null;
    }
    editor.dispatch({ effects: setExecLine.of(mark) });
    // Follow the running line, unless the author is typing in the editor.
    if (mark && (S.playing || !editor.hasFocus) && mark.line < editor.state.doc.lines) {
      const pos = editor.state.doc.line(mark.line + 1).from;
      editor.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'nearest', yMargin: 60 }) });
    }
  }
  drawTimeline();
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

// The timeline under the playbar: its bars are drawn once per trace, skin and
// size (bright and dim copies); each frame only lays the bright part over the
// dim one up to the playhead.
let tlCache: { key: string; bright: HTMLCanvasElement; dim: HTMLCanvasElement; head: string } | null = null;
let tlSize = { w: 0, h: 0, at: 0 };
function drawTimeline(): void {
  const now = performance.now();
  if (now - tlSize.at > 500 || !tlSize.w) {
    // the strip's size only changes on resize: don't ask layout every frame
    const r = timeline.getBoundingClientRect();
    tlSize = { w: r.width, h: r.height, at: now };
  }
  const dpr = window.devicePixelRatio || 1;
  const W = tlSize.w;
  const H = tlSize.h;
  if (timeline.width !== Math.round(W * dpr) || timeline.height !== Math.round(H * dpr)) {
    timeline.width = Math.round(W * dpr);
    timeline.height = Math.round(H * dpr);
  }
  const g = timeline.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, timeline.width, timeline.height);
  const t = S.trace;
  if (!t || !t.evs.length) return;
  const n = t.evs.length;
  const key = `${traceRevision}|${S.skin.id}|${timeline.width}x${timeline.height}`;
  if (tlCache?.key !== key) {
    const make = (alpha: number) => {
      const c = document.createElement('canvas');
      c.width = timeline.width;
      c.height = timeline.height;
      const cg = c.getContext('2d')!;
      cg.setTransform(dpr, 0, 0, dpr, 0, 0);
      const maxD = Math.max(1, ...t.snaps.map((s) => s.stack.length));
      const colW = W / n;
      const col = {
        call: cssVar('--tl-call'), ret: cssVar('--tl-ret'), ptr: cssVar('--tl-ptr'),
        write: cssVar('--tl-write'), eval: cssVar('--tl-eval'), error: cssVar('--tl-err'),
      };
      cg.globalAlpha = alpha;
      for (let i = 0; i < n; i++) {
        const e = t.evs[i];
        const d = t.snaps[i + 1].stack.length || t.snaps[i].stack.length;
        const h = 3 + (d / maxD) * (H - 8);
        cg.fillStyle = e.k === 'write' && e.via !== null ? col.ptr : e.k === 'step' ? col.eval : e.k === 'alloc' ? col.call : e.k === 'free' ? col.ret : col[e.k];
        cg.fillRect(i * colW + (colW > 3 ? 0.5 : 0), H - h, Math.max(1, colW - (colW > 3 ? 1 : 0)), h);
      }
      return c;
    };
    tlCache = { key, bright: make(1), dim: make(0.3), head: cssVar('--tl-head') };
  }
  const x = Math.round((S.pos / n) * W * dpr);
  g.drawImage(tlCache.dim, 0, 0);
  if (x > 0) g.drawImage(tlCache.bright, 0, 0, x, timeline.height, 0, 0, x, timeline.height);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = tlCache.head;
  g.fillRect(x / dpr - 1, 0, 2, H);
  g.fillStyle = '#ef5b50';
  for (const v of violations()) {
    const vx = (v.at / n) * W;
    g.beginPath(); g.moveTo(vx - 4, 0); g.lineTo(vx + 4, 0); g.lineTo(vx, 7); g.fill();
  }
}

// ---------------- the kill feed: who sent what to whom ----------------
// Calls, returns, and writes into memory another function owns, newest on
// top, each with its type and the value that went across. Built once per
// trace; redrawn only when the newest one changes.
interface Transfer { i: number; kind: 'call' | 'ret' | 'write'; from: string; to: string; data: string }
let transfers: { rev: number; list: Transfer[] } = { rev: -1, list: [] };
const FEED_COLORS = ['#2d89ef', '#00a300', '#e3008c', '#9f00a7', '#da532c', '#1e7145', '#b91d47', '#00aba9', '#603cba', '#e3a21a'];
const FEED_ACT = {
  call: '<svg viewBox="0 0 18 14" aria-label="calls"><path d="M1 7h14M10 2l5 5-5 5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ret: '<svg viewBox="0 0 18 14" aria-label="returns to"><path d="M16 2v5H4M8 3L3 7l5 4" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  write: '<svg viewBox="0 0 18 14" aria-label="writes into"><path d="M3 12l1.2-3.6L12 1.5l2.8 2.8L7 11.2zM3 12l3.6-1.2" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>',
};
const clipFeed = (v: string, n = 28) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

function transfersOf(t: Trace): Transfer[] {
  if (transfers.rev === traceRevision) return transfers.list;
  const list: Transfer[] = [];
  const name = (fn: string | null | undefined) => (!fn ? 'process' : S.model?.byName.get(fn)?.cname ?? fn);
  // the way C writes it: type, name, value
  const typed = (type: string | undefined, v: string, nm = '') => `${type ? `<i>${esc(type)}</i> ` : ''}${nm ? `${esc(nm)} = ` : ''}<b>${esc(clipFeed(v))}</b>`;
  t.evs.forEach((e, i) => {
    if (e.k === 'call') {
      const fn = S.model?.byName.get(e.fn);
      const snap = t.snaps[i + 1];
      const args = e.args.map((a, k) => typed(fn?.params[k]?.type, a.data ? payloadText(a.data) : argLabel(a.val, a.text, t, snap), a.name));
      list.push({ i, kind: 'call', from: name(e.caller), to: name(e.fn), data: args.join(' · ') || '<i>no arguments</i>' });
    } else if (e.k === 'ret') {
      const fn = S.model?.byName.get(e.fn);
      const v = e.data ? payloadText(e.data) : e.val.k === 'void' ? 'void' : retLabel(e.val, t);
      list.push({ i, kind: 'ret', from: name(e.fn), to: name(e.caller), data: typed(fn?.ret, v) });
    } else if (e.k === 'write' && e.frame !== null) {
      // only writes that land in memory another function owns
      const info = t.cells.get(e.cell);
      if (!info || info.frame === e.frame || info.frame === -2) return;
      const writer = t.snaps[i].stack.find((f) => f.id === e.frame)?.fn;
      const owner = info.frame === -1 ? info.owner : t.snaps[i + 1]?.stack.find((f) => f.id === info.frame)?.fn;
      if (!writer || !owner || writer === owner) return;
      list.push({ i, kind: 'write', from: name(writer), to: name(owner), data: `${esc(info.name)} = <b>${esc(clipFeed(fmtVal(e.val), 36))}</b>` });
    }
  });
  transfers = { rev: traceRevision, list };
  return list;
}

function feedIcon(n: string): string {
  let h = 7;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const parts = n.split('_').filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : n.slice(0, 2)) || '?';
  return `<span class="fn"><span class="ico" style="background:${FEED_COLORS[h % FEED_COLORS.length]}">${esc(initials)}</span>${esc(n)}</span>`;
}

let feedKey = '';
function renderFeed(): void {
  const el = $('feed');
  const t = S.trace;
  if (!t || !t.evs.length) {
    if (feedKey) (el.innerHTML = ''), (feedKey = '');
    return;
  }
  const list = transfersOf(t);
  const at = Math.floor(S.pos);
  let lo = 0, hi = list.length - 1, last = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (list[m].i <= at) (last = m), (lo = m + 1);
    else hi = m - 1;
  }
  const key = `${traceRevision}|${last}`;
  if (key === feedKey) return;
  feedKey = key;
  const rows = list.slice(Math.max(0, last - 4), last + 1).reverse();
  const fade = [1, 0.82, 0.66, 0.5, 0.36];
  el.innerHTML = rows.map((r, n) => `<div class="kf ${r.kind}" data-i="${r.i}" style="opacity:${fade[n]}" title="jump here">${feedIcon(r.from)}<span class="act">${FEED_ACT[r.kind]}</span>${feedIcon(r.to)}<span class="data">${r.data}</span></div>`).join('');
}

// ---------------- the duel: a transfer between far-apart machines ----------------
// The renderer decides when (a sender or receiver off screen, view.duel);
// here it's spelled out: the caller's line with the call marked and the
// callee's signature with the values that arrived; or the return statement
// and the caller's line with the call replaced by what came back; or a
// write landing in memory another function owns. It stays up long enough
// to read, even in Fast mode.
const C_KW = new Set(['if', 'else', 'while', 'for', 'do', 'return', 'break', 'continue', 'static', 'const', 'struct', 'typedef', 'sizeof', 'unsigned', 'signed', 'goto', 'switch', 'case', 'default', 'enum', 'union', 'extern', 'volatile']);
const C_TY = /^(int|char|void|long|short|float|double|size_t|ssize_t|bool|t_\w+|s_\w+|u?int\d+_t)$/;
function hlC(code: string): string {
  return code.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*.*?\*\/|\/\/.*$|\b\d[\w.]*\b|\b[A-Za-z_]\w*\b|[^A-Za-z_0-9"'\/]+|\/)/g, (t, _m, off: number, all: string) => {
    const e = esc(t);
    if (t[0] === '"' || t[0] === "'") return `<span class="syn-str">${e}</span>`;
    if (t.startsWith('/*') || t.startsWith('//')) return `<span class="syn-com">${e}</span>`;
    if (/^\d/.test(t)) return `<span class="syn-num">${e}</span>`;
    if (/^[A-Za-z_]/.test(t)) {
      if (C_KW.has(t)) return `<span class="syn-kw">${e}</span>`;
      if (C_TY.test(t)) return `<span class="syn-ty">${e}</span>`;
      if (/^[A-Z][A-Z0-9_]+$/.test(t)) return `<span class="syn-mac">${e}</span>`;
      if (all.slice(off + t.length).trimStart().startsWith('(')) return `<span class="syn-fn">${e}</span>`;
    }
    return e;
  });
}

// A source line as the editor has it (project file, or the sample buffer).
function srcLine(file: string | undefined, line: number): string {
  const text = S.project && file ? S.project.files.get(file)?.text : editor.state.doc.toString();
  return (text?.split('\n')[line] ?? '').trim();
}

// Where a frame was when event `i` happened: its latest line before i
// (not the closing brace gdb stops on just before a return).
function frameLine(t: Trace, frame: number, i: number, skipLine = -1): { line: number; file?: string } | null {
  for (let j = i - 1; j >= 0; j--) {
    const e = t.evs[j];
    if (e.frame === frame && e.k !== 'call' && e.k !== 'ret' && e.line !== skipLine) return { line: e.line, file: e.file };
  }
  return null;
}

// `callee(…)` inside a line: where it starts and ends (matching the parenthesis).
function callSpan(code: string, callee: string): [number, number] | null {
  const m = new RegExp(`\\b${callee}\\s*\\(`).exec(code);
  if (!m) return null;
  let depth = 0;
  for (let k = m.index + m[0].length - 1; k < code.length; k++) {
    if (code[k] === '(') depth++;
    else if (code[k] === ')' && --depth === 0) return [m.index, k + 1];
  }
  return null;
}

const DUEL_ICON = {
  call: '<svg viewBox="0 0 26 18"><path d="M1 9h21M15 3l7 6-7 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ret: '<svg viewBox="0 0 26 18"><path d="M3 2v7h19M17 3l6 6-6 6" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  write: '<svg viewBox="0 0 26 18"><path d="M3 15l1.5-4.5L16 1.5l3.5 3.5L8 14zM3 15l4.5-1.5M20 16h5" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linejoin="round"/></svg>',
};

let duelShown: { key: string; since: number } | null = null;
function renderDuel(now: number): void {
  const el = $('duel');
  const t = S.trace;
  // Focus mode's return card is saying it already: one overlay at a time
  if (!stageCard.hidden) {
    el.hidden = true;
    duelShown = null;
    return;
  }
  const d = view.duel;
  if (!d || !t) {
    // keep the last one up long enough to read, then let it go
    if (duelShown && now - duelShown.since > 1500) {
      el.classList.add('out');
      if (now - duelShown.since > 1800) (el.hidden = true), (duelShown = null);
    }
    return;
  }
  const chip = el.querySelector<HTMLElement>('.chip');
  if (duelShown?.key === d.key && chip) {
    // it may have started fading out: the same event is back, so keep it up
    if (el.classList.contains('out') || el.hidden) (el.classList.remove('out'), (el.hidden = false));
    chip.style.left = `${Math.max(4, Math.min(96, d.p * 100))}%`;
    chip.parentElement!.style.setProperty('--p', `${d.p}`);
    return;
  }
  duelShown = { key: d.key, since: now };
  const name = (fn: string | null | undefined) => (!fn ? 'process' : S.model?.byName.get(fn)?.cname ?? fn);
  const head = (fn: string, at: { line: number } | null) => `<div class="d-head">${feedIcon(fn).replace('<span class="fn">', '').replace(/<\/span>$/, '')}${at ? `<span class="d-at">line ${at.line + 1}</span>` : ''}</div>`;
  const e = t.evs[d.i];
  let left = '', right = '', verb = '', what = '', say = '';
  const role = (title: string, sub: string) => `<div class="d-role"><b>${esc(title)}</b> <span>${esc(sub)}</span></div>`;
  if (e.k === 'call') {
    const callerFrame = t.snaps[d.i].stack.at(-1);
    const at = t.engine === 'interp' ? { line: e.line, file: e.file } : callerFrame ? frameLine(t, callerFrame.id, d.i) : null;
    const code = at ? srcLine(at.file, at.line) : '';
    const fn = S.model?.byName.get(e.fn);
    const span = fn ? callSpan(code, fn.cname) : null;
    const body = span ? `${hlC(code.slice(0, span[0]))}<mark>${hlC(code.slice(span[0], span[1]))}</mark>${hlC(code.slice(span[1]))}` : hlC(code || `${e.fn}(…)`);
    left = `<div class="d-card send">${role('caller', `${name(e.caller)} makes the call${at ? ` on line ${at.line + 1}` : ''}`)}${head(name(e.caller), at)}<pre class="d-code">${body}</pre></div>`;
    const snap = t.snaps[d.i + 1];
    const params = (fn?.params ?? []).map((p, k) => {
      const a = e.args[k];
      const v = a ? (a.data ? payloadText(a.data) : argLabel(a.val, a.text, t, snap)) : '?';
      return `  ${hlC(`${p.type} ${p.name}`)} = <span class="val">${esc(v)}</span>`;
    });
    const sig = fn ? `${hlC(`${fn.isStatic ? 'static ' : ''}${fn.ret}`)}\n${hlC(fn.cname)}(${params.length ? `\n${params.join(',\n')}\n` : ''})` : esc(e.fn);
    right = `<div class="d-card recv">${role('called', `${name(e.fn)} starts with these values`)}${head(name(e.fn), fn ? { line: fn.nameLine } : null)}<pre class="d-code">${sig}</pre></div>`;
    verb = `calls ${DUEL_ICON.call}`;
    what = e.args.map((a) => `${a.name} = ${a.data ? payloadText(a.data) : argLabel(a.val, a.text, t, snap)}`).join(', ') || 'no arguments';
    say = `<b>${esc(name(e.caller))}</b> calls <b>${esc(name(e.fn))}</b>${e.args.length ? ` with ${esc(what)}` : ''}`;
  } else if (e.k === 'ret') {
    const fn = S.model?.byName.get(e.fn);
    const value = e.data ? payloadText(e.data) : e.val.k === 'void' ? 'void' : retLabel(e.val, t);
    const at = frameLine(t, e.frame!, d.i, fn?.endLine ?? -1);
    const code = at ? srcLine(at.file, at.line) : '}';
    left = `<div class="d-card send">${role('returning', `${name(e.fn)} is done and hands back`)}${head(name(e.fn), at)}<pre class="d-code">${hlC(code)}\n<span class="syn-com">// </span>${hlC(fn?.ret ?? '')} <span class="val">${esc(value)}</span></pre></div>`;
    const st = t.snaps[d.i].stack;
    const k = st.findIndex((f) => f.id === e.frame);
    const caller = k > 0 ? st[k - 1] : null;
    const cat = caller ? frameLine(t, caller.id, d.i) : null;
    const ccode = cat ? srcLine(cat.file, cat.line) : '';
    const span = fn ? callSpan(ccode, fn.cname) : null;
    const got = span ? `<span class="faint">${hlC(ccode)}</span>\n${hlC(ccode.slice(0, span[0]))}<span class="val">${esc(value)}</span>${hlC(ccode.slice(span[1]))}` : hlC(ccode || 'main');
    right = `<div class="d-card recv">${role('caller', `${name(e.caller)} gets it back here${cat ? ` (line ${cat.line + 1})` : ''}`)}${head(name(e.caller), cat)}<pre class="d-code">${got}</pre></div>`;
    verb = `returns ${DUEL_ICON.ret}`;
    what = value;
    say = `<b>${esc(name(e.fn))}</b> returns <b class="v">${esc(value)}</b> to <b>${esc(name(e.caller))}</b>`;
  } else if (e.k === 'write') {
    const info = t.cells.get(e.cell);
    const at = d.beatFrom !== undefined ? { line: t.evs[d.beatFrom].line, file: t.evs[d.beatFrom].file } : null;
    const writer = t.snaps[d.i].stack.find((f) => f.id === e.frame)?.fn;
    left = `<div class="d-card send">${role('writer', `${name(writer)} writes through a pointer`)}${head(name(writer), at)}<pre class="d-code">${hlC(at ? srcLine(at.file, at.line) : '')}</pre></div>`;
    const oldCell = [...t.snaps[d.i].statics, ...t.snaps[d.i].stack.flatMap((f) => f.cells)].find((c) => c.id === e.cell);
    const owner = info?.frame === -1 ? info.owner : t.snaps[d.i + 1]?.stack.find((f) => f.id === info?.frame)?.fn;
    right = `<div class="d-card recv">${role('owner', `${name(owner)}'s ${info?.name ?? 'variable'} changes`)}${head(name(owner), null)}<pre class="d-code">${hlC(`${oldCell?.type ?? ''} ${info?.name ?? '?'}`)}${info?.frame === -1 ? ' <span class="syn-com">// static</span>' : ''}\n  <span class="old">${esc(oldCell ? fmtVal(oldCell.val) : '?')}</span>\n→ <span class="val">${esc(fmtVal(e.val))}</span></pre></div>`;
    verb = `writes into ${DUEL_ICON.write}`;
    what = `${info?.name ?? ''} = ${fmtVal(e.val)}`;
    say = `<b>${esc(name(writer))}</b> changes <b>${esc(name(owner))}</b>'s ${esc(info?.name ?? '')}: <span class="old">${esc(oldCell ? fmtVal(oldCell.val) : '?')}</span> ➜ <b class="v">${esc(fmtVal(e.val))}</b>`;
  } else return;
  el.className = d.kind;
  el.innerHTML = `<div class="d-say"><span class="t">${say}</span></div>${left}<div class="d-mid"><div class="d-verb">${verb}</div><div class="d-track" style="--p:${d.p}"><span class="chip" style="left:${Math.max(4, d.p * 100)}%">${esc(clipFeed(what, 36))}</span></div>${what.length > 36 ? `<div class="d-what" title="${esc(what)}">${esc(what)}</div>` : ''}</div>${right}`;
  el.hidden = false;
}

// ---------------- focus mode: a return's card ----------------
// Over the veiled grid, before the result travels back: what the function
// was called with and what it hands back — its return value, and whatever it
// changed through its pointers.
const stageCard = $<HTMLElement>('stage-card');
let stageCardKey = '';
function renderStageCard(): void {
  const t = S.trace;
  const fr = t && t.evs.length ? frameAt(t, S.pos) : null;
  const ph = fr?.ph;
  if (!t || !fr || !ph || ph.parked !== 'card') {
    stageCard.hidden = true;
    stageCardKey = '';
    return;
  }
  // fade in and out at the ends of the wait
  const total = ph.lead > 0 ? ph.secs / ph.lead : 1;
  stageCard.style.opacity = String(Math.min(1, ph.secs / 0.3, (total - ph.secs) / 0.3));
  if (stageCardKey === `${traceRevision}|${fr.i}`) return;
  stageCardKey = `${traceRevision}|${fr.i}`;
  const c = returnCard(t, fr.i);
  if (!c) return void (stageCard.hidden = true);
  const name = (k: string | null) => (k ? S.model?.byName.get(k)?.cname ?? k : 'process');
  const fn = S.model?.byName.get(c.fn);
  // full names: a field under its variable reads buf->pos
  let parent = '';
  const rows = c.rows.map((r) => {
    if (!r.depth) parent = r.name;
    return { ...r, full: r.depth ? `${parent}->${r.name}` : r.name };
  });
  const typeOf = (n: string) => fn?.params.find((p) => p.name === n)?.type;
  const ret = c.ret[0];
  const gives = !ret || fn?.ret === 'void' ? '<span class="none">nothing (void)</span>'
    : c.ret.length > 1 ? `<span class="ty">${esc(fn?.ret ?? '')}</span> <b class="ret">{${c.ret.slice(1).map((r) => `${esc(r.name)}: ${esc(r.out ?? r.in)}`).join(', ')}}</b>`
    : `<span class="ty">${esc(fn?.ret ?? '')}</span> <b class="ret">${esc(ret.out ?? ret.in)}</b>`;
  const nChanged = rows.filter((r) => r.changed).length;
  // before | after, side by side; what changed is lit, what didn't is quiet
  const tr = (r: (typeof rows)[number]) => {
    const kind = r.changed ? 'chg' : r.out === undefined ? 'val' : 'same';
    const nm = `${r.depth ? '' : `<span class="ty">${esc(typeOf(r.name) ?? '')}</span> `}${esc(r.full)}`;
    const after = r.changed ? `<span class="arrow">➜</span><b>${esc(r.out ?? '')}</b><span class="tag">changed</span>`
      : r.out === undefined ? `<span class="note">${(typeOf(r.name) ?? '').includes('*') ? 'same address · what it points at is below' : 'a copy: the caller\'s own is untouched'}</span>`
      : `<span class="note">same</span>`;
    return `<tr class="${kind}${r.depth ? ' f' : ''}"><td class="n">${nm}</td><td class="b">${esc(r.in)}</td><td class="a">${after}</td></tr>`;
  };
  stageCard.innerHTML = `<div class="sc-title"><span class="t"><span class="fn">${esc(name(c.fn))}</span> <span class="k">is done and returns to</span> <span class="fn">${esc(name(c.caller))}</span></span></div>
    <div class="sc-gives"><span class="lbl">gives back</span> ${gives}</div>
    <table><thead><tr><th></th><th>before <span>(when called)</span></th><th>after <span>(now, at return)</span></th></tr></thead><tbody>
    ${rows.map(tr).join('') || '<tr><td class="n none" colspan="3">no arguments</td></tr>'}
    </tbody></table>
    <div class="sc-foot">${nChanged ? `${nChanged} value${nChanged === 1 ? '' : 's'} changed through its pointers` : 'nothing it could reach changed'}</div>`;
  stageCard.hidden = false;
}

// ---------------- system clock ----------------
// For skins that show one (Wii, Switch, PlayStation): time, am/pm, date.
function tickClock(): void {
  const d = new Date();
  const parts = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).split(' ');
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
  const html = `<b>${esc(parts[0])}</b>${parts[1] ? `<i>${esc(parts[1])}</i>` : ''}<s>${esc(date)}</s>`;
  document.querySelectorAll<HTMLElement>('.sysclock').forEach((el) => {
    if (el.innerHTML !== html) el.innerHTML = html;
  });
}
tickClock();
setInterval(tickClock, 15000);

// ---------------- app zoom ----------------
// Ctrl+wheel and Ctrl+= / − / 0 zoom the whole app, like the browser's own
// zoom, but here the level is known and shown. CSS zoom on <html>; the
// canvases measure their boxes, so they stay sharp.
const UI_ZOOMS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
let uiZoom = 1;
function setUiZoom(z: number): void {
  uiZoom = Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
  const html = document.documentElement;
  html.style.zoom = uiZoom === 1 ? '' : String(uiZoom);
  html.style.setProperty('--ui-zoom', String(uiZoom));
  $('ui-zoom-read').textContent = `${Math.round(uiZoom * 100)}%`;
  try {
    localStorage.setItem('ftb.zoom', String(uiZoom));
  } catch {}
  view.resize();
  hideMenu();
}
function stepUiZoom(dir: 1 | -1): void {
  const next = dir > 0 ? UI_ZOOMS.find((z) => z > uiZoom + 0.001) : [...UI_ZOOMS].reverse().find((z) => z < uiZoom - 0.001);
  if (next !== undefined) setUiZoom(next);
}

// ---------------- main loop ----------------
let lastT = performance.now();
let lastFollowEv = -1;
let lastStage = '';
// Paused and still (no input, the camera at rest): redraw about 15 times a
// second instead of 60, so an idle page doesn't keep the CPU busy.
let lastInputAt = 0;
let lastDrawAt = 0;
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
      if (!qTold) (qTold = true), toast(`drawing at ${next}× sharpness to keep it smooth`);
    }
  } else if (frames > 30 && qFast / frames > 0.95 && cur < screen) {
    const up = [...SCALES].reverse().find((s) => s > cur + 0.01 && s <= screen);
    if (up !== undefined) (view.scale = up), view.resize();
  }
  qSince = now;
  qSlow = qFast = 0;
}

function frame(now: number): void {
  if (!S.playing && now - lastInputAt > 400 && view.settled() && now - lastDrawAt < 66) {
    lastT = now;
    requestAnimationFrame(frame);
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
    if (i >= n) S.playing = false;
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
          S.pos = j + 1;
          left -= need;
          if (S.stepTarget !== null && S.pos >= S.stepTarget) break;
        } else {
          S.pos += (left * rate) / d;
          left = 0;
        }
      }
      // M4: freeze on the step where an invariant first breaks.
      const hit = violations().find((v) => v.at > before + 1e-9 && v.at <= S.pos);
      if (hit) {
        S.pos = hit.at;
        S.playing = false;
        S.stepTarget = null;
        toast(`stopped: ${hit.invariant} broke — ${hit.detail}`);
        // Bring the broken sprite into view, clear of the alert banner.
        const sp = S.sprites.find((x) => x.id === hit.sprite);
        if (sp) {
          const r = spriteWorldRect(sp, S.trace?.snaps[hit.at]?.bound?.[sp.id]);
          view.ensureVisible(r.x, r.y - 2, r.w, r.h + 2, Math.max(2.5, (view.h * 0.28) / view.cs));
        }
      }
      if (S.stepTarget !== null && S.pos >= S.stepTarget) {
        S.pos = S.stepTarget;
        S.stepTarget = null;
        S.playing = false;
      }
      if (S.pos >= n) {
        S.pos = n;
        S.playing = false;
      }
    }
  }
  // Follow the running function, but never fight the author's own panning.
  if (S.follow && t && S.playing && !drag && now - lastPanAt > 2500) {
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
  S.violations = violations();
  view.draw(S, S.skin, now);
  renderStageCard();
  renderPlaybar();
  renderFeed();
  renderDuel(now);
  renderInspector();
  renderLiveStatus();
  requestAnimationFrame(frame);
}

// ---------------- boot ----------------
async function boot(): Promise<void> {
  document.documentElement.dataset.skin = S.skin.id;
  await initParser();
  editor = createEditor($('editor'), S.sample.src, hooks, S.vim);
  Vim.defineEx('write', 'w', () => (S.project ? openSaveDialog() : restart()));
  Vim.defineEx('sample', 'sa', (_cm: unknown, p: { args?: string[] }) => loadSample(p.args?.[0]));

  $('vim-toggle').addEventListener('click', toggleVim);
  renderVimToggle();
  connectLive(onLive, () => {
    liveEditors = [];
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
  inspector.addEventListener('click', lineLinks);
  $('btn-open').addEventListener('click', () => void openFolderDialog());
  $('btn-files').addEventListener('click', toggleExplorer);
  $('btn-save').addEventListener('click', openSaveDialog);
  $<HTMLInputElement>('run-args').addEventListener('change', (e) => {
    if (!S.project) return;
    S.project.run.args = splitArgs((e.target as HTMLInputElement).value).slice(0, 32);
    runChanged();
  });
  $<HTMLInputElement>('run-defs').addEventListener('change', (e) => {
    if (!S.project) return;
    const input = e.target as HTMLInputElement;
    const defs = input.value.split(/[\s,]+/).map((d) => d.replace(/^-D/, '')).filter(Boolean);
    const bad = defs.find((d) => !/^[A-Za-z_]\w*(=[\w.+-]*)?$/.test(d));
    if (bad) return toast(`-D ${bad}: use NAME or NAME=value`);
    S.project.run.defines = defs.slice(0, 32);
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
      S.project.run.stdin = value;
      return runChanged();
    }
    S.stdin = value;
    saveSoon();
    if (S.model && engineFor(S.model) === 'gdb') {
      cancelGdb();
      startGdb(editor.state.doc.toString(), S.model, false);
      renderAlerts();
    }
  });
  $('btn-fit').addEventListener('click', () => view.fit(S));
  $('btn-tidy').addEventListener('click', tidy);
  document.addEventListener('pointerdown', (e) => {
    const list = $('skin-list');
    if (!list.hidden && !(e.target as HTMLElement).closest('#skin-list, #skins')) list.hidden = true;
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && ($('skin-list').hidden = true));
  $('feed').addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.kf');
    if (row) seek(Number(row.dataset.i));
  });
  document.querySelectorAll<HTMLButtonElement>('#insides button').forEach((b) => b.addEventListener('click', () => setAllShut(b.dataset.v === 'hide')));
  const followBtn = $('btn-follow');
  followBtn.setAttribute('aria-pressed', String(S.follow));
  followBtn.addEventListener('click', () => {
    S.follow = !S.follow;
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
  let scrubbing = false;
  const scrub = (e: PointerEvent) => {
    const r = timeline.getBoundingClientRect();
    seek(Math.round(((e.clientX - r.left) / r.width) * N()));
  };
  timeline.addEventListener('pointerdown', (e) => {
    scrubbing = true;
    timeline.setPointerCapture(e.pointerId);
    scrub(e);
  });
  timeline.addEventListener('pointermove', (e) => scrubbing && scrub(e));
  timeline.addEventListener('pointerup', () => (scrubbing = false));

  bindMouse();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', () => view.resize());
  try {
    const z = Number(localStorage.getItem('ftb.zoom'));
    setUiZoom(z > 0 ? z : 1);
  } catch {
    setUiZoom(1);
  }
  $('ui-zoom-in').addEventListener('click', () => stepUiZoom(1));
  $('ui-zoom-out').addEventListener('click', () => stepUiZoom(-1));
  $('ui-zoom-read').addEventListener('click', () => setUiZoom(1));
  let wheelAcc = 0;
  window.addEventListener(
    'wheel',
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // a mouse notch is one step; a trackpad pinch adds up small deltas
      wheelAcc += e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      if (Math.abs(wheelAcc) < 50) return;
      stepUiZoom(wheelAcc < 0 ? 1 : -1);
      wheelAcc = 0;
    },
    { passive: false },
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key === '=' || e.key === '+') stepUiZoom(1);
      else if (e.key === '-' || e.key === '_') stepUiZoom(-1);
      else if (e.key === '0') setUiZoom(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    },
    { capture: true },
  );
  new ResizeObserver(() => view.resize()).observe($('grid-wrap'));

  renderSampleTabs();
  renderSkinPicker();
  $('pb-speed').textContent = `${S.speed}×`;
  $('file-name').textContent = S.sample.file;
  await applySkin(S.skin);
  await document.fonts.ready;
  view.resize();
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
  if (import.meta.env.DEV) Object.assign(window, { __ftb: { S, view, layout, editor, computeBelts, openFolder, switchFile, refreshMeta, dirtyFiles, stageRect, applySkin, SKINS } });
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 10px 10px;color:#e2473b;background:#000;padding:10px">${esc(String(err?.stack ?? err))}</pre>`);
});
