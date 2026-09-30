// The Legend overlay (docs/VISUALS.md, "Legend"): the real drawings, each
// made by the active skin's own hooks with example values, and what each
// one means. It replaces the toolbelt's generic icons, which weren't 1:1
// with the canvas.
import type { Dc, Pt, Rect, RowInfo, Skin } from './skins/types';
import { esc } from './dom';

interface Tile {
  name: string;
  text: string;
  h?: number; // canvas height, css px (default 96)
  draw: (skin: Skin, dc: Dc, w: number, h: number) => void;
}

const W = 232;

const line = (x0: number, x1: number, y: number, n = 24): Pt[] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y] as Pt);
const row = (r: Rect, k: number, o: Partial<RowInfo> & { name: string; value: string }): RowInfo => ({
  kind: 'int', param: false, recent: false, flash: 0, depth: 0, fold: null, rect: { x: r.x, y: r.y + 20 + k * 20, w: r.w, h: 20 }, ...o,
});

function tiles(skin: Skin): Tile[] {
  const out: Tile[] = [
    { name: 'A copy, going in', text: 'An argument riding a belt into the function it calls: a copy of the value, never the variable.', draw: (s, dc, w, h) => s.plate(dc, w / 2, h / 2, 'n = 3', 'arg', 'arg') },
    { name: 'A value, coming back', text: 'What a function returns, riding its belt back to the caller.', draw: (s, dc, w, h) => s.plate(dc, w / 2, h / 2, '6', 'ret', 'ret') },
    { name: 'An address', text: 'A pointer passed along: only the address is copied; the memory stays where it lives.', draw: (s, dc, w, h) => s.plate(dc, w / 2, h / 2, '→a', 'ptr', 'arg') },
    { name: 'A belt', text: 'A call site: one function calling another. It lights while the call is on it.', draw: (s, dc, w, h) => s.belt(dc, line(18, w - 18, h / 2), { live: true, dir: 1, selected: false, hovered: false, custom: false, count: 0 }) },
    { name: "A pointer's line", text: 'From a pointer to the memory at the address it holds.', draw: (s, dc, w, h) => s.wire(dc, line(24, w - 24, h / 2), true) },
    { name: 'A dangling pointer', text: 'It holds an address whose memory is gone (freed, or its frame returned).', draw: (s, dc, w, h) => s.dangling(dc, [w / 2 - 20, h / 2]) },
    {
      name: 'Storage', text: 'A function’s variables in its frame: past values dimmed, the value now on the right; a pointer shows what its address points at.', h: 92,
      draw: (s, dc, w) => {
        const r = { x: 10, y: 8, w: w - 20, h: 76 };
        const past = Object.assign(['0', '1'], { older: 0 });
        s.frame(dc, r, { title: 'LOCALS', mode: 'live', stacked: 0, head: { x: r.x, y: r.y, w: r.w, h: 20 }, rows: [row(r, 0, { name: 'i', value: '2', past }), row(r, 1, { name: 'buf', value: '→#1', kind: 'ptr', tag: 'heap #1' })] });
      },
    },
    {
      name: 'Bytes, where they live', text: 'The bytes of a char array, or those a char * reaches: each byte in its cell, zero bytes empty.', h: 80,
      draw: (s, dc, w) => s.strip(dc, { x: 10, y: 12, w: w - 20, h: 60 }, { label: 'buf: 8 bytes, its own', bound: true, bytes: [104, 105, 10, 0, 0, 0, 0, 0], length: 8, pointer: null, markers: [{ label: 'len', index: 3, sampledIndex: 3 }], selected: false, hovered: false }),
    },
    {
      name: 'Statements', text: 'One stop per statement; the dot is the line running. A switch shows its values and result, and one mark per loop round.', h: 104,
      draw: (s, dc, w) => {
        const R = 18;
        const st = (k: number, kind: 'do' | 'loop' | 'if', text: string, extra: object = {}) => ({ kind, text, x: 22, y: 30 + k * R, textX: 36, readout: null, count: null, state: 'visited' as const, ...extra });
        s.interior(dc, { x: 6, y: 4, w: w - 12, h: 96 }, {
          title: 'stations', mode: 'live', row: R, head: { x: 6, y: 4, w: w - 12, h: 18 }, tracks: [], token: [22, 30],
          stations: [
            st(0, 'loop', 'while (i < n)', { readout: { text: '2 < 3 → true', result: true }, count: 2, state: 'current', rounds: { marks: [true, true, true], older: 0 } }),
            st(2, 'if', 'if (i % 2)', { readout: { text: '2 % 2 → false', result: false }, rounds: { marks: [false, true, false], older: 0 } }),
          ],
        });
      },
    },
    {
      name: 'The terminal', text: 'The program’s process: what really reached the terminal so far, and how it ended.', h: 104,
      draw: (s, dc, w) => s.proc(dc, { x: 10, y: 8, w: w - 20, h: 88 }, { state: 'done', exit: '0', out: 'hello\n', args: [], lines: 2, selected: false, hovered: false }),
    },
  ];
  if (skin.dock) out.splice(6, 0, {
    name: 'The IN dock', text: 'Where a call arrives: its state, and the arguments as they came in.', h: 104,
    draw: (s, dc, w) => s.dock!(dc, { x: 12, y: 8, w: w - 24, h: 88 }, { name: 'f', state: 'running', waitingOn: null, frames: 1, stale: false, copy: 1, editing: false, args: [{ name: 'n', text: '3' }, { name: 'buf', text: '→#1', tag: 'heap #1' }], before: null, last: false, crash: null, inPorts: [] }),
  });
  if (skin.stdbuf) out.push({
    name: "printf's buffer", text: 'Text printf holds that hasn’t reached the terminal: to a terminal it leaves at each \\n, to a pipe when full.', h: 80,
    draw: (s, dc, w) => s.stdbuf!(dc, { x: 10, y: 6, w: w - 20, h: 68 }, { text: 'hi', n: 2, cap: 4096, mode: 'terminal', flushed: null }),
  });
  if (skin.stdin) out.push({
    name: 'stdin', text: 'The run’s input: how much the program has taken, and what’s left.', h: 80,
    draw: (s, dc, w) => s.stdin!(dc, { x: 10, y: 6, w: w - 20, h: 68 }, { text: 'hello\nworld\n', pos: 6, taken: null }),
  });
  if (skin.heapCard) out.push({
    name: 'A heap block', text: 'A malloc’d block on the heap bar: its size, where it was malloc’d, its bytes, who holds its address.', h: 100,
    draw: (s, dc, w) => s.heapCard!({ ...dc, z: 1 }, { x: (w - 172) / 2, y: 6, w: 172, h: 88 }, { name: '#1', size: 16, site: 'push:13', preview: '', bytes: [], fields: [{ name: 'value', text: '7' }, { name: 'next', text: '→#2' }].map((f) => ({ name: f.name, value: f.text })), refs: [{ name: 'list (main)', top: true }], state: 'live', recent: false, t: 1 }),
  });
  if (skin.typeCard) out.push({
    name: 'A type', text: 'What a file defines, left of the machines: a struct’s fields, an enum’s values, #defines as the run used them.', h: 92,
    draw: (s, dc, w) => s.typeCard!(dc, { x: 10, y: 6, w: w - 20, h: 80 }, { kind: 'struct', name: 'struct s_point', alias: 't_point', file: '', members: [{ name: 'x', text: 'int' }, { name: 'y', text: 'int' }], more: 0, inUse: false }),
  });
  return out;
}

export function renderLegend(el: HTMLElement, skin: Skin): void {
  const list = tiles(skin);
  el.innerHTML = `<div class="lg-head"><b>Legend</b><span class="c">each drawing as ${esc(skin.name)} draws it on the grid, and what it means</span><button class="btn sm" data-close>Close</button></div>
    <div class="lg-grid">${list.map((t, i) => `<figure><canvas data-i="${i}" width="${W}" height="${t.h ?? 96}"></canvas><figcaption><b>${esc(t.name)}</b> ${esc(t.text)}</figcaption></figure>`).join('')}</div>`;
  const dpr = window.devicePixelRatio || 1;
  el.querySelectorAll<HTMLCanvasElement>('canvas[data-i]').forEach((c) => {
    const t = list[Number(c.dataset.i)];
    const h = t.h ?? 96;
    c.width = W * dpr;
    c.height = h * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${h}px`;
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dc: Dc = { g, z: 1, cs: 40, time: 0, vw: W, vh: h };
    g.save();
    if (skin.fullBleed) (g.fillStyle = skin.casing), g.fillRect(0, 0, W, h);
    else skin.background(dc, 0, 0);
    g.restore();
    try {
      g.save();
      t.draw(skin, dc, W, h);
    } catch {
      // a skin that can't draw this example: its tile stays blank rather than wrong
    } finally {
      g.restore();
    }
  });
}
