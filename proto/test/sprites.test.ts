import { describe, expect, it } from 'vitest';
import type { Sprite } from '../src/blueprint';
import type { Snap, Trace } from '../src/interp';
import { spriteStripInfo, spriteWorldRect } from '../src/render';

const sprite: Sprite = { id: 'buf', kind: 'strip', x: 2, y: 3, label: 'buf->data' };
const snapshot = (pointer: number, length: number, index: number, byte: number): Snap => ({
  stack: [], statics: [], heap: [],
  bound: { buf: { bound: true, pointer, length, bytes: [byte], markers: [{ label: 'pos', index }] } },
});
const trace = (before: Snap, after: Snap): Trace => ({
  engine: 'gdb', evs: [{ k: 'write', frame: null, line: 1, cell: 1, val: { k: 'int', v: 0 }, via: null, text: '' }], snaps: [before, after],
  cells: new Map(), exit: null, error: null, truncated: false,
});

describe('sampled strip rendering state', () => {
  it('interpolates only a marker on the same observed allocation', () => {
    const t = trace(snapshot(12, 8, 1, 65), snapshot(12, 8, 5, 66));
    const mid = spriteStripInfo(sprite, t, 0.5);
    expect(mid.markers).toEqual([{ label: 'pos', index: 3, sampledIndex: 5 }]);
    expect(mid.bytes).toEqual([66]);
  });

  it('switches identity, capacity and bytes at a reallocation', () => {
    const t = trace(snapshot(12, 8, 1, 65), snapshot(32, 16, 5, 66));
    const before = spriteStripInfo(sprite, t, 0.25);
    const after = spriteStripInfo(sprite, t, 0.75);
    expect(before).toMatchObject({ pointer: 12, length: 8, bytes: [65], markers: [{ index: 1 }] });
    expect(after).toMatchObject({ pointer: 32, length: 16, bytes: [66], markers: [{ index: 5 }] });
    expect(spriteWorldRect(sprite, t.snaps[1].bound?.buf).w).toBeGreaterThan(spriteWorldRect(sprite, t.snaps[0].bound?.buf).w);
  });

  it('keeps unbound data empty', () => {
    const t = trace({ stack: [], statics: [], heap: [] }, snapshot(32, 16, 5, 66));
    expect(spriteStripInfo(sprite, t, 0)).toMatchObject({ bound: false, bytes: [], markers: [], length: null });
  });
});
