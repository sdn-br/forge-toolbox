import { defineConfig } from 'vitest/config';

export default defineConfig({
  // fake-indexeddb first, Dexie looks for IndexedDB when it is imported
  test: { include: ['test/**/*.test.ts'], environment: 'node', setupFiles: ['fake-indexeddb/auto'] },
});
