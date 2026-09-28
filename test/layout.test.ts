import { beforeAll, describe, expect, it } from 'vitest';
import { Layout, shut } from '../src/layout';
import { parseBlueprint } from '../src/blueprint';
import { parse } from '../src/parse';
import { model, sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('layout', () => {
  it('places every callee right of all its callers (no back-edges)', () => {
    const m = model('reader');
    const l = new Layout();
    l.sync(m);
    for (const f of m.fns) {
      for (const c of f.calls) {
        if (c.callee === f.name) continue;
        expect(l.nodes.get(`func:${c.callee}`)!.place.x).toBeGreaterThan(l.nodes.get(f.id)!.place.x);
      }
    }
  });

  it('keeps a machine in place when its function is renamed (M1)', () => {
    const src = sample('pointer').src;
    const l = new Layout();
    l.sync(parse(src));
    const before = { ...l.nodes.get('func:bump')!.place };
    l.sync(parse(src.replaceAll('bump', 'bump2')));
    expect(l.nodes.has('func:bump')).toBe(false);
    expect(l.nodes.get('func:bump2')!.place).toEqual(before);
  });

  it('never clears the grid on broken code: missing symbols go stale', () => {
    const src = sample('pointer').src;
    const l = new Layout();
    l.sync(parse(src));
    l.sync(parse(src.replace('void\tbump(int *n)\n{', 'void\tbump(int *n\n{').replace('int\tstep', 'int\tstep_')));
    expect(l.nodes.size).toBeGreaterThanOrEqual(3);
  });

  it('refuses to drop a node on top of another', () => {
    const l = new Layout();
    l.sync(model('pointer'));
    const main = l.nodes.get('func:main')!.place;
    expect(l.setPos('func:step', main.x, main.y)).toBe(false);
    expect(l.setPos('func:step', main.x, main.y + 20)).toBe(true);
    expect(l.nodes.get('func:step')!.place.pinned).toBe(true);
  });

  it('settles a layout saved when machines were small: no overlaps after', () => {
    const m = model('reader');
    const l = new Layout();
    l.reset();
    l.sync(m);
    // positions from the 4×3-cell days: 7 cells apart, pinned by the author
    let k = 0;
    for (const n of l.nodes.values()) n.place = { x: (k % 3) * 7, y: Math.floor(k++ / 3) * 6, pinned: k % 2 === 0 };
    expect(l.overlaps().length).toBeGreaterThan(0);
    expect(l.settle(m)).toBeGreaterThan(0);
    expect(l.overlaps()).toEqual([]);
  });

  it('tidies back to the fresh auto layout', () => {
    const m = model('reader');
    const fresh = new Layout();
    fresh.reset();
    fresh.sync(m);
    const l = new Layout();
    l.reset();
    l.sync(m);
    l.setPos('func:lr_copy', 200, 200);
    l.waypoints.set('read_line>lr_fill', { x: 3, y: 3 });
    l.tidy(m);
    expect(l.waypoints.size).toBe(0);
    for (const [id, n] of fresh.nodes) expect([id, l.nodes.get(id)!.place]).toEqual([id, n.place]);
  });

  it('closed machines are small, keep their place in the blueprint, and open again', () => {
    const m = model('reader');
    const l = new Layout();
    l.reset();
    l.sync(m);
    const w0 = Math.max(...[...l.nodes.values()].map((n) => n.place.x));
    for (const f of m.fns) shut.add(f.name);
    l.reflow(m);
    expect(Math.max(...[...l.nodes.values()].map((n) => n.place.x))).toBeLessThan(w0);
    expect(l.overlaps()).toEqual([]);
    const bp = parseBlueprint(JSON.parse(JSON.stringify(l.toBlueprint([], false))));
    expect(bp.shut?.length).toBe(m.fns.length);
    shut.clear();
    l.applyBlueprint(bp, m, false);
    expect(shut.size).toBe(m.fns.length);
    shut.clear();
  });
});
