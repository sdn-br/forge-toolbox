import { context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
const ctx = await context({
  entryPoints: { proxy: 'src/proxy/index.ts', content: 'src/content/index.ts', background: 'src/background/index.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  loader: { '.css': 'text' },
  logLevel: 'info',
});
if (watch) await ctx.watch();
else {
  await ctx.rebuild();
  await ctx.dispose();
}
