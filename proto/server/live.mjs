// M6: live edits from any editor. An editor (the nvim plugin, or anything
// that can POST) pushes a file's current text and its cursor; every open
// page applies that to the view. The page doesn't care where an edit came
// from. The other way, a page can ask the editors to show a place in the
// code. Nothing here reads or writes the author's files: saving stays in
// the editor (and in the page's own confirmed Save).
//
// Both sides hold one POST /api/live/stream open and read newline-separated
// JSON from it; everything else is POST /api/live/push.
import { realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { openedRootOf, safeRel, wanted } from './project.mjs';

const MAX_TEXT = 1 << 20;
const MAX_FILES = 200;
const pages = new Set(); // res
const editors = new Map(); // res → source name
const latest = new Map(); // absolute path → { source, text, line, col } (unsaved text an editor has now)

const SOURCE = /^[\w.-]{1,24}$/;
const int = (v) => (Number.isInteger(v) && v >= 0 && v < 1e7 ? v : undefined);

function send(res, msg) {
  res.write(JSON.stringify(msg) + '\n');
}

function editorList() {
  return [...new Set(editors.values())].sort();
}

function toPages(msg) {
  for (const res of pages) send(res, msg);
}

// Where an absolute path sits in a folder the page opened: { root, rel }.
async function locate(path) {
  let real;
  try {
    real = await realpath(path);
  } catch {
    // a new buffer that isn't on disk yet: its folder is
    try {
      real = join(await realpath(dirname(path)), basename(path));
    } catch {
      return null;
    }
  }
  const root = openedRootOf(real);
  if (!root) return { root: null, rel: null, path: real };
  const rel = relative(root, real).split(sep).join('/');
  return safeRel(rel) && wanted(rel) ? { root, rel, path: real } : { root: null, rel: null, path: real };
}

function editMsg(source, at, e) {
  return { k: 'edit', source, path: at.path, root: at.root, rel: at.rel, ...(e.text !== undefined ? { text: e.text } : {}), ...(e.line !== undefined ? { line: e.line, col: e.col ?? 0 } : {}) };
}

// POST /api/live/stream { role: 'page' | 'editor', source }: stays open.
export async function liveStream(b, req, res) {
  const role = b?.role === 'editor' ? 'editor' : 'page';
  const source = typeof b?.source === 'string' && SOURCE.test(b.source) ? b.source : role;
  res.setHeader('content-type', 'application/x-ndjson');
  res.setHeader('cache-control', 'no-store');
  res.flushHeaders?.();
  if (role === 'page') {
    pages.add(res);
    send(res, { k: 'hello', editors: editorList() });
    // catch up: what the editors have unsaved right now
    for (const [path, e] of latest) {
      const at = await locate(path);
      if (at) send(res, editMsg(e.source, at, e));
    }
  } else {
    editors.set(res, source);
    send(res, { k: 'hello', pages: pages.size });
    toPages({ k: 'editors', editors: editorList() });
  }
  const ping = setInterval(() => send(res, { k: 'ping' }), 20_000);
  res.on('close', () => {
    clearInterval(ping);
    if (role === 'page') return void pages.delete(res);
    editors.delete(res);
    // an editor that went away took its unsaved text with it
    if (![...editors.values()].includes(source)) {
      for (const [path, e] of latest) if (e.source === source) {
        latest.delete(path);
        void locate(path).then((at) => at && toPages({ k: 'close', source, path: at.path, root: at.root, rel: at.rel }));
      }
    }
    toPages({ k: 'editors', editors: editorList() });
  });
}

// POST /api/live/push
//   from an editor: { source, kind: 'edit', path, text?, line?, col? }
//                   { source, kind: 'close', path }  (buffer gone: back to what's on disk)
//                   { source, kind: 'open', path }   (open this folder in the page)
//   from a page:    { kind: 'reveal', root, rel, line, col }  (show this place in the editors)
//                   { kind: 'replay' }  (what the editors have unsaved now, after opening a folder)
export async function livePush(b) {
  const kind = b?.kind;
  const source = typeof b?.source === 'string' && SOURCE.test(b.source) ? b.source : 'editor';
  if (kind === 'replay') {
    // a page that just opened a folder: the editors' unsaved text in it
    const edits = [];
    for (const [path, e] of latest) {
      const at = await locate(path);
      if (at?.root) edits.push(editMsg(e.source, at, e));
    }
    return { ok: true, edits, editors: editorList() };
  }
  if (kind === 'reveal') {
    const root = openedRootOf(typeof b.root === 'string' ? b.root : '');
    if (!root || root !== b.root || !safeRel(b.rel)) throw new Error('bad reveal');
    const msg = { k: 'reveal', path: join(root, ...b.rel.split('/')), line: int(b.line) ?? 0, col: int(b.col) ?? 0 };
    for (const res of editors.keys()) send(res, msg);
    return { ok: true, editors: editors.size };
  }
  if (typeof b?.path !== 'string' || !isAbsolute(b.path) || b.path.length > 1000 || b.path.includes('\0')) throw new Error('path must be absolute');
  if (kind === 'open') {
    toPages({ k: 'open', source, dir: b.path });
    return { ok: true, pages: pages.size };
  }
  const at = await locate(b.path);
  if (!at) return { ok: true, ignored: true };
  if (kind === 'close') {
    latest.delete(at.path);
    toPages({ k: 'close', source, path: at.path, root: at.root, rel: at.rel });
    return { ok: true };
  }
  if (kind !== 'edit') throw new Error('unknown kind');
  if (b.text !== undefined && (typeof b.text !== 'string' || b.text.length > MAX_TEXT)) throw new Error('bad text');
  const e = { source, text: b.text, line: int(b.line), col: int(b.col) };
  const prev = latest.get(at.path);
  if (e.text !== undefined || prev) {
    if (!prev && latest.size >= MAX_FILES) latest.delete(latest.keys().next().value);
    latest.set(at.path, { source, text: e.text ?? prev?.text, line: e.line ?? prev?.line, col: e.col ?? prev?.col });
  }
  toPages(editMsg(source, at, e));
  return { ok: true, pages: pages.size };
}
