import { describe, expect, it } from 'vitest';
import { memoryKv } from '../src/content/core/kv';
import { Recorder } from '../src/content/core/recorder';
import { Settings } from '../src/content/core/settings';

const traffic = { kind: 'ws' as const, data: '[]', at: 0 };

describe('Recorder', () => {
  it('starts and stops with the setting, without a reload', async () => {
    const settings = new Settings(memoryKv({}));
    settings.register({ key: 'core.record', group: 'settings.core', label: 'settings.recordTraffic', default: false });
    const recorder = new Recorder(() => settings.get('core.record'));
    const counts: number[] = [];
    recorder.onChange(() => counts.push(recorder.count));
    recorder.add(traffic);
    expect(recorder.count).toBe(0);
    await settings.set('core.record', true);
    recorder.add(traffic);
    recorder.add(traffic);
    await settings.set('core.record', false);
    recorder.add(traffic);
    expect(recorder.count).toBe(2);
    expect(counts).toEqual([1, 2]);
  });

  it('keeps requests only when asked to', () => {
    let withRequests = false;
    const recorder = new Recorder(
      () => true,
      () => withRequests,
    );
    const json = {
      kind: 'json' as const,
      url: 'u',
      request: '[{"requestMethod":"plunderById"}]',
      response: '[]',
      at: 0,
    };
    recorder.add(json);
    withRequests = true;
    recorder.add(json);
    const saved: { request: string | null }[] = JSON.parse(recorder.serialize());
    expect(saved.map((t) => t.request)).toEqual([null, json.request]);
  });

  it('keeps outgoing websocket messages only with requests', () => {
    let withRequests = false;
    const recorder = new Recorder(
      () => true,
      () => withRequests,
    );
    const out = { kind: 'ws' as const, direction: 'out' as const, data: '[]', at: 0 };
    recorder.add(out);
    recorder.add(traffic);
    withRequests = true;
    recorder.add(out);
    expect(JSON.parse(recorder.serialize())).toEqual([traffic, out]);
  });

  it('masks the session token of the websocket login', () => {
    const recorder = new Recorder(
      () => true,
      () => true,
    );
    const data =
      '{"requestClass":"SocketAuthenticationService","requestMethod":"authWithToken","requestData":["secret"]}';
    recorder.add({ kind: 'ws', direction: 'out', data, at: 0 });
    expect(JSON.parse(recorder.serialize())[0].data).toBe(
      '{"requestClass":"SocketAuthenticationService","requestMethod":"authWithToken","requestData":["*****"]}',
    );
  });
});
