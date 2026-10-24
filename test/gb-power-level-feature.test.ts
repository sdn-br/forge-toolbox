// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbOwnShareFeature } from '../src/content/features/gb-own-share';
import { createGbPowerLevelFeature } from '../src/content/features/gb-power-level';
import { registerGameHandlers } from '../src/content/game/handlers';
import definitions from './fixtures/gb-definitions.json';
import fixture from './fixtures/great-buildings.json';
import { featureContext } from './helpers/feature-context';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const env = featureContext();
  const { ctx } = env;
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now: Date.now });
  const copies: string[] = [];
  createGbOwnShareFeature(async () => {}).setup(ctx);
  createGbPowerLevelFeature(async (text) => {
    copies.push(text);
  }).setup(ctx);
  const own = env.boxes.get('gbOwnShare') as NonNullable<ReturnType<typeof env.boxes.get>>;
  const power = env.boxes.get('gbPowerLevel') as NonNullable<ReturnType<typeof env.boxes.get>>;
  const send = (...entries: Entry[]) =>
    ingestion.accept({
      kind: 'json',
      url: '/game/json?h=1',
      request: JSON.stringify(
        entries.map(({ requestClass, requestMethod, requestData }) => ({ requestClass, requestMethod, requestData })),
      ),
      response: JSON.stringify(
        entries.map(({ requestClass, requestMethod, responseData }) => ({ requestClass, requestMethod, responseData })),
      ),
      at: 0,
    });
  send(...(fixture.startup as Entry[]));
  for (const f of definitions.files)
    ingestion.accept({ kind: 'meta', url: f.url, response: JSON.stringify(f.json), at: 0 });
  const openOwn = () => send(fixture.own as Entry);
  // the header row, then the factor row, then one row per level
  const rows = () => [...power.root.querySelectorAll('tr:not(.factors)')].slice(1);
  const fields = (box: { root: HTMLElement }) =>
    [...box.root.querySelectorAll('input.place-factor')] as HTMLInputElement[];
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('change'));
  };
  const status = (box: { root: HTMLElement }) => box.root.querySelector('.factor-status')?.getAttribute('data-tip');
  const iconClick = (box: typeof power, tip: string) =>
    (box.root.querySelector(`.gb-factor button.icon[aria-label="${tip}"]`) as HTMLButtonElement).click();
  const cells = (tr: Element | undefined) =>
    [...(tr?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim());
  return { ...env, own, power, openOwn, rows, cells, copies, send, fields, type, status, iconClick };
}

describe('Powerleveln', () => {
  it('opens from the button in the Eigenanteil box and shows ten levels from the open one', async () => {
    const { own, power, openOwn, rows, cells } = setup();
    openOwn();
    await tick();
    expect(power.box.isOpen).toBe(false);
    own.click('Powerleveln');
    expect(power.box.isOpen).toBe(true);
    expect(rows()).toHaveLength(10);
    // the Ark takes no part in the double harvest: no such column
    expect(power.text).not.toContain('Doppelernte');
    expect(cells(rows()[0])[0]).toBe('135→136');
    expect(cells(rows()[9])[0]).toBe('144→145');
    // the open level: what the Eigenanteil box still asks, "offen 8.128" there
    expect(cells(rows()[0])[6]).toBe('8.128');
  });

  it('follows the factors of the Eigenanteil box at once', async () => {
    const { own, power, openOwn, rows, cells } = setup();
    openOwn();
    await tick();
    own.click('Powerleveln');
    const before = cells(rows()[1])[1];
    const field = own.root.querySelector('input.place-factor') as HTMLInputElement;
    field.value = '1.8';
    field.dispatchEvent(new Event('change'));
    await tick();
    expect(power.box.isOpen).toBe(true);
    expect(cells(rows()[1])[1]).not.toBe(before);
  });

  it('shows the factor bar and a factor field per place under the place headers', async () => {
    const { own, power, openOwn, fields, status } = setup();
    openOwn();
    await tick();
    own.click('Powerleveln');
    expect(power.root.querySelector('.gb-factor')?.textContent).toContain('Faktor');
    expect(fields(power).map((f) => f.value)).toEqual(['1.9', '1.9', '1.9', '1.9', '1.9']);
    expect(status(power)).toBe('Standard-Faktoren');
    // the field row sits between the headers and the first level
    const trs = [...power.root.querySelectorAll('tr')];
    expect(trs[1]?.classList.contains('factors')).toBe(true);
  });

  it('changes factors here and the Eigenanteil box shows them, and the other way round', async () => {
    const { own, power, openOwn, fields, type, status } = setup();
    openOwn();
    await tick();
    own.click('Powerleveln');
    type(fields(power)[2] as HTMLInputElement, '1.8');
    await tick();
    expect(fields(own).map((f) => f.value)).toEqual(['1.9', '1.9', '1.8', '1.9', '1.9']);
    expect(status(own)).toBe('Faktoren geändert, nicht gespeichert');
    // the free field of the bar sets all five in both
    power.click('2');
    await tick();
    expect(fields(own).map((f) => f.value)).toEqual(['2', '2', '2', '2', '2']);
    type(fields(own)[4] as HTMLInputElement, '1.7');
    await tick();
    expect(fields(power).map((f) => f.value)).toEqual(['2', '2', '2', '2', '1.7']);
    expect(status(power)).toBe('Faktoren geändert, nicht gespeichert');
  });

  it('works and changes factors while the Eigenanteil box is closed', async () => {
    const { own, power, openOwn, fields, type, rows, cells } = setup();
    openOwn();
    await tick();
    own.box.close();
    power.box.open();
    const before = cells(rows()[1])[1];
    type(fields(power)[0] as HTMLInputElement, '1.8');
    await tick();
    expect(own.box.isOpen).toBe(false);
    expect(fields(power)[0]?.value).toBe('1.8');
    expect(cells(rows()[1])[1]).not.toBe(before);
  });

  it('saves, adopts and resets the factors from here', async () => {
    const { own, power, openOwn, fields, type, status, iconClick, ctx } = setup();
    openOwn();
    await tick();
    own.click('Powerleveln');
    type(fields(power)[0] as HTMLInputElement, '1.8');
    await tick();
    iconClick(power, 'Für dieses LG speichern');
    await tick();
    expect(status(power)).toBe('Faktoren für dieses LG gespeichert');
    expect(status(own)).toBe('Faktoren für dieses LG gespeichert');
    expect(ctx.ui.pref('gbOwn.factors.X_FutureEra_Landmark1')).toBeDefined();
    iconClick(power, 'Als Standard übernehmen');
    await tick();
    expect(ctx.ui.pref('gbOwn.factorDefault')).toBeDefined();
    iconClick(power, 'Auf Standard zurücksetzen');
    await tick();
    // back on the standard, which is the five just adopted
    expect(status(power)).toBe('Standard-Faktoren');
    expect(fields(own).map((f) => f.value)).toEqual(['1.8', '1.9', '1.9', '1.9', '1.9']);
  });

  it('follows the Ext typed in the Eigenanteil box', async () => {
    const { own, power, openOwn, rows, cells } = setup();
    openOwn();
    await tick();
    own.click('Powerleveln');
    const before = cells(rows()[0])[6];
    const ext = own.root.querySelector('input.ext') as HTMLInputElement;
    ext.value = '1000';
    ext.dispatchEvent(new Event('change'));
    await tick();
    expect(cells(rows()[0])[6]).not.toBe(before);
    expect(power.box.isOpen).toBe(true);
  });

  it('copies the text of a row', async () => {
    const { own, power, openOwn, copies } = setup();
    openOwn();
    await tick();
    own.click('Powerleveln');
    (power.root.querySelectorAll('button[aria-label="Kopieren"]')[1] as HTMLButtonElement).click();
    await tick();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toContain('Die Arche');
  });

  it('asks the player to open a great building first', () => {
    const { power, ctx } = setup();
    ctx.bus.emit('gbPowerLevel.open', {});
    expect(power.text).toContain('Noch kein eigenes LG geöffnet');
  });
});
