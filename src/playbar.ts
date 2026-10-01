// The playbar: the step counter, what the current event or statement says,
// the running line marked in the editor, and the timeline under it.
import { beatNow, computeText, writesOf } from './beats';
import { $, esc } from './dom';
import { setExecLine } from './editor';
import { payloadText } from './feed';
import { planOf } from './interior';
import { type Ev, type Trace, fmtVal } from './interp';
import { violations } from './panels';
import { switchFile } from './project-ui';
import { pointeeName } from './render';
import { frameAt } from './playback';
import { renderChanges, renderCompare } from './changes-ui';
import { renderReport } from './report-ui';
import { S, editor, lastExec, lastPbKey, setLastExec, setLastPbKey, timeline, traceRevision } from './state';
import { EditorView } from '@codemirror/view';
import { N } from './main';

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
    case 'out':
      if (e.fd === 2) return `stderr <span class="arrow">→</span> terminal <span class="err">${esc(JSON.stringify(e.text))}</span>`;
      return e.via === 'write'
        ? `write <span class="arrow">→</span> terminal <span class="ret">${esc(JSON.stringify(e.text))}</span>`
        : `printf's buffer flushed <span class="arrow">→</span> terminal <span class="ret">${esc(JSON.stringify(e.text))}</span>`;
    case 'in':
      return `stdin <span class="arrow">→</span> program <span class="ret">${esc(JSON.stringify(e.text))}</span> (${e.to - e.from} B)`;
  }
}

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

export function renderPlaybar(): void {
  if (S.changes) renderChanges();
  if (S.compare) renderCompare();
  renderReport(); // (rewrites only when the run's end is reached or left)
  const t = S.trace;
  const n = N();
  const fr = t && n ? frameAt(t, S.pos) : null;
  const inRoom = roomLine();
  const ev = inRoom ? inRoom.ev : fr ? (fr.ev ?? (fr.i > 0 ? t!.evs[fr.i - 1] : null)) : null;
  const key = `${Math.floor(S.pos)}|${!!fr?.ev}|${S.playing}|${n}|${t?.exit ? 1 : 0}|${inRoom?.key ?? ''}`;
  if (key !== lastPbKey) {
    setLastPbKey(key);
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
    setLastExec(execKey);
    let mark: { line: number; kind: 'exec' | 'error' } | null = brokeHere ? { line: brokeHere.line!, kind: 'error' } : ev ? { line: ev.line, kind: ev.k === 'error' ? 'error' : 'exec' } : diag ? { line: diag.line, kind: 'error' } : null;
    // In a project the running line may be in another file: follow it there
    // like a debugger, unless the author is typing.
    const p = S.project;
    if (mark && p && markFile && markFile !== p.active) {
      if ((S.playing || !editor.hasFocus) && p.files.has(markFile)) {
        switchFile(markFile);
        setLastExec(`${execKey.slice(0, execKey.lastIndexOf('|'))}|${p.active}`);
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
export let tlCache: { key: string; bright: HTMLCanvasElement; dim: HTMLCanvasElement; head: string } | null = null;
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
        cg.fillStyle = e.k === 'write' && e.via !== null ? col.ptr : e.k === 'step' ? col.eval : e.k === 'alloc' ? col.call : e.k === 'free' ? col.ret : e.k === 'out' || e.k === 'in' ? col.write : col[e.k];
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
  // "when did this change?": a mark at each change, the ones passed brighter
  if (S.changes?.list.length) {
    g.fillStyle = cssVar('--tl-head');
    for (const c of S.changes.list) {
      const cx = ((c.at + 0.9) / n) * W;
      g.globalAlpha = c.at + 0.9 <= S.pos + 1e-6 ? 1 : 0.55;
      g.fillRect(cx - 1, H - 7, 2, 7);
      g.beginPath(); g.arc(cx, H - 8, 2.5, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  // the trace search's matches: a small triangle at the bottom
  if (S.search?.at.length) {
    g.fillStyle = cssVar('--tl-call');
    for (const i of S.search.at) {
      const sx = ((i + 0.9) / n) * W;
      g.beginPath(); g.moveTo(sx - 3.5, H); g.lineTo(sx + 3.5, H); g.lineTo(sx, H - 6); g.fill();
    }
  }
  // two runs side by side: the other run as a strip along the top, to the
  // same scale (solid while they're the same, dashed after they part), and a
  // line down the timeline at the step they part
  if (S.compare) {
    const c = S.compare;
    const end = Math.min(c.len, n) / n * W;
    const part = c.div ? Math.min(c.div.at + 0.9, n) / n * W : end;
    g.fillStyle = cssVar('--tl-call');
    g.fillRect(0, 0, part, 3);
    g.globalAlpha = 0.55;
    for (let sx = part; sx < end; sx += 6) g.fillRect(sx, 0, Math.min(3, end - sx), 3);
    g.globalAlpha = 1;
    if (c.div) {
      g.fillStyle = cssVar('--tl-head');
      g.fillRect(part - 1, 0, 2, H);
    }
  }
  g.fillStyle = '#ef5b50';
  for (const v of violations()) {
    const vx = (v.at / n) * W;
    g.beginPath(); g.moveTo(vx - 4, 0); g.lineTo(vx + 4, 0); g.lineTo(vx, 7); g.fill();
  }
}
