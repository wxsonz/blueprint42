// Projects (M5) and everything around them: opening folders, files and tabs,
// live edits from other editors (M6), polling the disk, the explorer, and the
// Save / Open Folder / Go to file dialogs.
import { renderCases } from './cases-ui';
import { type Blueprint, parseBlueprint, serializeBlueprint } from './blueprint';
import { $, esc, store } from './dom';
import { createState, jumpTo, swapState } from './editor';
import { type LiveMsg, liveReplay, liveReveal } from './live';
import { renderAlerts, renderSampleTabs, renderStatus } from './panels';
import { SAMPLES, SAMPLE_PROJECTS, type SampleProject } from './samples';
import { baseName } from './skins/util';
import { S, debounce, editor, layout, overlay, setDebounce, setLastExec, setLoadingSample, toast, view, update } from './state';
import { BP_JSON, DRIVER, type Listing, META, type Opened, type PFile, type Project, RUN_JSON, fromFiles, fsCall, hash, isDirty, isSource, joinArgs, lineDiff, parseRun, runEmpty, save, serializeRun } from './workspace';
import { analyze, cancelGdb, closeOverlay, currentSrc, engineFor, hooks, startGdb } from './main';
import { bindingsChanged, loadSample, renderInsides, saveSoon, settle } from './sample-ui';

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
export function projectSaveSoon(): void {
  const p = S.project;
  if (!p) return;
  clearTimeout(projectSaveTimer);
  projectSaveTimer = window.setTimeout(() => {
    if (S.project === p) writeProjectBackup(p);
  }, 400);
}

export function writeProjectBackup(p: Project): void {
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

export function leaveProject(): void {
  const p = S.project;
  if (!p) return;
  store.set('lastProject', '');
  clearTimeout(projectSaveTimer);
  writeProjectBackup(p);
  stopPolling();
  update('leaveProject', { project: null });
  cancelGdb();
  layout.reset();
  // a fresh state: the sample must not share the project file's undo history
  setLoadingSample(true);
  swapState(editor, createState('', hooks, S.vim), S.vim, hooks);
  setLoadingSample(false);
  const kept = [...p.files.values()].filter(isDirty).length;
  if (kept && !p.readOnly) toast(`${p.name}: ${kept} unsaved file${kept === 1 ? '' : 's'} kept in this browser — reopen to save`);
}

export async function openFolder(path: string): Promise<boolean> {
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

export function openSampleProject(sp: SampleProject): void {
  loadProject(fromFiles(null, sp.name, Object.entries(sp.files).map(([path, text]) => ({ path, text, mtime: null }))));
}

function loadProject(p: Project): void {
  if (S.project) leaveProject();
  update('loadProject', { project: p });
  update('loadProject', { selected: null });
  update('loadProject', { sprites: [] });
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
  setLoadingSample(true);
  swapState(editor, stateFor(p.files.get(p.active)!), S.vim, hooks);
  setLoadingSample(false);
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
      update('loadProject', { sprites: bp.sprites });
    } catch (e) {
      toast(`${BP_JSON}: ${(e as Error).message} — ignored`);
    }
  }
  if (saved && saved.bpBase === hash(bpDisk ?? '') && S.model) {
    try {
      const bp = parseBlueprint(saved.layout);
      layout.applyBlueprint(bp, S.model, true);
      update('loadProject', { sprites: bp.sprites });
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

export function switchFile(path: string, at?: { line: number; col: number }): void {
  const p = S.project;
  const f = p?.files.get(path);
  if (!p || !f) return;
  if (p.active !== path) {
    const cur = p.files.get(p.active);
    if (cur) (cur.state = editor.state), (cur.text = editor.state.doc.toString());
    p.active = path;
    if (!p.tabs.includes(path)) p.tabs.push(path);
    setLoadingSample(true);
    swapState(editor, stateFor(f), S.vim, hooks);
    setLoadingSample(false);
    setLastExec(''); // mark the running line again, in this file
    renderProjectChrome();
    projectSaveSoon();
  }
  if (at) jumpTo(editor, at.line, at.col);
}

// Jump to a place in the code: another file in a project, else this buffer.
export function openAt(file: string | undefined, line: number, col = 0): void {
  if (S.project && file) switchFile(file, { line, col });
  else jumpTo(editor, line, col);
  // the connected editors (nvim…) go there too
  if (S.project?.root && file && liveEditors.length) void liveReveal(S.project.root, file, line, col);
}

// ---- M6: live edits from any editor (the nvim plugin, …) ----
// The page doesn't care where an edit comes from: an editor's unsaved text
// for a file is applied like typing here, and the latest change wins.
let liveEditors: string[] = [];
export function setLiveEditors(v: string[]): void {
  liveEditors = v;
}
export const liveFrom = new Map<string, string>(); // project path → the editor whose unsaved text it shows
const liveOutside = new Set<string>();

export function renderLive(): void {
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
    setDebounce(window.setTimeout(() => analyze('', false), 150));
  }
}

export function onLive(m: LiveMsg): void {
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

// Bring the derived .blueprint42 files up to date with the run settings and
// the author's layout; unchanged content keeps the disk text (not dirty).
export function refreshMeta(): void {
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

export function dirtyFiles(): PFile[] {
  const p = S.project;
  if (!p) return [];
  refreshMeta();
  return [...p.files.values()].filter(isDirty).sort((a, b) => a.path.localeCompare(b.path));
}

// A new driver main for a project that has none (a library: libft, gnl…).
export function createDriver(): void {
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

export function renderRunFields(): void {
  const p = S.project;
  const stdin = $<HTMLTextAreaElement>('stdin');
  if (document.activeElement !== stdin) stdin.value = p ? p.run.stdin : S.stdin;
  // a single file gets the same run settings (kept in this browser), not only a project
  $('run-row').hidden = false;
  $('stdin-info').textContent = p ? `run settings, saved as ${RUN_JSON}` : 'stdin, arguments and -D flags for the run under gdb';
  const args = $<HTMLInputElement>('run-args');
  const defs = $<HTMLInputElement>('run-defs');
  if (document.activeElement !== args) args.value = joinArgs(p ? p.run.args : S.args);
  if (document.activeElement !== defs) defs.value = (p ? p.run.defines : S.defines).join(' ');
  renderCases(); // the cases that go with these settings
}

// A single file's run settings changed: keep them, and run it again under gdb.
export function sampleRunChanged(set: () => void): void {
  set();
  saveSoon();
  if (S.model && engineFor(S.model) === 'gdb') {
    cancelGdb();
    startGdb(editor.state.doc.toString(), S.model, false);
    renderAlerts();
  }
}

export function runChanged(): void {
  projectSaveSoon();
  if (S.model && engineFor(S.model) === 'gdb') {
    cancelGdb();
    startGdb(currentSrc(), S.model, false);
    renderAlerts();
  }
}

// ---- chrome: project chip, tabs, explorer, save button ----
let explorerOpen = store.get('explorer') !== 'off';

export function renderProjectChrome(): void {
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
    document.title = 'blueprint42';
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
  document.title = `${dirty ? '● ' : ''}${p.name} — blueprint42`;
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

export function toggleExplorer(): void {
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
export function openSaveDialog(): void {
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
        setLoadingSample(true);
        swapState(editor, stateFor(f), S.vim, hooks);
        setLoadingSample(false);
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
export async function openFolderDialog(dir?: string): Promise<void> {
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
export function quickOpen(): void {
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
