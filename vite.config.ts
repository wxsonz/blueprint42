import { defineConfig, type Plugin } from 'vite';
import { traceMiddleware } from './server/trace.mjs';

// The trace server (M3) rides on the dev and preview servers: POST /api/trace,
// and (M5) the project file routes under /api/fs/. FTB_OPEN is the folder
// named on the command line (server/dev.mjs).
const traceServer = (): Plugin => ({
  name: 'ftb-trace-server',
  configureServer(server) {
    server.middlewares.use(traceMiddleware({ initial: process.env.FTB_OPEN || null }));
  },
  configurePreviewServer(server) {
    server.middlewares.use(traceMiddleware({ initial: process.env.FTB_OPEN || null }));
  },
});

// Samples live in samples/ and are bundled at build time (?raw imports).
// The page never touches the filesystem itself: the trace server builds in a
// throwaway temp directory, and (M5) server/project.mjs reads an opened
// folder and writes to it only when the author confirms a save.
export default defineConfig({
  plugins: [traceServer()],
});
