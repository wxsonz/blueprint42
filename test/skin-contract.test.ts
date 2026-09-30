// Skin contract (docs/OBJECTIVES.md, "easy to diagnose", step 3): every skin
// × every drawing hook, with what the grid really passes (recorded by
// tools/capture-hooks.mjs into fixtures/hook-calls.json) and edge cases made
// from it. Nothing throws, nothing non-finite reaches a canvas, and drawing
// stays inside the rect it was given (plus the overhang its hook allows:
// glows, shadows, ports and focus rings reach past the box on purpose).
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { FakeCanvas, installDom, Rec2D } from './helpers/rec2d';
import type { Skin } from '../src/skins/types';

type Args = unknown[];
// recorded calls: the zoom their rects were laid out at, and the arguments after dc
const CALLS = JSON.parse(readFileSync(new URL('./fixtures/hook-calls.json', import.meta.url), 'utf8')) as Record<string, { z: number; args: Args }[]>;

// hooks the recorded scenes never reach (no project, no focus mode, no sprites)
const R = { x: 40, y: 30, w: 220, h: 140 };
const HAND: Record<string, Args[]> = {
  node: [[R, { name: 'lr_append', state: 'running', waitingOn: null, frames: 1, stale: false, pinned: false, isStatic: true, params: 3, selected: true, hovered: false, editing: false, hasFrame: true, copy: 1, inPorts: [60, 90], outPorts: [70] }],
    [R, { name: 'f', state: 'error', waitingOn: 'g', frames: 3, stale: true, pinned: true, isStatic: false, params: 0, selected: false, hovered: true, editing: true, hasFrame: false, copy: 2, inPorts: [], outPorts: [] }]],
  module: [[R, { name: 'src/line_reader_utils.c', fns: 5, doors: [{ name: 'lr_copy', live: true, undeclared: false }, { name: 'lr_grow', live: false, undeclared: true }], more: 2, state: 'waiting', running: 'lr_copy', depth: 2, cap: { used: 5, max: 5 }, pinned: false, selected: true, hovered: false, inPorts: [60], outPorts: [80, 100] }]],
  sprite: [[R, 'marker', { label: 'len', bound: true, value: '3', selected: false, hovered: false }], [R, 'chest', { label: 'bufs', bound: false, value: null, error: 'unbound', selected: true, hovered: true }], [R, 'train', { label: 't', bound: true, value: '→#1', violation: 'len > cap', selected: false, hovered: false }]],
  beltHandle: [[[120, 80]]],
  ghost: [[R, 'fib (copy 3)']],
  attention: [[R, 1], [R, 0.3]],
};

// how far past its rect each hook may draw (css px, at zoom 1; scaled by zoom)
// Declared by what each draws on purpose: a focus ring (it widens as it
// fades); a selected machine's glow and its call ports; drop shadows (Aqua,
// Switch, Game Boy's dither, PS3's halo); a sprite's label above it.
const OVERHANG: Record<string, number> = { default: 8, attention: 24, node: 40, module: 40, dock: 36, frame: 18, proc: 32, sprite: 16, wall: 22 };
const OVERHANG_MIN = 4; // at small zooms a 1 px line is still 1 px
// hooks whose rect is an anchor, not a box: a chest's rect is its icon, its
// name and value sit to the right of it
const ANCHORED = new Set(['chest']);

const isRect = (v: unknown): v is { x: number; y: number; w: number; h: number } => !!v && typeof v === 'object' && ['x', 'y', 'w', 'h'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number');
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
// strings an info carries (not the kinds and states a hook switches on)
const KEEP = new Set(['kind', 'state', 'mode', 'role', 'k', 'phase', 'dir', 'type', 'empty', 'shape']);
// the ones that come from the program, so can be any length: names, values,
// code, output, paths (titles and units are the engine's own, and short)
const DATA = new Set(['name', 'value', 'text', 'label', 'tag', 'note', 'site', 'preview', 'waitingOn', 'exit', 'out', 'file', 'alias', 'running', 'before', 'readout', 'full', 'err', 'why']);
function mapStrings(v: unknown, f: (s: string) => string, key = '', only?: Set<string>): unknown {
  if (typeof v === 'string') return KEEP.has(key) || v === '$dc' || (only && !only.has(key)) ? v : f(v);
  if (Array.isArray(v)) return v.map((x) => mapStrings(x, f, key, only));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapStrings(x, f, k, only)]));
  return v;
}
function mapCaps(v: unknown, f: (c: { used: number; max: number }) => { used: number; max: number }): unknown {
  if (Array.isArray(v)) return v.map((x) => mapCaps(x, f));
  if (v && typeof v === 'object') {
    const o = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapCaps(x, f)]));
    return 'used' in o && 'max' in o && typeof o.used === 'number' ? { ...o, ...f(o as { used: number; max: number }) } : o;
  }
  return v;
}

interface Case { name: string; args: Args; z: number; bounds: boolean }
function casesFor(hook: string): Case[] {
  const base = [...(CALLS[hook] ?? []), ...(HAND[hook] ?? []).map((args) => ({ z: 1, args }))];
  const out: Case[] = [];
  base.forEach(({ z: z0, args }, i) => {
    out.push({ name: `recorded ${i}`, args, z: z0, bounds: true });
    if (i > 1) return; // variants of the first two
    for (const z of [0.3, 3]) out.push({ name: `recorded ${i} at zoom ${z}`, args, z, bounds: false });
    out.push({ name: `recorded ${i}, empty text`, args: mapStrings(clone(args), () => '') as Args, z: z0, bounds: true });
    out.push({ name: `recorded ${i}, long text`, args: mapStrings(clone(args), (s) => `${s}_${'x'.repeat(160)}`, '', DATA) as Args, z: z0, bounds: true });
    out.push({ name: `recorded ${i}, capacity 0/0`, args: mapCaps(clone(args), () => ({ used: 0, max: 0 })) as Args, z: z0, bounds: true });
    out.push({ name: `recorded ${i}, capacity far over`, args: mapCaps(clone(args), (c) => ({ used: c.max + 20, max: c.max })) as Args, z: z0, bounds: true });
    const r = args.findIndex(isRect);
    if (r >= 0) {
      const zero = clone(args);
      (zero[r] as { w: number; h: number }).w = 0;
      (zero[r] as { w: number; h: number }).h = 0;
      out.push({ name: `recorded ${i}, a 0×0 rect`, args: zero, z: z0, bounds: false });
    }
  });
  return out;
}

let SKINS: Skin[] = [];
const offscreen: Rec2D[] = [];
beforeAll(async () => {
  installDom();
  // offscreen canvases a skin makes (sprite caches, PS3's strips) are checked too
  const doc = globalThis.document as unknown as { createElement: (t: string) => unknown };
  const make = doc.createElement;
  doc.createElement = (t: string) => {
    const c = make(t) as FakeCanvas;
    if (c instanceof FakeCanvas) {
      const get = c.getContext.bind(c);
      c.getContext = (k: string) => { const x = get(k); if (x && !offscreen.includes(x)) offscreen.push(x); return x; };
    }
    return c;
  };
  SKINS = (await import('../src/skins')).SKINS;
});

const HOOKS = ['background', 'belt', 'node', 'dock', 'stdbuf', 'stdin', 'heapBar', 'heapCard', 'typeCard', 'frame', 'chest', 'strip', 'sprite', 'proc', 'plate', 'crate', 'wire', 'dangling', 'pulse', 'trail', 'beltHandle', 'ghost', 'module', 'wall', 'door', 'attention', 'interior'];

export interface Problem { skin: string; hook: string; case: string; what: string }
function run(skin: Skin): Problem[] {
  const problems: Problem[] = [];
  for (const hook of HOOKS) {
    const fn = (skin as unknown as Record<string, unknown>)[hook];
    if (typeof fn !== 'function') continue;
    for (const c of casesFor(hook)) {
      const canvas = new FakeCanvas(true);
      canvas.width = 1400;
      canvas.height = 900;
      const g = canvas.getContext('2d')!;
      const dc = { g, z: c.z, cs: 40 * c.z, time: 1.5, vw: 1400, vh: 900 };
      const args = hook === 'background' ? [0, 0] : c.args;
      offscreen.length = 0;
      try {
        (fn as (...a: unknown[]) => void).call(skin, dc, ...args);
      } catch (e) {
        problems.push({ skin: skin.id, hook, case: c.name, what: `threw: ${(e as Error).message}` });
        continue;
      }
      for (const v of [...g.violations, ...offscreen.flatMap((o) => o.violations)].slice(0, 3)) problems.push({ skin: skin.id, hook, case: c.name, what: `non-finite: ${v}` });
      if (g.depth !== 0) problems.push({ skin: skin.id, hook, case: c.name, what: `left ${g.depth} save(s) open` });
      const r = hook === 'background' ? { x: 0, y: 0, w: 1400, h: 900 } : args.find(isRect);
      if (c.bounds && r && !ANCHORED.has(hook) && g.drawn.x1 >= g.drawn.x0) {
        // shadows and rings don't all scale with zoom: at least two thirds of it zoomed out
        const allow = Math.max(OVERHANG_MIN, (OVERHANG[hook] ?? OVERHANG.default) * Math.max(c.z, 0.67));
        const d = g.drawn;
        const over = Math.max(r.x - d.x0, r.y - d.y0, d.x1 - (r.x + r.w), d.y1 - (r.y + r.h));
        if (over > allow + 0.5) {
          const sides = [['left', r.x - d.x0], ['top', r.y - d.y0], ['right', d.x1 - (r.x + r.w)], ['bottom', d.y1 - (r.y + r.h)]].filter(([, v]) => (v as number) > allow + 0.5).map(([k, v]) => `${k} ${(v as number).toFixed(0)}`).join(', ');
          problems.push({ skin: skin.id, hook, case: c.name, what: `drew ${over.toFixed(1)} px past its rect (${sides})` });
        }
      }
    }
  }
  return problems;
}

describe('skin contract', () => {
  it('has recorded calls for the hooks the grid uses', () => {
    for (const h of ['frame', 'dock', 'interior', 'plate', 'belt', 'wire']) expect(CALLS[h]?.length ?? 0).toBeGreaterThan(0);
  });
  it('every skin, every hook: no throw, nothing non-finite, inside its rect', () => {
    const all: Problem[] = [];
    for (const skin of SKINS) {
      const tints = skin.tints?.map((t) => t.id) ?? [null];
      for (const t of tints) {
        if (t && skin.tint) skin.tint(t, true);
        all.push(...run(skin).map((p) => (t ? { ...p, skin: `${p.skin}(${t})` } : p)));
      }
    }
    if (process.env.CONTRACT_REPORT) {
      const by = new Map<string, { n: number; worst: string }>();
      for (const p of all) {
        const k = `${p.skin.replace(/\(.*\)/, '')}.${p.hook}: ${p.what.replace(/[\d.]+ px/, 'N px').replace(/ \(.*$/, '')}`;
        const e = by.get(k) ?? { n: 0, worst: '' };
        e.n++;
        if (!e.worst || p.what > e.worst) e.worst = `${p.case}: ${p.what}`;
        by.set(k, e);
      }
      writeFileSync(process.env.CONTRACT_REPORT, [...by].sort().map(([k, e]) => `${String(e.n).padStart(4)}  ${k}   [${e.worst}]`).join('\n') + '\n');
    }
    expect(all.map((p) => `${p.skin}.${p.hook} (${p.case}): ${p.what}`)).toEqual([]);
  });

  // State a skin depends on is followed, not copied once (step 8): a tinted
  // skin's veil and the colours it fills its panels and plates with move with
  // the picked tint.
  it('a tinted skin follows its tint (veil, panels, plates)', () => {
    const tinted = SKINS.filter((sk) => (sk.tints?.length ?? 0) > 1 && sk.tint);
    expect(tinted.length).toBeGreaterThan(0);
    const colours = (skin: Skin, hook: string): string => {
      const canvas = new FakeCanvas(true);
      canvas.width = 1400;
      canvas.height = 900;
      const g = canvas.getContext('2d')!;
      const { z, args } = CALLS[hook][0];
      (skin as unknown as Record<string, (...a: unknown[]) => void>)[hook](({ g, z, cs: 40 * z, time: 1.5, vw: 1400, vh: 900 }), ...args);
      return [...(g.styles.get('fillStyle') ?? [])].sort().join(' ');
    };
    for (const skin of tinted) {
      const ids = skin.tints!.map((t) => t.id);
      const seen = new Map<string, { veil: string; frame: string; plate: string }>();
      for (const id of ids) {
        skin.tint!(id, true);
        seen.set(id, { veil: skin.spotlight, frame: colours(skin, 'frame'), plate: colours(skin, 'plate') });
      }
      skin.tint!(ids[0], true);
      const [a, b] = [seen.get(ids[0])!, seen.get(ids.find((x) => x !== ids[0] && x !== 'black') ?? ids[1])!];
      expect(b.veil, `${skin.id}: the veil follows the tint`).not.toBe(a.veil);
      expect(b.frame, `${skin.id}: panel fills follow the tint`).not.toBe(a.frame);
      // every tint gives its own veil (none left over from another)
      expect(new Set([...seen.values()].map((v) => v.veil)).size, `${skin.id}: one veil per tint`).toBe(ids.length);
    }
  });
});

