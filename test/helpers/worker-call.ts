import { openDb, type ToolboxDb } from '../../src/background/db';
import { watchBackupTables } from '../../src/background/persisted';
import { profileDispatch, workerCall } from '../../src/background/profiles';
import type { ProfileCall } from '../../src/shared/rpc';

/**
 * The calls into the profile databases as the service worker serves them, with the hooks of the backups on each
 * database; `changes` counts the writes that change a backup.
 */
export function workerCalls(open: (name: string) => ToolboxDb = openDb): { call: ProfileCall; changes: () => number } {
  let changes = 0;
  const dispatch = profileDispatch({
    open,
    watch: (_profile, db) =>
      watchBackupTables(db, () => {
        changes++;
      }),
    prepare: async () => {},
    deps: { now: () => 1000, fetchText: async () => '' },
    logError: () => {},
  });
  return { call: workerCall(dispatch), changes: () => changes };
}
