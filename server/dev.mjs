// `npm run dev -- [folder] [vite flags]`: the dev server, opening that folder
// the way `code <folder>` does. A relative folder is relative to where npm
// was run from, not to the repo root.
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const argv = process.argv.slice(2);
let folder = null;
let port;
let host;
let strictPort = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--port') port = Number(argv[++i]);
  else if (a.startsWith('--port=')) port = Number(a.slice(7));
  else if (a === '--strictPort') strictPort = true;
  else if (a === '--host') host = argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : true;
  else if (!a.startsWith('-')) folder = a;
}
if (folder) {
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), folder.replace(/^~(?=$|\/)/, process.env.HOME ?? '~'));
  const s = await stat(path).catch(() => null);
  if (!s?.isDirectory()) {
    console.error(`blueprint42: ${path} is not a folder`);
    process.exit(1);
  }
  process.env.FTB_OPEN = path;
}
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { ...(port ? { port } : {}), ...(host !== undefined ? { host } : {}), strictPort },
});
await server.listen();
server.printUrls();
if (folder) console.log(`  ➜  Opening:  ${process.env.FTB_OPEN}`);
server.bindCLIShortcuts({ print: true });
