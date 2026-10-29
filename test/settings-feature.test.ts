// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Recorder } from '../src/content/core/recorder';
import { createGbOwnShareFeature } from '../src/content/features/gb-own-share';
import { settingsFeature } from '../src/content/features/settings-feature';
import { featureContext } from './helpers/feature-context';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const env = featureContext();
  createGbOwnShareFeature(async () => {}).setup(env.ctx);
  settingsFeature(env.profileCopy).setup(env.ctx);
  env.ctx.open('settings', 'gbOwn.title');
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
    expect(nav().map((b) => [b.querySelector('svg') !== null, b.getAttribute('aria-label')])).toEqual([
      [true, 'Allgemein'],
      [true, 'Eigenanteil'],
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
    ctx.open('settings', 'gbOwn.title');
    await tick();
    expect(box.root.querySelector('.settings-main h2')?.textContent).toBe('Eigenanteil');
  });
});

describe('settings box recording', () => {
  it('clears the recorded data, greyed while there is none', async () => {
    const env = featureContext();
    const { ctx } = env;
    ctx.recorder = new Recorder(() => true);
    settingsFeature(env.profileCopy).setup(ctx);
    await ctx.settings.set('core.record', true);
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
});

describe('settings box: copy from another profile', () => {
  async function open(storage: Record<string, unknown>) {
    const env = featureContext({ storage });
    settingsFeature(env.profileCopy).setup(env.ctx);
    env.ctx.open('settings', 'settings.core');
    await tick();
    const box = env.boxes.get('settings') as NonNullable<ReturnType<typeof env.boxes.get>>;
    const copySelect = () =>
      [...box.root.querySelectorAll('label')]
        .find((l) => l.textContent?.trim().startsWith('Einstellungen von einem anderen Profil übernehmen'))
        ?.querySelector('select') as HTMLSelectElement | undefined;
    const button = () =>
      [...box.root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Übernehmen') as HTMLButtonElement;
    return { env, box, copySelect, button };
  }

  const storage = {
    'settings:de20:1': { a: false },
    'settings:de20:2': { a: true },
    'profile:de20:2': { name: 'Zweit' },
    'settings:de10:3': { b: true },
    'ui.boxes:de10:3': { pvp: { x: 5 } },
  };

  const question = (box: { root: ParentNode }) => box.root.querySelector('p.warn');
  const answer = (box: { root: ParentNode }, label: string) =>
    [...(question(box)?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label) as HTMLButtonElement;

  it('asks in a line naming the profile, copies on the answer, then reloads the game', async () => {
    const { env, box, copySelect, button } = await open(storage);
    expect([...(copySelect()?.options ?? [])].map((o) => o.textContent)).toEqual(['de10 · 3', 'de20 · Zweit']);
    expect(question(box)).toBeNull();
    button().click();
    await tick();
    expect(question(box)?.textContent).toContain('durch die von de10 · 3 ersetzen?');
    expect(env.reloads).toBe(0);
    answer(box, 'Übernehmen').click();
    await tick();
    expect(env.reloads).toBe(1);
    expect(env.storage.data.get('settings:de20:1')).toEqual({ b: true });
    expect(env.storage.data.get('ui.boxes:de20:1')).toEqual({ pvp: { x: 5 } });
  });

  it('keeps the question through redraws, drops it on closing, another group, cancel or another choice', async () => {
    const { env, box, copySelect, button } = await open(storage);
    button().click();
    await tick();
    box.box.update();
    expect(question(box)).not.toBeNull();
    box.box.close();
    box.box.open();
    expect(question(box)).toBeNull();
    button().click();
    await tick();
    env.ctx.settings.register({ key: 'other', group: 'sabotage.title', label: 'sabotage.title', default: true });
    box.box.update();
    const nav = () => [...box.root.querySelectorAll<HTMLButtonElement>('.settings-nav button')];
    (nav()[1] as HTMLButtonElement).click();
    (nav()[0] as HTMLButtonElement).click();
    await tick();
    expect(question(box)).toBeNull();
    button().click();
    await tick();
    answer(box, 'Abbrechen').click();
    await tick();
    expect(question(box)).toBeNull();
    button().click();
    await tick();
    const select = copySelect() as HTMLSelectElement;
    select.value = 'de20:2';
    select.dispatchEvent(new Event('change'));
    await tick();
    expect(question(box)).toBeNull();
    button().click();
    await tick();
    expect(question(box)?.textContent).toContain('de20 · Zweit');
    answer(box, 'Übernehmen').click();
    await tick();
    expect(env.reloads).toBe(1);
    expect(env.storage.data.get('settings:de20:1')).toEqual({ a: true });
  });

  it('shows nothing of it without another profile', async () => {
    const { box, copySelect } = await open({ 'settings:de20:1': {} });
    expect(copySelect()).toBeUndefined();
    expect(box.text).not.toContain('Übernehmen');
  });
});
