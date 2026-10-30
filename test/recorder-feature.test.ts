// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Recorder } from '../src/content/core/recorder';
import { RECORD, recorderFeature } from '../src/content/features/recorder';
import { settingsFeature } from '../src/content/features/settings-feature';
import { featureContext } from './helpers/feature-context';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('recorder buttons in the settings box', () => {
  it('clears the recorded data, greyed while there is none', async () => {
    const env = featureContext();
    const { ctx } = env;
    ctx.recorder = new Recorder(() => true);
    recorderFeature.setup(ctx);
    settingsFeature.setup(ctx);
    await ctx.settings.of(RECORD).set(true);
    ctx.open('settings', 'settings.core');
    const box = env.boxes.get('settings') as NonNullable<ReturnType<typeof env.boxes.get>>;
    ctx.recorder.add({ kind: 'ws', data: '[]', at: 0 });
    ctx.recorder.add({ kind: 'ws', data: '[]', at: 0 });
    await tick();
    const clear = () => box.root.querySelector('[aria-label="Aufnahmedaten löschen"]') as HTMLButtonElement;
    expect(clear().getAttribute('aria-disabled')).toBe('false');
    clear().click();
    await tick();
    expect(ctx.recorder.count).toBe(0);
    expect(clear().getAttribute('aria-disabled')).toBe('true');
  });

  it('shows them only while recording, with the count on the save button', async () => {
    const env = featureContext();
    const { ctx } = env;
    ctx.recorder = new Recorder(() => true);
    recorderFeature.setup(ctx);
    settingsFeature.setup(ctx);
    ctx.open('settings', 'settings.core');
    const box = env.boxes.get('settings') as NonNullable<ReturnType<typeof env.boxes.get>>;
    expect(box.root.querySelector('[aria-label="Aufnahmedaten löschen"]')).toBeNull();
    await ctx.settings.of(RECORD).set(true);
    ctx.recorder.add({ kind: 'ws', data: '[]', at: 0 });
    await tick();
    expect(box.root.querySelector('[aria-label="Aufnahmedaten löschen"]')).not.toBeNull();
    expect(box.root.querySelector('button.icon-only')?.textContent?.trim()).toBe('1');
  });
});
