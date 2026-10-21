// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { registerGameHandlers } from '../src/content/game/handlers';
import fixture from './fixtures/gb-contribution.json';
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
  createGbCalculatorFeature(() => {}).setup(ctx);
  const box = env.boxes.get('gbCalculator') as NonNullable<ReturnType<typeof env.boxes.get>>;
  const events: string[] = [];
  ctx.bus.on('inventory.changed', () => events.push('inventory'));
  ctx.bus.on('resources.changed', () => events.push('resources'));
  ctx.bus.on('greatBuilding.changed', (e) => events.push(`gb:${e.reason}`));
  /** one game response with these entries */
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
  send(...(fixture.inventory as Entry[]));
  for (const e of fixture.opening as Entry[]) send(e);
  events.length = 0;
  const rows = () => [...box.root.querySelectorAll('tr')].slice(1);
  return { ...env, box, send, events, rows, batch: fixture.contribution as Entry[] };
}

describe('recorded own contribution', () => {
  it('shows the opening with the unlocked level and the packages', async () => {
    const { box, rows } = setup();
    await tick();
    expect(box.text).toContain('St. 63 → 64');
    expect(box.text).toContain('freigeschaltet bis 64');
    expect(box.text).toContain('Verfügbare FP: 108.453');
    // 1935 needed, 1455 in, nothing of mine: rank 2 held with 121, round((121 + 480) / 2) = 301, what was paid
    expect(rows()[1]?.querySelectorAll('td')[1]?.textContent?.trim()).toBe('301');
  });

  it('applies the whole response: rankings, building, resources and inventory, each announced once', async () => {
    const { ctx, box, send, events, rows, batch } = setup();
    send(...batch);
    await tick();
    const open = ctx.greatBuildings.current();
    expect(open?.rankings.find((r) => r.self)).toMatchObject({ rank: 2, fp: 301, player: 1000 });
    expect(open?.entity).toMatchObject({ invested: 1756, required: 1935, level: 63, maxLevel: 64 });
    expect(ctx.inventory.item(9001)?.inStock).toBe(9906);
    expect(ctx.inventory.item(9002)?.inStock).toBe(400);
    expect(ctx.inventory.computedForgePointPackages()).toBe(108_198);
    expect(ctx.inventory.forgePointPackages()).toBe(108_198);
    expect(ctx.resources.amount('strategy_points')).toBe(0);
    expect(events.filter((e) => e === 'inventory')).toHaveLength(1);
    expect(events.filter((e) => e.startsWith('gb:'))).toEqual(['gb:contributed']);
    expect(box.text).toContain('Verfügbare FP: 108.198');
    expect(box.root.querySelector('.gb-fp')?.getAttribute('title')).toBe('Leiste 0 + Pakete 108.198');
    expect(box.text).toContain('Bis Level-Up fehlen 179 FP');
    // the own place is safe with what was paid: round((121 + 480) / 2) = 301
    expect(rows()[1]?.className).toBe('gb-mine');
    expect(ctx.cities.visited()).toBeUndefined();
  });

  it('counts the contribution once whatever the order of the entries', () => {
    const { ctx, send, batch } = setup();
    send(...[...batch].reverse());
    expect(ctx.greatBuildings.current()?.entity?.invested).toBe(1756);
  });

  it('keeps the open building current with a reset of it alone', () => {
    const { ctx, send, batch, events } = setup();
    const reset = batch.find((e) => e.requestMethod === 'reset') as Entry;
    send(reset);
    expect(ctx.greatBuildings.current()?.entity?.invested).toBe(1756);
    expect(events).toEqual(['gb:entity']);
  });
});
