import { folderService, notifyGameTabs, planFolderWrite } from '../backup/folder-worker';
import { logError } from '../content/core/log';
import { isDataImported, OPEN_DATA_PAGE, persisted } from '../shared/messages';
import { profileOfStorageKey } from '../shared/profile';
import type { RpcResponse } from '../shared/rpc';
import { openDb } from './db';
import { adoptLegacy, type LocalStorage } from './legacy';
import { PersistedSignal, watchBackupTables } from './persisted';
import { isRpcRequest, ProfileTabs, profileDispatch, workerCall } from './profiles';

const storage: LocalStorage = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

// A build of 2026-11 learned great building level costs into a database all profiles shared; the costs now ship with
// the toolbox, so the old database goes. Deleting a database that does not exist does nothing.
// debt: runs at every start of the worker. ceiling: none, the call is cheap. upgrade: remove it some releases later,
// once every installation has started a build with it.
indexedDB.deleteDatabase('forge-toolbox-shared');

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
  folderDue: planFolderWrite,
});

// the settings live in chrome.storage.local, written by the game tab; the folder backs them up as well
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of Object.keys(changes)) {
    const profile = profileOfStorageKey(key, 'settings');
    if (profile) signal.settingsChanged(profile);
  }
});

const dispatch = profileDispatch({
  open: openDb,
  watch: (profile, db) => watchBackupTables(db, () => signal.rowsChanged(profile)),
  prepare: (profile, db) => adoptLegacy(profile, db, storage),
  deps: {
    now: Date.now,
    // the host permission for the Inno CDN lets the service worker read the game's script past CORS
    fetchText: async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return res.text();
    },
    // the host permission for ScoreDB lets the service worker read its pages, which send no CORS headers
    fetchPage: (url, init) => fetch(url, init),
  },
  logError,
});

const folder = folderService({
  local: storage,
  call: workerCall(dispatch),
  change: (profile) => signal.current(profile),
});

chrome.alarms.onAlarm.addListener(({ name }) => folder.onAlarm(name));

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (res: unknown) => void) =>
  folder.onMessage(message, sendResponse),
);

// the content script cannot open extension pages itself
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (message === OPEN_DATA_PAGE) chrome.runtime.openOptionsPage().catch(() => {});
  if (isDataImported(message))
    notifyGameTabs(message).catch((error) => logError('notifying the game tabs failed', error));
  return false;
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse: (res: RpcResponse) => void) => {
  if (!isRpcRequest(message)) return false;
  // the data page imports through these calls too, but it is no game tab of the profile
  if (!sender.url?.startsWith(chrome.runtime.getURL(''))) tabs.seen(message.profile, sender.tab?.id);
  dispatch(message).then(sendResponse);
  return true;
});
