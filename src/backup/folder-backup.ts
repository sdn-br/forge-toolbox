// The backup in a local folder, run by the service worker: one file per profile, as the export of only this profile
// writes it, and a copy per day. FoE allows one session per world, so a merge is always safe: the first write of a
// session merges the profile's file and the conflict copies a sync tool left next to it into the database, writes the
// file anew and deletes the copies. That carries the data between computers sharing the folder (OneDrive).
import type { ToolboxDb } from '../background/db';
import { playerId } from '../shared/ids';
import { FOLDER_STATUS, type FolderStatus } from '../shared/messages';
import { type Profile, profileDbName, profileStorageKey } from '../shared/profile';
import { collectBackup, storedOfProfile } from './collect';
import type { RootFolder } from './folder';
import {
  DAILY_FOLDER,
  dailyFileName,
  dailyToDelete,
  folderFileName,
  profileFiles,
  profilesInFolder,
} from './folder-files';
import { gzipJson } from './gzip';
import { importBackup, readBackupFile } from './import';
import { type Area, DATA_AREAS } from './merge';

/** the profiles merged with the folder in this browser session, in chrome.storage.session */
const SYNCED = 'folder.synced';

/** what became of a request to write: no folder chosen, no permission, written, or nothing changed */
export type FolderResult = 'none' | 'paused' | 'written' | 'unchanged';

/** a part of chrome.storage */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface FolderBackupEnv {
  /** the chosen folder, undefined when none is chosen */
  folder(): Promise<RootFolder | undefined>;
  open(name: string): ToolboxDb;
  local: StorageArea;
  session: StorageArea;
  /** the profiles with a database here */
  localProfiles(): Promise<Profile[]>;
  now(): number;
  logError(what: string, error: unknown): void;
}

/** the permission is gone, typically after a browser restart before "Bei jedem Besuch zulassen" */
class Paused extends Error {}

const keyOf = ({ world, player }: Profile) => `${world}:${player}`;
const sameProfile = (a: Profile) => (b: Profile) => a.world === b.world && a.player === b.player;
const isRefused = (error: unknown) =>
  error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError');

export class FolderBackup {
  /** one folder operation at a time: two writes of the same file must not interleave */
  private queue: Promise<unknown> = Promise.resolve();
  /** the profile entry written last per profile, to skip a write that would store the same */
  private last = new Map<string, string>();

  constructor(private env: FolderBackupEnv) {}

  /** At the start of the game: merges the folder into the profile and writes it anew. */
  start(profile: Profile): Promise<FolderResult> {
    return this.run([profile], async (folder) => {
      await this.sync(folder, profile, true);
      return 'written';
    }).then(([result]) => result ?? 'none');
  }

  /** After a change of backed up data: writes the profile, merged first when this session has not merged it yet. */
  changed(profile: Profile): Promise<FolderResult> {
    return this.run([profile], async (folder) => {
      if (!(await this.synced()).includes(keyOf(profile))) {
        await this.sync(folder, profile, true);
        return 'written';
      }
      return (await this.write(folder, profile, false)) ? 'written' : 'unchanged';
    }).then(([result]) => result ?? 'none');
  }

  /**
   * Right after the folder was chosen: merges every profile found in it, also one this computer does not have yet,
   * and writes every profile there is. Returns the profiles whose rows the merge changed.
   */
  async chosen(): Promise<Profile[]> {
    this.last.clear();
    await this.env.session.set({ [SYNCED]: [] });
    const changed: Profile[] = [];
    await this.run([], async (folder) => {
      const local = await this.env.localProfiles();
      const found = profilesInFolder(await folder.files()).filter((p) => !local.some(sameProfile(p)));
      for (const profile of [...local, ...found]) {
        if (await this.sync(folder, profile, local.some(sameProfile(profile)))) changed.push(profile);
      }
      return 'written';
    });
    return changed;
  }

  /** The data page got the permission back: writes the profiles that waited. Returns those the merge changed. */
  async granted(): Promise<Profile[]> {
    const { pending } = await this.status();
    const changed: Profile[] = [];
    await this.run(pending, async (folder, profile) => {
      if (profile && (await this.sync(folder, profile, true))) changed.push(profile);
      return 'written';
    });
    return changed;
  }

  /**
   * Runs `fn` on the folder, once per profile or once without one, behind the operations before. Without permission
   * it remembers the profiles and pauses the backup.
   */
  private run(
    profiles: Profile[],
    fn: (folder: RootFolder, profile: Profile | undefined) => Promise<FolderResult>,
  ): Promise<FolderResult[]> {
    const next = this.queue.then(async () => {
      const folder = await this.env.folder();
      if (!folder) return profiles.map(() => 'none' as const);
      try {
        if ((await folder.permission()) !== 'granted') throw new Paused();
        const results: FolderResult[] = [];
        for (const profile of profiles.length ? profiles : [undefined]) results.push(await fn(folder, profile));
        // a profile that waited and was not written here stays waiting for its next write
        const before = await this.status();
        const pending = before.pending.filter((p) => !profiles.some(sameProfile(p)));
        const written = results.includes('written');
        if (written || before.paused || pending.length !== before.pending.length) {
          const lastWrite = written ? this.env.now() : before.lastWrite;
          await this.setStatus({ ...(lastWrite !== undefined && { lastWrite }), paused: false, pending });
        }
        return results;
      } catch (error) {
        if (!(error instanceof Paused) && !isRefused(error)) throw error;
        const { lastWrite, pending } = await this.status();
        const waiting = [...pending, ...profiles.filter((p) => !pending.some(sameProfile(p)))];
        await this.setStatus({ ...(lastWrite !== undefined && { lastWrite }), paused: true, pending: waiting });
        return profiles.map(() => 'paused' as const);
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /**
   * Merges the profile's main file and its conflict copies into the database, then writes the file anew and deletes
   * the copies it merged. A file that cannot be read or holds no entry of the profile stays. Without any file merged a
   * profile that is not here (`write` false) is left alone. Returns whether the merge changed any row or setting.
   */
  private async sync(folder: RootFolder, profile: Profile, write: boolean): Promise<boolean> {
    const { main, conflicts } = profileFiles(await folder.files(), profile);
    const merged: string[] = [];
    let changed = false;
    for (const name of [main, ...conflicts]) {
      if (name === undefined) continue;
      try {
        if (await this.merge(await folder.read(name), profile)) changed = true;
        merged.push(name);
      } catch (error) {
        if (isRefused(error)) throw error;
        this.env.logError(`reading ${name} from the backup folder failed`, error);
      }
    }
    if (!write && merged.length === 0) return false;
    await this.write(folder, profile, true);
    for (const name of merged) if (name !== main) await folder.remove(name);
    const synced = await this.synced();
    if (!synced.includes(keyOf(profile))) await this.env.session.set({ [SYNCED]: [...synced, keyOf(profile)] });
    return changed;
  }

  /** merges the profile's entry of one file, as the import "Zusammenführen" does; throws when there is none */
  private async merge(file: Blob, profile: Profile): Promise<boolean> {
    const read = await readBackupFile(file);
    if (!read.ok) throw new Error(read.error);
    const entry = read.backup.profiles.find((p) => p.world === profile.world && p.player === profile.player);
    if (!entry) throw new Error('no entry of the profile');
    const settingsKey = profileStorageKey('settings', profile);
    const hasSettings = (await this.env.local.get([settingsKey]))[settingsKey] !== undefined;
    // the settings carry no time, the own ones stay; only a profile without any takes them
    const areas = new Set<Area>([...DATA_AREAS, ...(entry.settings && !hasSettings ? ['settings' as const] : [])]);
    const { open, local } = this.env;
    const counts = await importBackup(
      [{ profile: { ...entry, player: playerId(profile.player) }, areas }],
      read.backup.createdAt,
      { open, get: (keys) => local.get(keys), set: (items) => local.set(items) },
    );
    return counts.pvp + counts.notes + counts.greatBuildings + counts.players + counts.settings > 0;
  }

  /**
   * Writes the profile as its export does, to the main file and the copy of the day, and drops the daily copies past
   * the last seven. Unless forced, a write that would store the same as the one before is skipped.
   */
  private async write(folder: RootFolder, profile: Profile, force: boolean): Promise<boolean> {
    const { open, local, now } = this.env;
    const db = open(profileDbName(profile));
    const at = now();
    const backup = await collectBackup(
      [{ ...profile, ...(await storedOfProfile(profile, (keys) => local.get(keys))), db }],
      at,
    ).finally(() => db.close());
    const json = JSON.stringify(backup.profiles[0]);
    if (!force && this.last.get(keyOf(profile)) === json) return false;
    const file = await gzipJson(backup);
    await folder.write(folderFileName(profile), file);
    const daily = await folder.subfolder(DAILY_FOLDER);
    await daily.write(dailyFileName(profile, at), file);
    for (const name of dailyToDelete(await daily.files(), profile)) await daily.remove(name);
    this.last.set(keyOf(profile), json);
    return true;
  }

  private async synced(): Promise<string[]> {
    return ((await this.env.session.get([SYNCED]))[SYNCED] as string[] | undefined) ?? [];
  }

  private async status(): Promise<FolderStatus> {
    const stored = (await this.env.local.get([FOLDER_STATUS]))[FOLDER_STATUS] as FolderStatus | undefined;
    return { paused: false, pending: [], ...stored };
  }

  private async setStatus(status: FolderStatus): Promise<void> {
    await this.env.local.set({ [FOLDER_STATUS]: status });
  }
}
