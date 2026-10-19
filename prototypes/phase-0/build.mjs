import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await build({
  entryPoints: { proxy: 'src/proxy.ts', content: 'src/content.ts', background: 'src/background.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
});
await copyFile('manifest.json', 'dist/manifest.json');
