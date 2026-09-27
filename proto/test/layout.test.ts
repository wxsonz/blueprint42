import { beforeAll, describe, expect, it } from 'vitest';
import { Layout } from '../src/layout';
import { parse } from '../src/parse';
import { model, sample, setupParser } from './helpers';

beforeAll(setupParser);

describe('layout', () => {
  it('places every callee right of all its callers (no back-edges)', () => {
    const m = model('gnl');
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
});
