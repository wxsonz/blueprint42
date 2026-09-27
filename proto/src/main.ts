import { EditorView } from '@codemirror/view';
import { Vim } from '@replit/codemirror-vim';
import { createEditor, jumpTo, setDoc, setExecLine, setVim, type EditorHooks } from './editor';
import { evaluateInterpreterBindings, fmtVal, run, type Ev, type Trace } from './interp';
import { isSafeBindingExpr, parseBlueprint, serializeBlueprint, type Blueprint, type Sprite, type SpriteKind } from './blueprint';
import { footprint, Layout } from './layout';
import { convertGdb, requestTrace, type GResult } from './gdb';
import { findViolations, parseInvariant, surpriseCalls, type Violation } from './invariants';
import { bufferShapes, initParser, parse, validateBindingExpr, type Model, type Var } from './parse';
import { GridView, activeHostRect, computeBelts, entKey, entityAt, evDuration, frameAt, pointeeName, spriteWorldRect, type Entity, type ViewState } from './render';
import { buildScene } from './route';
import { SAMPLES, type Sample } from './samples';
import { SKINS, SKIN_FONTS } from './skins';
import type { IconKind, Skin } from './skins/types';
import './styles/base.css';
import './styles/amp.css';
import './styles/classic.css';
import './styles/aqua.css';
import './styles/minimal.css';

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
};

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 12, 20];

// Long real traces pick a speed that plays them in about 45 s.
function autoSpeed(trace: Trace): void {
  const total = trace.evs.reduce((a, e) => a + evDuration(e), 0);
  S.speed = SPEEDS.find((sp) => total / sp <= 45) ?? SPEEDS[SPEEDS.length - 1];
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
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (toastEl.hidden = true), 2000);
}

// ---------------- analysis ----------------
let debounce = 0;
let editor: ReturnType<typeof createEditor>;

function analyze(src: string, fresh: boolean): void {
  const model = parse(src);
  if (fresh) layout.reset();
  const renamed = layout.sync(model);
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
    view.fit(S, true);
  }
}

function applyTrace(trace: Trace | null, fresh: boolean): void {
  const oldN = S.trace?.evs.length ?? 0;
  const atEnd = S.trace !== null && S.pos >= oldN;
  S.trace = trace;
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
    try {
      r = await requestTrace(
        { src, files: S.sample.files, defines: S.sample.defines, stdin: S.stdin, fns: model.fns.map((f) => f.name), maxSteps: 20000, maxSeconds: 8, bindings: S.sprites },
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
      applyTrace(convertGdb(r, model, src), fresh);
      if (fresh) {
        autoSpeed(S.trace!);
        view.fit(S);
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
  const key = S.sample.key;
  clearTimeout(saveTimers.get(key));
  const saved: Saved = {
    src: editor.state.doc.toString(),
    stdin: S.stdin,
    places: [...layout.nodes.values()].map((n) => [n.id, n.place.x, n.place.y, n.place.pinned]),
    waypoints: [...layout.waypoints].map(([k, w]) => [k, w.x, w.y]),
    sprites: structuredClone(S.sprites),
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
}

function blueprint(): Blueprint {
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
  a.download = `${S.sample.key}.blueprint.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBlueprint(file: File): Promise<void> {
  try {
    if (file.size > 200_000) throw new Error('Blueprint is too large');
    const bp = parseBlueprint(await file.text());
    for (const [id, p] of Object.entries(bp.nodes)) {
      const n = layout.nodes.get(id);
      if (n) n.place = { ...p };
    }
    layout.waypoints.clear();
    for (const [id, p] of Object.entries(bp.waypoints)) layout.waypoints.set(id, p);
    S.sprites = bp.sprites;
    S.selected = null;
    bindingsChanged();
    saveSoon();
    view.fit(S);
    toast(`loaded ${bp.sprites.length} sprite${bp.sprites.length === 1 ? '' : 's'}`);
  } catch (e) { toast(`Blueprint: ${(e as Error).message}`); }
}

function renderRevert(): void {
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
  const s = SAMPLES.find((x) => x.key === key || x.title === key) ?? (key ? SAMPLES[Number(key) - 1] : undefined);
  if (!s) return toast(`no sample “${key}” — try ${SAMPLES.map((x) => x.key).join(', ')}`);
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
  if (saved) {
    applySavedLayout(saved);
    view.fit(S, true);
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
    if (f) jumpTo(editor, f.nameLine, f.nameCol);
  } else if (e.k === 'static') {
    const v = S.model.byName.get(e.fn)?.statics.find((x) => x.name === e.name);
    if (v) jumpTo(editor, v.line, 0);
  } else if (e.k === 'belt') {
    const b = computeBelts(layout, S.model, S.trace).find((x) => x.key === e.key);
    if (b?.lines.length) jumpTo(editor, b.lines[0], 0);
    else gotoCode({ k: 'node', id: 'func:main' });
  } else gotoCode({ k: 'node', id: 'func:main' });
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
  | { k: 'sprite'; id: string; ox: number; oy: number; moved: boolean };
let drag: Drag | null = null;
let lastPanAt = 0;

function localXY(e: MouseEvent): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function setCursorStyle(): void {
  canvas.style.cursor =
    drag?.k === 'pan' ? 'grabbing' :
    drag?.k === 'node' || drag?.k === 'belt' ? 'move' :
    S.hovered?.k === 'node' || S.hovered?.k === 'belt' ? 'move' :
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
    else if (!hit) drag = { k: 'pan', x: e.clientX, y: e.clientY, moved: false };
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
    if (drag?.k === 'node' && drag.moved) toast('pinned: auto-layout won’t move it (right-click → Unpin)');
    if ((drag?.k === 'node' || drag?.k === 'belt' || drag?.k === 'sprite') && drag.moved) saveSoon();
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
    gotoCode(hit);
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
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
      if (layout.nodes.get(hit.id)?.place.pinned) items.push(['Unpin (auto-place)', () => unpin(hit.id)]);
    } else if (hit?.k === 'sprite') {
      items.push(['Bind…', () => { S.selected = hit; lastInspectorKey = ''; renderInspector(); inspector.querySelector<HTMLInputElement>('[name="expr"]')?.focus(); }]);
      items.push(['Remove', () => removeSprite(hit.id)]);
    } else if (hit?.k === 'belt') {
      items.push(['Go to call site', () => gotoCode(hit)]);
      if (layout.waypoints.has(hit.key)) items.push(['Reset route', () => resetRoute(hit.key)]);
    } else if (hit) items.push(['Go to code', () => gotoCode(hit)]);
    items.push(['Fit view', () => view.fit(S)]);
    showMenu(e.clientX, e.clientY, items);
  });
}

function showMenu(x: number, y: number, items: [string, () => void][]): void {
  menu.innerHTML = items.map(([label], i) => `<button data-i="${i}">${esc(label)}</button>`).join('');
  menu.hidden = false;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 4)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 4)}px`;
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
function onKey(e: KeyboardEvent): void {
  if (e.ctrlKey && e.key === 'Enter') {
    e.preventDefault();
    return restart();
  }
  if (!overlay.hidden) {
    if (e.key === 'Escape' || e.key === '?') {
      e.preventDefault();
      closeOverlay();
    }
    return;
  }
  if (!gridPane.contains(document.activeElement) || (document.activeElement as HTMLElement | null)?.closest('input, textarea, select, button, [contenteditable="true"]') || e.metaKey || e.altKey) return;
  const k = e.key;
  let handled = true;
  if (k === ' ') togglePlay();
  else if (k === 'ArrowRight') (e.shiftKey ? nextCall : stepFwd)();
  else if (k === 'ArrowLeft') (e.shiftKey ? prevCall : stepBack)();
  else if (k === 'Home') seek(0);
  else if (k === 'End') seek(N());
  else if (k === 'Escape') (S.selected = null), (S.legend = null), hideMenu();
  else if (k === 'f' || k === 'F') view.fit(S);
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

function renderSkinPicker(): void {
  const box = $('skins');
  box.innerHTML = SKINS.map((s) => `<button data-id="${s.id}" aria-pressed="${s === S.skin}" title="${esc(s.blurb)}">${esc(s.name)}</button>`).join('');
  box.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
    b.addEventListener('click', () => void applySkin(SKINS.find((s) => s.id === b.dataset.id)!)),
  );
}

// ---------------- vim toggle ----------------
const hooks: EditorHooks = {
  onChange: (doc) => {
    if (loadingSample) return;
    saveSoon();
    clearTimeout(debounce);
    debounce = window.setTimeout(() => analyze(doc, false), 150);
  },
  onCursor: (line, col) => {
    S.cursor = { line, col };
    const f = S.model?.fns.find((x) => line >= x.startLine && line <= x.endLine);
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
          ${K(['Double-click'], 'jump to code · reset route · fit')}${K(['Right-click'], 'more')}
        </div>
        <div><h4>Playback (canvas focused)</h4>
          ${K(['Space'], 'play / pause')}${K(['←', '→'], 'step')}${K(['Shift', '←/→'], 'previous / next call')}
          ${K(['Home', 'End'], 'start / end')}${K(['F'], 'fit view')}${K(['Ctrl', 'Enter'], 'run from the start (anywhere)')}
          <h4>Editor</h4>
          ${K(['vim'], 'toggle in the editor header')}${K([':w'], 'run from the start (vim)')}
        </div>
      </div>
      <div class="legend">${LEGEND.slice(0, 5).map((l) => `<canvas data-kind="${l.kind}"></canvas><div><b>${esc(l.name)}</b> <span class="c">${esc(l.c)}</span><br>${esc(l.text)}</div>`).join('')}</div>
    </div></div>`;
  overlay.hidden = false;
  overlay.querySelectorAll<HTMLCanvasElement>('canvas[data-kind]').forEach((c) => drawIcon(c, c.dataset.kind as IconKind, 34));
  $('dlg-close').addEventListener('click', closeOverlay);
}
function closeOverlay(): void {
  overlay.hidden = true;
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
  nav.innerHTML = SAMPLES.map((s) => `<button data-key="${s.key}" aria-pressed="${s === S.sample}" title="${esc(s.blurb)}">${esc(s.title)}</button>`).join('');
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
  if (m?.error) al('warn', `<b>Syntax error</b> on line ${m.error.line + 1}. The picture keeps its last shape; nothing runs until it parses.`);
  else if (m && !m.byName.has('main'))
    al('info', `<b>Structure view.</b> No <code>main()</code>, so nothing runs.`);
  const g = S.gdb;
  if (g.status === 'running') al('info', `<b>Running under gdb…</b> compiling with <code>cc -Wall -Wextra -Werror</code>${S.sample.defines?.length ? ` <code>${S.sample.defines.map((d) => `-D${esc(d)}`).join(' ')}</code>` : ''}`);
  if (g.status === 'unavailable') al('warn', `<b>No trace server.</b> Real execution runs inside <code>npm run dev</code> (or <code>npm run preview</code>); a static build can only use the interpreter.`);
  if (g.status === 'error' && g.compile) {
    const errs = g.compile.diagnostics.filter((d) => d.severity === 'error');
    const first = errs[0];
    al('err', first
      ? `<b>Compile failed</b> on line ${first.line + 1}: ${esc(first.msg)}${errs.length > 1 ? ` <span class="c">(+${errs.length - 1} more)</span>` : ''}`
      : `<b>Compile failed.</b> <code>${esc(g.compile.text.split('\n')[0] ?? '')}</code>`);
  } else if (g.status === 'error') al('err', `<b>Trace failed:</b> ${esc(g.error ?? 'unknown error')}`);
  if (S.trace?.error) al('err', `<b>Stopped</b> at line ${S.trace.error.line + 1}: ${esc(S.trace.error.msg)}`);
  if (S.trace?.truncated) al('warn', `<b>Trace truncated</b> at ${S.trace.evs.length} steps.`);
  const leaks = S.trace?.leaks ?? [];
  if (leaks.length) {
    const bytes = leaks.reduce((a, l) => a + l.size, 0);
    al('warn', `<b>Leak at exit:</b> ${leaks.length} block${leaks.length > 1 ? 's' : ''}, ${bytes} B never freed (${leaks.map((l) => `${esc(S.trace!.cells.get(l.cell)?.name ?? '?')}${l.line !== null ? ` from <a data-line="${l.line}">line ${l.line + 1}</a>` : ''}`).join(', ')}).`);
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
    const where = `<a data-seek="${v.at}"${v.line !== null ? ` data-line="${v.line}"` : ''}>step ${v.at}${v.line !== null ? `, line ${v.line + 1}` : ''}</a>`;
    al('err', `<b>${v.builtin ? 'Picture mismatch' : 'Invariant broken'}:</b> <code>${esc(v.invariant)}</code> on ${esc(sp?.label || sp?.binding?.expr || 'sprite')} — first at ${where}: ${esc(v.detail)}${list.length > 1 ? ` <span class="c">(${list.length} times)</span>` : ''}`);
  }
  for (const c of surpriseCalls(S.trace, (a, b) => a === b || !!S.model?.byName.get(a)?.calls.some((x) => x.callee === b)))
    al('warn', `<b>Unpredicted call:</b> <code>${esc(c.caller)} → ${esc(c.callee)}</code> at <a data-seek="${c.at}" data-line="${c.line}">line ${c.line + 1}</a> is not in the code's call graph — a function pointer?`);
  alerts.innerHTML = out.join('');
}

function renderStatus(): void {
  const m = S.model;
  const belts = computeBelts(layout, m).filter((b) => b.from !== '' && !b.chain).length + (m?.fns.filter((f) => f.calls.some((c) => c.callee === f.name)).length ?? 0);
  const statics = m?.fns.reduce((a, f) => a + f.statics.length, 0) ?? 0;
  $('st-parse').innerHTML = !m
    ? ''
    : m.error
      ? `<span class="bad">syntax error, line ${m.error.line + 1}</span>`
      : `<span class="ok">parsed</span> · ${m.fns.length} function${m.fns.length === 1 ? '' : 's'} · ${belts} call${belts === 1 ? '' : 's'}${statics ? ` · ${statics} static` : ''}`;
  const t = S.trace;
  $('st-trace').innerHTML = !t
    ? ''
    : t.error
      ? `<span class="bad">runtime error</span> · ${t.evs.length} steps`
      : `${t.engine === 'gdb' ? `gdb${S.gdb.ms ? ` ${S.gdb.ms} ms` : ''} · ` : ''}${t.evs.length} steps · ${t.truncated ? '<span class="bad">truncated</span>' : `<span class="ok">exit ${t.exit ? fmtVal(t.exit) : '?'}</span>`}`;
  $('grid-info').textContent = m ? `${S.sample.file}` : '';
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
  $('zoom-read').textContent = `${Math.round(view.cam.zoom * 100)}%`;
  $('st-hint').textContent = f === 'canvas' ? 'Space play · ←/→ step · middle-drag pan · wheel zoom' : 'Ctrl+Enter run';
}

let lastInspectorKey = '';
let traceRevision = 0;

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
    ...[...layout.nodes.values()].map((n) => footprint(n)),
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
  const key = `${S.legend}|${entKey(S.selected)}:${S.selected?.k === 'node' ? S.selected.copy ?? 1 : ''}|${fr ? `${fr.si}` : ''}|${traceRevision}|${S.model?.tree.rootNode.text.length}|${S.skin.id}`;
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
      ${row('calls', esc([...new Set(f?.calls.map((c) => c.callee))].join(', ') || '—'))}
      ${row('called by', esc(callers.join(', ') || (node.name === 'main' ? 'process' : '—')))}
      ${f?.externals.length ? row('external', esc(f.externals.join(', '))) : ''}
      ${suggestionButtons([...f?.params ?? [], ...f?.locals ?? []], f?.name ?? '')}
      <div class="foot"><span>double-click → code</span><span>${node.place.pinned ? 'pinned by you' : 'auto-placed'}</span></div></div>`;
    bindSuggestionButtons();
  } else if (e.k === 'static') {
    const id = S.trace ? [...S.trace.cells].find(([, c]) => c.frame === -1 && c.owner === e.fn && c.name === e.name)?.[0] : undefined;
    const c = id !== undefined ? snap?.statics.find((x) => x.id === id) : null;
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(e.name)}</span><span class="k">static</span></div>
      <div class="ins-body">${row('owner', esc(e.fn))}${row('value', c ? esc(fmtVal(c.val, c.type)) : '—')}
      <p>Lives for the whole program, not just one call.</p>${suggestionButtons(S.model?.byName.get(e.fn)?.statics.filter((v) => v.name === e.name) ?? [], e.fn)}</div>`;
    bindSuggestionButtons();
  } else if (e.k === 'proc') {
    const t = S.trace;
    inspector.innerHTML = `<div class="ins-title"><span class="n">process</span><span class="k">the OS</span></div>
      <div class="ins-body"><p>Calls <code>main</code> and keeps its return value as the exit status.</p>
      ${row('exit', t && S.pos >= t.evs.length && t.exit ? esc(fmtVal(t.exit)) : '—')}</div>`;
  } else {
    const b = computeBelts(layout, S.model, S.trace).find((x) => x.key === e.key);
    if (!b) return void (inspector.hidden = true);
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(b.from || 'process')} → ${esc(b.to)}</span><span class="k">call</span></div>
      <div class="ins-body">${b.lines.length ? row('call sites', b.lines.map((l) => `line ${l + 1}`).join(', ')) : ''}
      ${row('route', b.custom ? 'yours' : 'auto')}
      <div class="foot"><span>drag → re-route</span>${b.custom ? '<span>double-click → reset</span>' : ''}</div></div>`;
  }
}

// ---------------- playbar ----------------
function describe(e: Ev, trace: Trace): string {
  const f = (s: string) => `<span class="fn">${esc(s)}</span>`;
  switch (e.k) {
    case 'call':
      return `${f(e.caller ?? 'process')} <span class="arrow">→</span> ${f(e.fn)}(${e.args.map((a) => (a.val.k === 'ptr' ? `<span class="ptr">${esc(a.text)}</span>` : esc(fmtVal(a.val)))).join(', ')})`;
    case 'ret':
      return `${f(e.fn)} <span class="arrow">returns</span> <span class="ret">${e.val.k === 'void' ? 'void' : esc(e.val.k === 'ptr' ? (e.val.to === null ? 'NULL' : `→${pointeeName(trace, e.val.to, null)}`) : fmtVal(e.val))}</span> <span class="arrow">to</span> ${f(e.caller ?? 'process')}`;
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

let lastPbKey = '';
let lastExec = '';
function renderPlaybar(): void {
  const t = S.trace;
  const n = N();
  const fr = t && n ? frameAt(t, S.pos) : null;
  const ev = fr ? (fr.ev ?? (fr.i > 0 ? t!.evs[fr.i - 1] : null)) : null;
  const key = `${Math.floor(S.pos)}|${!!fr?.ev}|${S.playing}|${n}|${t?.exit ? 1 : 0}`;
  if (key !== lastPbKey) {
    lastPbKey = key;
    const idx = fr ? (fr.ev ? fr.i + 1 : fr.i) : 0;
    $('pb-step').textContent = t
      ? `${t.engine === 'gdb' ? 'gdb  ' : ''}${String(idx).padStart(2, '0')} / ${String(n).padStart(2, '0')}${S.pos >= n && n ? '  done' : ''}`
      : S.gdb.status === 'running' ? 'running under gdb…' : 'no trace';
    $('pb-event').innerHTML = ev ? describe(ev, t!) : t ? '<span class="no">ready — press play</span>' : '<span class="no">nothing to run</span>';
    $('play-icon').innerHTML = S.playing ? '<path d="M3 2h4v12H3zM9 2h4v12H9z"/>' : '<path d="M4 2v12l10-6z"/>';
    document.querySelectorAll<HTMLButtonElement>('.pb-buttons button').forEach((b) => (b.disabled = !t));
  }
  const diag = !t ? S.gdb.compile?.diagnostics.find((d) => d.severity === 'error') : undefined;
  const brokeHere = t && !S.playing && Number.isInteger(S.pos) ? violations().find((v) => v.at === S.pos && v.line !== null) : undefined;
  const execKey = brokeHere ? `v${brokeHere.line}` : ev ? `${ev.line}|${ev.k === 'error' ? 'e' : 'x'}` : diag ? `c${diag.line}` : '';
  if (execKey !== lastExec) {
    lastExec = execKey;
    const mark = brokeHere ? { line: brokeHere.line!, kind: 'error' as const } : ev ? { line: ev.line, kind: ev.k === 'error' ? ('error' as const) : ('exec' as const) } : diag ? { line: diag.line, kind: 'error' as const } : null;
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

function drawTimeline(): void {
  const r = timeline.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (timeline.width !== Math.round(r.width * dpr) || timeline.height !== Math.round(r.height * dpr)) {
    timeline.width = Math.round(r.width * dpr);
    timeline.height = Math.round(r.height * dpr);
  }
  const g = timeline.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = r.width;
  const H = r.height;
  g.clearRect(0, 0, W, H);
  const t = S.trace;
  if (!t || !t.evs.length) return;
  const n = t.evs.length;
  const maxD = Math.max(1, ...t.snaps.map((s) => s.stack.length));
  const colW = W / n;
  const col = {
    call: cssVar('--tl-call'), ret: cssVar('--tl-ret'), ptr: cssVar('--tl-ptr'),
    write: cssVar('--tl-write'), eval: cssVar('--tl-eval'), error: cssVar('--tl-err'),
  };
  for (let i = 0; i < n; i++) {
    const e = t.evs[i];
    const d = t.snaps[i + 1].stack.length || t.snaps[i].stack.length;
    const h = 3 + (d / maxD) * (H - 8);
    g.globalAlpha = i < S.pos ? 1 : 0.3;
    g.fillStyle = e.k === 'write' && e.via !== null ? col.ptr : e.k === 'step' ? col.eval : e.k === 'alloc' ? col.call : e.k === 'free' ? col.ret : col[e.k];
    g.fillRect(i * colW + (colW > 3 ? 0.5 : 0), H - h, Math.max(1, colW - (colW > 3 ? 1 : 0)), h);
  }
  g.globalAlpha = 1;
  const x = Math.round((S.pos / n) * W);
  g.fillStyle = cssVar('--tl-head');
  g.fillRect(x - 1, 0, 2, H);
  g.fillStyle = '#ef5b50';
  for (const v of violations()) {
    const vx = (v.at / n) * W;
    g.beginPath(); g.moveTo(vx - 4, 0); g.lineTo(vx + 4, 0); g.lineTo(vx, 7); g.fill();
  }
}

// ---------------- main loop ----------------
let lastT = performance.now();
let lastFollowEv = -1;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const t = S.trace;
  if (S.playing && t) {
    const n = t.evs.length;
    const i = Math.floor(S.pos);
    if (i >= n) S.playing = false;
    else {
      const before = S.pos;
      S.pos += (dt * S.speed) / evDuration(t.evs[i]);
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
    if (i !== lastFollowEv && i < t.evs.length) {
      lastFollowEv = i;
      const r = activeHostRect(S);
      if (r) view.ensureVisible(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
    }
  }
  S.violations = violations();
  view.draw(S, S.skin, now);
  renderPlaybar();
  renderInspector();
  renderLiveStatus();
  requestAnimationFrame(frame);
}

// ---------------- boot ----------------
async function boot(): Promise<void> {
  document.documentElement.dataset.skin = S.skin.id;
  await initParser();
  editor = createEditor($('editor'), S.sample.src, hooks, S.vim);
  Vim.defineEx('write', 'w', () => restart());
  Vim.defineEx('sample', 'sa', (_cm: unknown, p: { args?: string[] }) => loadSample(p.args?.[0]));

  $('vim-toggle').addEventListener('click', toggleVim);
  renderVimToggle();
  $('btn-help').addEventListener('click', openHelp);
  $('btn-revert').addEventListener('click', revertSample);
  alerts.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('a[data-seek], a[data-line]');
    if (!a) return;
    if (a.dataset.seek !== undefined) seek(Number(a.dataset.seek));
    if (a.dataset.line !== undefined) jumpTo(editor, Number(a.dataset.line), 0);
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
    S.stdin = (e.target as HTMLTextAreaElement).value;
    saveSoon();
    if (S.model && engineFor(S.model) === 'gdb') {
      cancelGdb();
      startGdb(editor.state.doc.toString(), S.model, false);
      renderAlerts();
    }
  });
  $('btn-fit').addEventListener('click', () => view.fit(S));
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
  new ResizeObserver(() => view.resize()).observe($('grid-wrap'));

  renderSampleTabs();
  renderSkinPicker();
  $('pb-speed').textContent = `${S.speed}×`;
  $('file-name').textContent = S.sample.file;
  await applySkin(S.skin);
  await document.fonts.ready;
  view.resize();
  loadSample(store.get('lastSample') ?? S.sample.key);
  requestAnimationFrame(frame);
  editor.focus();
  // Dev-only handle for the headless screenshot checks.
  if (import.meta.env.DEV) Object.assign(window, { __ftb: { S, view, layout, editor, computeBelts } });
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 10px 10px;color:#e2473b;background:#000;padding:10px">${esc(String(err?.stack ?? err))}</pre>`);
});
