// Serve the app from a git ref (a temporary worktree) or from the working
// tree, on a free port, for tools that compare or measure two versions.
// Nothing is written inside the repo: worktrees go in the OS temp dir and
// are removed by `close()`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as net } from 'node:net';
import { createServer } from 'vite';

const freePort = () => new Promise((res, rej) => { const s = net(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); }); });

export const REPO = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();

// ref: a commit-ish, or 'WORK' for the working tree as it is on disk
export async function serve(ref) {
  let root = REPO;
  let tmp = null;
  if (ref !== 'WORK') {
    const sha = git('rev-parse', '--verify', `${ref}^{commit}`);
    tmp = mkdtempSync(join(tmpdir(), 'b42-ref-'));
    root = join(tmp, 'tree');
    git('worktree', 'add', '--detach', root, sha);
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'));
  }
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), logLevel: 'error', server: { port: await freePort(), strictPort: true, host: '127.0.0.1', hmr: false } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  return {
    url,
    ref,
    async close() {
      await server.close();
      if (tmp) {
        try { git('worktree', 'remove', '--force', root); } catch { /* already gone */ }
        git('worktree', 'prune');
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  };
}
