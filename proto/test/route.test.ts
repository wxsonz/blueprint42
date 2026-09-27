import { beforeAll, describe, expect, it } from 'vitest';
import { run } from '../src/interp';
import { Layout, MW } from '../src/layout';
import { buildScene, crossings } from '../src/route';
import type { Pt } from '../src/skins/types';
import { model, setupParser } from './helpers';

beforeAll(setupParser);

type Seg = { a: Pt; b: Pt };
const segs = (pts: Pt[]): Seg[] => pts.slice(1).map((b, i) => ({ a: pts[i], b }));
const sharesSegment = (p: Seg, q: Seg) => {
  const eq = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  if (eq(p.a[1], p.b[1]) && eq(q.a[1], q.b[1]) && eq(p.a[1], q.a[1])) {
    const [p0, p1] = [Math.min(p.a[0], p.b[0]), Math.max(p.a[0], p.b[0])];
    const [q0, q1] = [Math.min(q.a[0], q.b[0]), Math.max(q.a[0], q.b[0])];
    return Math.min(p1, q1) - Math.max(p0, q0) > 1e-6;
  }
  if (eq(p.a[0], p.b[0]) && eq(q.a[0], q.b[0]) && eq(p.a[0], q.a[0])) {
    const [p0, p1] = [Math.min(p.a[1], p.b[1]), Math.max(p.a[1], p.b[1])];
    const [q0, q1] = [Math.min(q.a[1], q.b[1]), Math.max(q.a[1], q.b[1])];
    return Math.min(p1, q1) - Math.max(p0, q0) > 1e-6;
  }
  return false;
};

describe('routing', () => {
  for (const key of ['gnl', 'pointer', 'swap', 'recursion']) {
    it(`${key}: no two calls share a segment`, () => {
      const m = model(key);
      const l = new Layout();
      l.sync(m);
      const belts = buildScene(l, m, null).belts;
      for (let i = 0; i < belts.length; i++)
        for (let j = i + 1; j < belts.length; j++)
          for (const p of segs(belts[i].pts)) for (const q of segs(belts[j].pts)) expect(sharesSegment(p, q), `${belts[i].key} / ${belts[j].key}`).toBe(false);
    });
  }

  it('starts each belt on its caller and ends on its callee', () => {
    const m = model('gnl');
    const l = new Layout();
    l.sync(m);
    const scene = buildScene(l, m, null);
    for (const b of scene.belts) {
      const from = scene.hosts.get(b.fromHost);
      const to = scene.hosts.get(b.toHost)!;
      if (from) expect(b.pts[0][0]).toBe(from.x + MW);
      expect(b.pts[b.pts.length - 1][0]).toBe(to.x);
    }
  });

  it('reserves one copy per recursion level the trace reaches', () => {
    const m = model('recursion');
    const l = new Layout();
    l.sync(m);
    expect(buildScene(l, m, null).copies.get('fact')).toBe(2); // placeholder for the first copy
    expect(buildScene(l, m, run(m)).copies.get('fact')).toBe(4); // fact(4) → fact(1)
  });

  it('finds perpendicular crossings but not shared endpoints', () => {
    expect(crossings([[0, 1], [4, 1]], [[2, 0], [2, 3]])).toEqual([{ x: 2, y: 1, horizontal: true }]);
    expect(crossings([[0, 1], [2, 1]], [[2, 1], [2, 3]])).toEqual([]);
  });
});
