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

// The IN dock (top left of a machine): where a call arrives. The engine's
// four states; while it runs (or waits) it holds the arguments that arrived,
// as they arrived (the PARAMETERS pool holds the copies as they are now).
export interface DockInfo {
  name: string;
  state: RunState;
  waitingOn: string | null;
  frames: number; // live frames of this function (recursion)
  stale: boolean;
  copy: number;
  editing: boolean;
  // what arrived with the call on show: null when there is none (never
  // called), or when it arrived before the loaded window began (`before`)
  args: { name: string; text: string; tag?: string }[] | null; // tag: a pointer, named by what its address points at
  before: number | null; // the call began before step `before`: its arguments weren't traced
  last: boolean; // the arguments are the last call's (it returned)
  crash: { line: number; msg: string } | null; // where (1-based, as the editor numbers it) and how it died
  inPorts: number[]; // screen y of each incoming call's port (left side)
  cap?: CapInfo; // parameters, of the Norm's 4
  // where the call on show came from (the caller and its line) and which call
  // of this function it is (2 of 3 in this trace)
  from?: { fn: string; line: number | null; nth: [number, number] };
}

// A Norm limit as capacity (src/norm.ts): used of max. Sent only to skins
// that set `capacity` (Minimal and Barebone prototype it).
export interface CapInfo {
  used: number;
  max: number;
  unit?: string; // 'lines'; none for the others (their panel says what)
}

export type ValueKind = 'int' | 'ptr' | 'null' | 'undef' | 'none' | 'dangling';

// A row's past values, oldest first; `older`: how many came before these
// (not kept), so a skin can say so instead of hiding them
export type Past = string[] & { older?: number };

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
  past?: Past; // what it held before, oldest first (a skin shows it dimmed before the value)
  tag?: string; // a pointer: what its address points at; a skin that draws tags shows this in place of `value`
}

export interface FrameInfo {
  title?: string; // which storage pool this panel is (PARAMETERS, LOCALS, …, RETURN); skins show it in place of their own label
  mode: 'live' | 'returned' | 'none';
  stacked: number; // extra frames of the same function underneath (recursion)
  rows: RowInfo[];
  head: Rect;
  cap?: CapInfo; // LOCALS: variables, local statics included, of the Norm's 5
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
  out?: string; // what the program printed: what has really reached the terminal by now
  errSpans?: [number, number][]; // stretches of `out` that came through stderr (gdb engine)
  args?: string[]; // its command-line arguments, for the prompt line
  lines?: number; // how many lines of output the box has room for (it grows with them)
  selected: boolean;
  hovered: boolean;
}

export type PlateKind = 'arg' | 'ptr' | 'ret' | 'void';
export type PlateRole = 'arg' | 'ret';

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
  cap?: CapInfo; // function definitions, of the Norm's 5
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
  note?: string; // replaces the function count (a machine's wall: its state)
  kind?: 'module' | 'machine'; // a file's wall, or a machine (a function's inside)
  cap?: CapInfo; // a module: function definitions, of the Norm's 5
  live: boolean; // a frame is running inside
  pinned: boolean;
  selected: boolean;
  hovered: boolean;
  head: Rect;
}

// M5.5: a machine's insides, one station per statement. Geometry is the
// engine's; screen px.
export interface StationInfo {
  kind: 'do' | 'if' | 'else' | 'loop' | 'ret' | 'jump' | 'end';
  text: string;
  x: number; // centre of its stop on the track
  y: number;
  textX: number;
  readout: { text: string; result: boolean | null } | null; // a switch: its operands and result, on the row below
  count: number | null; // a loop: times round
  // a loop: which way each round went (true: in, false: out); an if inside a
  // loop: its result in each of those rounds (null: not reached). The latest
  // rounds; `older` counts the ones before them
  rounds?: { marks: (boolean | null)[]; older: number };
  state: 'idle' | 'visited' | 'current';
  hot?: boolean; // its text is the expression with the values it just read (inside a machine)
  pause?: { cond: string | null }; // a breakpoint: playback pauses here (when cond holds)
  norm?: string; // what of the Norm it breaks (src/norm.ts normMarks), for skins with normMarks
}

export interface InteriorInfo {
  title: string;
  mode: 'live' | 'returned' | 'none';
  stations: StationInfo[];
  tracks: { pts: Pt[]; lit: boolean; back: boolean }[];
  token: Pt | null; // where the running line is
  row: number; // row height, px
  head: Rect;
  cap?: CapInfo; // physical lines between the braces, of the Norm's 25
  died?: { station: number; msg: string }; // the statement the program died in (its frame crashed there), and how
}

// printf's buffer inside libc (stdout's FILE buffer), above the process box:
// the bytes printf has taken that haven't reached the terminal yet. Only
// drawn when the trace really read it each step (the gdb engine).
export interface StdBufInfo {
  text: string; // what it holds now, waiting
  n: number; // bytes held
  cap: number; // its size (4096 on glibc)
  mode: 'terminal' | 'pipe'; // where stdout goes: flushed at each newline, or only when full
  flushed: string | null; // bytes that just left it for the terminal (this step's flush), or null
}

// stdin, under the process box: the input the run was given (a file, as
// `< in.txt`), how much the program has taken, and what's left. Only drawn
// when the trace really read fd 0's offset each step (the gdb engine).
export interface StdinInfo {
  text: string; // all of it
  pos: number; // bytes taken so far
  taken: string | null; // what this step took, or null
}

// The heap bar (docs/VISUALS.md, "The heap bar"): fixed to the screen, bottom
// left, one card per live malloc block. The heap belongs to no function and
// outlives every call, so it stays with you wherever you look.
export interface HeapBarInfo {
  count: number; // live blocks
  bytes: number; // their total size
  more: number; // blocks with no card (no room)
  folded: boolean; // down to its header line
  leaks: number; // blocks still there at exit
  empty: 'none' | 'yet' | 'now'; // with no blocks: the run never mallocs, hasn't yet, or freed them all
}
export interface HeapCardInfo {
  name: string; // #1
  size: number;
  site: string; // where it was malloc'd: "lr_grow:42"
  preview: string; // its first bytes as text, or hex
  bytes: number[];
  fields?: { name: string; value: string }[]; // a struct's fields, as read through a typed pointer to it
  refs: { name: string; top: boolean }[]; // the pointers holding its address (top: in the running frame)
  state: 'live' | 'new' | 'freeing' | 'leak' | 'lost'; // lost: nothing points at it any more (a leak from then on)
  note?: string; // why it's lost
  recent: boolean; // written this step
  t: number; // how far a drop-in (new) or take-out (freeing) has gone, 0..1
  // a struct being watched, not a heap block: where it really lives, or that
  // its frame is gone (it stays in its frame; the card only shows it)
  watch?: { where: string; gone: boolean };
}

// A card on the types shelf: a type or a file's constants.
export interface TypeCardInfo {
  kind: 'struct' | 'union' | 'enum' | 'typedef' | 'defines';
  name: string;
  alias?: string;
  file: string; // where it's defined ('' for the one buffer)
  members: { name: string; text: string; note?: string; set?: boolean }[]; // set: the value the run used came from -D
  more: number; // members with no row
  inUse: boolean; // the running function has a variable of this type
}

export interface Skin {
  id: string;
  name: string;
  blurb: string;
  casing: string; // canvas background colour, used to cut gaps where lines cross
  spotlight: string; // focus mode: the veil over everything but the sender and receiver
  capacity?: boolean; // draws the Norm's limits (CapInfo on docks, panels, stations, modules)
  normMarks?: boolean; // marks the statements that break the Norm's other rules (StationInfo.norm; prototyped in Minimal and Barebone)
  solidMachines?: boolean; // its wall paints a machine's whole body (rounded corners and all): no floor under it
  variantOf?: string; // the other mode (light/dark) of this skin: its id; the picker lists only the base
  mode?: 'light' | 'dark'; // set on skins that come in both modes
  background(dc: Dc, camX: number, camY: number): void;
  // its background is the whole page's: painted once behind every panel, and
  // the grid draws on a clear canvas over it (PS3)
  fullBleed?: boolean;
  belt(dc: Dc, pts: Pt[], o: { live: boolean; dir: number; selected: boolean; hovered: boolean; custom: boolean; count: number }): void;
  node(dc: Dc, r: Rect, n: NodeInfo): void;
  // optional: a machine's IN dock, drawn in the motor's place; skins without
  // it draw their node sprite there (Minimal and Barebone prototype it)
  dock?(dc: Dc, r: Rect, d: DockInfo): void;
  // optional: printf's buffer above the process box (Minimal and Barebone prototype it)
  stdbuf?(dc: Dc, r: Rect, b: StdBufInfo): void;
  // optional: stdin under the process box (Minimal and Barebone prototype it)
  stdin?(dc: Dc, r: Rect, b: StdinInfo): void;
  // optional, both or neither: the heap bar in screen space, and its cards;
  // skins without them keep the heap shelf under the process box (Minimal and
  // Barebone prototype it)
  heapBar?(dc: Dc, r: Rect, b: HeapBarInfo): void;
  heapCard?(dc: Dc, r: Rect, c: HeapCardInfo): void;
  // optional: a card on the types shelf, left of the machines (Minimal and
  // Barebone prototype it); skins without it draw no shelf
  typeCard?(dc: Dc, r: Rect, t: TypeCardInfo): void;
  frame(dc: Dc, r: Rect, f: FrameInfo): void;
  chest(dc: Dc, r: Rect, c: ChestInfo): void;
  strip(dc: Dc, r: Rect, info: StripInfo): void;
  sprite(dc: Dc, r: Rect, kind: Exclude<SpriteKind, 'strip'>, info: SpriteInfo): void;
  proc(dc: Dc, r: Rect, p: ProcInfo): void;
  // role: what the plate is on a belt (a call's argument, a return value),
  // told apart by shape where the skin draws roles (Minimal, Barebone), never
  // by an arrow (a belt can run any way); kind is its colour
  plate(dc: Dc, x: number, y: number, text: string, kind: PlateKind, role?: PlateRole): void;
  crate(dc: Dc, x: number, y: number, c: CrateInfo): void; // centred on (x, y)
  wire(dc: Dc, pts: Pt[], complete: boolean): void;
  dangling(dc: Dc, p: Pt): void;
  pulse(dc: Dc, x: number, y: number): void;
  // optional: the path data in flight just travelled, oldest point first,
  // drawn under the data itself (a light trail); skins without it draw nothing
  trail?(dc: Dc, pts: Pt[], kind: 'arg' | 'ret'): void;
  beltHandle(dc: Dc, p: Pt): void; // drag handle on a selected belt
  ghost(dc: Dc, r: Rect, label: string): void; // reserved slot for a recursive copy
  icon(g: CanvasRenderingContext2D, kind: IconKind, s: number): void;
  // optional: colours the author can pick from the top bar (PS3's XMB);
  // tint() switches (fading unless instant) and returns the CSS variables to set
  tints?: { id: string; name: string; colour: string }[];
  tint?(id: string, instant?: boolean): Record<string, string>;
  busy?(): boolean; // still animating on its own (a fade): draw at full rate
  module(dc: Dc, r: Rect, m: ModuleInfo): void;
  wall(dc: Dc, r: Rect, w: WallInfo): void; // drawn under belts and machines
  door(dc: Dc, p: Pt, vertical: boolean, live: boolean): void; // where a belt passes through a wall
  attention(dc: Dc, r: Rect, a: number): void; // focus mode: "look here", a = 0..1 strength
  interior(dc: Dc, r: Rect, i: InteriorInfo): void; // an opened machine's stations (M5.5)
}
