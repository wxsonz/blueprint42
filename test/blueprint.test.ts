import { describe, expect, it } from 'vitest';
import { isSafeBindingExpr, parseBlueprint, serializeBlueprint, type Blueprint } from '../src/blueprint';
import { evaluateInterpreterBindings, type Trace } from '../src/interp';

describe('blueprint annotation layer', () => {
  it('round trips placements, routes, sprites and bindings without source', () => {
    const blueprint: Blueprint = {
      version: 1,
      nodes: { 'func:read_line': { x: 4, y: -2, pinned: true } },
      waypoints: { 'main>read_line': { x: 3, y: 1 } },
      sprites: [
        { id: 'buf', kind: 'strip', x: 7, y: 8, binding: { scope: 'fn', fn: 'lr_fill', expr: 'buf->data' }, lengthExpr: 'buf->cap', markers: [{ expr: 'buf->pos', label: 'pos' }] },
        { id: 'ins', kind: 'copy', x: 9, y: 2, label: 'inserter', binding: { scope: 'fn', fn: 'lr_copy', expr: 'n' } },
      ],
    };
    const json = serializeBlueprint(blueprint);
    expect(json).not.toContain('"src"');
    expect(parseBlueprint(json)).toEqual(blueprint);
  });

  it('rejects active expressions and malformed imported data', () => {
    for (const expr of ['free(buf)', 'buf->pos++', 'buf->pos = 9', '*buf', 'buf->data[0] = 1']) expect(isSafeBindingExpr(expr)).toBe(false);
    expect(isSafeBindingExpr('buf->data[0]')).toBe(true);
    expect(() => parseBlueprint({ version: 1, nodes: {}, waypoints: {}, sprites: [{ id: 'x', kind: 'strip', x: 0, y: 0, binding: { scope: 'fn', fn: 'main', expr: 'free(buf)' } }] })).toThrow();
  });

  it('observes interpreter plain variables only and clears returned scope', () => {
    const trace: Trace = {
      engine: 'interp', evs: [{ k: 'step', line: 0, frame: 1 }], cells: new Map(), exit: null, error: null, truncated: false,
      snaps: [
        { stack: [{ id: 1, fn: 'main', cells: [{ id: 1, name: 'n', type: 'int', val: { k: 'int', v: 3 } }] }], statics: [], heap: [] },
        { stack: [], statics: [], heap: [] },
      ],
    };
    const sprites = [
      { id: 'n', kind: 'marker' as const, x: 0, y: 0, binding: { scope: 'fn' as const, fn: 'main', expr: 'n' } },
      { id: 'field', kind: 'strip' as const, x: 0, y: 0, binding: { scope: 'fn' as const, fn: 'main', expr: 'n.data' } },
    ];
    const evaluated = evaluateInterpreterBindings(trace, sprites);
    expect(evaluated.snaps[0].bound?.n).toMatchObject({ bound: true, number: 3 });
    expect(evaluated.snaps[0].bound?.field).toEqual({ bound: false });
    expect(evaluated.snaps[1].bound?.n).toEqual({ bound: false });
  });
});
