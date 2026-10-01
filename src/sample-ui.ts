// A single sample's work, kept in this browser: its text, run settings,
// layout and sprites; loading, reverting, blueprint export and import.
import { sanitizeCases, type TestCase } from './cases';
import { type Blueprint, type Sprite, parseBlueprint, serializeBlueprint } from './blueprint';
import { $, store } from './dom';
import { setDoc } from './editor';
import { evaluateInterpreterBindings, run } from './interp';
import { folded, shut } from './layout';
import { analyze, applyTrace, cancelGdb, engineFor, play, startGdb } from './main';
import { renderAlerts, renderSampleTabs } from './panels';
import { leaveProject, openSampleProject, projectSaveSoon, renderProjectChrome, renderRunFields } from './project-ui';
import { SAMPLES, SAMPLE_PROJECTS } from './samples';
import { S, debounce, editor, layout, setLastInspectorKey, setLoadingSample, toast, view, update } from './state';

// ---------------- per-sample work, kept in this browser ----------------
interface Saved {
  src: string;
  stdin?: string;
  args?: string[];
  defines?: string[];
  cases?: TestCase[]; // test cases (src/cases.ts), kept in this browser
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
export function saveSoon(): void {
  if (S.project) return projectSaveSoon();
  const key = S.sample.key;
  clearTimeout(saveTimers.get(key));
  const saved: Saved = {
    src: editor.state.doc.toString(),
    stdin: S.stdin,
    args: S.args,
    defines: S.defines,
    ...(S.cases.length ? { cases: S.cases } : {}),
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
export function settle(): void {
  renderInsides();
  if (!S.model) return;
  const moved = layout.settle(S.model);
  if (moved) toast(`rearranged ${moved} machine${moved === 1 ? '' : 's'} that overlapped`);
}

// Back to the auto layout (with an undo for a few seconds).
export function tidy(): void {
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
export function toggleShut(fn: string): void {
  if (!S.model) return;
  if (shut.has(fn)) shut.delete(fn);
  else shut.add(fn);
  layout.reflow(S.model);
  setLastInspectorKey('');
  saveSoon();
  renderInsides();
}
export function setAllShut(closed: boolean): void {
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
export function renderInsides(): void {
  const all = !!S.model?.fns.length && S.model.fns.every((f) => shut.has(f.name));
  document.querySelectorAll<HTMLButtonElement>('#insides button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === 'hide' ? all : !all)));
}

export function blueprint(): Blueprint {
  if (S.project) return layout.toBlueprint(S.sprites, true);
  return {
    version: 1,
    nodes: Object.fromEntries([...layout.nodes.values()].map((n) => [n.id, { x: n.place.x, y: n.place.y, pinned: n.place.pinned }])),
    waypoints: Object.fromEntries([...layout.waypoints].map(([k, p]) => [k, { x: p.x, y: p.y }])),
    sprites: S.sprites,
  };
}

export function exportBlueprint(): void {
  const data = new Blob([serializeBlueprint(blueprint())], { type: 'application/json' });
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${S.project?.name ?? S.sample.key}.blueprint.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importBlueprint(file: File): Promise<void> {
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
    update('importBlueprint', { sprites: bp.sprites });
    update('importBlueprint', { selected: null });
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

export function revertSample(): void {
  clearTimeout(saveTimers.get(S.sample.key));
  saveTimers.delete(S.sample.key);
  store.set(`sample.${S.sample.key}`, '');
  loadSample(S.sample.key, true);
  toast('back to the original sample (Ctrl+Z in the editor undoes this)');
}

export function loadSample(key: string | undefined, pristine = false): void {
  const sp = SAMPLE_PROJECTS.find((x) => x.key === key);
  if (sp) return openSampleProject(sp);
  const s = SAMPLES.find((x) => x.key === key || x.title === key) ?? (key ? SAMPLES[Number(key) - 1] : undefined);
  if (!s) return toast(`no sample “${key}” — try ${SAMPLES.map((x) => x.key).join(', ')}`);
  if (S.project) leaveProject();
  update('loadSample', { sample: s });
  update('loadSample', { selected: null });
  store.set('lastSample', s.key);
  const saved = pristine ? null : readSaved(s.key);
  update('loadSample', { sprites: saved?.sprites ? parseSavedSprites(saved.sprites) : [] });
  const src = saved?.src ?? s.src;
  update('loadSample', { stdin: saved?.stdin ?? s.stdin ?? '' });
  update('loadSample', { args: saved?.args ?? [] });
  update('loadSample', { defines: saved?.defines ?? s.defines ?? [] });
  update('loadSample', { cases: sanitizeCases(saved?.cases ?? s.cases) });
  $<HTMLTextAreaElement>('stdin').value = S.stdin;
  renderRunFields();
  $('file-name').textContent = s.file;
  renderSampleTabs();
  setLoadingSample(true);
  setDoc(editor, src);
  setLoadingSample(false);
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

export function bindingsChanged(): void {
  setLastInspectorKey('');
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
