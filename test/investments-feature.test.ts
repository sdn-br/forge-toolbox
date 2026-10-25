// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { investmentsFeature } from '../src/content/features/investments';
import { registerGameHandlers } from '../src/content/game/handlers';
import { GreatBuildingStore } from '../src/content/stores/great-buildings';
import { playerId, worldId } from '../src/shared/ids';
import contributionFixture from './fixtures/gb-contribution.json';
import contributions from './fixtures/gb-contributions.json';
import { testDb } from './helpers/battle-db';
import { featureContext } from './helpers/feature-context';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

/** reads the known buildings of the current setup; it queues behind the writes and the box's own read */
let drain: (() => Promise<unknown>) | undefined;
/** the stored buildings come back through an in-memory IndexedDB; a fixed wait is too short when the whole suite runs */
const tick = async () => {
  await drain?.();
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const MINUTE = 60_000;

function setup() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000_000);
  const now = () => Date.now();
  const env = featureContext({ now });
  const { ctx } = env;
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now });
  investmentsFeature.setup(ctx);
  drain = () => ctx.greatBuildings.known();
  const box = env.boxes.get('investments') as NonNullable<ReturnType<typeof env.boxes.get>>;
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
  send(...(contributions.startup as Entry[]));
  const rows = () => [...box.root.querySelectorAll('tbody tr')];
  const cells = (row: Element | undefined) =>
    [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
  const heads = () => [...box.root.querySelectorAll('thead th')];
  return {
    ...env,
    ...ctx,
    box,
    send,
    rows,
    cells,
    heads,
    menuClick: env.menu,
    advance: (ms: number) => vi.setSystemTime(Date.now() + ms),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('Investitionen box', () => {
  it('opens on the own investments when the town hall list arrives, one row per building', async () => {
    const { box, send, rows, cells } = setup();
    send(contributions.contributions as Entry);
    await tick();
    expect(box.box.isOpen).toBe(true);
    expect(box.text).toContain('Meine Investitionen');
    expect(rows()).toHaveLength(12);
    // nearest level up first: the Leuchtturm misses 17
    expect(cells(rows()[0])).toEqual([
      'Eigentümer 2005',
      'Leuchtturm von Alexandria',
      '30',
      'P1',
      '242',
      '−12',
      '',
      '907 / 924',
    ]);
    const progress = rows()[0]?.querySelector('td.inv-progress') as HTMLElement;
    expect(progress.dataset.tip).toBe('Fehlt bis zum Level-up: 17 von 924 FP');
    expect((progress.querySelector('.fp-bar > div') as HTMLElement).style.width).toMatch(/^98\.1/);
  });

  it('shows growth between two town hall lists of a building never opened', async () => {
    const { send, rows, advance } = setup();
    const first = contributions.contributions
      .responseData[0] as (typeof contributions.contributions.responseData)[number];
    const listed = (progress: number) =>
      send({ ...contributions.contributions, responseData: [{ ...first, current_progress: progress }] } as Entry);
    listed(24_602);
    await tick();
    expect(rows()[0]?.classList.contains('grown')).toBe(false);
    advance(MINUTE);
    listed(25_002);
    await tick();
    expect(rows()[0]?.classList.contains('grown')).toBe(true);
    expect(rows()[0]?.querySelector('td.inv-progress .inv-growth')?.textContent).toBe('+400');
  });

  it('shows the age of a town hall list from before a reload', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    const now = () => Date.now();
    // the list came before this page load: it is in the database, but no event reaches the box
    const db = testDb({ now });
    await db.greatBuildings.putContributions(worldId('de20'), [], 1_000_000);
    const env = featureContext({
      now,
      overrides: ({ bus, world }) => ({ greatBuildings: new GreatBuildingStore(bus, world, db.greatBuildings, now) }),
    });
    await env.ctx.greatBuildings.load();
    vi.setSystemTime(1_000_000 + 7 * MINUTE);
    investmentsFeature.setup(env.ctx);
    env.menu('investments');
    await env.ctx.greatBuildings.known();
    expect(env.boxes.get('investments')?.text).toContain('Stand: vor 7 Min.');
  });

  it('shows the age of the town hall list and the totals', async () => {
    const { box, send, advance } = setup();
    send(contributions.contributions as Entry);
    await tick();
    advance(5 * MINUTE);
    box.box.update();
    expect(box.text).toContain('Stand: vor 5 Min.');
    // no Arc bonus without an own city: profit is the net reward minus the own deposit
    expect(box.text).toContain('Umlauf: 4.896 FP');
    const line = box.root.querySelector('p.gb-me') as HTMLElement;
    // the safe profit stands out, green only above 0; the total stays muted
    expect(line.querySelector('b')?.textContent).toBe('Gewinn sicher: 0');
    expect(line.querySelector('b')?.classList.contains('gain')).toBe(false);
    expect(line.querySelector('.muted')?.textContent?.trim()).toBe('· gesamt: −36');
  });

  it('marks the status with an icon and its word in the tooltip', async () => {
    const { send, rows } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const status = rows()[0]?.querySelectorAll('td')[6];
    expect(status?.getAttribute('aria-label')).toBe('unbekannt: ohne passende Rangliste nicht entscheidbar, LG öffnen');
    expect(status?.querySelector('svg')).not.toBeNull();
  });

  it('stays closed with the setting off', async () => {
    const { box, send, settings } = setup();
    await settings.set('investments.openWithList', false);
    send(contributions.contributions as Entry);
    await tick();
    expect(box.box.isOpen).toBe(false);
  });

  it('sorts by a column on a click on its head and turns around on the second', async () => {
    const { send, rows, cells, heads } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const deposit = heads().find((h) => h.textContent?.trim() === 'Einzahlung') as HTMLElement;
    deposit.click();
    await tick();
    expect(cells(rows()[0])[4]).toBe('1.886');
    (heads().find((h) => h.textContent?.trim() === 'Einzahlung') as HTMLElement).click();
    await tick();
    expect(cells(rows()[0])[4]).toBe('1');
  });

  it('opens from the menu and tells when no town hall list was seen', async () => {
    const { box, menuClick } = setup();
    menuClick('investments');
    await tick();
    expect(box.box.isOpen).toBe(true);
    expect(box.text).toContain('Rathausliste');
  });

  it('highlights a building that grew since it was opened, until it is opened again', async () => {
    const { send, rows, box, advance } = setup();
    send(...(contributionFixture.startup as Entry[]));
    for (const e of contributionFixture.opening as Entry[]) send(e);
    send(...(contributionFixture.contribution as Entry[]));
    const own = contributions.contributions.responseData[0];
    const list = (progress: number) => {
      // a list newer than what is known changes the numbers
      advance(MINUTE);
      send({
        ...contributions.contributions,
        responseData: [
          {
            ...own,
            entity_id: 222,
            level: 63,
            rank: 2,
            forge_points: 301,
            current_progress: progress,
            max_progress: 1935,
            player: { player_id: 1001, name: 'Eigentümer 1001' },
          },
        ],
      } as Entry);
    };
    list(1800);
    await tick();
    expect(rows()[0]?.classList.contains('grown')).toBe(true);
    expect(box.text).toContain('+44');
    // opened again with what others paid meanwhile: 44 more on place 1
    const [entity, construction] = contributionFixture.opening as Entry[];
    const contributed = (contributionFixture.contribution as Entry[]).find(
      (e) => e.requestMethod === 'contributeForgePoints',
    ) as Entry;
    const rankings = (contributed.responseData as { rank?: number; forge_points?: number }[]).map((r) =>
      r.rank === 1 ? { ...r, forge_points: (r.forge_points ?? 0) + 44 } : r,
    );
    const building = entity?.responseData as { state: object };
    send({
      ...entity,
      responseData: { ...building, state: { ...building.state, invested_forge_points: 1800 } },
    } as Entry);
    advance(MINUTE);
    send({ ...construction, responseData: { rankings } } as Entry);
    await tick();
    list(1800);
    await tick();
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.classList.contains('grown')).toBe(false);
  });
});

describe('Investitionen: reading the known buildings', () => {
  it('reads them once for all events of an opened building', async () => {
    const { send, menuClick, greatBuildings } = setup();
    send(...(contributionFixture.startup as Entry[]));
    menuClick('investments');
    await tick();
    const reads = vi.spyOn(greatBuildings, 'known');
    for (const e of contributionFixture.opening as Entry[]) send(e);
    send(...(contributionFixture.contribution as Entry[]));
    await tick();
    // one read of the box, one of the test waiting for it
    expect(reads).toHaveBeenCalledTimes(2);
  });

  it('reads once more after a running read, however many events come meanwhile', async () => {
    const { bus, menuClick, greatBuildings } = setup();
    menuClick('investments');
    await tick();
    const reads = vi.spyOn(greatBuildings, 'known');
    const changed = () => bus.emit('greatBuilding.changed', { owner: playerId(1001), entityId: 1, reason: 'ranking' });
    changed();
    await vi.waitFor(() => expect(reads).toHaveBeenCalledTimes(1));
    changed();
    changed();
    changed();
    await tick();
    // two reads of the box, one of the test waiting for them
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it('rates the read buildings anew on other inputs without reading them again', async () => {
    const { bus, send, box, settings, greatBuildings } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const reads = vi.spyOn(greatBuildings, 'known');
    const drawn = box.updates.length;
    bus.emit('catalog.updated', { defs: [] });
    expect(box.updates.length).toBe(drawn + 1);
    // a collection in the own city leaves the Arc bonus as it is; the factor is the calculator's, a snipe is about profit
    bus.emit('city.ownChanged', { reset: false, buildingIds: [1] });
    await settings.set('gbCalc.factor', 80);
    expect(box.updates.length).toBe(drawn + 1);
    expect(reads).not.toHaveBeenCalled();
  });
});
