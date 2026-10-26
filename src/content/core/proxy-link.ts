import { type ContentMessage, PROXY_TAG, type ProxyMessage, type Traffic } from '../../shared/proxy-protocol';

/** Connects to the proxy in the page. The traffic the proxy buffered so far flows to `receive` at once. */
export function connectProxy(receive: (traffic: Traffic) => void): void {
  const ready = () =>
    window.postMessage({ tag: PROXY_TAG, from: 'content', type: 'ready' } as ContentMessage, location.origin);
  window.addEventListener('message', (event: MessageEvent<ProxyMessage>) => {
    if (event.source !== window || event.data?.tag !== PROXY_TAG || event.data.from !== 'proxy') return;
    if (event.data.type === 'hello') ready();
    else if (event.data.type === 'traffic') receive(event.data.traffic);
  });
  ready();
}
