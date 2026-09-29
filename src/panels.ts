// The panels around the grid: the Examples menu, the dock, alerts, the
// status bar, and the inspector (with M4's invariant checks it reports).
import { isSafeBindingExpr } from './blueprint';
import { $, esc } from './dom';
import { fmtVal } from './interp';
import { type Violation, findViolations, parseInvariant, surpriseCalls } from './invariants';
import { Layout, doorsOf, footprint } from './layout';
import { type Var, bufferShapes, validateBindingExpr } from './parse';
import { createDriver } from './project-ui';
import { computeBelts, entKey, frameAt, pointeeName, spriteWorldRect } from './render';
import { buildScene } from './route';
import { SAMPLES, SAMPLE_PROJECTS, type Sample } from './samples';
import type { IconKind } from './skins/types';
import { LEGEND, S, alerts, decl, editorPane, gridPane, inspector, lastInspectorKey, layout, modelRevision, setLastInspectorKey, toast, traceRevision, view } from './state';
import { DRIVER } from './workspace';
import { drawIcon, gotoCode, placeSprite, removeSprite, toggleModule } from './main';
import { bindingsChanged, loadSample, saveSoon } from './sample-ui';

// ---------------- panels ----------------
// The examples: one dropdown on the top bar, grouped by what they need (the
// browser alone, or gdb through the local server), then the sample projects.
const EXAMPLE_GROUPS: { id: Sample['group']; name: string; note: string }[] = [
  { id: 'basics', name: 'Runs in your browser', note: 'the built-in interpreter: ints, pointers, loops, recursion, statics' },
  { id: 'memory', name: 'Real C, traced under gdb', note: 'arrays, structs, the heap, crashes and leaks (needs npm run dev)' },
  { id: 'io', name: 'Reading input', note: 'real read() calls on the stdin you give it (gdb)' },
];
export function renderSampleTabs(): void {
  const btn = $<HTMLButtonElement>('examples');
  const list = $('example-list');
  const openSample = S.project?.readOnly ? SAMPLE_PROJECTS.find((x) => x.name === S.project!.name) : undefined;
  const current = openSample?.title ?? (S.project ? null : S.sample.title);
  btn.innerHTML = `Examples${current ? `<span class="cur">${esc(current)}</span>` : ''}<span class="caret">▾</span>`;
  const item = (key: string, title: string, blurb: string, on: boolean) =>
    `<button role="menuitemradio" data-key="${esc(key)}" aria-checked="${on}"><b>${esc(title)}</b><span class="tag">${esc(blurb)}</span></button>`;
  list.innerHTML = [
    ...EXAMPLE_GROUPS.map((g) => `<section><h3>${esc(g.name)}<span>${esc(g.note)}</span></h3>${SAMPLES.filter((s) => s.group === g.id).map((s) => item(s.key, s.title, s.blurb, !S.project && s === S.sample)).join('')}</section>`),
    `<section><h3>Projects<span>several files opened as a folder: modules, headers, a Makefile (gdb)</span></h3>${SAMPLE_PROJECTS.map((s) => item(s.key, s.title, s.blurb, openSample === s)).join('')}</section>`,
  ].join('');
  list.querySelectorAll<HTMLButtonElement>('button[data-key]').forEach((b) => b.addEventListener('click', () => {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    loadSample(b.dataset.key);
  }));
  btn.onclick = () => {
    list.hidden = !list.hidden;
    btn.setAttribute('aria-expanded', String(!list.hidden));
  };
}

export function renderDock(): void {
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

export function renderAlerts(): void {
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

export function renderStatus(): void {
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
export function renderLiveStatus(): void {
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


// M4: invariant violations for the current trace and sprites, recomputed only
// when either changes (invariants are checked client-side on sampled values).
let violationCache = { key: '', list: [] as Violation[] };
export function violations(): Violation[] {
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
    setLastInspectorKey('');
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
    setLastInspectorKey('');
    renderInspector();
    toast(expr ? 'binding applied' : 'sprite is unbound');
  });
  form.querySelector<HTMLButtonElement>('[data-remove]')!.addEventListener('click', () => removeSprite(id));
}

export function renderInspector(): void {
  const fr = S.trace && S.trace.evs.length ? frameAt(S.trace, S.pos) : null;
  const key = `${S.legend}|${entKey(S.selected)}:${S.selected?.k === 'node' ? S.selected.copy ?? 1 : ''}|${fr ? `${fr.si}` : ''}|${traceRevision}|${modelRevision}|${S.skin.id}|${S.selected?.k === 'module' ? `${layout.modules.get(S.selected.file)?.collapsed}${layout.modules.get(S.selected.file)?.pinned}` : ''}`;
  if (key === lastInspectorKey) return;
  if (inspector.contains(document.activeElement)) return;
  setLastInspectorKey(key);

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
      setLastInspectorKey('');
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
