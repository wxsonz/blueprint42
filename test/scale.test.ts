// Fast at any size (docs/OBJECTIVES.md, 2026-10-03): what a frame costs
// follows what changed and what's on screen, not the size of the program.
// These count work rather than time it, so they say the same on every
// machine (tools/scale.mjs has the times).
import { beforeAll, describe, expect, it } from 'vitest';
import { Layout } from '../src/layout';
import { folded, shut, slotsOf } from '../src/machine';
import { run, type Trace } from '../src/interp';
import { slotHistory, slotValue } from '../src/beats';
import { handleTrace } from '../server/trace.mjs';
import { convertGdb } from '../src/gdb';
import type { Model } from '../src/parse';
import { parse, parseProject, parseStats, type SourceFile } from '../src/parse';
import { buildScene, computeScene, crossings, gapsFor, sceneStats, type Belt, type Scene } from '../src/route';
import { frameState, moduleInfo, wallInfo } from '../src/frame';
import { activeHostRect, entityAt, stationAt } from '../src/hit';
import { checkFailures } from '../src/diag';
import { allAtOnce, jsonSteps } from '../src/slices';
import type { ViewState } from '../src/playback';
import { model, sample, setupParser } from './helpers';

beforeAll(setupParser);

// a scene as text, Maps and all, to compare two of them
const ser = (sc: Scene) => JSON.stringify(sc, (_, v: unknown) => (v instanceof Map || v instanceof Set ? [...v] : v));

// A project as tools/scale.mjs makes them: files of 5 functions, each calling
// the next, and one in the next file.
function project(files: number): SourceFile[] {
  const total = files * 5;
  const out: SourceFile[] = [{ path: 'ft.h', text: Array.from({ length: total }, (_, k) => `int\tft_f${k}(int a);`).join('\n') }];
  for (let f = 0; f < files; f++) {
    const fns: string[] = [];
    for (let j = 0; j < 5; j++) {
      const k = f * 5 + j;
      const calls = [k + 1, k + 6].filter((c) => c < total).map((c) => `\tif (a < ${c})\n\t\ta += ft_f${c}(a + 1);\n`).join('');
      fns.push(`int\tft_f${k}(int a)\n{\n${calls}\treturn (a);\n}\n`);
    }
    out.push({ path: `src/file${f}.c`, text: `#include "../ft.h"\n\n${fns.join('\n')}` });
  }
  out.push({ path: 'main.c', text: '#include "ft.h"\n\nint\tmain(void)\n{\n\treturn (ft_f0(0));\n}\n' });
  return out;
}

function setup() {
  const m = model('recursion');
  const layout = new Layout();
  layout.sync(m);
  const trace = run(m);
  const s: ViewState = { layout, model: m, trace, pos: 0, selected: null, hovered: null, editorFn: null, sprites: [] };
  // what one frame and one mouse move ask for
  const frame = () => {
    frameState(s);
    activeHostRect(s);
    entityAt(s, 3, 3);
    stationAt(s, 3, 3);
  };
  const builds = (f: () => void) => {
    const b = sceneStats.builds;
    f();
    return sceneStats.builds - b;
  };
  return { m, layout, trace, s, frame, builds };
}

describe('one scene per change (step 2)', () => {
  it('a frame and a mouse move build the scene once, the same frame again none', () => {
    const { s, trace, frame, builds } = setup();
    expect(builds(frame)).toBe(1);
    expect(builds(frame)).toBe(0);
    // playing on, through every recursion depth: each position at most once
    // (a call between copies adds a second scene with its live belt)
    for (let i = 0; i < trace.evs.length; i++) {
      s.pos = i + 0.5;
      expect(builds(frame)).toBeLessThanOrEqual(2);
      expect(builds(frame)).toBe(0);
    }
  });

  it('builds again after each kind of change, and what it keeps is what a fresh build makes', () => {
    const { m, layout, s, frame, builds } = setup();
    const fresh = () => expect(ser(buildScene(layout, s.model, s.trace))).toBe(ser(computeScene(layout, s.model, s.trace)));
    frame();
    // a drag
    const n = [...layout.nodes.values()].find((x) => x.name !== 'main')!;
    expect(layout.setPos(n.id, n.place.x, n.place.y + 30)).toBe(true);
    expect(builds(frame)).toBe(1);
    fresh();
    // a belt routed by hand, and back
    const b = buildScene(layout, m, s.trace).belts[0];
    layout.setRoute(b.key, { x: 2.5, y: 40.5 });
    expect(builds(frame)).toBe(1);
    fresh();
    layout.setRoute(b.key, null);
    expect(builds(frame)).toBe(1);
    // a struct row folded, a machine shut
    folded.add('fact.n');
    expect(builds(frame)).toBe(1);
    folded.clear();
    shut.add(n.name);
    expect(builds(frame)).toBe(1);
    fresh();
    shut.clear();
    expect(builds(frame)).toBe(0); // back as it was: the scene kept from before is that one
    fresh();
    // another run, another parse
    s.trace = run(m);
    expect(builds(frame)).toBe(1);
    const m2 = parse(`${sample('recursion').src}\n`);
    layout.sync(m2);
    s.model = m2;
    expect(builds(frame)).toBe(1);
    fresh();
  });

  it('a change made behind the layout\'s back is reported (dev), and drawn right', () => {
    const { m, layout, trace } = setup();
    buildScene(layout, m, trace);
    const n = [...layout.nodes.values()][0];
    n.place.x += 20; // not through a Layout method, and no touch()
    const before = checkFailures.length;
    let scene = buildScene(layout, m, trace);
    for (let i = 0; i < 60; i++) scene = buildScene(layout, m, trace);
    expect(checkFailures.slice(before).some((f) => f.check === 'scene kept')).toBe(true);
    expect(ser(scene)).toBe(ser(computeScene(layout, m, trace)));
  });
});

describe('nodes by file (step 3)', () => {
  // the sweeps of the node list one frame makes: its scene, and what each
  // module block and wall says
  function sweeps(files: number, open: boolean): { first: number; again: number } {
    const m = parseProject(project(files));
    const layout = new Layout();
    layout.sync(m);
    if (open) for (const f of [...layout.modules.keys()]) layout.setCollapsed(f, false, m);
    const s: ViewState = { layout, model: m, trace: null, pos: 0, selected: null, hovered: null, editorFn: null, sprites: [] };
    const nodes = layout.nodes;
    const values = nodes.values;
    let n = 0;
    nodes.values = function (this: typeof nodes) {
      n++;
      return values.call(this);
    };
    const frame = () => {
      const fs = frameState(s);
      for (const h of fs.scene.hosts.values()) if (h.module) moduleInfo(s, fs, h, true);
      for (const w of fs.scene.walls) wallInfo(s, fs, w.file, true);
    };
    frame();
    const first = n;
    frame();
    nodes.values = values;
    return { first, again: n - first };
  }

  it('a frame walks the node list a fixed number of times, however many modules', () => {
    for (const open of [false, true]) {
      const small = sweeps(10, open);
      const big = sweeps(50, open);
      expect(big.first).toBe(small.first);
      expect(big.first).toBeLessThanOrEqual(2); // the scene's hosts, the files' lists
      expect(big.again).toBe(0);
    }
  });

  it('a file\'s machines follow machines added, removed and moved to another file', () => {
    const files = project(3);
    const m = parseProject(files);
    const layout = new Layout();
    layout.sync(m);
    const names = (f: string) => layout.nodesOf(f).map((n) => n.name);
    expect(names('src/file1.c')).toEqual(['ft_f5', 'ft_f6', 'ft_f7', 'ft_f8', 'ft_f9']);
    // ft_f9 moves to file2.c, and file0.c gets a new function
    const moved = files.map((f) => {
      if (f.path === 'src/file1.c') return { ...f, text: f.text.replace(/int\tft_f9\(int a\)\n\{[^}]*\}\n/, '') };
      if (f.path === 'src/file2.c') return { ...f, text: `${f.text}\nint\tft_f9(int a)\n{\n\treturn (a);\n}\n` };
      if (f.path === 'src/file0.c') return { ...f, text: `${f.text}\nint\tft_new(int a)\n{\n\treturn (a);\n}\n` };
      return f;
    });
    const m2 = parseProject(moved);
    layout.sync(m2);
    expect(names('src/file1.c')).toEqual(['ft_f5', 'ft_f6', 'ft_f7', 'ft_f8']);
    expect(names('src/file2.c')).toContain('ft_f9');
    expect(names('src/file0.c')).toContain('ft_new');
    // the same as filtering every node by its file
    for (const f of m2.files) expect(names(f)).toEqual([...layout.nodes.values()].filter((n) => n.file === f).map((n) => n.name));
  });
});

describe('crossings once per scene (step 4)', () => {
  // what passBelts did every frame: each belt against every belt drawn after it
  const pairwise = (drawn: Belt[]) => drawn.map((b, i) => drawn.slice(i + 1).flatMap((o) => crossings(o.pts, b.pts)));
  // a fixed shuffle (the same each run)
  const shuffled = <T>(xs: T[], seed: number): T[] => {
    const out = [...xs];
    let r = seed;
    for (let i = out.length - 1; i > 0; i--) {
      r = (r * 1103515245 + 12345) % 2147483648;
      const j = r % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  it('cuts the same gaps as trying every pair, in any drawing order', () => {
    const m = parseProject(project(20));
    const layout = new Layout();
    layout.sync(m);
    for (const f of [...layout.modules.keys()]) layout.setCollapsed(f, false, m);
    const scene = buildScene(layout, m, null);
    expect(pairwise(scene.belts).flat().length).toBeGreaterThan(20); // it has crossings to cut
    for (let seed = 1; seed <= 5; seed++) {
      const drawn = shuffled(scene.belts, seed).slice(0, scene.belts.length - seed * 7); // some off screen
      expect(gapsFor(scene, drawn)).toEqual(pairwise(drawn));
    }
    expect(gapsFor(scene, scene.belts)).toEqual(pairwise(scene.belts));
  });

  it('finds them once per scene, from far fewer pairs than all of them', () => {
    const m = parseProject(project(50));
    const layout = new Layout();
    layout.sync(m);
    for (const f of [...layout.modules.keys()]) layout.setCollapsed(f, false, m);
    const scene = buildScene(layout, m, null);
    const n = scene.belts.length;
    let p = sceneStats.pairs;
    gapsFor(scene, scene.belts);
    const tried = sceneStats.pairs - p;
    expect(tried).toBeLessThan((n * (n - 1)) / 2 / 10);
    p = sceneStats.pairs;
    gapsFor(scene, shuffled(scene.belts, 3)); // the next frame, another order
    expect(sceneStats.pairs - p).toBe(0);
  });
});

describe('an edit parses one file (step 5)', () => {
  it('walks only the edited file for its structs', () => {
    const files = project(30);
    files.push({ path: 'buf.h', text: 'typedef struct s_buf\n{\n\tchar\t*data;\n\tsize_t\tlen;\n}\tt_buf;\n' });
    parseProject(files);
    const before = parseStats.structWalks;
    const edited = files.map((f) => (f.path === 'src/file7.c' ? { ...f, text: `${f.text}\n` } : f));
    const m = parseProject(edited);
    expect(parseStats.structWalks - before).toBe(1);
    expect(m.fns).toHaveLength(151);
  });

  it('two anonymous structs in two files keep their own fields', () => {
    const m = parseProject([
      { path: 'a.h', text: 'typedef struct\n{\n\tint\tx;\n}\tt_a;\n' },
      { path: 'b.h', text: 'typedef struct\n{\n\tchar\t*s;\n\tint\tn;\n}\tt_b;\n' },
      { path: 'main.c', text: '#include "a.h"\n#include "b.h"\n\nint\tget(t_a *p, t_b *q)\n{\n\treturn (p->x + q->n);\n}\n\nint\tmain(void)\n{\n\treturn (0);\n}\n' },
    ]);
    const get = m.byName.get('get')!;
    expect(get.params.map((v) => v.fields?.map((f) => f.name))).toEqual([['x'], ['s', 'n']]);
    // and an edit to one of them changes only its own
    const m2 = parseProject([
      { path: 'a.h', text: 'typedef struct\n{\n\tint\tx;\n\tint\ty;\n}\tt_a;\n' },
      { path: 'b.h', text: 'typedef struct\n{\n\tchar\t*s;\n\tint\tn;\n}\tt_b;\n' },
      { path: 'main.c', text: '#include "a.h"\n#include "b.h"\n\nint\tget(t_a *p, t_b *q)\n{\n\treturn (p->x + q->n);\n}\n\nint\tmain(void)\n{\n\treturn (0);\n}\n' },
    ]);
    expect(m2.byName.get('get')!.params.map((v) => v.fields?.map((f) => f.name))).toEqual([['x', 'y'], ['s', 'n']]);
  });
});

describe('routing that scales (step 6)', () => {
  // obstacles tried while routing one scene, every module open
  function tried(files: number): { near: number; size: number } {
    const m = parseProject(project(files));
    const layout = new Layout();
    layout.sync(m);
    for (const f of [...layout.modules.keys()]) layout.setCollapsed(f, false, m);
    const before = sceneStats.near;
    const sc = computeScene(layout, m, null);
    return { near: sceneStats.near - before, size: sc.hosts.size + sc.belts.length };
  }

  it('tries the obstacles near each belt, not all of them: the work grows with the program, not its square', () => {
    const small = tried(10);
    const big = tried(50);
    // five times the program: about five times the work (all of them: about 25 times)
    expect(big.near / big.size).toBeLessThan((small.near / small.size) * 2);
  });
});

describe('a row\'s past values, scanned once (step 7)', () => {
  // the scan as it was: every snapshot up to `upto`, a slot's whole value at each
  function before(slot: ReturnType<typeof slotsOf>[number], fn: string, frameId: number, trace: Trace, upto: number, n = 8) {
    if (slot.kind === 'more') return [];
    const changes: { si: number; text: string }[] = [];
    for (let si = 0; si <= upto && si < trace.snaps.length; si++) {
      const snap = trace.snaps[si];
      const f = snap.stack.find((x) => x.id === frameId);
      if (!f) continue;
      const text = slotValue(slot, fn, f, snap, trace).text || '?';
      if (changes.at(-1)?.text !== text) changes.push({ si, text });
    }
    const from = Math.max(0, changes.length - 1 - n);
    const past: string[] & { older?: number } = changes.slice(from, -1).map((c) => c.text);
    if (from > 0) past.older = from;
    return past;
  }
  // every frame of the run, every row of its machine, at positions moving on (and back)
  function same(trace: Trace, m: Model): number {
    const frames = new Map<number, string>();
    for (const s of trace.snaps) for (const f of s.stack) frames.set(f.id, f.fn);
    const n = trace.snaps.length;
    const at = [0, 1, Math.floor(n / 7), Math.floor(n / 3), Math.floor(n / 2), n - 2, n - 1, Math.floor(n / 4)];
    let rows = 0;
    for (const [id, fn] of frames) {
      const info = m.byName.get(fn);
      if (!info) continue;
      for (const slot of slotsOf(info)) {
        rows++;
        for (const upto of at) expect(slotHistory(slot, fn, id, trace, upto)).toEqual(before(slot, fn, id, trace, upto));
      }
    }
    return rows;
  }

  it('the same history as scanning every snapshot (interpreter)', () => {
    let rows = 0;
    for (const key of ['recursion', 'fib', 'swap', 'counter', 'gcd', 'structs']) {
      const m = model(key);
      rows += same(run(m), m);
    }
    expect(rows).toBeGreaterThan(20);
  });

  it('the same history as scanning every snapshot (gdb: heap, statics, strings)', async () => {
    let rows = 0;
    for (const key of ['reader', 'list', 'lost']) {
      const s = sample(key);
      const m = parse(s.src);
      const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
      expect(r.ok, r.error).toBe(true);
      rows += same(convertGdb(r, m, s.src), m);
    }
    expect(rows).toBeGreaterThan(20);
  }, 120000);
});

describe('a window\'s answer read in slices (step 7)', () => {
  const read = (text: string) => allAtOnce(jsonSteps(text, 'stops'));

  it('is what JSON.parse makes of a real answer, stop for stop', async () => {
    const s = sample('reader');
    const m = parse(s.src);
    const r = await handleTrace({ src: s.src, fns: m.fns.map((f) => f.name), stdin: s.stdin, defines: s.defines, files: s.files });
    expect(r.stops?.length).toBeGreaterThan(600); // several pieces of 256
    const text = JSON.stringify(r);
    expect(read(text)).toEqual(JSON.parse(text));
    expect(Object.keys(read(text) as object)).toEqual(Object.keys(JSON.parse(text)));
    expect(read(JSON.stringify(r, null, 2))).toEqual(r); // spaced out, the same
  }, 60000);

  it('isn\'t fooled by strings, nesting or another array by that name', () => {
    const texts = [
      '{"a":"x\\"]}","stops":[{"s":"]\\\\","t":[1,[2,{"u":"\\"stops\\":["}]]},3,"a , ] [ { }",null,true,-1.5e3,{}],"b":{"stops":[9]},"c":[]}',
      '{"stops":[]}',
      '{"b":1,"stops":[[],[[]],"\\u005d"],"z":"stops"}',
      '{"nostops":[1],"x":{"stops":[2]}}', // not at the top: read whole
      '{"stops":null,"y":[1,2]}', // not an array: read whole
      '[1,{"stops":[3]}]',
      `{"stops":[${Array.from({ length: 700 }, (_, k) => `{"n":${k},"s":"${'],\\"'.repeat(k % 3)}"}`).join(',')}],"tail":"\\\\"}`,
    ];
    for (const t of texts) expect(read(t)).toEqual(JSON.parse(t));
  });
});
