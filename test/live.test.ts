// M6: live edits over the real routes (server/live.mjs behind the trace
// middleware): editor → page edits, page → editor reveals, catch-up, and an
// editor that goes away taking its unsaved text with it.
import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openProject } from '../server/project.mjs';
import { traceMiddleware } from '../server/trace.mjs';

let server: Server;
let base = '';
let dir = '';
let root = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ftb-live-'));
  await writeFile(join(dir, 'main.c'), 'int\tmain(void)\n{\n\treturn (0);\n}\n');
  root = (await openProject(dir)).root;
  const mw = traceMiddleware();
  server = createServer((req, res) => void mw(req, res, () => ((res.statusCode = 404), res.end())));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const a = server.address();
  base = `http://localhost:${typeof a === 'object' && a ? a.port : 0}`;
});
afterAll(async () => {
  server.closeAllConnections();
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const H = { 'content-type': 'application/json', 'x-ftb': '1' };
const push = async (b: unknown) => (await fetch(`${base}/api/live/push`, { method: 'POST', headers: H, body: JSON.stringify(b) })).json();

// Open a stream and collect its messages; `next(k)` waits for one of a kind.
function open(body: unknown) {
  const ctrl = new AbortController();
  const got: Record<string, unknown>[] = [];
  const waiters: [string, (m: Record<string, unknown>) => void][] = [];
  const ready = fetch(`${base}/api/live/stream`, { method: 'POST', headers: H, body: JSON.stringify(body), signal: ctrl.signal }).then(async (res) => {
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += value;
          for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
            const m = JSON.parse(buf.slice(0, i));
            buf = buf.slice(i + 1);
            got.push(m);
            for (const w of waiters.splice(0)) (w[0] === m.k ? w[1](m) : waiters.push(w));
          }
        }
      } catch { /* aborted */ }
    })();
  });
  const next = (k: string) => {
    const seen = got.find((m) => m.k === k && !(m as { _used?: boolean })._used);
    if (seen) return Promise.resolve(Object.assign(seen, { _used: true }));
    return new Promise<Record<string, unknown>>((r) => waiters.push([k, (m) => r(Object.assign(m, { _used: true }))]));
  };
  return { ready, next, close: () => ctrl.abort(), got };
}

describe('live edits (M6)', () => {
  it('needs our header, like every other route', async () => {
    const r = await fetch(`${base}/api/live/push`, { method: 'POST', body: '{}' });
    expect(r.status).toBe(403);
  });

  it('carries an editor’s text and cursor to the page, and a reveal back', async () => {
    const page = open({ role: 'page' });
    await page.ready;
    expect((await page.next('hello')).editors).toEqual([]);
    const ed = open({ role: 'editor', source: 'nvim' });
    await ed.ready;
    await ed.next('hello');
    expect((await page.next('editors')).editors).toEqual(['nvim']);

    const text = 'int\tmain(void)\n{\n\treturn (42);\n}\n';
    await push({ source: 'nvim', kind: 'edit', path: join(dir, 'main.c'), text, line: 2, col: 1 });
    const e = await page.next('edit');
    expect(e).toMatchObject({ source: 'nvim', root, rel: 'main.c', text, line: 2, col: 1 });

    // a file outside the folder is passed on without a project path
    await push({ source: 'nvim', kind: 'edit', path: '/etc/hosts.c', text: 'x' });
    expect(await page.next('edit')).toMatchObject({ root: null, rel: null });

    // double-click on the grid → the editor jumps there
    const r = await push({ kind: 'reveal', root, rel: 'main.c', line: 3, col: 0 });
    expect(r.editors).toBe(1);
    expect(await ed.next('reveal')).toMatchObject({ path: join(root, 'main.c'), line: 3 });
    await expect(push({ kind: 'reveal', root: '/', rel: 'etc/passwd', line: 0 })).resolves.toMatchObject({ ok: false });

    // a page that comes later (a reload) catches up on unsaved text
    const late = open({ role: 'page' });
    await late.ready;
    expect((await late.next('edit')).text).toBe(text);
    const replay = await push({ kind: 'replay' });
    expect(replay.edits).toHaveLength(1);

    // the editor goes away: its unsaved text goes with it
    ed.close();
    expect(await page.next('close')).toMatchObject({ rel: 'main.c', source: 'nvim' });
    expect((await page.next('editors')).editors).toEqual([]);
    expect((await push({ kind: 'replay' })).edits).toHaveLength(0);
    page.close();
    late.close();
  });

  it('asks the page to open a folder (:FtbOpen)', async () => {
    const page = open({ role: 'page' });
    await page.ready;
    await page.next('hello');
    await push({ source: 'nvim', kind: 'open', path: dir });
    expect(await page.next('open')).toMatchObject({ dir });
    await expect(push({ source: 'nvim', kind: 'open', path: 'relative/dir' })).resolves.toMatchObject({ ok: false });
    page.close();
  });
});
