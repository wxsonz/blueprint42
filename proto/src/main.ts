import { Vim } from '@replit/codemirror-vim';
import { createEditor, jumpTo, setDoc, setExecLine, setVim, type EditorHooks } from './editor';
import { fmtVal, run, type Ev, type Trace } from './interp';
import { Layout } from './layout';
import { initParser, parse } from './parse';
import { GridView, activeHostRect, computeBelts, entKey, entityAt, evDuration, frameAt, pointeeName, type Entity, type ViewState } from './render';
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
};

const SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 5];

const LEGEND: { kind: IconKind; name: string; c: string; live: boolean; text: string }[] = [
  { kind: 'node', name: 'Function', c: 'function definition', live: true, text: 'One per function. Shows whether it is running, waiting on a callee, or idle.' },
  { kind: 'belt', name: 'Call', c: 'f(a, b)', live: true, text: 'Caller → callee. Arguments ride in, the return value rides back. Animated while the call is in progress. Drag it to re-route.' },
  { kind: 'frame', name: 'Stack frame', c: 'parameters + locals', live: true, text: 'Attached under its function. Appears on call; after the return it stays dimmed with the last values.' },
  { kind: 'wire', name: 'Pointer', c: 'T *p', live: true, text: 'Runs from a pointer to what it points at. A write through *p travels along it.' },
  { kind: 'chest', name: 'Static', c: 'static / global variable', live: true, text: 'Lives for the whole program, not one call. Tethered to the function that owns it.' },
  { kind: 'strip', name: 'Buffer', c: 'array with indices', live: false, text: 'A strip of bytes with markers riding it (pos, len, cap).' },
  { kind: 'drill', name: 'Input', c: 'read() / fd', live: false, text: 'Produces up to BUFFER_SIZE bytes per call.' },
  { kind: 'copy', name: 'Copy', c: 'memcpy, copy loops', live: false, text: 'Moves bytes from a buffer into a block.' },
  { kind: 'train', name: 'List', c: 'linked list', live: false, text: 'Cars coupled by next pointers.' },
  { kind: 'stack', name: 'Stack', c: 'push_swap A / B', live: false, text: 'A vertical strip.' },
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
  const sel = S.selected;
  if (sel?.k === 'node' && renamed.has(sel.id)) S.selected = { k: 'node', id: renamed.get(sel.id)! };
  if (sel?.k === 'node' && !layout.nodes.has((S.selected as { id: string }).id)) S.selected = null;
  const oldN = S.trace?.evs.length ?? 0;
  const atEnd = S.trace !== null && S.pos >= oldN;
  S.model = model;
  S.trace = !model.error && model.byName.has('main') ? run(model) : null;
  const n = S.trace?.evs.length ?? 0;
  S.pos = fresh ? 0 : atEnd ? n : Math.min(S.pos, n);
  S.stepTarget = null;
  if (!S.trace) S.playing = false;
  renderAlerts();
  renderStatus();
  if (fresh) {
    view.resize();
    view.fit(S, true);
  }
}

function loadSample(key: string | undefined): void {
  const s = SAMPLES.find((x) => x.key === key || x.title === key) ?? (key ? SAMPLES[Number(key) - 1] : undefined);
  if (!s) return toast(`no sample “${key}” — try ${SAMPLES.map((x) => x.key).join(', ')}`);
  S.sample = s;
  S.selected = null;
  $('file-name').textContent = s.file;
  renderSampleTabs();
  setDoc(editor, s.src);
  clearTimeout(debounce);
  analyze(s.src, true);
  if (S.trace) setTimeout(() => play(), 450);
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
  toast('handed back to auto-placement');
}

function resetRoute(key: string): void {
  layout.waypoints.delete(key);
  toast('route reset');
}

// ---------------- mouse ----------------
type Drag =
  | { k: 'pan'; x: number; y: number; moved: boolean }
  | { k: 'node'; id: string; ox: number; oy: number; moved: boolean }
  | { k: 'belt'; key: string; moved: boolean };
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
    if (hit?.k === 'node' && (hit.copy ?? 1) > 1) drag = null; // copies follow their home
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
    } else {
      S.hovered = entityAt(S, wx, wy);
    }
    setCursorStyle();
  });

  const end = () => {
    if (drag?.k === 'node' && drag.moved) toast('pinned: auto-layout won’t move it (right-click → Unpin)');
    if (drag?.k === 'pan' && !drag.moved && S.selected === null) S.legend = null;
    drag = null;
    setCursorStyle();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => {
    if (!drag) S.hovered = null;
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
  if (!gridPane.contains(document.activeElement) || e.metaKey || e.altKey) return;
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
  dock.innerHTML = LEGEND.map((l, i) => `<button class="slot${l.live ? '' : ' later'}${S.legend === l.kind ? ' on' : ''}" data-i="${i}" title="${esc(l.name)} — ${esc(l.c)}"><canvas></canvas></button>`).join('');
  dock.querySelectorAll<HTMLButtonElement>('.slot').forEach((b) => {
    const l = LEGEND[Number(b.dataset.i)];
    drawIcon(b.querySelector('canvas')!, l.kind, 26);
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
    al('info', `<b>Structure view.</b> No <code>main()</code>, so nothing runs.${m.fns.some((f) => f.externals.length) ? ' Calls to <code>read</code>/<code>malloc</code> need the real trace server (M3).' : ''}`);
  if (S.trace?.error) al('err', `<b>Stopped</b> at line ${S.trace.error.line + 1}: ${esc(S.trace.error.msg)}`);
  if (S.trace?.truncated) al('warn', `<b>Trace truncated</b> at ${S.trace.evs.length} steps.`);
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
      : `${t.evs.length} steps · <span class="ok">exit ${t.exit ? fmtVal(t.exit) : '?'}</span>`;
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
function renderInspector(): void {
  const fr = S.trace && S.trace.evs.length ? frameAt(S.trace, S.pos) : null;
  const key = `${S.legend}|${entKey(S.selected)}:${S.selected?.k === 'node' ? S.selected.copy ?? 1 : ''}|${fr ? `${fr.si}` : ''}|${S.model?.tree.rootNode.text.length}|${S.skin.id}`;
  if (key === lastInspectorKey) return;
  lastInspectorKey = key;

  if (S.legend) {
    const l = LEGEND.find((x) => x.kind === S.legend)!;
    inspector.hidden = false;
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(l.name)}</span><span class="k">legend</span></div>
      <div class="ins-body"><div class="row"><span class="l">C</span><span class="v">${esc(l.c)}</span></div><p>${esc(l.text)}</p>
      ${l.live ? '' : '<div class="foot"><span class="soon">placing it arrives in M2</span></div>'}</div>`;
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
  if (e.k === 'node') {
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
    const vals = frames[0]?.cells.map((c) => `${c.name} = ${c.val.k === 'ptr' && c.val.to !== null ? `→${pointeeName(S.trace, c.val.to, frames[0])}` : fmtVal(c.val, c.type)}`).join(' · ');
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(copy > 1 ? `${node.name} #${copy}` : node.name)}</span><span class="k">${copy > 1 ? 'recursive copy' : 'function'}</span></div>
      <div class="ins-body"><div class="sig">${esc(sig)}</div>
      ${row('state', `<span class="state ${state}">${state}${waitingOn ? ` on ${esc(waitingOn)}` : ''}</span>${frames.length > 1 ? ` · ${frames.length} frames` : ''}${node.stale ? ' · stale' : ''}`)}
      ${vals ? row('frame', esc(vals)) : ''}
      ${recursive ? row('recursion', copy > 1 ? `call depth ${copy} — spawned by ${esc(node.name)} #${copy - 1}` : 'each call spawns a copy') : ''}
      ${row('calls', esc([...new Set(f?.calls.map((c) => c.callee))].join(', ') || '—'))}
      ${row('called by', esc(callers.join(', ') || (node.name === 'main' ? 'process' : '—')))}
      ${f?.externals.length ? row('external', esc(f.externals.join(', '))) : ''}
      <div class="foot"><span>double-click → code</span><span>${node.place.pinned ? 'pinned by you' : 'auto-placed'}</span></div></div>`;
  } else if (e.k === 'static') {
    const id = S.trace ? [...S.trace.cells].find(([, c]) => c.frame === -1 && c.owner === e.fn && c.name === e.name)?.[0] : undefined;
    const c = id !== undefined ? snap?.statics.find((x) => x.id === id) : null;
    inspector.innerHTML = `<div class="ins-title"><span class="n">${esc(e.name)}</span><span class="k">static</span></div>
      <div class="ins-body">${row('owner', esc(e.fn))}${row('value', c ? esc(fmtVal(c.val, c.type)) : '—')}
      <p>Lives for the whole program, not just one call.</p></div>`;
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
    $('pb-step').textContent = t ? `${String(idx).padStart(2, '0')} / ${String(n).padStart(2, '0')}${S.pos >= n && n ? '  done' : ''}` : 'no trace';
    $('pb-event').innerHTML = ev ? describe(ev, t!) : t ? '<span class="no">ready — press play</span>' : '<span class="no">nothing to run</span>';
    $('play-icon').innerHTML = S.playing ? '<path d="M3 2h4v12H3zM9 2h4v12H9z"/>' : '<path d="M4 2v12l10-6z"/>';
    document.querySelectorAll<HTMLButtonElement>('.pb-buttons button').forEach((b) => (b.disabled = !t));
  }
  const execKey = ev ? `${ev.line}|${ev.k === 'error' ? 'e' : 'x'}` : '';
  if (execKey !== lastExec) {
    lastExec = execKey;
    editor.dispatch({ effects: setExecLine.of(ev ? { line: ev.line, kind: ev.k === 'error' ? 'error' : 'exec' } : null) });
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
    g.fillStyle = e.k === 'write' && e.via !== null ? col.ptr : col[e.k];
    g.fillRect(i * colW + (colW > 3 ? 0.5 : 0), H - h, Math.max(1, colW - (colW > 3 ? 1 : 0)), h);
  }
  g.globalAlpha = 1;
  const x = Math.round((S.pos / n) * W);
  g.fillStyle = cssVar('--tl-head');
  g.fillRect(x - 1, 0, 2, H);
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
      S.pos += (dt * S.speed) / evDuration(t.evs[i]);
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
  analyze(S.sample.src, true);
  requestAnimationFrame(frame);
  editor.focus();
  setTimeout(() => play(), 700);
  // Dev-only handle for the headless screenshot checks.
  if (import.meta.env.DEV) Object.assign(window, { __ftb: { S, view, layout, computeBelts } });
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;inset:auto 10px 10px;color:#e2473b;background:#000;padding:10px">${esc(String(err?.stack ?? err))}</pre>`);
});
