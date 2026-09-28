import { amp } from './amp';
import { aqua } from './aqua';
import { classic } from './classic';
import { minimal } from './minimal';
import { blueprint } from './blueprint';
import { factory } from './factory';
import { gameboy } from './gameboy';
import { synthwave } from './synthwave';
import { barebone } from './barebone';
import { xp } from './xp';
import { seven } from './seven';
import { metro } from './metro';
import { bigsur, leopard, platinum, system7, tahoe, yosemite } from './macos';
import type { Skin } from './types';

export const SKINS: Skin[] = [amp, classic, xp, seven, metro, system7, platinum, aqua, leopard, yosemite, bigsur, tahoe, minimal, barebone, blueprint, factory, gameboy, synthwave];

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
  xp: [],
  barebone: [],
  seven: ['12px "Open Sans"', '600 12px "Open Sans"'],
  metro: ['300 12px "Open Sans"', '600 12px "Open Sans"'],
  system7: ['12px "Pixelify Sans"', '700 12px "Pixelify Sans"'],
  platinum: ['12px "Pixelify Sans"', '700 12px "Pixelify Sans"', '12px "Open Sans"'],
  leopard: ['12px "Open Sans"', '700 12px "Open Sans"'],
  yosemite: ['500 12px Inter', '700 12px Inter'],
  bigsur: ['500 12px Inter', '700 12px Inter'],
  tahoe: ['500 12px Inter', '700 12px Inter'],
};
