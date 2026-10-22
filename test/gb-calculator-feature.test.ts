// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { foestatsFeature } from '../src/content/features/foestats';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { registerGameHandlers } from '../src/content/game/handlers';
import type { FetchLike } from '../src/persistence/foestats/api';
import fixture from './fixtures/great-buildings.json';
import { featureContext } from './helpers/feature-context';
import type { TestStoresOptions } from './helpers/stores';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: TestStoresOptions = {}) {
  const env = featureContext(options);
  const { ctx } = env;
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now: Date.now });
  let tones = 0;
  createGbCalculatorFeature(() => tones++).setup(ctx);
  foestatsFeature.setup(ctx);
  const box = env.boxes.get('gbCalculator') as NonNullable<ReturnType<typeof env.boxes.get>>;
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
  const ws = (responseData: unknown) =>
    ingestion.accept({
      kind: 'ws',
      data: JSON.stringify([{ requestClass: 'OtherPlayerService', requestMethod: 'newEvent', responseData }]),
      at: 0,
    });
  send(...(fixture.startup as Entry[]), ...(fixture.overviews as Entry[]));
  const opening = (entityId: number) => {
    const o = fixture.openings.find((x) => x.entity.requestData[0] === entityId);
    if (!o) throw new Error(`no opening ${entityId}`);
    return o as { entity: Entry; construction: Entry };
  };
  const open = (entityId: number, entity?: (e: Record<string, unknown>) => Record<string, unknown>) => {
    const o = opening(entityId);
    send(entity ? { ...o.entity, responseData: entity(o.entity.responseData as Record<string, unknown>) } : o.entity);
    send(o.construction);
  };
  const rows = () => [...box.root.querySelectorAll('tr')].slice(1);
  return { ...env, box, send, ws, open, opening, rows, tones: () => tones };
}

describe('LG-Rechner', () => {
  it('opens with a foreign great building and shows every place with its status', async () => {
    const { box, open, rows, tones } = setup();
    open(1909);
    await tick();
    expect(box.box.isOpen).toBe(true);
    expect(box.text).toContain('Aachener Dom St. 75 → 76');
    expect(box.text).toContain('Eigentümer: Eigentümer 1001');
    const owner = [...box.root.querySelectorAll('a')].find((a) => a.textContent === 'Eigentümer 1001');
    expect(owner?.getAttribute('href')).toBe('https://foestats.com/de/de20/players/1001');
    expect(owner?.target).toBe('_blank');
    expect(box.text).toContain('Arche-Bonus: 95,5 %');
    expect(box.text).toContain('Verfügbare FP: unbekannt');
    expect(box.text).toContain('Bis Level-Up fehlen 2.811 FP');
    expect(rows().map((r) => r.className)).toEqual([
      'gb-profit',
      'gb-unavailable',
      'gb-unavailable',
      'gb-unavailable',
      'gb-unavailable',
    ]);
    // place, safe, demand at 90 %, gross, profit, rate, blueprints, medals
    expect([...(rows()[0]?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim())).toEqual([
      '1',
      '1.406',
      '1.387',
      '1.427',
      '21',
      '192,6 %',
      '29',
      '2.111',
    ]);
    expect(tones()).toBe(1);
  });

  it('marks a demand below the safe cost and names the profit at it', async () => {
    const { open, rows } = setup();
    open(1909);
    await tick();
    const demand = rows()[0]?.querySelectorAll('td')[2];
    expect(demand?.className).toBe('num below-safe');
    expect(demand?.getAttribute('title')).toBe('Gewinn bei Fordern: 40 FP\nunter Sicher: nur mit Absprache haltbar');
  });

  it('marks a demand above what the level still needs and keeps the extra over the own deposit', async () => {
    const { box, open, rows } = setup();
    open(2434);
    const input = box.root.querySelector('.gb-factor input') as HTMLInputElement;
    input.value = '200';
    input.dispatchEvent(new Event('change'));
    await tick();
    // rank 1 pays 655: round(655 × 3) = 1965, the level needs 786 more; 575 of mine already in
    const demand = rows()[0]?.querySelectorAll('td')[2];
    expect(demand?.textContent?.trim()).toBe('1.965 (+1.390)');
    expect(demand?.className).toBe('num over-rest');
    expect(demand?.getAttribute('title')).toContain('mehr als bis zum Level-Up fehlt (786 FP)');
    expect(demand?.getAttribute('title')).toContain('Gewinn bei Fordern: -684 FP');
  });

  it('asks to reopen when the construction came without its building', async () => {
    const { box, send, opening } = setup();
    send(opening(1909).construction);
    await tick();
    expect(box.text).toContain('Eigentümer: Eigentümer 1001');
    expect(box.text).toContain('Bitte das LG im Spiel neu öffnen.');
  });

  it('stays closed for an own great building and keeps the foreign one', async () => {
    const { box, send, open } = setup();
    send(fixture.own as Entry);
    expect(box.box.isOpen).toBe(false);
    open(1909);
    send(fixture.own as Entry);
    await tick();
    expect(box.text).toContain('Aachener Dom');
  });

  it('remembers the factor from the buttons and the field and uses it for the demand', async () => {
    const { box, ctx, open, rows } = setup();
    open(1909);
    const demand = () => rows()[0]?.querySelectorAll('td')[2]?.textContent?.trim();
    box.click('100 %');
    await tick();
    expect(ctx.settings.number('gbCalc.factor')).toBe(100);
    expect(demand()).toBe('1.460');
    box.click('Arche');
    await tick();
    expect(ctx.settings.get('gbCalc.factorArc')).toBe(true);
    expect(demand()).toBe('1.427');
    const input = box.root.querySelector('.gb-factor input') as HTMLInputElement;
    input.value = '150';
    input.dispatchEvent(new Event('change'));
    await tick();
    expect(ctx.settings.get('gbCalc.factorArc')).toBe(false);
    // round(730 × 2.5)
    expect(demand()).toBe('1.825');
  });

  it('marks costs the available Forge points do not cover', async () => {
    const { box, ctx, open, rows } = setup();
    ctx.resources.set({ strategy_points: 1000 });
    open(1909);
    await tick();
    expect(box.text).toContain('Verfügbare FP: 1.000');
    expect(rows()[0]?.querySelectorAll('td')[1]?.className).toBe('num short');
  });

  it('counts the Forge point packages into the available Forge points', async () => {
    const { box, ctx, send, open, rows } = setup();
    ctx.resources.set({ strategy_points: 1 });
    send(...(fixture.inventory as Entry[]));
    open(1909);
    await tick();
    expect(box.text).toContain('Verfügbare FP: 108.454');
    expect(box.root.querySelector('.gb-fp')?.getAttribute('title')).toBe('Leiste 1 + Pakete 108.453');
    expect(rows()[0]?.querySelectorAll('td')[1]?.className).toBe('num');
    // packages alone enough or not: 1000 on the bar plus 200 in packages is short of 1406
    ctx.inventory.set([
      {
        id: 1,
        name: '',
        inStock: 100,
        gameClass: 'ForgePointPackagePayload',
        payload: { kind: 'forgePoints', gain: 2 },
      },
    ]);
    ctx.resources.set({ strategy_points: 1000 });
    await tick();
    expect(box.text).toContain('Verfügbare FP: 1.200');
    expect(rows()[0]?.querySelectorAll('td')[1]?.className).toBe('num short');
  });

  it('follows live updates of the resources and the inventory in the header', async () => {
    const { box, send, open } = setup();
    const message = (requestClass: string, requestMethod: string, responseData: unknown): Entry => ({
      requestClass,
      requestMethod,
      requestData: [],
      responseData,
    });
    send(message('ResourceService', 'getPlayerResourceBag', { resources: { resources: { strategy_points: 1 } } }));
    send(...(fixture.inventory as Entry[]));
    open(1909);
    await tick();
    expect(box.text).toContain('Verfügbare FP: 108.454');
    send(message('ResourceService', 'getPlayerResources', { resources: { strategy_points: 11 } }));
    await tick();
    expect(box.text).toContain('Verfügbare FP: 108.464');
    // 9931 → 9930 packages of 10
    send(message('InventoryService', 'updateItem', { id: 9001, amount: 9930 }));
    await tick();
    expect(box.text).toContain('Verfügbare FP: 108.454');
  });

  it('colours the own place and shows the extra above it', async () => {
    const { open, rows } = setup();
    open(2434);
    expect(rows().map((r) => r.className)).toEqual([
      'gb-unavailable',
      'gb-mine',
      'gb-unavailable',
      'gb-unavailable',
      'gb-unavailable',
    ]);
  });

  it('covers the places at the highest level and when not connected', async () => {
    const { box, open } = setup();
    open(1909, (e) => ({ ...e, level: 76 }));
    expect(box.root.querySelector('.gb-overlay')?.textContent).toContain('höchste Stufe');
    open(1909, (e) => ({ ...e, connected: undefined }));
    expect(box.root.querySelector('.gb-overlay')?.textContent).toContain('nicht an eine Straße angeschlossen');
  });

  it('shows a past level with places and Forge points only', async () => {
    const { box, send, open, rows } = setup();
    open(2434);
    send(fixture.ranking as Entry);
    await tick();
    expect(box.text).toContain('Vergangene Stufe 51 → 52');
    expect(box.root.querySelector('.gb-factor')).toBeNull();
    expect([...(rows()[0]?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim())).toEqual([
      '1',
      'Spieler 2011',
      '1.020',
    ]);
    expect(rows()[0]?.querySelector('a')?.getAttribute('href')).toBe('https://foestats.com/de/de20/players/2011');
  });

  it('stays quiet for the same places and covers them after a level up with one more tone', async () => {
    const { box, send, ws, open, opening, tones } = setup();
    open(1909);
    const current = opening(1909).construction;
    send({
      ...current,
      requestMethod: 'getConstructionRanking',
      requestData: [1909, 1001, 76],
      responseData: (current.responseData as { rankings: unknown }).rankings,
    });
    expect(tones()).toBe(1);
    ws({
      type: 'great_building_contribution',
      other_player: { player_id: 1001, name: 'x' },
      great_building_name: 'Aachener Dom',
      level: 76,
      rank: 1,
    });
    await tick();
    expect(box.root.querySelector('.gb-overlay')?.textContent).toContain('auf Stufe 76 gelevelt');
    expect(tones()).toBe(2);
  });

  it('plays no tone when it is switched off', async () => {
    const { ctx, open, tones } = setup();
    await ctx.settings.set('gbCalc.sound', false);
    open(1909);
    expect(tones()).toBe(0);
  });

  describe('activity of the owner by foestats', () => {
    afterEach(() => vi.useRealTimers());

    /** foestats with a history of `[date, points, battles]` per day; `status` other than 200 refuses */
    function foestats(days: [string, number, number][], status = 200) {
      const series = (i: 1 | 2) =>
        JSON.stringify({ success: true, data: days.map((d) => ({ date: d[0], value: d[i] })) });
      return vi.fn<FetchLike>(async (url) => ({
        ok: status === 200,
        status,
        text: async () => (url.endsWith('/points-history') ? series(1) : series(2)),
      }));
    }

    const history: [string, number, number][] = [
      ['2026-10-14', 1000, 50],
      ['2026-10-15', 1000, 50],
      ['2026-10-16', 1200, 50],
      ['2026-10-17', 1200, 53],
      ['2026-10-18', 1500, 53],
      ['2026-10-19', 1500, 53],
      ['2026-10-20', 1500, 53],
      ['2026-10-21', 1500, 53],
      ['2026-10-22', 1500, 53],
    ];

    function activitySetup(fetch: FetchLike) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 9, 22, 9, 0));
      return setup({ fetch });
    }

    const line = (root: HTMLElement) => root.querySelector('.gb-activity') as HTMLElement | null;

    it('shows the last active day and the last week in the header, flagged after three quiet days', async () => {
      const fetch = foestats(history);
      const { box, open } = activitySetup(fetch);
      open(1909);
      await vi.waitFor(() => expect(line(box.root)).not.toBeNull());
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        'https://api.forge-db.com/api/players/de/de20/1001/points-history',
        'https://api.forge-db.com/api/players/de/de20/1001/battles-history',
      ]);
      const activity = line(box.root) as HTMLElement;
      expect(activity.textContent).toBe('zuletzt aktiv vor 4 Tagen · 7 Tage: +500 Punkte, +3 Kämpfe');
      expect(activity.className).toBe('gb-activity warn');
      expect(activity.title).toBe('Punkte und Kämpfe laut foestats.com, Stand 2026-10-22');
    });

    it('reads the stored days when the owner is opened again the same day', async () => {
      const fetch = foestats(history.slice(0, 5));
      const { box, open, ctx } = activitySetup(fetch);
      open(1909);
      await vi.waitFor(() => expect(line(box.root)).not.toBeNull());
      open(1909);
      await vi.waitFor(() => expect(ctx.foestats.get(1001 as never)).toBeDefined());
      await tick();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(line(box.root)?.textContent).toBe('zuletzt aktiv vor 4 Tagen · 4 Tage: +500 Punkte, +3 Kämpfe');
    });

    it('says when foestats cannot be reached', async () => {
      const { box, open } = activitySetup(foestats([], 403));
      open(1909);
      await vi.waitFor(() => expect(line(box.root)?.textContent).toBe('foestats nicht erreichbar'));
      expect(line(box.root)?.className).toBe('gb-activity muted');
    });

    it('asks nothing and hides the activity when the setting is off, but keeps the link', async () => {
      const fetch = foestats(history);
      const { box, open, ctx } = activitySetup(fetch);
      await ctx.settings.set('foestats.fetch', false);
      open(1909);
      await tick();
      await tick();
      expect(fetch).not.toHaveBeenCalled();
      expect(line(box.root)).toBeNull();
      expect(box.root.querySelector('a')?.getAttribute('href')).toBe('https://foestats.com/de/de20/players/1001');
    });

    it('is a setting that is on by default and tells what it sends', () => {
      const { ctx } = setup();
      expect(ctx.settings.get('foestats.fetch')).toBe(true);
      expect(ctx.settings.defs.find((d) => d.key === 'foestats.fetch')).toMatchObject({
        label: 'foestats.fetchSetting',
        hint: 'foestats.fetchHint',
      });
    });
  });
});
