// The signal that persisted data changed: Dexie hooks on the export tables count the writes that change what the
// backup holds (`BACKUP_CHANGES`). A change number per profile goes to the game tab of the profile, for its backup copy,
// and makes the backup in a local folder due. The backups need not know which events of the game lead to such a write.
import Dexie from 'dexie';
import { BACKUP_CHANGES } from '../backup/format';
import type { Profile } from '../shared/profile';
import type { ToolboxDb } from './db';

const keyOf = ({ world, player }: Profile) => `${world}:${player}`;

/** whether a key path of a Dexie modification is one of the fields or lies inside one */
const touches = (fields: readonly string[], path: string) => fields.some((f) => path === f || path.startsWith(`${f}.`));

/**
 * Installs hooks on the export tables of `db`. `changed` runs once per row whose write changes the backup, after the
 * write went through. A write that stores the same row again counts as none.
 */
export function watchBackupTables(db: ToolboxDb, changed: () => void): void {
  for (const [name, rule] of Object.entries(BACKUP_CHANGES)) {
    const fields: readonly string[] | undefined = rule === 'every' ? undefined : rule;
    const counts = (row: Record<string, unknown>) => !fields || fields.some((f) => row[f] !== undefined);
    const table = db.table(name);
    table.hook('creating', function (_key, row) {
      if (counts(row)) this.onsuccess = changed;
    });
    table.hook('deleting', function (_key, row) {
      // a delete of a key that is not there finds no row
      if (row !== undefined && counts(row)) this.onsuccess = changed;
    });
    table.hook('updating', function (modifications, _key, before) {
      // Dexie names an array or other non plain object as modified whenever it is a new one, even with equal content
      const paths = Object.entries(modifications)
        .filter(([path, value]) => JSON.stringify(Dexie.getByKeyPath(before, path)) !== JSON.stringify(value))
        .map(([path]) => path);
      if (fields ? paths.some((p) => touches(fields, p)) : paths.length > 0) this.onsuccess = changed;
    });
  }
}

export interface PersistedEnv {
  now(): number;
  /** tells the game tabs of the profile that its rows changed, once per burst of writes, with the change number */
  notify(profile: Profile, change: number): void;
  /** the backup in a local folder of the profile is due; a later call replaces the earlier one */
  folderDue(profile: Profile): void;
}

/**
 * Counts the changes of each profile's backed up data. The change number rises with each change and never falls below
 * the clock it started at, so it keeps rising when the service worker starts anew and counts from scratch. A backup
 * that holds the number it was written at is due again once the number moved on.
 */
export class PersistedSignal {
  private changes = new Map<string, number>();
  /** the profiles changed since the last flush, and whether rows changed (settings alone do not go to the tab) */
  private waiting = new Map<string, { profile: Profile; rows: boolean }>();

  constructor(private env: PersistedEnv) {}

  /** the change number of the profile */
  current(profile: Profile): number {
    const key = keyOf(profile);
    let change = this.changes.get(key);
    if (change === undefined) {
      change = this.env.now();
      this.changes.set(key, change);
    }
    return change;
  }

  /** a row of the export changed; the tab hears of it, the tab's settings reach its backup copy on their own */
  rowsChanged(profile: Profile): void {
    this.count(profile, true);
  }

  /** the stored settings of the profile changed; only the folder is due */
  settingsChanged(profile: Profile): void {
    this.count(profile, false);
  }

  private count(profile: Profile, rows: boolean) {
    const key = keyOf(profile);
    this.changes.set(key, Math.max(this.current(profile) + 1, this.env.now()));
    // a bulk write runs the hooks once per row: the tab and the folder hear of it once
    if (this.waiting.size === 0) setTimeout(() => this.flush(), 0);
    const before = this.waiting.get(key);
    this.waiting.set(key, { profile, rows: rows || (before?.rows ?? false) });
  }

  private flush() {
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const { profile, rows } of waiting) {
      if (rows) this.env.notify(profile, this.current(profile));
      this.env.folderDue(profile);
    }
  }
}

/** The game tab of each profile, as its calls name it. A tab shows one game; a reload may bring another profile. */
export class ProfileTabs {
  private tabs = new Map<number, string>();

  /** a call of the profile came from the tab */
  seen(profile: Profile, tab: number | undefined): void {
    if (tab !== undefined) this.tabs.set(tab, keyOf(profile));
  }

  /** the tab was closed */
  forget(tab: number): void {
    this.tabs.delete(tab);
  }

  of(profile: Profile): number[] {
    const key = keyOf(profile);
    return [...this.tabs].filter(([, k]) => k === key).map(([tab]) => tab);
  }
}
