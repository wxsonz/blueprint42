// The skin contract. The engine (render.ts) owns geometry, camera, playback
// and hit-testing; a skin only decides how each entity looks. Geometry is the
// same for every skin, so switching skins never moves anything.

import type { SpriteKind } from '../blueprint';

export type Pt = [number, number];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type RunState = 'idle' | 'waiting' | 'running' | 'error';

export interface Dc {
  g: CanvasRenderingContext2D;
  z: number; // zoom (1 = 40px cells)
  cs: number; // cell size in px
  time: number; // seconds, for idle animation
  vw: number; // viewport size in css px
  vh: number;
}

export interface NodeInfo {
  name: string;
  state: RunState;
  waitingOn: string | null;
  frames: number;
  stale: boolean;
  pinned: boolean;
  isStatic: boolean;
  params: number;
  selected: boolean;
  hovered: boolean;
  editing: boolean; // the editor cursor is inside this function
  hasFrame: boolean; // a frame panel is attached below
  copy: number; // 1 = the function's home node, 2+ = a spawned recursive copy
  inPorts: number[]; // screen y of each incoming call's port (left side)
  outPorts: number[]; // screen y of each outgoing call's port (right side)
}

export type ValueKind = 'int' | 'ptr' | 'null' | 'undef' | 'none' | 'dangling';

export interface RowInfo {
  name: string;
  value: string;
  kind: ValueKind;
  param: boolean;
  recent: boolean; // written by the last event
  flash: number; // 0..1, fading highlight while a write lands
  rect: Rect;
  depth: number; // 1 = a struct field under the row above it
  fold: 'open' | 'closed' | null; // a struct row (its name already carries ▾/▸)
}

export interface FrameInfo {
  mode: 'live' | 'returned' | 'none';
  stacked: number; // extra frames of the same function underneath (recursion)
  rows: RowInfo[];
  head: Rect;
}

export interface ChestInfo {
  name: string;
  value: string | null;
  flash: number;
  recent: boolean;
  selected: boolean;
  hovered: boolean;
}

export interface ProcInfo {
  state: 'idle' | 'running' | 'done' | 'crashed';
  exit: string | null;
  out?: string; // what the program printed (shown once it has finished)
  selected: boolean;
  hovered: boolean;
}

export type PlateKind = 'arg' | 'ptr' | 'ret' | 'void';

// A struct riding a belt: its type, where it lives (for a pointer), fields.
export interface CrateInfo {
  title: string;
  via?: string;
  rows: { name: string; value: string }[];
  more: number;
  kind: 'arg' | 'ret';
}

export type IconKind = 'node' | 'belt' | 'frame' | 'wire' | 'chest' | 'strip' | 'drill' | 'copy' | 'train' | 'stack';

export interface StripInfo {
  label: string;
  bound: boolean;
  bytes: number[];
  length: number | null;
  pointer: number | null;
  markers: { label: string; index: number; sampledIndex: number }[];
  error?: string;
  violation?: string; // M4: the invariant that is false at this step
  selected: boolean;
  hovered: boolean;
}

export interface SpriteInfo {
  label: string;
  bound: boolean;
  value: string | null;
  error?: string;
  violation?: string;
  selected: boolean;
  hovered: boolean;
}

// M5: a collapsed module (one .c file) drawn as a single block. Doors are its
// public functions, the ones other files can call.
export interface ModuleInfo {
  name: string; // project-relative path
  fns: number; // functions inside
  doors: { name: string; live: boolean; undeclared: boolean }[];
  more: number; // doors not listed
  state: RunState; // running: the top frame is inside; waiting: a frame inside is waiting on a callee
  running: string | null; // the function whose frame is newest inside
  depth: number; // live frames inside
  pinned: boolean;
  selected: boolean;
  hovered: boolean;
  inPorts: number[];
  outPorts: number[];
}

// An expanded module: a wall around its machines, with a title tab (`head`).
export interface WallInfo {
  name: string;
  fns: number;
  live: boolean; // a frame is running inside
  pinned: boolean;
  selected: boolean;
  hovered: boolean;
  head: Rect;
}

export interface Skin {
  id: string;
  name: string;
  blurb: string;
  casing: string; // canvas background colour, used to cut gaps where lines cross
  spotlight: string; // focus mode: the veil over everything but the sender and receiver
  background(dc: Dc, camX: number, camY: number): void;
  belt(dc: Dc, pts: Pt[], o: { live: boolean; dir: number; selected: boolean; hovered: boolean; custom: boolean; count: number }): void;
  node(dc: Dc, r: Rect, n: NodeInfo): void;
  frame(dc: Dc, r: Rect, f: FrameInfo): void;
  chest(dc: Dc, r: Rect, c: ChestInfo): void;
  strip(dc: Dc, r: Rect, info: StripInfo): void;
  sprite(dc: Dc, r: Rect, kind: Exclude<SpriteKind, 'strip'>, info: SpriteInfo): void;
  proc(dc: Dc, r: Rect, p: ProcInfo): void;
  plate(dc: Dc, x: number, y: number, text: string, kind: PlateKind): void;
  crate(dc: Dc, x: number, y: number, c: CrateInfo): void; // centred on (x, y)
  wire(dc: Dc, pts: Pt[], complete: boolean): void;
  dangling(dc: Dc, p: Pt): void;
  pulse(dc: Dc, x: number, y: number): void;
  beltHandle(dc: Dc, p: Pt): void; // drag handle on a selected belt
  ghost(dc: Dc, r: Rect, label: string): void; // reserved slot for a recursive copy
  icon(g: CanvasRenderingContext2D, kind: IconKind, s: number): void;
  module(dc: Dc, r: Rect, m: ModuleInfo): void;
  wall(dc: Dc, r: Rect, w: WallInfo): void; // drawn under belts and machines
  door(dc: Dc, p: Pt, vertical: boolean, live: boolean): void; // where a belt passes through a wall
  attention(dc: Dc, r: Rect, a: number): void; // focus mode: "look here", a = 0..1 strength
}
