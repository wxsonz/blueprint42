// How heavy is a skin (docs/OBJECTIVES.md, nice to have 12).
import { describe, expect, it } from 'vitest';
import { SKINS } from '../src/skins';
import { weightOf } from '../src/skins/weight';
import { WEIGHTS } from '../src/skins/weight-data';

describe('skin weight', () => {
  it('every skin the picker lists was measured, and its class follows its cost', () => {
    const bases = SKINS.filter((s) => !s.variantOf);
    const lightest = Math.min(...Object.values(WEIGHTS).map((w) => w.ms));
    for (const s of bases) {
      const w = weightOf(s.id);
      expect(w, s.id).not.toBe(null);
      const x = w!.ms / lightest;
      expect(w!.cls, s.id).toBe(x <= 1.3 ? 'light' : x <= 2 ? 'medium' : 'heavy');
      expect(w!.title).toContain('Measured');
    }
  });
  it('the gradient note, only for skins that make many', () => {
    const many = Object.entries(WEIGHTS).filter(([, w]) => w.grad >= 10).map(([id]) => id);
    for (const [id] of Object.entries(WEIGHTS)) expect(weightOf(id)!.title.includes('Firefox'), id).toBe(many.includes(id));
  });
});
