// Skins' GPU scenes, by skin id. A skin without one draws its background on
// the canvas, whatever the GFX mode. (A skin whose background is the whole
// page, PS3 and PS4, runs its scene on the page's layer: page.ts.)
import type { GpuScene } from '../layer';
import { ps2Scene } from './ps2';
import { ps3Scene } from './ps3';
import { ps4Scene } from './ps4';

const SCENES: Record<string, GpuScene> = { ps2: ps2Scene, ps3: ps3Scene, ps4: ps4Scene };

export function sceneFor(skinId: string): GpuScene | null {
  return SCENES[skinId] ?? null;
}
