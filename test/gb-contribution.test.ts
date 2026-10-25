// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { registerGameHandlers } from '../src/content/game/handlers';
import fixture from './fixtures/gb-contribution.json';
import belowOwn from './fixtures/gb-contribution-below-own.json';
import { featureContext } from './helpers/feature-context';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

interface ContributionFixture {
  startup: unknown[];
  inventory: unknown[];
  opening: unknown[];
  contribution: unknown[];
  others?: unknown[][];
}

function setup(f: ContributionFixture = fixture) {
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
  send(...(f.startup as Entry[]));
  send(...(f.inventory as Entry[]));
  for (const e of f.opening as Entry[]) send(e);
  events.length = 0;
  const rows = () => [...box.root.querySelectorAll('tr')].slice(1);
  return { ...env, box, send, events, rows, batch: f.contribution as Entry[] };
}

describe('recorded own contribution', () => {
  it('shows the opening with the unlocked level and the packages', async () => {
    const { box, rows } = setup();
    await tick();
    expect(box.text).toContain('St. 63 → 64');
    expect(box.text).toContain('freigeschaltet bis 64');
    expect(box.text).toContain('Verfügbare FP: 108.453');
    // 1935 needed, 1455 in, nothing of mine: rank 2 held with 121, round((121 + 480) / 2) = 301, what was paid
    expect(rows()[1]?.querySelectorAll('td')[2]?.textContent?.trim()).toBe('301');
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
    expect(box.root.querySelector('.gb-fp')?.getAttribute('data-tip')).toBe('Leiste 0 + Pakete 108.198');
    expect(box.text).toContain('noch 179 FP bis zum Level-up');
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

const cells = (row: Element | undefined) =>
  [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim());

// Basilius-Kathedrale St. 41 of 42 (recorded 2026-10-21): 1543 needed, 986 in (820 on rank 1, owner 166), ranks 2 to 5
// empty. The own 279 FP went to rank 2; below it nothing can be paid, the own deposit cannot hold a second place.
describe('recorded contribution to place 2 with empty places below', () => {
  it('offers place 2 for 279 before', async () => {
    const { rows } = setup(belowOwn);
    await tick();
    // the fixture has no own Arc, so 205 FP for 279 is a loss here
    expect(rows()[1]?.className).toBe('gb-loss');
    expect(cells(rows()[1])[2]).toBe('279');
  });

  it('shows the own place and no cost, profit or rate below it after', async () => {
    const { ctx, box, send, rows, batch } = setup(belowOwn);
    send(...batch);
    await tick();
    expect(ctx.greatBuildings.current()?.entity?.invested).toBe(1265);
    expect(rows().map((r) => r.className)).toEqual([
      'gb-unavailable',
      'gb-mine',
      'gb-unavailable',
      'gb-unavailable',
      'gb-unavailable',
    ]);
    // rank 1 holds 820, its safe cost round((820 + 557) / 2) = 689 cannot pass it anymore
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['1', '820', '✓']);
    expect(rows()[0]?.querySelectorAll('td')[2]?.getAttribute('data-tip')).toBe('Platz ist sicher');
    expect([cells(rows()[0])[4], cells(rows()[0])[6]]).toEqual(['–', '–']);
    // rest 557, no successor: round(557 / 2) = 279, already paid: safe, the rate is the own 279 of 205
    expect(cells(rows()[1])).toEqual(['2', '279', '✓', '205', '-74', '390 (+111)', '136,1 %']);
    expect(box.root.querySelector('.gb-me')?.textContent?.trim()).toBe('Du: 279 FP auf P2 · sicher ✓');
    expect(box.root.querySelector('.gb-me')?.className).toBe('gb-me safe');
    for (const row of rows().slice(2)) {
      const [, invested, safe, gross, profit, demand, rate] = cells(row);
      expect([invested, safe, profit, rate]).toEqual(['–', '–', '–', '–']);
      // the reward and the owner's demand stay
      expect(gross).toMatch(/^\d/);
      expect(demand).toMatch(/^\d/);
    }
    expect(box.text).toContain('noch 278 FP bis zum Level-up');
  });

  it('covers a building at its unlocked level and names a far higher unlocked level', async () => {
    const { box, send } = setup(belowOwn);
    const [atMax, farBelow] = (belowOwn.others ?? []) as Entry[][];
    for (const e of atMax ?? []) send(e);
    await tick();
    // 41 of 41, invested_forge_points left out because it is 0
    expect(box.text).toContain('St. 41 → 42');
    expect(box.root.querySelector('.gb-overlay')?.textContent).toContain('höchste Stufe');
    for (const e of farBelow ?? []) send(e);
    await tick();
    expect(box.text).toContain('freigeschaltet bis 283');
    expect(box.root.querySelector('.gb-overlay')).toBeNull();
  });
});
