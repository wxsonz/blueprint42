import { defineConfig } from 'vite';

// Samples live in ../samples and are bundled at build time (?raw imports).
// No runtime filesystem access (SPEC principle 6).
export default defineConfig({
  server: { fs: { allow: ['..'] } },
});
