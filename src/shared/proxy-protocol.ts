// Proxy (MAIN world) and content script (isolated world) share the window: window.postMessage is the transport.
// Page scripts can post the same messages, so receivers validate what they parse.

export const PROXY_TAG = 'forge-toolbox';

export type Traffic =
  | { kind: 'json'; url: string; request: string | null; response: string; at: number }
  | { kind: 'meta'; url: string; response: string; at: number }
  // `out` is what the game sends (requests), absent means received; older recordings have no direction
  | { kind: 'ws'; direction?: 'out'; data: string; at: number };

export type ProxyMessage =
  | { tag: typeof PROXY_TAG; from: 'proxy'; type: 'hello' }
  | { tag: typeof PROXY_TAG; from: 'proxy'; type: 'traffic'; traffic: Traffic };

export type ContentMessage = { tag: typeof PROXY_TAG; from: 'content'; type: 'ready' };
