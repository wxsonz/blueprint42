import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from '../src/parse';
import { model, setupParser } from './helpers';

beforeAll(setupParser);

describe('parse: M1 acceptance on samples/gnl_v3', () => {
  it('finds all 10 functions, including the four static ones (plus the sandbox main)', () => {
    const m = model('gnl');
    expect(m.error).toBeNull();
    expect(m.fns.map((f) => f.name).sort()).toEqual(
      ['get_next_line', 'gnl_append_chunk', 'gnl_consume', 'gnl_copy', 'gnl_extract_line', 'gnl_fill_line',
        'gnl_find_delim', 'gnl_reserve', 'gnl_reset', 'gnl_swar_scan', 'main'].sort(),
    );
    const statics = m.fns.filter((f) => f.isStatic).map((f) => f.name).sort();
    expect(statics).toEqual(['gnl_append_chunk', 'gnl_copy', 'gnl_fill_line', 'gnl_swar_scan']);
  });

  it('extracts the real call edges', () => {
    const m = model('gnl');
    const edges = new Set(m.fns.flatMap((f) => f.calls.map((c) => `${f.name}>${c.callee}`)));
    for (const e of ['get_next_line>gnl_fill_line', 'gnl_fill_line>gnl_append_chunk', 'gnl_append_chunk>gnl_reserve',
      'gnl_append_chunk>gnl_find_delim', 'gnl_find_delim>gnl_swar_scan']) expect(edges).toContain(e);
  });

  it('sees the function-local static bufs as a chest owned by get_next_line', () => {
    const gnl = model('gnl').byName.get('get_next_line')!;
    expect(gnl.statics.map((s) => s.name)).toEqual(['bufs']);
  });

  it('reports externals separately from user calls', () => {
    const fill = model('gnl').byName.get('gnl_append_chunk')!;
    expect(fill.externals).toContain('read');
    expect(fill.calls.every((c) => c.callee !== 'read')).toBe(true);
  });

  it('flags a syntax error with its line', () => {
    const m = parse('int main(void)\n{\n\treturn (1\n}\n');
    expect(m.error).not.toBeNull();
  });
});
