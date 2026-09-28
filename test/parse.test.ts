import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { model, setupParser } from './helpers';

beforeAll(setupParser);

describe('parse: M1 acceptance on samples/line_reader', () => {
  it('finds all 10 functions, including the four static ones (plus the sandbox main)', () => {
    const m = model('reader');
    expect(m.error).toBeNull();
    expect(m.fns.map((f) => f.name).sort()).toEqual(
      ['read_line', 'lr_append', 'lr_consume', 'lr_copy', 'lr_take_line', 'lr_fill',
        'lr_find_nl', 'lr_grow', 'lr_reset', 'lr_scan', 'main'].sort(),
    );
    const statics = m.fns.filter((f) => f.isStatic).map((f) => f.name).sort();
    expect(statics).toEqual(['lr_append', 'lr_copy', 'lr_fill', 'lr_scan']);
  });

  it('extracts the real call edges', () => {
    const m = model('reader');
    const edges = new Set(m.fns.flatMap((f) => f.calls.map((c) => `${f.name}>${c.callee}`)));
    for (const e of ['read_line>lr_fill', 'lr_fill>lr_append', 'lr_append>lr_grow',
      'lr_append>lr_find_nl', 'lr_find_nl>lr_scan']) expect(edges).toContain(e);
  });

  it('sees the function-local static bufs as a chest owned by read_line', () => {
    const rl = model('reader').byName.get('read_line')!;
    expect(rl.statics.map((s) => s.name)).toEqual(['bufs']);
  });

  it('reports externals separately from user calls', () => {
    const fill = model('reader').byName.get('lr_append')!;
    expect(fill.externals).toContain('read');
    expect(fill.calls.every((c) => c.callee !== 'read')).toBe(true);
  });

  it('flags a syntax error with its line', () => {
    const m = parse('int main(void)\n{\n\treturn (1\n}\n');
    expect(m.error).not.toBeNull();
  });
});
