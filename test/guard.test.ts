// A skin can't stop the frame (docs/OBJECTIVES.md, "easy to diagnose", step 2).
import { beforeEach, describe, expect, it } from 'vitest';
import { hookErrors } from '../src/diag';
import { guardSkin } from '../src/skins/guard';
import type { Skin } from '../src/skins/types';

// just enough of a 2D context: saves, style, transform
function fakeContext() {
  const stack: Record<string, unknown>[] = [];
  const g = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '10px sans', textAlign: 'start',
    t: [1, 0, 0, 1, 0, 0], dash: [] as number[], paths: 0, drawn: [] as string[],
    save() { stack.push({ fillStyle: this.fillStyle, lineWidth: this.lineWidth, t: this.t }); },
    restore() { const s = stack.pop(); if (s) Object.assign(this, s); },
    getTransform() { return this.t; }, setTransform(t: number[]) { this.t = t; },
    getLineDash() { return this.dash; }, setLineDash(d: number[]) { this.dash = d; },
    beginPath() { this.paths++; }, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {},
    fillRect(x: number) { this.drawn.push(`rect ${x}`); },
    get depth() { return stack.length; },
  };
  return g;
}

describe('guarded skin hooks', () => {
  beforeEach(() => hookErrors.clear());

  it('a hook that throws is reported once, the canvas put back, and the next hook still draws', () => {
    const g = fakeContext();
    const dc = { g, z: 1, cs: 40, time: 0, vw: 100, vh: 100 };
    const skin = {
      id: 'broken',
      panel(d: { g: typeof g }) {
        d.g.save();
        d.g.save();
        d.g.fillStyle = 'red';
        d.g.lineWidth = 9;
        throw new Error('0/0 in a progress bar');
      },
      card(d: { g: typeof g }) { d.g.fillRect(7); },
    } as unknown as Skin;
    const s = guardSkin(skin, false);
    for (let i = 0; i < 3; i++) (s as unknown as { panel: (d: unknown, r: unknown) => void }).panel(dc, { x: 1, y: 2, w: 3, h: 4 });
    (s as unknown as { card: (d: unknown) => void }).card(dc);
    expect(g.depth).toBe(0); // the two saves it left open are closed
    expect(g.fillStyle).toBe('#000');
    expect(g.lineWidth).toBe(1);
    expect(g.drawn).toEqual(['rect 7']);
    const errs = [...hookErrors.values()];
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ skin: 'broken', hook: 'panel', message: '0/0 in a progress bar', count: 3 });
    expect(errs[0].args).toContain('w: 3');
  });

  it("changes nothing when hooks succeed: state they leave behind stays (skins rely on it)", () => {
    const g = fakeContext();
    const dc = { g, z: 1, cs: 40, time: 0, vw: 100, vh: 100 };
    const skin = { id: 'ok', frame(d: { g: typeof g }) { d.g.lineWidth = 3; } } as unknown as Skin;
    (guardSkin(skin, false) as unknown as { frame: (d: unknown) => void }).frame(dc);
    expect(g.lineWidth).toBe(3);
    expect(hookErrors.size).toBe(0);
  });

  it("keeps a skin's getters live (PS3's veil follows the theme colour)", () => {
    let colour = 'blue';
    const skin = { id: 'tinted' } as unknown as Skin;
    Object.defineProperty(skin, 'spotlight', { get: () => colour, enumerable: true });
    const s = guardSkin(skin, false);
    colour = 'red';
    expect(s.spotlight).toBe('red');
    expect(guardSkin(s, false)).toBe(s); // guarding twice is the same guard
  });
});
