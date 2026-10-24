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
  const rows = () => [...power.root.querySelectorAll('tr')].slice(1);
  const cells = (tr: Element | undefined) =>
    [...(tr?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim());
  return { ...env, own, power, openOwn, rows, cells, copies, send };
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
