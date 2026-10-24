// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { registerGameHandlers } from '../src/content/game/handlers';
import definitions from './fixtures/gb-definitions.json';
import levelUp from './fixtures/gb-level-up.json';
import fixture from './fixtures/great-buildings.json';
import { featureContext } from './helpers/feature-context';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

/** the stored buildings come back through an in-memory IndexedDB, which takes a few turns */
const tick = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 5));
};
const MINUTE = 60_000;

function setup() {
  // the stores, the handlers and the box all read the clock; only the date is faked
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000_000);
  const now = () => Date.now();
  const env = featureContext({ now });
  const { ctx } = env;
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now });
  let tones = 0;
  createGbCalculatorFeature(() => tones++).setup(ctx);
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
  for (const f of definitions.files)
    ingestion.accept({ kind: 'meta', url: f.url, response: JSON.stringify(f.json), at: 0 });
  send(...(fixture.startup as Entry[]));
  const list = (responseData: unknown[], owner = 1001) =>
    send({
      requestClass: 'GreatBuildingsService',
      requestMethod: 'getOtherPlayerOverview',
      requestData: [owner],
      responseData,
    });
  const open = (entityId: number) => {
    const o = fixture.openings.find((x) => x.entity.requestData[0] === entityId);
    if (!o) throw new Error(`no opening ${entityId}`);
    send(o.entity as Entry);
    send(o.construction as Entry);
  };
  const rows = () => [...box.root.querySelectorAll('tr')].slice(1);
  const cells = (row: Element | undefined) =>
    [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim());
  return {
    ...env,
    ...ctx,
    box,
    send,
    list,
    open,
    rows,
    cells,
    tones: () => tones,
    advance: (ms: number) => {
      vi.setSystemTime(Date.now() + ms);
    },
  };
}

type Row = {
  entity_id: number;
  city_entity_id: string;
  name: string;
  level: number;
  current_progress?: number;
  max_progress: number;
  player: { player_id: number; name: string };
};
const zeus = levelUp.overview.responseData[0] as Row;
const lighthouse = levelUp.overview.responseData[1] as Row;
const oracle = levelUp.overview.responseData[2] as Row;
/** rows that pay a place: Zeusstatue P1 pays 45, Orakel 75, so a cost of 80 or 100 makes place 1 cheap enough */
const hitZeus = () => withRequired(zeus, 80);
const hitOracle = () => withRequired(oracle, 100);
const withRequired = (r: Row, required: number, invested?: number): Row => ({
  ...r,
  max_progress: required,
  ...(invested !== undefined && { current_progress: invested }),
});

afterEach(() => vi.useRealTimers());

describe('Snipehilfe: box with tabs', () => {
  it('has the tabs Liste and LG and shows the building until a list comes', async () => {
    const { box, tones } = setup();
    box.box.open();
    expect(box.root.querySelectorAll('.tabs button').length).toBe(2);
    expect([...box.root.querySelectorAll('.tabs button')].map((b) => b.textContent)).toEqual(['Liste', 'LG']);
    expect(box.text).toContain('Noch kein fremdes LG geöffnet.');
    box.click('Liste');
    expect(box.text).toContain('Noch keine LG-Liste');
    expect(tones()).toBe(0);
  });

  it('opens with a list that has hits, shows the owner, its age and the rows by profit', async () => {
    const { box, list, rows, cells, tones, advance } = setup();
    list([hitZeus(), lighthouse, hitOracle()]);
    await tick();
    expect(box.box.isOpen).toBe(true);
    expect(box.root.querySelector('.tabs .active')?.textContent).toBe('Liste');
    expect(box.text).toContain('LGs von Eigentümer 1001');
    expect(box.text).toContain('Stand: vor 1 Min.');
    advance(4 * MINUTE);
    box.box.update();
    await tick();
    expect(box.text).toContain('Stand: vor 4 Min.');
    expect([...box.root.querySelectorAll('th')].map((th) => th.getAttribute('aria-label'))).toEqual([
      'LG',
      'Stufe',
      'Fortschritt',
      'Platz',
      'Einsatz',
      'Gewinn',
      'Sicherheit',
    ]);
    // the lighthouse has no loaded definition: unknown reward; the others pay a place
    expect(rows()).toHaveLength(2);
    const [first] = cells(rows()[0]);
    expect(['Zeusstatue', 'Orakel von Delphi']).toContain(first);
    expect(box.text).toContain('Belohnung unbekannt: 1');
    expect(tones()).toBe(1);
  });

  it('marks a building without a deposit as maybe locked and shows the tier with a tooltip', async () => {
    const { box, list, rows } = setup();
    list([hitZeus()]);
    await tick();
    expect(rows()[0]?.getAttribute('data-tip')).toContain('eventuell gesperrt');
    const tier = rows()[0]?.querySelector('td.snipe-tier');
    expect(tier?.className).toContain('safe');
    expect(tier?.getAttribute('data-tip')).toContain('sicher');
    expect(box.root.querySelector('td.snipe-tier svg')).not.toBeNull();
  });

  it('gives a range as profit when not exact and sorts by a clicked column head', async () => {
    const { box, list, rows, cells } = setup();
    list([withRequired(zeus, 80, 20), withRequired(oracle, 100, 30)]);
    await tick();
    const profits = rows().map((r) => cells(r)[5] ?? '');
    expect(profits.every((p) => /^[+−]?\d[\d.]* … [+−]?\d[\d.]*$|^[+−]?\d[\d.]*$/.test(p))).toBe(true);
    const names = () => rows().map((r) => cells(r)[0]);
    const before = names();
    (box.root.querySelectorAll('th')[0] as HTMLElement).click();
    await tick();
    const ascending = names();
    expect(ascending).toEqual([...before].sort((a, b) => (a ?? '').localeCompare(b ?? '', 'de')));
    (box.root.querySelectorAll('th')[0] as HTMLElement).click();
    await tick();
    expect(names()).toEqual([...ascending].reverse());
    expect(box.root.querySelector('th.desc')?.getAttribute('aria-label')).toBe('LG');
  });

  it('does not open for a list without a hit, and does not beep', async () => {
    const { box, list, tones } = setup();
    list([withRequired(zeus, 9_000, 400)]);
    await tick();
    expect(box.box.isOpen).toBe(false);
    expect(tones()).toBe(0);
    box.box.open();
    expect(box.text).toContain('Kein LG mit lohnendem Platz.');
    expect(box.text).toContain('ohne Treffer: 1');
  });

  it('switches an open box to the list even without a hit', async () => {
    const { box, list } = setup();
    box.box.open();
    box.click('LG');
    list([withRequired(zeus, 9_000, 400)]);
    await tick();
    expect(box.root.querySelector('.tabs .active')?.textContent).toBe('Liste');
    expect(box.text).toContain('Kein LG mit lohnendem Platz.');
  });

  it('stays closed and quiet when its settings are off', async () => {
    const { box, list, tones, settings } = setup();
    await settings.set('snipe.open', false);
    await settings.set('snipe.sound', false);
    list([hitZeus()]);
    await tick();
    expect(box.box.isOpen).toBe(false);
    expect(tones()).toBe(0);
  });

  it('beeps once per list: the same hits do not beep twice', async () => {
    const { list, tones } = setup();
    list([hitZeus()]);
    await tick();
    list([hitZeus()]);
    await tick();
    expect(tones()).toBe(1);
    list([withRequired(oracle, 90)]);
    await tick();
    expect(tones()).toBe(2);
  });

  it('ignores the own list', async () => {
    const { box, list, tones } = setup();
    list([{ ...hitZeus(), player: { player_id: 1000, name: 'Ich' } }], 1000);
    await tick();
    expect(box.box.isOpen).toBe(false);
    expect(tones()).toBe(0);
  });

  it('a new list replaces the previous one; an opened building switches to the building', async () => {
    const { box, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    open(1909);
    await tick();
    expect(box.root.querySelector('.tabs .active')?.textContent).toBe('LG');
    expect(box.text).toContain('Aachener Dom St. 75 → 76');
    advance(10_000);
    list([hitOracle()], 1001);
    await tick();
    expect(box.root.querySelector('.tabs .active')?.textContent).toBe('Liste');
    expect(box.text).not.toContain('Zeusstatue');
  });

  it('updates the row of an opened building of the list owner to exact', async () => {
    const { box, list, open, advance, rows, cells } = setup();
    // the Aachener Dom of owner 1001 (entity 1909, level 75, 3.062 needed) is opened with 251 paid in, an empty ranking
    const dom = {
      entity_id: 1909,
      city_entity_id: 'X_EarlyMiddleAge_Landmark2',
      name: 'Aachener Dom',
      level: 75,
      max_progress: 3062,
      player: { player_id: 1001, name: 'Eigentümer 1001' },
    };
    advance(10_000);
    list([{ ...dom, current_progress: 2_900 }]);
    await tick();
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['Aachener Dom', '75', '2.900 / 3.062']);
    expect(rows()[0]?.querySelector('td.snipe-tier')?.className).not.toContain('exact');
    advance(10_000);
    open(1909);
    await tick();
    expect(box.root.querySelector('.tabs .active')?.textContent).toBe('LG');
    box.click('Liste');
    // the opening is newer than the list: its state and its ranking make the row exact
    expect(cells(rows()[0]).slice(0, 4)).toEqual(['Aachener Dom', '75', '251 / 3.062', 'P1']);
    expect(rows()[0]?.querySelector('td.snipe-tier')?.className).toContain('exact');
  });
});
