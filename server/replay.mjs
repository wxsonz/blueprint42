// The replay player (docs/OBJECTIVES.md, nice to have 10): the app built as
// one HTML file (vite.replay.config.mjs) into a throwaway temp directory,
// when a page asks for it (POST /api/replay/player). Kept until the app's
// code changes (the newest mtime under src/, index.html and the config).
// Nothing here touches the author's files.
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let cache = null; // { key, html }
let building = null;

async function newest(p) {
  const s = await stat(p);
  if (!s.isDirectory()) return s.mtimeMs;
  let m = s.mtimeMs;
  for (const e of await readdir(p)) m = Math.max(m, await newest(join(p, e)));
  return m;
}

export async function replayPlayer() {
  const key = String(Math.max(await newest(join(root, 'src')), await newest(join(root, 'index.html')), await newest(join(root, 'vite.replay.config.mjs'))));
  if (cache?.key === key) return { ok: true, html: cache.html };
  building ??= (async () => {
    const out = await mkdtemp(join(tmpdir(), 'b42-replay-'));
    try {
      const { build } = await import('vite');
      await build({ root, configFile: join(root, 'vite.replay.config.mjs'), logLevel: 'warn', build: { outDir: out, emptyOutDir: true } });
      cache = { key, html: await readFile(join(out, 'index.html'), 'utf8') };
    } finally {
      await rm(out, { recursive: true, force: true });
      building = null;
    }
  })();
  await building;
  return { ok: true, html: cache.html };
}
