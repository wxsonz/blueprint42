import { amp } from './amp';
import { aqua } from './aqua';
import { classic } from './classic';
import { minimal } from './minimal';
import type { Skin } from './types';

export const SKINS: Skin[] = [amp, classic, aqua, minimal];

// Web fonts each skin draws with on the canvas; loaded before first paint.
export const SKIN_FONTS: Record<string, string[]> = {
  amp: ['16px VT323', '8px Silkscreen'],
  classic: ['11px Cousine'],
  aqua: [],
  minimal: ['500 12px Inter', '600 12px Inter', '500 12px "JetBrains Mono"', '600 12px "JetBrains Mono"'],
};
