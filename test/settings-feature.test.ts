// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createGbOwnShareFeature } from '../src/content/features/gb-own-share';
import { settingsFeature } from '../src/content/features/settings-feature';
import { featureContext } from './helpers/feature-context';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const env = featureContext();
  createGbOwnShareFeature(async () => {}).setup(env.ctx);
  settingsFeature.setup(env.ctx);
  env.menu('settings');
  const box = env.boxes.get('settings') as NonNullable<ReturnType<typeof env.boxes.get>>;
  /** the input whose label starts with `text` */
  const field = (text: string) =>
    [...box.root.querySelectorAll('label')]
      .find((l) => l.textContent?.trim().startsWith(text))
      ?.querySelector('input') as HTMLInputElement;
  const type = async (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('change'));
    await tick();
  };
  return { ...env, box, field, type };
}

describe('settings box', () => {
  it('shows factor settings as factors and stores them in percent', async () => {
    const { ctx, field, type } = setup();
    const factor = field('Faktor für eigene LGs');
    expect(factor.value).toBe('1.9');
    expect([factor.min, factor.max, factor.step]).toEqual(['0', '3', '0.01']);
    await type(factor, '1.955');
    expect(ctx.settings.number('gbOwn.factor')).toBe(95.5);
    const buttons = field('Faktor-Knöpfe');
    expect(buttons.value).toBe('1,8; 1,9; 2');
    await type(buttons, '1,9 2,1; 1,955');
    expect(ctx.settings.numbers('gbOwn.factorButtons')).toEqual([90, 110, 95.5]);
    expect(buttons.value).toBe('1,9; 2,1; 1,955');
  });
});
