// Skins' GPU scenes, by skin id. A skin without one draws its background on
// the canvas, whatever the GFX mode.
import type { GpuScene } from '../layer';
import { ps2Scene } from './ps2';

const SCENES: Record<string, GpuScene> = { ps2: ps2Scene };

export function sceneFor(skinId: string): GpuScene | null {
  return SCENES[skinId] ?? null;
}
