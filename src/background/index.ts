import { logError } from '../content/core/log';
import { type DataImported, isDataImported, OPEN_DATA_PAGE } from '../shared/messages';
import type { RpcResponse } from '../shared/rpc';
import { openDb } from './db';
import { adoptLegacy, type LocalStorage } from './legacy';
import { isRpcRequest, profileDispatch } from './profiles';

const storage: LocalStorage = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
};

const dispatch = profileDispatch({
  open: openDb,
  prepare: (profile, db) => adoptLegacy(profile, db, storage),
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

// the content script cannot open extension pages itself
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (message === OPEN_DATA_PAGE) chrome.runtime.openOptionsPage().catch(() => {});
  if (isDataImported(message))
    notifyGameTabs(message).catch((error) => logError('notifying the game tabs failed', error));
  return false;
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (res: RpcResponse) => void) => {
  if (!isRpcRequest(message)) return false;
  dispatch(message).then(sendResponse);
  return true;
});
