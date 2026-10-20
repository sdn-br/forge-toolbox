// Runs in the page (MAIN world) at document_start, before the game code.
// Only listens: forwards raw game traffic, all parsing happens in the content script.
import { type ContentMessage, PROXY_TAG, type ProxyMessage, type Traffic } from '../shared/proxy-protocol';
import { bodyText } from './body';

const queue: Traffic[] = [];
let contentReady = false;

function post(message: ProxyMessage) {
  window.postMessage(message, location.origin);
}

function emit(traffic: Traffic) {
  if (contentReady) post({ tag: PROXY_TAG, from: 'proxy', type: 'traffic', traffic });
  else queue.push(traffic);
}

window.addEventListener('message', (event: MessageEvent<ContentMessage>) => {
  if (event.source !== window || event.data?.tag !== PROXY_TAG || event.data.from !== 'content') return;
  if (event.data.type === 'ready' && !contentReady) {
    contentReady = true;
    for (const traffic of queue.splice(0)) post({ tag: PROXY_TAG, from: 'proxy', type: 'traffic', traffic });
  }
});

const urls = new WeakMap<XMLHttpRequest, string>();
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
  urls.set(this, String(url));
  return (originalOpen as (...args: unknown[]) => void).call(this, method, url, ...rest);
} as typeof XMLHttpRequest.prototype.open;

XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
  const url = urls.get(this);
  if (url?.includes('/game/json?h=')) {
    const request = bodyText(body);
    this.addEventListener('load', () => {
      const response = textOf(this);
      if (response !== null) emit({ kind: 'json', url, request, response, at: Date.now() });
    });
  } else if (url?.includes('/metadata?id=')) {
    this.addEventListener('load', () => {
      const response = textOf(this);
      if (response !== null) emit({ kind: 'meta', url, response, at: Date.now() });
    });
  }
  return originalSend.call(this, body);
};

function textOf(xhr: XMLHttpRequest): string | null {
  if (xhr.status !== 200) return null;
  try {
    return xhr.responseText;
  } catch {
    return null; // responseType other than text
  }
}

const watchedSockets = new WeakSet<WebSocket>();
const originalWsSend = WebSocket.prototype.send;

WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket['send']>[0]) {
  if (!watchedSockets.has(this)) {
    watchedSockets.add(this);
    this.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') emit({ kind: 'ws', data: event.data, at: Date.now() });
    });
  }
  const text = bodyText(data);
  if (text !== null) emit({ kind: 'ws', direction: 'out', data: text, at: Date.now() });
  return originalWsSend.call(this, data);
};

post({ tag: PROXY_TAG, from: 'proxy', type: 'hello' });
