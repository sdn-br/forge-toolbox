import { OPEN_DATA_PAGE } from '../shared/messages';
import type { Method, RpcRequest, RpcResponse } from '../shared/rpc';
import { openDb } from './db';
import { createHandlers } from './handlers';

const handlers = createHandlers(openDb(), { now: Date.now });

// the content script cannot open extension pages itself
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (message === OPEN_DATA_PAGE) chrome.runtime.openOptionsPage().catch(() => {});
  return false;
});

chrome.runtime.onMessage.addListener((req: RpcRequest, _sender, sendResponse: (res: RpcResponse) => void) => {
  const handler = handlers[req?.rpc] as ((arg: unknown) => Promise<unknown>) | undefined;
  if (!handler) return false;
  handler(req.arg).then(
    (result) => sendResponse({ ok: true, result } as RpcResponse<Method>),
    (error) => sendResponse({ ok: false, error: String(error) }),
  );
  return true;
});
