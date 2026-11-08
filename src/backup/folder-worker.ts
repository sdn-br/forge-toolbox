// The backup folder in the service worker: the alarm that makes a write due, and the handlers of the chrome events
// around the folder (its alarm, the data page choosing or granting it). The entry of the service worker only wires the
// events to these functions.

import { openDb } from '../background/db';
import type { LocalStorage } from '../background/legacy';
import { logError } from '../content/core/log';
import { type DataImported, dataImported, FOLDER_CHOSEN, FOLDER_GRANTED, isFolderRequest } from '../shared/messages';
import { type Profile, profileOfDbName, profileOfStorageKey, profileStorageKey } from '../shared/profile';
import { handleFolder, loadFolderHandle } from './folder';
import { FolderBackup } from './folder-backup';

/** how long after the last change the backup folder is written, as the copy on the game page */
export const FOLDER_DELAY = 30_000;

/**
 * The service worker writes the folder on a `chrome.alarms` alarm per profile: a timer would die with the worker, which
 * the browser stops after half a minute without events, and creating the alarm again moves it on.
 */
export const folderAlarm = (profile: Profile): string => profileStorageKey('folder', profile);

/** the profile of an alarm of `folderAlarm`, null for any other alarm */
export const profileOfFolderAlarm = (name: string): Profile | null => profileOfStorageKey(name, 'folder');

/** Plans the write of the folder of the profile for `FOLDER_DELAY` from now; an earlier plan is replaced. */
export function planFolderWrite(profile: Profile): void {
  chrome.alarms
    .create(folderAlarm(profile), { when: Date.now() + FOLDER_DELAY })
    .catch((error) => logError('planning the write of the backup folder failed', error));
}

/**
 * Tells every tab of the game which profiles an import changed; a tab of one of them offers a reload. Without the
 * "tabs" permission the tabs come without their URL, so the message goes to all of them; a tab without the content
 * script refuses it.
 */
export async function notifyGameTabs(message: DataImported): Promise<void> {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

export interface FolderServiceEnv {
  local: LocalStorage;
  /** the change number of the profile's backed up data */
  change(profile: Profile): number;
}

/** the service worker writes the backup folder itself, through the handle the data page stored */
export function folderService({ local, change }: FolderServiceEnv) {
  const backup = new FolderBackup({
    folder: async () => {
      const handle = await loadFolderHandle();
      return handle && handleFolder(handle);
    },
    open: openDb,
    local,
    session: { get: (keys) => chrome.storage.session.get(keys), set: (items) => chrome.storage.session.set(items) },
    localProfiles: async () =>
      (await indexedDB.databases()).flatMap(({ name }) => {
        const profile = profileOfDbName(name ?? '');
        return profile ? [profile] : [];
      }),
    now: Date.now,
    change,
    logError,
  });

  /** the data page chose or granted the folder: the merge may have changed profiles an open game holds in memory */
  const announce = (profiles: Profile[]) => {
    if (profiles.length)
      notifyGameTabs(dataImported(profiles)).catch((e) => logError('notifying the game tabs failed', e));
    return { ok: true, profiles: profiles.length };
  };

  return {
    /** a `chrome.alarms` alarm: the folder of its profile is due */
    onAlarm(name: string): void {
      const profile = profileOfFolderAlarm(name);
      if (profile) backup.changed(profile).catch((error) => logError('the backup folder failed', error));
    },
    /** a message of the data page about the folder; false when it is none, else the answer comes through `respond` */
    onMessage(message: unknown, respond: (res: unknown) => void): boolean {
      if (isFolderRequest(message)) {
        backup
          .start(message.profile)
          .catch((error) => {
            logError('the backup folder failed', error);
            return 'failed';
          })
          .then(respond);
        return true;
      }
      if (message === FOLDER_CHOSEN || message === FOLDER_GRANTED) {
        (message === FOLDER_CHOSEN ? backup.chosen() : backup.granted())
          .then(announce, (error) => {
            logError('the backup folder failed', error);
            return { ok: false, profiles: 0 };
          })
          .then(respond);
        return true;
      }
      return false;
    },
  };
}
