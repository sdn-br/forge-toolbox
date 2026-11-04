// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROXY_TAG, type ProxyMessage } from '../src/shared/proxy-protocol';

afterEach(() => vi.resetModules());

describe('proxy', () => {
  it('forwards the request of a game call when it is sent, before any answer', async () => {
    const sent = vi.fn();
    class FakeXhr {
      open() {}
      send(body: unknown) {
        sent(body);
      }
      addEventListener() {}
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const messages: ProxyMessage[] = [];
    window.addEventListener('message', (e) => messages.push(e.data));
    vi.stubGlobal('WebSocket', class {});
    await import('../src/proxy/index');
    window.dispatchEvent(
      new MessageEvent('message', { data: { tag: PROXY_TAG, from: 'content', type: 'ready' }, source: window }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://de20.forgeofempires.com/game/json?h=abc');
    const body = '[{"requestClass":"A","requestMethod":"b","requestData":[1]}]';
    xhr.send(new TextEncoder().encode(body).buffer);
    const empty = new XMLHttpRequest();
    empty.open('GET', 'https://de20.forgeofempires.com/game/json?h=abc');
    empty.send(null);
    await new Promise((r) => setTimeout(r, 0));
    const traffic = messages.flatMap((m) => (m.from === 'proxy' && m.type === 'traffic' ? [m.traffic] : []));
    expect(traffic).toEqual([expect.objectContaining({ kind: 'request', request: body })]);
    expect(sent).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
