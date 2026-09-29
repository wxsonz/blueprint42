// The state every part of the page shares: the app state S, the layout, the
// DOM handles, and the few values more than one module reassigns (each has a
// setter: an imported binding can't be assigned).
import type { createEditor } from './editor';
import type { GResult } from './gdb';
import { Layout } from './layout';
import { GridView } from './render';
import { type ViewState } from './playback';
import { SAMPLES, type Sample } from './samples';
import { SKINS } from './skins';
import type { IconKind, Skin } from './skins/types';
import type { Sprite } from './blueprint';
import type { Project } from './workspace';
import { $, store } from './dom';

// ---------------- state ----------------
export const layout = new Layout();
export const S: ViewState & {
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
  args: string[]; // a single file's command-line arguments (a project keeps its own in run.json)
  defines: string[]; // …and its -D flags
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
  args: [],
  defines: [],
  gdb: { status: 'idle' },
  sprites: [],
  project: null,
};

export const LEGEND: { kind: IconKind; name: string; c: string; live: boolean; text: string }[] = [
  { kind: 'node', name: 'Function', c: 'function definition', live: true, text: 'One per function. Shows whether it is running, waiting on a callee, or idle.' },
  { kind: 'belt', name: 'Call', c: 'f(a, b)', live: true, text: 'Caller → callee. Arguments ride in, the return value rides back. Animated while the call is in progress. Drag it to re-route.' },
  { kind: 'frame', name: 'Stack frame', c: 'parameters + locals', live: true, text: 'Attached under its function. Appears on call; after the return it stays dimmed with the last values.' },
  { kind: 'wire', name: 'Pointer', c: 'T *p', live: true, text: 'Runs from a pointer to what it points at. A write through *p travels along it.' },
  { kind: 'chest', name: 'Static', c: 'static / global variable', live: true, text: 'Lives for the whole program, not one call. Tethered to the function that owns it.' },
  { kind: 'strip', name: 'Strip', c: 'array with indices', live: true, text: 'Drag onto the grid; bind bytes, length and markers in the inspector.' },
  { kind: 'chest', name: 'Chest', c: 'value or storage', live: true, text: 'Drag onto the grid and bind a value.' },
  { kind: 'marker' as IconKind, name: 'Marker', c: 'cursor or index', live: true, text: 'Standalone card showing a bound index. To make a cursor ride a strip, add it in that strip’s Markers field.' },
  { kind: 'drill', name: 'Drill', c: 'input fd', live: true, text: 'Drag onto the grid and bind its source.' },
  { kind: 'copy', name: 'Inserter', c: 'memcpy / copy loop', live: true, text: 'Drag onto the grid and bind what the copy is moving, e.g. the bytes left (n) in lr_copy.' },
  { kind: 'train', name: 'Train', c: 'linked list', live: true, text: 'Drag onto the grid and bind a pointer.' },
  { kind: 'stack', name: 'Stack', c: 'stack A / B', live: true, text: 'Drag onto the grid and bind a value.' },
];

// ---------------- DOM ----------------
export const canvas = $<HTMLCanvasElement>('grid');
export const view = new GridView(canvas);
export const gridPane = $<HTMLElement>('grid-pane');
export const editorPane = $<HTMLElement>('editor-pane');
export const inspector = $<HTMLElement>('inspector');
export const alerts = $<HTMLElement>('alerts');
export const overlay = $<HTMLElement>('overlay');
const toastEl = $<HTMLElement>('toast');
export const timeline = $<HTMLCanvasElement>('timeline');
export const menu = $<HTMLElement>('menu');

export const decl = (type: string, name: string) => (type.endsWith('*') ? type + name : `${type} ${name}`);

let toastTimer = 0;
export function toast(msg: string, action?: { label: string; run: () => void }): void {
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

// ---------------- shared values ----------------
// The editor (made in boot) and the re-parse timer.
export let debounce = 0;
export let editor: ReturnType<typeof createEditor>;
// true while the editor's text is replaced by code, not typed
export let loadingSample = false;
// bumped on every new trace and model; what the inspector and the playbar
// last showed, and the running line last marked in the editor
export let lastInspectorKey = '';
export let traceRevision = 0;
export let modelRevision = 0;
export let lastPbKey = '';
export let lastExec = '';
export function setDebounce(v: number): void { debounce = v; }
export function setEditor(v: ReturnType<typeof createEditor>): void { editor = v; }
export function setLoadingSample(v: boolean): void { loadingSample = v; }
export function setLastInspectorKey(v: string): void { lastInspectorKey = v; }
export function setTraceRevision(v: number): void { traceRevision = v; }
export function setModelRevision(v: number): void { modelRevision = v; }
export function setLastPbKey(v: string): void { lastPbKey = v; }
export function setLastExec(v: string): void { lastExec = v; }
