import { describe, expect, it } from 'vitest';
import { ps2Scene } from '../src/gfx/scenes/ps2';
import { sceneFor } from '../src/gfx/scenes';

describe('GPU scenes', () => {
  const view = { w: 900, h: 600, dpr: 2, time: 12.5, z: 1, cs: 40, camX: 3, camY: -2 };

  it('PS2: fills its uniforms and 4 hairline trails, all finite', () => {
    const u = new Float32Array(ps2Scene.vec4s * 4);
    const verts = ps2Scene.frame(u, view);
    expect(verts.length).toBe(4 * 90 * 12); // 4 lights × 90 segments × 2 vertices × (x, y, r, g, b, a)
    expect([...u].every(Number.isFinite)).toBe(true);
    expect([...verts].every(Number.isFinite)).toBe(true);
    expect([u[0], u[1]]).toEqual([900, 600]);
  });

  it('PS2: both shader languages define the scene', () => {
    expect(ps2Scene.wgsl).toMatch(/fn scene\(p: vec2f\) -> vec4f/);
    expect(ps2Scene.glsl).toMatch(/vec4 scene\(vec2 p\)/);
    expect(sceneFor('ps2')).toBe(ps2Scene);
    expect(sceneFor('minimal')).toBeNull();
  });

  // naga (wgpu, Firefox) lets \`a * b ^ c\` through; Tint (Chrome) refuses the
  // whole shader: "mixing '*' and '^' requires parenthesis"
  it('WGSL: arithmetic next to a bitwise operator is parenthesised', () => {
    // a bitwise operator with arithmetic beside it at the same level (inner
    // parentheses folded away first)
    const bad = (line: string) => {
      let bare = line.replace(/\/\/.*$/, '');
      for (let k = 0; k < 6; k++) bare = bare.replace(/\([^()]*\)/g, '_');
      bare = bare.replace(/&&|\|\||->/g, ' ');
      return /[\^|&]/.test(bare) && /[*+/%]|[^\w\s(]\s*-|\w\s+-\s/.test(bare);
    };
    expect(bad('  var h = bitcast<u32>(i32(p.x)) * 1597334677u ^ u32(s) * 2654435769u;')).toBe(true);
    expect(bad('  var h = (bitcast<u32>(i32(p.x)) * 1597334677u) ^ (u32(s) * 2654435769u);')).toBe(false);
    for (const line of ps2Scene.wgsl.split('\n')) expect(bad(line), line).toBe(false);
  });
});
