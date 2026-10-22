// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { foestatsFeature } from '../src/content/features/foestats';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { registerGameHandlers } from '../src/content/game/handlers';
import type { FetchLike } from '../src/shared/foestats-api';
import definitions from './fixtures/gb-definitions.json';
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
  const loadDefinitions = () => {
    for (const f of definitions.files)
      ingestion.accept({ kind: 'meta', url: f.url, response: JSON.stringify(f.json), at: 0 });
  };
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
  return { ...env, box, send, ws, open, opening, rows, loadDefinitions, tones: () => tones };
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
    // place, invested, safe, gross, profit, demand at 90 %, rate; blueprints and medals are not shown
    const cells = (row: Element | undefined) =>
      [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim());
    expect([...box.root.querySelectorAll('th')].map((th) => th.textContent?.trim())).toEqual([
      'Platz',
      'Investiert',
      'Sichern',
      'FP',
      'Gewinn',
      'Fördern',
      'Kurs',
    ]);
    expect(cells(rows()[0])).toEqual(['1', '–', '1.406', '1.427', '21', '1.387', '192,6 %']);
    // place 2 costs the same 1406 as place 1, which is better: no safe cost, profit or rate, reward and demand stay
    expect(cells(rows()[1])).toEqual(['2', '–', '–', '714', '–', '694', '–']);
    expect(tones()).toBe(1);
  });

  it('marks a demand below the safe cost and names the profit at it', async () => {
    const { open, rows } = setup();
    open(1909);
    await tick();
    const demand = rows()[0]?.querySelectorAll('td')[5];
    expect(demand?.className).toBe('num below-safe');
    expect(demand?.getAttribute('title')).toBe('Gewinn bei Fördern: 40 FP\nunter Sichern: nur mit Absprache haltbar');
  });

  it('marks a demand above what the level still needs and keeps the extra over the own deposit', async () => {
    const { box, open, rows } = setup();
    open(2434);
    const input = box.root.querySelector('.gb-factor input') as HTMLInputElement;
    input.value = '200';
    input.dispatchEvent(new Event('change'));
    await tick();
    // rank 1 pays 655: round(655 × 3) = 1965, the level needs 786 more; 575 of mine already in
    const demand = rows()[0]?.querySelectorAll('td')[5];
    expect(demand?.textContent?.trim()).toBe('1.965 (+1.390)');
    expect(demand?.className).toBe('num over-rest');
    expect(demand?.getAttribute('title')).toContain('mehr als bis zum Level-Up fehlt (786 FP)');
    expect(demand?.getAttribute('title')).toContain('Gewinn bei Fördern: -684 FP');
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
    const demand = () => rows()[0]?.querySelectorAll('td')[5]?.textContent?.trim();
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
    expect(rows()[0]?.querySelectorAll('td')[2]?.className).toBe('num short');
  });

  it('counts the Forge point packages into the available Forge points', async () => {
    const { box, ctx, send, open, rows } = setup();
    ctx.resources.set({ strategy_points: 1 });
    send(...(fixture.inventory as Entry[]));
    open(1909);
    await tick();
    expect(box.text).toContain('Verfügbare FP: 108.454');
    expect(box.root.querySelector('.gb-fp')?.getAttribute('title')).toBe('Leiste 1 + Pakete 108.453');
    expect(rows()[0]?.querySelectorAll('td')[2]?.className).toBe('num');
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
    expect(rows()[0]?.querySelectorAll('td')[2]?.className).toBe('num short');
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

  it('plays no tone when only a place that cannot be had would pay', async () => {
    const { send, opening, rows, tones } = setup();
    const { entity, construction } = opening(1909);
    type Row = { rank?: number; reward?: { strategy_point_amount: number } };
    // the empty Aachener Dom with place 1 paying 10 and place 2 paying 2000: place 2 costs the same as place 1
    const rankings = (construction.responseData as { rankings: Row[] }).rankings.map((r) =>
      r.reward && (r.rank === 1 || r.rank === 2)
        ? { ...r, reward: { ...r.reward, strategy_point_amount: r.rank === 1 ? 10 : 2000 } }
        : r,
    );
    send(entity);
    send({ ...construction, responseData: { ...(construction.responseData as object), rankings } });
    await tick();
    expect(rows().map((r) => r.className)).toEqual([
      'gb-loss',
      'gb-unavailable',
      'gb-unavailable',
      'gb-unavailable',
      'gb-unavailable',
    ]);
    expect(tones()).toBe(0);
  });

  describe('scenario of the user (2026-10-22): rest 5404 on the empty level, places 1275/640/215/55/10, Arc 95.5 %', () => {
    type Row = { rank?: number; forge_points?: number; player?: Record<string, unknown>; reward?: object };
    const NET = [1275, 640, 215, 55, 10];
    /** the Aachener Dom with the owner's 251 and `deposits` on places 1 to 5; `me` marks the own place */
    const scenario = (deposits: number[], me?: number, net = NET, required = 5655) => {
      const env = setup();
      const { entity, construction } = env.opening(1909);
      const rankings = (construction.responseData as { rankings: Row[] }).rankings.map((r) => {
        if (r.rank === undefined) return r;
        const fp = deposits[r.rank - 1];
        return {
          ...r,
          ...(fp !== undefined && { forge_points: fp }),
          player: { ...r.player, name: `Spieler ${r.rank}`, ...(r.rank === me && { is_self: true }) },
          reward: { ...r.reward, strategy_point_amount: net[r.rank - 1] },
        };
      });
      const invested = 251 + deposits.reduce((sum, fp) => sum + fp, 0);
      const e = entity.responseData as { state: object };
      env.send({
        ...entity,
        responseData: {
          ...e,
          state: { ...e.state, invested_forge_points: invested, forge_points_for_level_up: required },
        },
      });
      env.send({ ...construction, responseData: { ...(construction.responseData as object), rankings } });
      return env;
    };
    const cells = (row: Element | undefined) =>
      [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim());
    /** the lines about the own deposit, the second lists the places still to make safe */
    const meLines = (root: HTMLElement) => {
      const me = root.querySelector('.gb-me');
      const targets = me?.querySelector('.muted')?.textContent?.trim();
      const first = me?.textContent
        ?.replace(targets ?? '', '')
        .replace(/\s+/g, ' ')
        .trim();
      return targets === undefined ? [first] : [first, targets];
    };

    const best = (root: HTMLElement) => [...root.querySelectorAll('.gb-me b')].map((b) => b.textContent?.trim());

    it('empty: only place 1 has a safe cost, profit and rate, and the line offers only place 1', () => {
      const { box, rows } = scenario([]);
      // round(5404 / 2) = 2702 for round(1275 × 1.955) = 2493; demand round(1275 × 1.9) = 2423
      expect(cells(rows()[0])).toEqual(['1', '–', '2.702', '2.493', '-209', '2.423', '211,9 %']);
      // the others cost the same 2702 for less: dominated, reward and demand stay
      expect(rows().slice(1).map(cells)).toEqual([
        ['2', '–', '–', '1.251', '–', '1.216', '–'],
        ['3', '–', '–', '420', '–', '409', '–'],
        ['4', '–', '–', '108', '–', '105', '–'],
        ['5', '–', '–', '20', '–', '19', '–'],
      ]);
      expect(meLines(box.root)).toEqual(['Du: noch nichts eingezahlt', 'P1 sicher: 2.702']);
      expect(best(box.root)).toEqual(['P1 sicher: 2.702']);
    });

    it('nothing paid in: the places that can be had with their safe total, the best profit in bold', () => {
      // seen in the browser: 1970 missing, place 1 holds 3099, place 2 holds 479, gross 4291/2151/714/176/39
      const { box, rows } = scenario([3099, 479], undefined, [2195, 1100, 365, 90, 20], 251 + 3578 + 1970);
      expect(box.text).toContain('Bis Level-Up fehlen 1.970 FP');
      expect(rows().map((r) => cells(r)[3])).toEqual(['4.291', '2.151', '714', '176', '39']);
      // place 1: round((3099 + 1970) / 2) = 2535 cannot pass 3099; place 2: round(2449 / 2) = 1225 for 926 profit;
      // place 3: round(1970 / 2) = 985 for -271; place 4 the same 985: dominated
      expect(cells(rows()[0])?.[2]).toBe('✓');
      expect(meLines(box.root)).toEqual(['Du: noch nichts eingezahlt', 'P2 sicher: 1.225 · P3 sicher: 985']);
      expect(best(box.root)).toEqual(['P2 sicher: 1.225']);
    });

    it('nothing paid in and every place safe: says that no place can be had', () => {
      // 50 left: every holder is safe
      const { box } = scenario([3000, 2000, 1000, 500, 100], undefined, NET, 251 + 6600 + 50);
      expect(meLines(box.root)).toEqual(['Du: noch nichts eingezahlt', 'kein Platz zu haben']);
      expect(best(box.root)).toEqual([]);
    });

    it('partly filled with me on place 3: every place I can still make safe, my rate now and when safe', () => {
      // others 1500 and 900, me 400: rest 3004, 2604 missing
      const { box, rows } = scenario([1500, 900, 400], 3);
      expect(box.text).toContain('Bis Level-Up fehlen 2.604 FP');
      expect(cells(rows()[0])?.slice(0, 3)).toEqual(['1', '1.500', '2.252 (+1.852)']);
      // 1952 passes place 1 for now, but place 1 can pass back and place 2 cannot: place 2 is safe at 1952
      expect(cells(rows()[1])?.slice(0, 3)).toEqual(['2', '900', '1.952 (+1.552)']);
      expect(rows()[1]?.className).not.toBe('gb-unavailable');
      // own row: round(3004 / 2) = 1502; 400 / 215 = 186 % now, 1502 / 215 = 698.6 % when safe
      expect(cells(rows()[2])).toEqual(['3', '400', '1.502 (+1.102)', '420', '-1.082', '409 (+9)', '186 % → 698,6 %']);
      const now = rows()[2]?.querySelectorAll('td')[6]?.querySelector('span');
      expect(now?.className).toBe('muted');
      expect(now?.getAttribute('title')).toBe('wenn du nichts mehr einzahlst und dich niemand überholt');
      expect(box.root.querySelector('.gb-me')?.className).toBe('gb-me');
      expect(meLines(box.root)).toEqual([
        'Du: 400 FP auf P3 · nicht sicher',
        'P1 sicher: +1.852 · P2 sicher: +1.552 · P3 sicher: +1.102',
      ]);
      // profits 2493 - 2252 = 241, 1251 - 1952 = -701, 420 - 1502 = -1082
      expect(best(box.root)).toEqual(['P1 sicher: +1.852']);
    });

    it('safe on place 1: the line says so and the own row shows a check mark and one rate', () => {
      // me 2800 alone: rest 5404, round(5404 / 2) = 2702 cannot pass me
      const { box, rows } = scenario([2800], 1);
      expect(meLines(box.root)).toEqual(['Du: 2.800 FP auf P1 · sicher ✓']);
      expect(box.root.querySelector('.gb-me')?.className).toBe('gb-me safe');
      // the own deposit is the cost once it is more than the safe 2702: 2493 - 2800
      expect(cells(rows()[0])?.slice(0, 5)).toEqual(['1', '2.800', '✓', '2.493', '-307']);
      // 2800 / 1275 = 219.6 %
      expect(cells(rows()[0])?.[6]).toBe('219,6 %');
    });

    it('leaves out the places above that cannot be had', () => {
      // place 1 holds 4000, me 400 on 2: rest 5404 - 4000 = 1404; round((4000 + 1404) / 2) = 2702 cannot pass it
      const { box, rows } = scenario([4000, 400], 2);
      expect(cells(rows()[0])?.slice(0, 3)).toEqual(['1', '4.000', '✓']);
      // own place: round(1404 / 2) = 702
      expect(meLines(box.root)).toEqual(['Du: 400 FP auf P2 · nicht sicher', 'P2 sicher: +302']);
    });
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
      await vi.waitFor(() => expect(line(box.root)?.parentElement?.querySelector('.spinner')).toBeNull());
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
      await vi.waitFor(() => expect(line(box.root)?.parentElement?.querySelector('.spinner')).toBeNull());
      open(1909);
      await vi.waitFor(() => expect(ctx.foestats.get(1001 as never)?.loading).toBe(false));
      await tick();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(line(box.root)?.textContent).toBe('zuletzt aktiv vor 4 Tagen · 4 Tage: +500 Punkte, +3 Kämpfe');
    });

    it('labels the line and shows that foestats is being asked before anything is known', async () => {
      let answer = () => {};
      const answered = new Promise<void>((resolve) => {
        answer = resolve;
      });
      const ready = foestats(history);
      const fetch = vi.fn<FetchLike>(async (url, init) => {
        await answered;
        return ready(url, init);
      });
      const { box, open } = activitySetup(fetch);
      open(1909);
      await vi.waitFor(() => expect(line(box.root)?.textContent).toBe('wird von foestats geladen …'));
      const header = line(box.root)?.parentElement as HTMLElement;
      expect(header.textContent).toContain('Aktivität:');
      expect(header.querySelector('.spinner')).not.toBeNull();
      answer();
      await vi.waitFor(() => expect(header.querySelector('.spinner')).toBeNull());
      expect(line(box.root)?.textContent).toBe('zuletzt aktiv vor 4 Tagen · 7 Tage: +500 Punkte, +3 Kämpfe');
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

  describe('level preview', () => {
    const cells = (row: Element | undefined) =>
      [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim());
    const levelInput = (root: HTMLElement) => root.querySelector('.gb-levels input') as HTMLInputElement;
    const choose = (root: HTMLElement, level: number) => {
      const input = levelInput(root);
      input.value = String(level);
      input.dispatchEvent(new Event('change'));
    };

    it('shows a later level from the field open and empty', () => {
      const { box, open, rows, loadDefinitions, tones } = setup();
      loadDefinitions();
      open(1909);
      expect(levelInput(box.root).value).toBe('75');
      expect(box.text).not.toContain('Laufend');
      choose(box.root, 76);
      expect(box.text).toContain('Laufend 75 → 76');
      expect(box.text).toContain('Vorschau Stufe 76 → 77');
      expect(box.text).toContain('noch nicht freigeschaltet');
      expect(box.text).toContain('Die Stufe kostet 3.138 FP');
      expect(box.text).not.toContain('Bis Level-Up fehlen');
      expect(box.root.querySelector('.gb-overlay')).toBeNull();
      // empty: only the first place can be had, a deposit on any other would land on it
      expect(rows().map((r) => r.className)).toEqual([
        'gb-loss',
        'gb-unavailable',
        'gb-unavailable',
        'gb-unavailable',
        'gb-unavailable',
      ]);
      expect(cells(rows()[0])).toEqual(['1', '–', '1.569', '1.447', '-122', '1.406', '212 %']);
      expect(cells(rows()[1])).toEqual(['2', '–', '–', '723', '–', '703', '–']);
      expect(rows().map((r) => cells(r)[3])).toEqual(['1.447', '723', '244', '59', '10']);
      expect(box.root.querySelector('.estimate')).toBeNull();
      expect(tones()).toBe(1);
    });

    it('takes any later level from the field and goes back to the live construction', async () => {
      const { box, open, rows, loadDefinitions } = setup();
      loadDefinitions();
      open(1909);
      choose(box.root, 90);
      expect(box.text).toContain('Vorschau Stufe 90 → 91');
      expect(box.text).toContain('Die Stufe kostet 4.434 FP');
      expect(cells(rows()[0])?.[0]).toBe('1');
      // the factor still sets the demand: 910 × 2
      box.click('100 %');
      await tick();
      expect(cells(rows()[0])?.[5]).toBe('1.820');
      box.click('Laufend');
      expect(box.text).not.toContain('Vorschau Stufe');
      expect(box.text).toContain('Bis Level-Up fehlen 2.811 FP');
      expect(levelInput(box.root).value).toBe('75');
    });

    it('goes back to the live construction when the field gets the current level', () => {
      const { box, open, loadDefinitions } = setup();
      loadDefinitions();
      open(1909);
      choose(box.root, 90);
      choose(box.root, 75);
      expect(box.text).not.toContain('Vorschau Stufe');
      expect(box.text).toContain('Bis Level-Up fehlen 2.811 FP');
    });

    it('ignores a level that is not after the current construction', () => {
      const { box, open, loadDefinitions } = setup();
      loadDefinitions();
      open(1909);
      choose(box.root, 74);
      expect(box.text).not.toContain('Vorschau Stufe');
    });

    it('marks computed rewards past the table as estimate', () => {
      const { box, open, rows, loadDefinitions } = setup();
      loadDefinitions();
      open(1500);
      choose(box.root, 421);
      const gross = rows()[0]?.querySelectorAll('td')[3];
      expect(gross?.className).toBe('num estimate');
      expect(gross?.getAttribute('title')).toBe('Belohnung geschätzt, auf etwa 5 FP genau');
      expect(gross?.textContent).toContain('≈');
    });

    it('says what is missing without the definition or past every known level', () => {
      const { box, open, loadDefinitions } = setup();
      open(1909);
      choose(box.root, 76);
      expect(box.text).toContain('Definition des LGs ist noch nicht geladen');
      loadDefinitions();
      choose(box.root, 2000);
      expect(box.text).toContain('Für diese Stufe ist die Belohnung nicht bekannt.');
      expect(box.text).toContain('Die Stufe kostet');
    });

    it('starts live again when another great building is opened', () => {
      const { box, open, loadDefinitions } = setup();
      loadDefinitions();
      open(1909);
      choose(box.root, 76);
      open(650);
      expect(box.text).not.toContain('Vorschau Stufe');
      expect(levelInput(box.root).value).toBe('49');
    });
  });
});
