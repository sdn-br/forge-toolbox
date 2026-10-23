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
  env.ctx.bus.emit('settings.open', { group: 'gbOwn.title' });
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

describe('settings box layout', () => {
  it('shows one module at a time, picked from a column of icons, with its sections', async () => {
    const { ctx, box, menu } = setup();
    const nav = () => [...box.root.querySelectorAll('.settings-nav button')];
    // the general settings first, then the modules in the order they registered
    expect(nav().map((b) => [b.textContent?.trim(), b.getAttribute('aria-label')])).toEqual([
      ['⚙️', 'Allgemein'],
      ['🧱', 'Eigenanteil'],
    ]);
    expect(box.root.querySelector('.settings-nav button.active')?.getAttribute('aria-label')).toBe('Eigenanteil');
    expect(box.root.querySelector('.settings-main h2')?.textContent).toBe('Eigenanteil');
    expect(box.root.querySelector('.settings-main h3')?.textContent).toBe('Kopiertext');
    expect(box.text).not.toContain('Spielverkehr aufzeichnen');
    (nav()[0] as HTMLButtonElement).click();
    await tick();
    expect(box.text).toContain('Spielverkehr aufzeichnen');
    // the module shown is kept when the settings open from the menu again
    menu('settings');
    menu('settings');
    expect(box.root.querySelector('.settings-main h2')?.textContent).toBe('Allgemein');
    // a box's settings button picks its module
    ctx.bus.emit('settings.open', { group: 'gbOwn.title' });
    await tick();
    expect(box.root.querySelector('.settings-main h2')?.textContent).toBe('Eigenanteil');
  });
});
