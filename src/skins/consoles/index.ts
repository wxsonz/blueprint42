// Console skins: PlayStation 1–5, Wii, GameCube and Switch. Each is a theme for the kit (`makeSkin`): a
// wallpaper drawn once per size, window chrome in the console's own style,
// and a palette. Geometry is the engine's; only the look changes.
// One file per console; `common.ts` holds what more than one of them uses.

export { ps1Theme, ps1 } from './ps1';
export { ps2Theme, ps2 } from './ps2';
export { PS3_TINTS, ps3Theme, ps3 } from './ps3';
export { ps4Theme, ps4 } from './ps4';
export { ps5Theme, ps5 } from './ps5';
export { wiiTheme, wii, wiiDark } from './wii';
export { gamecubeTheme, gamecube } from './gamecube';
export { switchTheme, nswitch, nswitchDark } from './switch';
