// The replay player (docs/OBJECTIVES.md, nice to have 10; src/replay.ts):
// the app built as ONE html file, everything inlined (scripts, styles, the
// tree-sitter wasm as data: URLs), so a replay opens from disk with no
// server. Built on demand by the trace server (GET /api/replay/player); the
// page adds the replay's JSON to it. Fonts still come from Google Fonts
// when online (without them the skins fall back to local fonts).
import { defineConfig } from 'vite';

const inline = () => ({
  name: 'b42-inline',
  enforce: 'post',
  generateBundle(_, bundle) {
    const html = Object.values(bundle).find((f) => f.fileName.endsWith('.html'));
    if (!html) return;
    let src = String(html.source);
    for (const [name, f] of Object.entries(bundle)) {
      if (f === html) continue;
      const ref = new RegExp(`<script[^>]*src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`);
      const css = new RegExp(`<link[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`);
      if (f.type === 'chunk' && ref.test(src)) src = src.replace(ref, () => `<script type="module">${f.code.replace(/<\/script/gi, '<\\/script')}</script>`);
      else if (f.type === 'asset' && name.endsWith('.css') && css.test(src)) src = src.replace(css, () => `<style>${String(f.source)}</style>`);
      else continue;
      delete bundle[name];
    }
    html.source = src;
  },
});

export default defineConfig({
  plugins: [inline()],
  build: {
    outDir: 'dist-replay',
    emptyOutDir: true,
    assetsInlineLimit: () => true, // every asset as a data: URL
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: { codeSplitting: false },
      // (web-tree-sitter's own eval: not ours, and nothing to act on)
      onwarn(w, warn) { if (w.code !== 'EVAL') warn(w); },
    },
  },
});
