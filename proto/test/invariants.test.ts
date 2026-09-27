import { describe, expect, it } from 'vitest';
import { evaluate, parseInvariant } from '../src/invariants';

const check = (s: string) => {
  const c = parseInvariant(s);
  if (typeof c === 'string') throw new Error(c);
  return c;
};
const strip = (pos: number, len: number, cap: number, bytes: number[] = []) => ({
  bound: true, length: cap, bytes, markers: [{ label: 'pos', index: pos }, { label: 'len', index: len }, { label: 'cap', index: cap }],
});

describe('invariants', () => {
  it('parses chains, offsets, zero tails and on-return checks', () => {
    expect(check('pos <= len <= cap').body).toMatchObject({ kind: 'cmp', ops: ['<=', '<='] });
    expect(check('len - 1 < cap').body).toMatchObject({ terms: [{ name: 'len', offset: -1 }, { name: 'cap', offset: 0 }] });
    expect(check('on return: zero after len')).toMatchObject({ onReturn: true, body: { kind: 'zero' } });
    for (const bad of ['', 'pos', 'pos <=', 'pos <== len', 'free(buf) < 1', 'zero after']) expect(typeof parseInvariant(bad)).toBe('string');
  });

  it('explains a failure with the values involved', () => {
    expect(evaluate(check('pos <= len <= cap'), strip(2, 4, 8))).toEqual({ ok: true, detail: '' });
    expect(evaluate(check('pos <= len <= cap'), strip(5, 4, 8))).toEqual({ ok: false, detail: 'pos 5 > len 4' });
    expect(evaluate(check('zero after len'), strip(0, 2, 4, [104, 105, 0, 7]))).toMatchObject({ ok: false, detail: expect.stringMatching(/byte 3 is 0x07/) });
    expect(evaluate(check('zero after len for 1'), strip(0, 2, 4, [104, 105, 0, 7]))).toEqual({ ok: true, detail: '' });
  });

  it('cannot decide without a live sample, and says so', () => {
    expect(evaluate(check('pos <= len'), { bound: false })).toBeNull();
    expect(evaluate(check('pos <= missing'), strip(1, 2, 3))).toBeNull();
  });
});
