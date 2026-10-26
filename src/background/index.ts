import { logError } from '../content/core/log';
import { OPEN_DATA_PAGE } from '../shared/messages';
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

// the content script cannot open extension pages itself
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (message === OPEN_DATA_PAGE) chrome.runtime.openOptionsPage().catch(() => {});
  return false;
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (res: RpcResponse) => void) => {
  if (!isRpcRequest(message)) return false;
  dispatch(message).then(sendResponse);
  return true;
});
