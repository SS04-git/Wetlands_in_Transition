import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// The experience fetches the Earth model and the full-resolution maps at runtime from /assets.
// Vite only bundles what is imported, so copy those (unchanged) into the build output.
const copyRuntimeAssets = () => ({
  name: 'copy-runtime-assets',
  apply: 'build',
  closeBundle() {
    for (const rel of ['assets/earth.opt.glb', 'assets/maps']) {
      const from = resolve(root, rel);
      if (existsSync(from)) cpSync(from, resolve(root, 'dist', rel), { recursive: true });
    }
  },
});

// Entry pages:
//   index.html         Wetlands in Transition - the scroll-driven 3D experience
//   index-legacy.html  the earlier site, kept unchanged
//   lighttable.html    the Light Table prototype
export default defineConfig({
  server: { port: 5173, strictPort: true },
  plugins: [copyRuntimeAssets()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        legacy: resolve(root, 'index-legacy.html'),
        lighttable: resolve(root, 'lighttable.html'),
      },
    },
  },
});
