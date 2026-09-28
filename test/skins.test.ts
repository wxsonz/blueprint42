import { describe, expect, it } from 'vitest';
import { SKINS, SKIN_GROUPS, otherMode } from '../src/skins';

describe('skin picker groups', () => {
  const bases = SKINS.filter((s) => !s.variantOf).map((s) => s.id);
  const grouped = SKIN_GROUPS.flatMap((g) => g.ids);

  it('puts every base skin in exactly one group', () => {
    expect([...grouped].sort()).toEqual([...bases].sort());
  });

  it('lists only base skins (a light/dark twin is reached with ☀/☾)', () => {
    for (const id of grouped) expect(SKINS.find((s) => s.id === id)?.variantOf).toBeUndefined();
  });

  it('gives every variant a base to flip back to', () => {
    for (const s of SKINS.filter((x) => x.variantOf)) expect(otherMode(s)?.id).toBe(s.variantOf);
  });
});
