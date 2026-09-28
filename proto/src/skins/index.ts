import { amp } from './amp';
import { aqua } from './aqua';
import { classic } from './classic';
import { minimal } from './minimal';
import { blueprint } from './blueprint';
import { factory } from './factory';
import { gameboy } from './gameboy';
import { synthwave } from './synthwave';
import type { Skin } from './types';

export const SKINS: Skin[] = [amp, classic, aqua, minimal, blueprint, factory, gameboy, synthwave];

// Web fonts each skin draws with on the canvas; loaded before first paint.
export const SKIN_FONTS: Record<string, string[]> = {
  amp: ['16px VT323', '8px Silkscreen'],
  classic: ['11px Cousine'],
  aqua: [],
  minimal: ['500 12px Inter', '600 12px Inter', '500 12px "JetBrains Mono"', '600 12px "JetBrains Mono"'],
  blueprint: ['12px "Architects Daughter"', '12px "Share Tech Mono"'],
  factory: ['600 12px Rajdhani', '700 12px Rajdhani', '12px "IBM Plex Mono"', '600 12px "IBM Plex Mono"'],
  gameboy: ['8px "Press Start 2P"', '16px VT323'],
  synthwave: ['500 12px Orbitron', '700 12px Orbitron', '12px "Share Tech Mono"'],
};
