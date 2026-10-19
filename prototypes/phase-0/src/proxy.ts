// Runs in the page (MAIN world) at document_start, before the game code.
// Only listens: forwards raw game traffic, parsing happens in the content script.
import { TAG, type ContentMessage, type ProxyMessage, type Traffic } from './protocol';

const queue: Traffic[] = [];
let contentReady = false;

function post(message: ProxyMessage) {
  window.postMessage(message, location.origin);
}

function emit(traffic: Traffic) {
  if (contentReady) post({ tag: TAG, from: 'proxy', type: 'traffic', traffic });
  else queue.push(traffic);
}

window.addEventListener('message', (event: MessageEvent<ContentMessage>) => {
  if (event.source !== window || event.data?.tag !== TAG || event.data.from !== 'content') return;
  if (event.data.type === 'ready' && !contentReady) {
    contentReady = true;
    for (const traffic of queue.splice(0)) post({ tag: TAG, from: 'proxy', type: 'traffic', traffic });
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
  if (url?.includes('game/json?h=')) {
    const request = typeof body === 'string' ? body : null;
    this.addEventListener('load', () => {
      try {
        emit({ kind: 'xhr', url, request, response: this.responseText, sentAt: performance.now() });
      } catch {
        // responseType other than text: nothing to forward
      }
    });
  }
  return originalSend.call(this, body);
};

const watchedSockets = new WeakSet<WebSocket>();
const originalWsSend = WebSocket.prototype.send;

WebSocket.prototype.send = function (this: WebSocket, data: Parameters<WebSocket["send"]>[0]) {
  if (!watchedSockets.has(this)) {
    watchedSockets.add(this);
    this.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') emit({ kind: 'ws', data: event.data, sentAt: performance.now() });
    });
  }
  return originalWsSend.call(this, data);
};

post({ tag: TAG, from: 'proxy', type: 'hello' });
