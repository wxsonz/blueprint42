// M5: projects — linking across files, modules, and the file server.
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Layout } from '../src/layout';
import { parseProject, type SourceFile } from '../src/parse';
import { buildScene, moduleKey } from '../src/route';
import { parseBlueprint } from '../src/blueprint';
import { SAMPLE_PROJECTS } from '../src/samples';
import { openProject, pollProject, safeRel, saveFiles } from '../server/project.mjs';
import { setupParser } from './helpers';

beforeAll(setupParser);

const gnlFiles = (withDriver = false): SourceFile[] =>
  Object.entries(SAMPLE_PROJECTS[0].files)
    .filter(([p]) => !p.endsWith('.json') && (withDriver || !p.startsWith('.ft_blueprint/')))
    .map(([path, text]) => ({ path, text }));

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('project model (M5)', () => {
  it('links gnl_v3 across its two .c files', () => {
    const m = parseProject(gnlFiles());
    expect(m.project).toBe(true);
    expect(m.fns).toHaveLength(10);
    expect(m.files).toEqual(['get_next_line.c', 'get_next_line_utils.c']);
    expect(m.byName.get('gnl_copy')!.file).toBe('get_next_line_utils.c');
    // get_next_line.c reaches into utils.c: cross-file call sites resolve, not external
    const cross = m.fns.filter((f) => f.file === 'get_next_line.c').flatMap((f) => f.calls.filter((c) => m.byName.get(c.callee)!.file !== f.file));
    expect(cross.length).toBeGreaterThan(0);
    expect(m.fns.every((f) => f.externals.every((x) => !m.byName.has(x)))).toBe(true);
    // header prototypes make doors "declared"
    expect(m.byName.get('get_next_line')!.declared).toBe(true);
  });

  it('keys colliding statics by file and resolves calls the way the linker does', () => {
    const m = parseProject([
      { path: 'a.c', text: 'static int\thelper(void)\n{\n\treturn (1);\n}\n\nint\tfa(void)\n{\n\treturn (helper());\n}\n' },
      { path: 'b.c', text: 'static int\thelper(void)\n{\n\treturn (2);\n}\n\nint\tfb(void)\n{\n\treturn (helper() + fa());\n}\n' },
      { path: 'c.c', text: 'int\tfc(void)\n{\n\treturn (helper());\n}\n' },
    ]);
    expect(m.byName.has('helper@a.c')).toBe(true);
    expect(m.byName.has('helper@b.c')).toBe(true);
    expect(m.byName.get('fa')!.calls.map((c) => c.callee)).toEqual(['helper@a.c']);
    expect(m.byName.get('fb')!.calls.map((c) => c.callee).sort()).toEqual(['fa', 'helper@b.c']);
    // c.c cannot see either static helper
    expect(m.byName.get('fc')!.calls).toEqual([]);
    expect(m.warnings.some((w) => w.file === 'c.c' && /static/.test(w.msg))).toBe(true);
  });

  it('keeps a static machine in place when a namesake appears in another file', () => {
    const a = { path: 'a.c', text: 'static int\thelper(void)\n{\n\treturn (1);\n}\n\nint\tmain(void)\n{\n\treturn (helper());\n}\n' };
    const l = new Layout();
    l.sync(parseProject([a]));
    const before = { ...l.nodes.get('func:helper')!.place };
    const renamed = l.sync(parseProject([a, { path: 'b.c', text: 'static int\thelper(void)\n{\n\treturn (2);\n}\n' }]));
    expect(renamed.get('func:helper')).toBe('func:helper@a.c');
    expect(l.nodes.get('func:helper@a.c')!.place).toEqual(before);
  });
});

describe('modules (M5)', () => {
  it('starts collapsed except the module with main, and never overlaps', () => {
    const m = parseProject(gnlFiles(true));
    const l = new Layout();
    l.sync(m);
    expect([...l.modules.keys()].sort()).toEqual(['.ft_blueprint/main.c', 'get_next_line.c', 'get_next_line_utils.c']);
    expect(l.modules.get('.ft_blueprint/main.c')!.collapsed).toBe(false);
    expect(l.modules.get('get_next_line.c')!.collapsed).toBe(true);
    const rects = [...l.modules.keys()].map((f) => l.moduleRect(f));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
  });

  it('draws calls between collapsed modules as one trunk that counts its call sites', () => {
    const m = parseProject(gnlFiles(true));
    const l = new Layout();
    l.sync(m);
    const scene = buildScene(l, m, null);
    const trunk = scene.belts.find((b) => b.fromHost === moduleKey('get_next_line.c') && b.toHost === moduleKey('get_next_line_utils.c'))!;
    const sites = m.fns.filter((f) => f.file === 'get_next_line.c').flatMap((f) => f.calls.filter((c) => m.byName.get(c.callee)!.file === 'get_next_line_utils.c'));
    expect(trunk.lines).toHaveLength(sites.length);
    expect(new Set(trunk.callees)).toEqual(new Set(sites.map((c) => c.callee)));
    // no belt stays inside a collapsed module
    expect(scene.belts.some((b) => b.fromHost === b.toHost)).toBe(false);
    // main (open) calls get_next_line (collapsed): its belt lands on the block
    expect(scene.belts.some((b) => b.from === 'main' && b.toHost === moduleKey('get_next_line.c'))).toBe(true);
  });

  it('opening a module routes to its machines and pushes only auto-placed modules', () => {
    const m = parseProject(gnlFiles(true));
    const l = new Layout();
    l.sync(m);
    l.moveModule('.ft_blueprint/main.c', -30, -20); // the author pins main's module
    const pinned = { ...l.modules.get('.ft_blueprint/main.c')! };
    l.setCollapsed('get_next_line.c', false, m);
    l.setCollapsed('get_next_line_utils.c', false, m);
    expect(l.modules.get('.ft_blueprint/main.c')).toEqual(pinned);
    const rects = [...l.modules.keys()].map((f) => l.moduleRect(f));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
    const scene = buildScene(l, m, null);
    expect(scene.walls).toHaveLength(3);
    expect(scene.belts.some((b) => b.from === 'gnl_fill_line' || b.to === 'gnl_copy')).toBe(true);
    expect(scene.belts.every((b) => !b.toHost.startsWith('mod:'))).toBe(true);
    // every open machine sits inside its own wall
    for (const n of l.nodes.values()) {
      const w = l.moduleRect(n.file);
      expect(n.place.x >= w.x && n.place.y >= w.y && n.place.x + 4 <= w.x + w.w).toBe(true);
    }
    // collapse again: machines hidden, wall gone, block back
    l.setCollapsed('get_next_line_utils.c', true, m);
    expect(buildScene(l, m, null).hosts.has(moduleKey('get_next_line_utils.c'))).toBe(true);
  });

  it('keeps a libft-sized project (50 files) readable and fast', () => {
    const files: SourceFile[] = [];
    for (let i = 0; i < 50; i++) {
      const calls = [1, 2, 3].map((d) => (i + d) % 50).filter((j) => j > i).map((j) => `ft_f${j}()`).join(' + ') || '0';
      files.push({ path: `src/ft_f${i}.c`, text: `static int\tlocal(void)\n{\n\treturn (1);\n}\n\nint\tft_f${i}(void)\n{\n\treturn (local() + ${calls});\n}\n` });
    }
    files.push({ path: 'main.c', text: 'int\tft_f0(void);\n\nint\tmain(void)\n{\n\treturn (ft_f0());\n}\n' });
    const t0 = performance.now();
    const m = parseProject(files);
    const l = new Layout();
    l.sync(m);
    const scene = buildScene(l, m, null);
    const ms = performance.now() - t0;
    expect(m.fns).toHaveLength(101);
    expect(new Set(m.fns.filter((f) => f.cname === 'local').map((f) => f.name)).size).toBe(50);
    // collapsed by default: one block per file, one trunk per pair of files that talk
    expect([...scene.hosts.values()].filter((h) => h.module)).toHaveLength(50);
    expect(scene.belts.length).toBeLessThanOrEqual(1 + 49 * 3);
    const rects = [...l.modules.keys()].map((f) => l.moduleRect(f));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i], rects[j])).toBe(false);
    expect(ms).toBeLessThan(3000);
  });

  it('round-trips module state through a v2 blueprint', () => {
    const bp = parseBlueprint({ version: 2, nodes: { 'func:helper@a.c': { x: 1, y: 2, pinned: true } }, modules: { 'src/a.c': { x: 3, y: 4, pinned: false, collapsed: true } }, waypoints: {}, sprites: [{ id: 's', kind: 'chest', x: 0, y: 0, binding: { scope: 'fn', fn: 'helper@src/a.c', expr: 'x' } }] });
    expect(bp.modules!['src/a.c'].collapsed).toBe(true);
    expect(() => parseBlueprint({ version: 2, nodes: {}, modules: { '../x.c': { x: 0, y: 0, pinned: false, collapsed: true } }, waypoints: {}, sprites: [] })).toThrow();
  });
});

describe('file server (M5)', () => {
  let dir = '';
  let outside = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ftb-proj-'));
    outside = await mkdtemp(join(tmpdir(), 'ftb-out-'));
    await mkdir(join(dir, 'src'));
    await mkdir(join(dir, '.git'));
    await writeFile(join(dir, 'main.c'), 'int\tmain(void)\n{\n\treturn (0);\n}\n');
    await writeFile(join(dir, 'src', 'a.c'), 'int a;\n');
    await writeFile(join(dir, 'Makefile'), 'NAME = x\n');
    await writeFile(join(dir, 'notes.txt'), 'private');
    await writeFile(join(dir, '.git', 'config'), 'secret');
    await writeFile(join(outside, 'victim.c'), 'untouched');
    await symlink(outside, join(dir, 'link'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('rejects paths that could leave the project', () => {
    for (const bad of ['../x.c', '/etc/passwd', 'a/../../x.c', '.git/config', '', 'a//b.c', 'x\\\\y.c']) expect(safeRel(bad)).toBe(false);
    for (const ok of ['main.c', 'src/a.c', '.ft_blueprint/blueprint.json', 'libft/ft_strlen.c']) expect(safeRel(ok)).toBe(true);
  });

  it('reads sources, headers and Makefiles only', async () => {
    const p = await openProject(dir);
    expect(p.files.map((f) => f.path).sort()).toEqual(['Makefile', 'main.c', 'src/a.c']);
  });

  it('refuses to write a folder that was never opened', async () => {
    await expect(saveFiles(outside, [{ path: 'victim.c', text: 'x', base: null }])).rejects.toThrow(/not open/);
  });

  it('saves only over the version the page loaded, and never through a symlink out', async () => {
    const p = await openProject(dir);
    const main = p.files.find((f) => f.path === 'main.c')!;
    // someone edits main.c in nvim after it was loaded
    await writeFile(join(dir, 'main.c'), 'int\tmain(void)\n{\n\treturn (1);\n}\n');
    await utimes(join(dir, 'main.c'), new Date(), new Date(Date.now() + 5000));
    const r = await saveFiles(p.root, [{ path: 'main.c', text: 'mine', base: main.mtime }]);
    expect(r.saved).toEqual([]);
    expect(r.conflicts[0].path).toBe('main.c');
    expect(await readFile(join(dir, 'main.c'), 'utf8')).toContain('return (1)');
    // poll sees the outside edit
    const polled = await pollProject(p.root, { 'main.c': main.mtime, 'src/a.c': p.files.find((f) => f.path === 'src/a.c')!.mtime, Makefile: 0 });
    expect(polled.changed.map((f) => f.path).sort()).toEqual(['Makefile', 'main.c']);
    // a new blueprint file goes into .ft_blueprint/
    const ok = await saveFiles(p.root, [{ path: '.ft_blueprint/blueprint.json', text: '{}', base: null }]);
    expect(ok.saved).toHaveLength(1);
    await expect(saveFiles(p.root, [{ path: 'link/victim.c', text: 'pwned', base: null }])).rejects.toThrow(/outside/);
    await expect(saveFiles(p.root, [{ path: 'notes.txt', text: 'x', base: null }])).rejects.toThrow();
    expect(await readFile(join(outside, 'victim.c'), 'utf8')).toBe('untouched');
  });
});
