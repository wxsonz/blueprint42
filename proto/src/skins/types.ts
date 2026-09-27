// The skin contract. The engine (render.ts) owns geometry, camera, playback
// and hit-testing; a skin only decides how each entity looks. Geometry is the
// same for every skin, so switching skins never moves anything.

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
  selected: boolean;
  hovered: boolean;
}

export type PlateKind = 'arg' | 'ptr' | 'ret' | 'void';

export type IconKind = 'node' | 'belt' | 'frame' | 'wire' | 'chest' | 'strip' | 'drill' | 'copy' | 'train' | 'stack';

export interface Skin {
  id: string;
  name: string;
  blurb: string;
  casing: string; // canvas background colour, used to cut gaps where lines cross
  background(dc: Dc, camX: number, camY: number): void;
  belt(dc: Dc, pts: Pt[], o: { live: boolean; dir: number; selected: boolean; hovered: boolean; custom: boolean }): void;
  node(dc: Dc, r: Rect, n: NodeInfo): void;
  frame(dc: Dc, r: Rect, f: FrameInfo): void;
  chest(dc: Dc, r: Rect, c: ChestInfo): void;
  proc(dc: Dc, r: Rect, p: ProcInfo): void;
  plate(dc: Dc, x: number, y: number, text: string, kind: PlateKind): void;
  wire(dc: Dc, pts: Pt[], complete: boolean): void;
  dangling(dc: Dc, p: Pt): void;
  pulse(dc: Dc, x: number, y: number): void;
  beltHandle(dc: Dc, p: Pt): void; // drag handle on a selected belt
  ghost(dc: Dc, r: Rect, label: string): void; // reserved slot for a recursive copy
  icon(g: CanvasRenderingContext2D, kind: IconKind, s: number): void;
}
