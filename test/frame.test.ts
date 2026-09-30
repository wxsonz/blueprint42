// What a frame shows, as data (docs/OBJECTIVES.md, "easy to diagnose", step
// 4): no canvas. Each checks the picture against the run itself (SPEC
// principle 4): a readout says the values the snapshot holds, a card is lost
// when nothing points at it, a dock shows the arguments the call carried.
import { beforeAll, describe, expect, it } from 'vitest';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import type { Trace } from '../src/interp';
import { parse, type Model } from '../src/parse';
import { Layout } from '../src/layout';
import { planOf } from '../src/interior';
import { readoutOf, type ViewState } from '../src/playback';
import { dockInfo, frameState, heapBarInfo, heapCardInfo, heapModel, procInfo, stdinInfo, waitingOnOf } from '../src/frame';
import { sample, setupParser } from './helpers';

beforeAll(setupParser);

async function gdbTrace(key: string): Promise<{ t: Trace; m: Model }> {
  const s = sample(key);
  const m = parse(s.src);
  const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
  expect(r.ok, r.error ?? r.compile?.text).toBe(true);
  return { t: convertGdb(r, m, s.src), m };
}
function view(m: Model, trace: Trace, pos: number): ViewState {
  const layout = new Layout();
  layout.sync(m);
  return { layout, model: m, trace, pos, selected: null, hovered: null, editorFn: null };
}
// the playback position just after event i
const after = (i: number) => i + 1;

describe('what a frame shows', () => {
  it("a readout says the values the snapshot holds (bubble sort's comparison)", async () => {
    const { t, m } = await gdbTrace('sort');
    const fn = m.byName.get('sort_ints')!;
    const station = planOf(fn).stations.find((st) => st.cond === 'tab[j] > tab[j + 1]')!;
    expect(station, 'the comparison station').toBeTruthy();
    let checked = 0;
    for (let i = 0; i < t.evs.length; i++) {
      const snap = t.snaps[i + 1];
      const f = snap.stack.at(-1);
      if (f?.fn !== 'sort_ints' || t.evs[i].line !== station.line) continue;
      // the array the pointer points into, as it is now, and j
      const tab = f.cells.find((c) => c.name === 'tab')!;
      const j = f.cells.find((c) => c.name === 'j')!;
      if (tab.val.k !== 'ptr' || j.val.k !== 'int') continue;
      const to = tab.val.to;
      const arr = snap.stack.flatMap((x) => x.cells).find((c) => c.id === to)!;
      if (arr.val.k !== 'raw') continue;
      const els = arr.val.text.replace(/[[\]]/g, '').split(',').map((x) => x.trim());
      const k = Number(j.val.v);
      expect(readoutOf(station, t, snap, f.id, fn.name)).toBe(`${els[k]} > ${els[k + 1]}`);
      checked++;
    }
    expect(checked, 'comparisons checked against the array').toBeGreaterThan(3);
  });

  it('a block is lost the moment nothing points at it, and leaked at the end (the heap bar)', async () => {
    const { t, m } = await gdbTrace('lost');
    const ret = t.evs.findIndex((e) => e.k === 'ret' && e.fn === 'leaky');
    expect(ret).toBeGreaterThan(0);
    const fs = frameState(view(m, t, after(ret)));
    const hm = heapModel(fs, [], 1)!;
    const lost = [...hm.blocks.values()].filter((b) => b.state === 'lost');
    expect(lost.length).toBe(1);
    const card = heapCardInfo(hm, lost[0], t, fs.recent);
    expect(card.refs).toEqual([]); // nothing holds it
    expect(card.note).toMatch(/leaky/);
    // before leaky returns it isn't lost yet: the pointer still holds it
    const before = heapModel(frameState(view(m, t, ret - 1)), [], 1)!;
    expect([...before.blocks.values()].some((b) => b.state === 'lost' && b.c.id === lost[0].c.id)).toBe(false);
    // at the end: a leak, counted on the bar
    const end = frameState(view(m, t, t.evs.length));
    const hEnd = heapModel(end, [], 1)!;
    expect(heapBarInfo(hEnd, t, end.fr, 0, false).leaks).toBeGreaterThan(0);
  });

  it('the IN dock shows the arguments the call carried, and where it came from', async () => {
    const { t, m } = await gdbTrace('list');
    const call = t.evs.findIndex((e) => e.k === 'call' && e.fn === 'push');
    expect(call).toBeGreaterThan(0);
    const ev = t.evs[call];
    if (ev.k !== 'call') throw new Error('not a call');
    const fs = frameState(view(m, t, after(call) + 0.5));
    const frame = fs.st.at(-1)!;
    expect(frame.fn).toBe('push');
    const h = fs.scene.hosts.get(fs.hostOf.get(frame.id)!)!;
    const d = dockInfo(t, h, m.byName.get('push')!, frame, null, 'running', waitingOnOf(t, fs.fr!.i, frame, 'running'), 1, false, false, true);
    expect(d.args?.map((a) => a.name)).toEqual(ev.args.map((a) => a.name));
    expect(d.from?.fn).toBe('main');
    expect(d.from?.nth[0]).toBe(1); // the first call of push
    expect(d.cap).toEqual({ used: ev.args.length, max: 4 });
  });

  it('stdin shows how much the program has taken, and what a read takes', async () => {
    const { t, m } = await gdbTrace('reader');
    const reads = t.evs.map((e, i) => (e.k === 'in' ? i : -1)).filter((i) => i >= 0);
    expect(reads.length).toBeGreaterThan(0);
    let last = 0;
    for (const i of reads) {
      const fs = frameState(view(m, t, i + 0.5)); // during the read
      const si = stdinInfo(fs)!;
      const ev = t.evs[i];
      if (ev.k !== 'in') continue;
      expect(si.taken).toBe(ev.text);
      const done = stdinInfo(frameState(view(m, t, after(i))))!;
      expect(done.pos).toBeGreaterThanOrEqual(last); // what's taken never comes back
      expect(done.pos).toBeLessThanOrEqual(si.text.length);
      last = done.pos;
    }
    expect(last).toBeGreaterThan(0);
  });

  it('the process box: done at the end, with what really reached the terminal', async () => {
    const { t, m } = await gdbTrace('reader');
    const end = procInfo(frameState(view(m, t, t.evs.length)));
    expect(end.state).toBe('done');
    expect(end.out ?? '').toBe(t.outText ?? t.stdout ?? '');
    expect(procInfo(frameState(view(m, t, 0))).state).toBe('idle');
  });
});
