// Messages between the proxy (MAIN world) and the content script (isolated world).
// Both share the window, so window.postMessage is the transport.

export const TAG = 'forge-toolbox-proto';

export type ProxyMessage =
  | { tag: typeof TAG; from: 'proxy'; type: 'hello' }
  | { tag: typeof TAG; from: 'proxy'; type: 'traffic'; traffic: Traffic };

export type ContentMessage = { tag: typeof TAG; from: 'content'; type: 'ready' };

export type Traffic =
  | { kind: 'xhr'; url: string; request: string | null; response: string; sentAt: number }
  | { kind: 'ws'; data: string; sentAt: number };

export type StorageRequest =
  | { op: 'put'; key: string; value: unknown }
  | { op: 'get'; key: string }
  | { op: 'bulkPut'; rows: { key: string; value: unknown }[] }
  | { op: 'getAll' }
  | { op: 'clear' };
