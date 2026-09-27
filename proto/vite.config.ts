import { defineConfig, type Plugin } from 'vite';
import { traceMiddleware } from './server/trace.mjs';

// The trace server (M3) rides on the dev and preview servers: POST /api/trace.
const traceServer = (): Plugin => ({
  name: 'ftb-trace-server',
  configureServer(server) {
    server.middlewares.use(traceMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(traceMiddleware());
  },
});

// Samples live in ../samples and are bundled at build time (?raw imports).
// The page itself never touches the filesystem (SPEC principle 6); only the
// trace server writes, into a throwaway temp directory per run.
export default defineConfig({
  plugins: [traceServer()],
  server: { fs: { allow: ['..'] } },
});
