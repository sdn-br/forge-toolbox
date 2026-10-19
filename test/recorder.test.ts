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
});
