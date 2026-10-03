import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ps2Scene } from '../src/gfx/scenes/ps2';
import { ps3Scene } from '../src/gfx/scenes/ps3';
import { ps4Scene } from '../src/gfx/scenes/ps4';
import { sceneFor } from '../src/gfx/scenes';
import { fullWgsl } from '../src/gfx/layer';

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
    for (const scene of [ps2Scene, ps3Scene, ps4Scene]) for (const line of scene.wgsl.split('\n')) expect(bad(line), line).toBe(false);
  });

  // the page skins' scenes (PS3, PS4) run on the page's layer, not the grid's
  it('PS3 and PS4: registered, both shader languages, uniforms finite at any time', () => {
    expect(sceneFor('ps3')).toBe(ps3Scene);
    expect(sceneFor('ps4')).toBe(ps4Scene);
    for (const scene of [ps3Scene, ps4Scene]) {
      expect(scene.wgsl).toMatch(/fn backdrop\(p: vec2f\) -> vec4f/);
      expect(scene.wgsl).toMatch(/fn scene\(p: vec2f\) -> vec4f/);
      expect(scene.glsl).toMatch(/vec4 backdrop\(vec2 p\)/);
      expect(scene.glsl).toMatch(/vec4 scene\(vec2 p\)/);
      for (const time of [0, 1.5, 47.3, 1234.5, 86400, 1e6]) {
        const u = new Float32Array(scene.vec4s * 4);
        const verts = scene.frame(u, { ...view, time });
        expect([...u].every(Number.isFinite), `${scene.id} t=${time}`).toBe(true);
        expect(verts.length).toBe(0); // no hairlines: everything is in the shaders
      }
    }
  });

  it('PS3: a square per sparkle, inside the uniforms it reads', () => {
    const u = new Float32Array(ps3Scene.vec4s * 4);
    ps3Scene.frame(u, view);
    const boxes = ps3Scene.regions!(u);
    expect(boxes.length % 4).toBe(0);
    expect(boxes.length / 4).toBe(170);
    expect(boxes.every(Number.isFinite)).toBe(true);
    // each is wider than its sparkle (twice the radius, and a pixel more)
    for (let i = 0; i < boxes.length; i += 4) expect(boxes[i + 2]).toBeGreaterThan(2);
  });

  it('PS4: all in the backdrop, so the frame pass has no regions to draw', () => {
    expect(ps4Scene.regions!(new Float32Array(ps4Scene.vec4s * 4))).toEqual([]);
  });

  // the layer gives the frame pass an explicit bind group layout: a scene that
  // reads nothing of its uniforms there (PS4's) would otherwise have none
  it('the frame pass binds the uniforms even where scene() never reads them', () => {
    expect(ps4Scene.wgsl).not.toMatch(/fn scene[^]*U\.v/);
    expect(fullWgsl(ps4Scene)).toMatch(/@group\(0\) @binding\(0\) var<uniform> U: Uni;/);
    const layer = readFileSync('src/gfx/layer.ts', 'utf8');
    expect(layer).toMatch(/const pipe = pipeOf\('fs_full', G\.format, G\.frameLayout\)/);
  });
});
