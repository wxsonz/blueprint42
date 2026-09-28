import { amp } from './amp';
import { aqua } from './aqua';
import { classic } from './classic';
import { minimal, minimalLight } from './minimal';
import { blueprint } from './blueprint';
import { factory } from './factory';
import { gameboy } from './gameboy';
import { synthwave } from './synthwave';
import { bareboneDark, bareboneLight } from './barebone';
import { xp } from './xp';
import { seven } from './seven';
import { metro, metroLight } from './metro';
import { bigsur, bigsurDark, leopard, platinum, system7, tahoe, tahoeDark, yosemite } from './macos';
import { gamecube, gba, n64, nswitch, nswitchDark, ps1, ps2, ps3, ps4, ps5, snes, wii, wiiDark } from './consoles';
import type { Skin } from './types';

// A skin with a variantOf is the other mode (light/dark) of that skin: the
// picker lists only bases, and the ☀/☾ button flips between the two.
export const SKINS: Skin[] = [amp, classic, xp, seven, metro, metroLight, system7, platinum, aqua, leopard, yosemite, bigsur, bigsurDark, tahoe, tahoeDark, minimal, minimalLight, bareboneDark, bareboneLight, blueprint, factory, gameboy, synthwave, ps1, ps2, ps3, ps4, ps5, wii, wiiDark, gamecube, n64, nswitch, nswitchDark, snes, gba];

// How the picker groups the base skins. A skin missing here still shows,
// under "Other".
export const SKIN_GROUPS: { name: string; blurb: string; ids: string[] }[] = [
  { name: 'Simple', blurb: 'quiet and fast', ids: ['minimal', 'barebone'] },
  { name: 'Windows', blurb: '3.1 to 8', ids: ['classic', 'xp', 'seven', 'metro'] },
  { name: 'Mac', blurb: 'System 7 to Tahoe', ids: ['system7', 'platinum', 'aqua', 'leopard', 'yosemite', 'bigsur', 'tahoe'] },
  { name: 'PlayStation', blurb: 'PS1 to PS5', ids: ['ps1', 'ps2', 'ps3', 'ps4', 'ps5'] },
  { name: 'Nintendo', blurb: 'Game Boy to Switch', ids: ['gameboy', 'gba', 'snes', 'n64', 'gamecube', 'wii', 'switch'] },
  { name: 'Just for fun', blurb: 'players, drawings, machines, neon', ids: ['amp', 'blueprint', 'factory', 'synthwave'] },
];

// The other mode of a skin, if it has one.
export function otherMode(skin: Skin): Skin | undefined {
  return skin.variantOf ? SKINS.find((s) => s.id === skin.variantOf) : SKINS.find((s) => s.variantOf === skin.id);
}

// Web fonts each skin draws with on the canvas; loaded before first paint.
export const SKIN_FONTS: Record<string, string[]> = {
  ps1: ['500 12px Rubik', '12px "Share Tech Mono"'],
  ps2: ['600 12px "Exo 2"', '12px "Share Tech Mono"'],
  ps3: ['400 12px "M PLUS Rounded 1c"', '12px "JetBrains Mono"'],
  ps4: ['300 12px "Source Sans 3"', '400 12px "Source Sans 3"', '12px "JetBrains Mono"'],
  ps5: ['300 12px "Source Sans 3"', '600 12px "Source Sans 3"', '12px "JetBrains Mono"'],
  wii: ['700 12px "M PLUS 1p"', '12px "JetBrains Mono"'],
  'wii-dark': ['700 12px "M PLUS 1p"', '12px "JetBrains Mono"'],
  gamecube: ['600 12px Jost', '12px "JetBrains Mono"'],
  n64: ['700 12px "Chakra Petch"', '12px "Share Tech Mono"'],
  switch: ['700 12px Nunito', '12px "JetBrains Mono"'],
  'switch-dark': ['700 12px Nunito', '12px "JetBrains Mono"'],
  snes: ['700 12px "Pixelify Sans"', '12px "Share Tech Mono"'],
  gba: ['700 12px "Pixelify Sans"', '12px "Share Tech Mono"'],
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
  'minimal-light': ['500 12px Inter', '600 12px Inter', '500 12px "JetBrains Mono"', '600 12px "JetBrains Mono"'],
  'barebone-light': [],
  'metro-light': ['300 12px "Open Sans"', '600 12px "Open Sans"'],
  'bigsur-dark': ['500 12px Inter', '700 12px Inter'],
  'tahoe-dark': ['500 12px Inter', '700 12px Inter'],
  seven: ['12px "Open Sans"', '600 12px "Open Sans"'],
  metro: ['300 12px "Open Sans"', '600 12px "Open Sans"'],
  system7: ['12px "Pixelify Sans"', '700 12px "Pixelify Sans"'],
  platinum: ['12px "Pixelify Sans"', '700 12px "Pixelify Sans"', '12px "Open Sans"'],
  leopard: ['12px "Open Sans"', '700 12px "Open Sans"'],
  yosemite: ['500 12px Inter', '700 12px Inter'],
  bigsur: ['500 12px Inter', '700 12px Inter'],
  tahoe: ['500 12px Inter', '700 12px Inter'],
};
