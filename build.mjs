import { context } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';

const watch = process.argv.includes('--watch');

const options = {
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  loader: { '.css': 'text' },
  logLevel: 'info',
};

await mkdir('dist', { recursive: true });
await cp('static', 'dist', { recursive: true });
const contexts = await Promise.all([
  context({
    ...options,
    entryPoints: {
      proxy: 'src/proxy/index.ts',
      content: 'src/content/index.ts',
      background: 'src/background/index.ts',
    },
  }),
  // The marker reads `this` of the game's frames from V8 call sites, and V8 hides it below a strict mode frame.
  // Without "use strict" its own frames stay sloppy; type checking stays strict.
  context({
    ...options,
    entryPoints: { marker: 'src/marker/index.ts' },
    tsconfigRaw: { compilerOptions: { alwaysStrict: false } },
  }),
]);
if (watch) await Promise.all(contexts.map((ctx) => ctx.watch()));
else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
