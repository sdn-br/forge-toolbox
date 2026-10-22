import type { Method, RpcRequest, RpcResponse } from '../shared/rpc';
import { openDb } from './db';
import { createHandlers } from './handlers';

// requests to foestats go out without cookies from here, see src/persistence/foestats/api.ts
const handlers = createHandlers(openDb(), { fetch: (url, init) => fetch(url, init), now: Date.now });

chrome.runtime.onMessage.addListener((req: RpcRequest, _sender, sendResponse: (res: RpcResponse) => void) => {
  const handler = handlers[req?.rpc] as ((arg: unknown) => Promise<unknown>) | undefined;
  if (!handler) return false;
  handler(req.arg).then(
    (result) => sendResponse({ ok: true, result } as RpcResponse<Method>),
    (error) => sendResponse({ ok: false, error: String(error) }),
  );
  return true;
});
