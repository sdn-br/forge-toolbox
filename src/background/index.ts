import { handleFolder, loadFolderHandle } from '../backup/folder';
import { FolderBackup } from '../backup/folder-backup';
import { logError } from '../content/core/log';
import {
  type DataImported,
  dataImported,
  FOLDER_CHOSEN,
  FOLDER_GRANTED,
  isDataImported,
  isFolderRequest,
  OPEN_DATA_PAGE,
  persisted,
} from '../shared/messages';
import { type Profile, profileOfDbName } from '../shared/profile';
import type { RpcResponse } from '../shared/rpc';
import { openDb } from './db';
import { adoptLegacy, type LocalStorage } from './legacy';
import { PersistedSignal, ProfileTabs, watchBackupTables } from './persisted';
import { isRpcRequest, profileDispatch } from './profiles';

const storage: LocalStorage = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

// the game tab of each profile, as its calls name it; empty after a restart of the worker until the tab calls again,
// and the rows a tab changes come through its calls
const tabs = new ProfileTabs();
chrome.tabs.onRemoved.addListener((tab) => tabs.forget(tab));

const signal = new PersistedSignal({
  now: Date.now,
  notify: (profile, change) => {
    // a tab that refuses has no content script any more
    for (const tab of tabs.of(profile)) chrome.tabs.sendMessage(tab, persisted(profile, change)).catch(() => {});
  },
  folderDue: () => {},
});

const dispatch = profileDispatch({
  open: openDb,
  prepare: (profile, db) => adoptLegacy(profile, db, storage),
  watch: (profile, db) => watchBackupTables(db, () => signal.rowsChanged(profile)),
  deps: { now: Date.now },
  logError,
});

/**
 * Tells every tab of the game which profiles an import changed; a tab of one of them offers a reload. Without the
 * "tabs" permission the tabs come without their URL, so the message goes to all of them; a tab without the content
 * script refuses it.
 */
async function notifyGameTabs(message: DataImported) {
  for (const tab of await chrome.tabs.query({})) {
    if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, message).catch(() => {});
  }
}

// the service worker writes the backup folder itself, through the handle the data page stored
const folderBackup = new FolderBackup({
  folder: async () => {
    const handle = await loadFolderHandle();
    return handle && handleFolder(handle);
  },
  open: openDb,
  local: storage,
  session: { get: (keys) => chrome.storage.session.get(keys), set: (items) => chrome.storage.session.set(items) },
  localProfiles: async () =>
    (await indexedDB.databases()).flatMap(({ name }) => {
      const profile = profileOfDbName(name ?? '');
      return profile ? [profile] : [];
    }),
  now: Date.now,
  logError,
});

/** the data page chose or granted the folder: the merge may have changed profiles an open game holds in memory */
function announce(profiles: Profile[]) {
  if (profiles.length)
    notifyGameTabs(dataImported(profiles)).catch((e) => logError('notifying the game tabs failed', e));
  return { ok: true, profiles: profiles.length };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (res: unknown) => void) => {
  if (isFolderRequest(message)) {
    const { action, profile } = message;
    (action === 'start' ? folderBackup.start(profile) : folderBackup.changed(profile))
      .catch((error) => {
        logError('the backup folder failed', error);
        return 'failed';
      })
      .then(sendResponse);
    return true;
  }
  if (message === FOLDER_CHOSEN || message === FOLDER_GRANTED) {
    (message === FOLDER_CHOSEN ? folderBackup.chosen() : folderBackup.granted())
      .then(announce, (error) => {
        logError('the backup folder failed', error);
        return { ok: false, profiles: 0 };
      })
      .then(sendResponse);
    return true;
  }
  return false;
});

// the content script cannot open extension pages itself
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (message === OPEN_DATA_PAGE) chrome.runtime.openOptionsPage().catch(() => {});
  if (isDataImported(message))
    notifyGameTabs(message).catch((error) => logError('notifying the game tabs failed', error));
  return false;
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (res: RpcResponse) => void) => {
  if (!isRpcRequest(message)) return false;
  tabs.seen(message.profile, sender.tab?.id);
  dispatch(message).then(sendResponse);
  return true;
});
