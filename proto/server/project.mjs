// M5: open a real project. This is the only code that reads or writes the
// author's files. Reads cover C sources, headers, Makefiles and the
// .ft_blueprint/ folder; writes happen only when the page asks after the
// author confirmed a save, only inside a folder opened this session, only to
// those same kinds of files, and never over a file that changed on disk
// since it was loaded (unless the author chose to overwrite).
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';

export const META = '.ft_blueprint';
const MAX_FILES = 800;
const MAX_FILE = 1 << 20;
const MAX_TOTAL = 16 << 20;
const MAX_DEPTH = 8;
const MAKEFILES = new Set(['Makefile', 'makefile', 'GNUmakefile']);
const SKIP = new Set(['node_modules', '.git']);

const opened = new Set(); // real paths of folders opened this session

// Which project-relative paths the tool reads (and may later write).
export function wanted(rel) {
  const parts = rel.split('/');
  const name = parts[parts.length - 1];
  if (parts[0] === META) return parts.length === 2 && (/^[\w.-]+\.json$/.test(name) || name === 'main.c');
  return /\.[ch]$/.test(name) || MAKEFILES.has(name);
}

// A project-relative path the page may name: no absolute paths, no "..",
// no empty or hidden segments except the tool's own folder.
export function safeRel(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 400 || rel.includes('\\') || rel.includes('\0')) return false;
  const parts = rel.split('/');
  return parts.every((p, i) => p && p !== '.' && p !== '..' && (!p.startsWith('.') || (i === 0 && p === META)) && /^[\w.+@ -]+$/.test(p));
}

const inside = (root, full) => full === root || full.startsWith(root + sep);

async function walk(root) {
  const out = [];
  let total = 0;
  const queue = [['', 0]];
  while (queue.length) {
    const [rel, depth] = queue.shift();
    let entries;
    try {
      entries = await readdir(join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP.has(e.name) || (e.name.startsWith('.') && !(e.name === META && !rel)) || depth >= MAX_DEPTH) continue;
        queue.push([path, depth + 1]);
      } else if (e.isFile() && safeRel(path) && wanted(path)) {
        const s = await stat(join(root, path));
        if (s.size > MAX_FILE) continue;
        total += s.size;
        if (out.length >= MAX_FILES || total > MAX_TOTAL) return { files: out, truncated: true };
        out.push({ path, mtime: s.mtimeMs, size: s.size });
      }
    }
  }
  return { files: out, truncated: false };
}

export async function listDir(dir) {
  const d = await realpath(resolve(dir || homedir()));
  const entries = await readdir(d, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name).sort((a, b) => a.localeCompare(b));
  const project = entries.some((e) => e.isFile() && (/\.[ch]$/.test(e.name) || MAKEFILES.has(e.name)));
  const parent = dirname(d);
  return { dir: d, parent: parent !== d ? parent : null, dirs, project, home: homedir() };
}

export async function openProject(dir) {
  const root = await realpath(resolve(String(dir)));
  if (!(await stat(root)).isDirectory()) throw new Error('not a folder');
  const { files, truncated } = await walk(root);
  opened.add(root);
  const withText = await Promise.all(files.map(async (f) => ({ ...f, text: await readFile(join(root, f.path), 'utf8') })));
  return { root, name: basename(root), files: withText, truncated };
}

function openedRoot(root) {
  if (typeof root !== 'string' || !opened.has(root)) throw new Error('that folder is not open');
  return root;
}

// Changes on disk since the page last looked: edits made in another editor.
export async function pollProject(root, known) {
  root = openedRoot(root);
  const { files } = await walk(root);
  const changed = [];
  const seen = new Set();
  for (const f of files) {
    seen.add(f.path);
    if (known?.[f.path] === f.mtime) continue;
    changed.push({ ...f, text: await readFile(join(root, f.path), 'utf8') });
  }
  const removed = Object.keys(known ?? {}).filter((p) => !seen.has(p));
  return { changed, removed };
}

// writes: [{ path, text, base }] where base is the mtime the page loaded
// (null for a file that should not exist yet). All or nothing: any conflict
// and nothing is written, unless force.
export async function saveFiles(root, writes, force = false) {
  root = openedRoot(root);
  if (!Array.isArray(writes) || !writes.length || writes.length > 200) throw new Error('bad request: writes');
  const plan = [];
  const conflicts = [];
  for (const w of writes) {
    if (!w || !safeRel(w.path) || !wanted(w.path) || typeof w.text !== 'string' || w.text.length > MAX_FILE) throw new Error(`cannot write ${String(w?.path)}`);
    const full = join(root, w.path);
    if (!inside(root, full)) throw new Error(`cannot write ${w.path}`);
    // The folder chain must stay inside the project (no symlinked escape).
    // Its nearest existing folder is inside root lexically, so this ends at root at the latest.
    for (let p = dirname(full); ; p = dirname(p)) {
      let real;
      try {
        real = await realpath(p);
      } catch (e) {
        if (e.code === 'ENOENT') continue;
        throw e;
      }
      if (!inside(root, real)) throw new Error(`cannot write ${w.path}: outside the project`);
      break;
    }
    let current = null;
    try {
      const l = await lstat(full);
      if (l.isSymbolicLink()) {
        const real = await realpath(full);
        if (!inside(root, real)) throw new Error(`cannot write ${w.path}: it links outside the project`);
      }
      if (!l.isFile() && !l.isSymbolicLink()) throw new Error(`cannot write ${w.path}: not a file`);
      current = (await stat(full)).mtimeMs;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (current !== (w.base ?? null) && !force) {
      conflicts.push({ path: w.path, mtime: current, text: current === null ? null : await readFile(full, 'utf8') });
    }
    plan.push({ full, w });
  }
  if (conflicts.length) return { saved: [], conflicts };
  const saved = [];
  for (const { full, w } of plan) {
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, w.text);
    saved.push({ path: w.path, mtime: (await stat(full)).mtimeMs });
  }
  return { saved, conflicts: [] };
}
