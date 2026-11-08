// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { investmentsFeature } from '../src/content/features/investments';
import { registerGameHandlers } from '../src/content/game/handlers';
import { playerId } from '../src/shared/ids';
import ranking from './fixtures/gb-ranking.json';
import fixture from './fixtures/great-buildings.json';
import { featureContext } from './helpers/feature-context';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

let drain: (() => Promise<unknown>) | undefined;
const tick = async () => {
  await drain?.();
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const DAY = 24 * 60 * 60 * 1000;

function setup(prefs: Record<string, string> = {}) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(10 * DAY);
  const now = () => Date.now();
  const env = featureContext({ now });
  const { ctx } = env;
  for (const [key, value] of Object.entries(prefs)) ctx.ui.savePref(key, value);
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
  send(...(fixture.startup as Entry[]));
  const rows = () => [...box.root.querySelectorAll('tbody tr')];
  const cells = (row: Element | undefined) =>
    [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
  const showFinder = async () => {
    if (!box.box.isOpen) env.menu('investments');
    box.click('LG-Finder');
    await tick();
  };
  const input = (label: string) => box.root.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const type = () => box.root.querySelector('select[aria-label="LG-Typ"]') as HTMLSelectElement;
  const typeIn = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input'));
  };
  return {
    ...env,
    ...ctx,
    openMenu: () => env.menu('investments'),
    box,
    send,
    rows,
    cells,
    showFinder,
    input,
    type,
    typeIn,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Investitionen: LG-Finder', () => {
  it('lists every stored foreign building with owner, relation, building, level, progress and age', async () => {
    const { box, send, rows, cells, showFinder } = setup();
    send(ranking.page as Entry);
    await tick();
    vi.setSystemTime(13 * DAY);
    await showFinder();
    expect([...box.root.querySelectorAll('thead th')].map((th) => th.getAttribute('aria-label'))).toEqual([
      'Eigentümer',
      'Beziehung',
      'LG',
      'Stufe',
      'Fortschritt',
      'Stand',
    ]);
    expect(rows()).toHaveLength(4);
    expect(cells(rows().find((r) => cells(r)[0] === 'Spieler 2018'))).toEqual([
      'Spieler 2018',
      'keine',
      'Die blaue Galaxie',
      '137',
      '25.760 / 27.360',
      'vor 3 T.',
    ]);
    expect(box.text).toContain('4 von 4 LGs');
  });

  it('shows the gold marker before the level of a gold building only, with its tooltip', async () => {
    const { send, rows, showFinder } = setup();
    send(ranking.opened as Entry);
    await tick();
    await showFinder();
    const marked = rows().filter((r) => r.querySelector('.tier-gold'));
    expect(marked).toHaveLength(5);
    const marker = marked[0]?.querySelector('.tier-gold');
    expect(marker?.getAttribute('data-tip')).toBe('Gold-Stufe');
    expect(marker?.closest('td')?.textContent?.trim()).toBe('137');
  });

  it('sorts by level descending by default and by a clicked head', async () => {
    const { box, send, rows, cells, showFinder } = setup();
    send(ranking.buildingSearch as Entry);
    await tick();
    await showFinder();
    expect(rows().map((r) => cells(r)[3])).toEqual(['301', '301', '277', '270', '251', '250']);
    (box.root.querySelector('th[aria-label="Fortschritt"]') as HTMLElement).click();
    expect(rows().map((r) => cells(r)[0])[0]).toBe('Spieler 2027');
  });

  it('filters by the type, sorted by name, the first option all types', async () => {
    const { send, rows, cells, showFinder, type, typeIn } = setup();
    send(ranking.opened as Entry);
    await tick();
    await showFinder();
    expect([...type().options].map((o) => o.textContent?.trim())).toEqual([
      'alle Typen',
      'Alcatraz',
      'Atomium',
      'Cape Canaveral',
      'Château Frontenac',
      'Die Arche',
    ]);
    typeIn(type(), 'X_ModernEra_Landmark2');
    await tick();
    expect(rows().map((r) => cells(r)[2])).toEqual(['Atomium']);
    typeIn(type(), '');
    await tick();
    expect(rows()).toHaveLength(17);
  });

  it('filters by the level from and to, an empty field is open', async () => {
    const { send, rows, cells, showFinder, input, typeIn } = setup();
    send(ranking.buildingSearch as Entry);
    await tick();
    await showFinder();
    typeIn(input('Stufe ab'), '260');
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['301', '301', '277', '270']);
    typeIn(input('Stufe bis'), '300');
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['277', '270']);
    typeIn(input('Stufe ab'), '');
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['277', '270', '251', '250']);
  });

  it('shows started and not started buildings by two toggles, both on by default, both off shows none', async () => {
    const { box, send, rows, cells, showFinder } = setup();
    send(ranking.buildingSearch as Entry);
    await tick();
    await showFinder();
    const toggle = (word: string) =>
      box.root.querySelector(`.inv-started-filter button[aria-label="${word}"]`) as HTMLButtonElement;
    expect(toggle('Angefangene LGs zeigen').getAttribute('aria-pressed')).toBe('true');
    expect(toggle('Nicht angefangene LGs zeigen').getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toHaveLength(6);
    toggle('Nicht angefangene LGs zeigen').click();
    await tick();
    expect(rows()).toHaveLength(3);
    expect(box.text).toContain('3 von 6 LGs');
    toggle('Nicht angefangene LGs zeigen').click();
    await tick();
    toggle('Angefangene LGs zeigen').click();
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['277', '270', '250']);
    toggle('Angefangene LGs zeigen').click();
    await tick();
    expect(rows()).toHaveLength(6);
    toggle('Nicht angefangene LGs zeigen').click();
    await tick();
    toggle('Angefangene LGs zeigen').click();
    await tick();
    expect(rows()).toHaveLength(0);
    expect(box.text).toContain('0 von 6 LGs');
  });

  it('reads the former toggle "only started" as started on and not started off, off or missing as both on', async () => {
    const showing = async (saved: string | undefined) => {
      const t = setup({
        'investments.tab': 'finder',
        ...(saved !== undefined && { 'investments.finderFilter': saved }),
      });
      t.send(ranking.buildingSearch as Entry);
      await tick();
      t.openMenu();
      await tick();
      return t.rows().length;
    };
    expect(await showing(JSON.stringify({ started: true }))).toBe(3);
    expect(await showing(JSON.stringify({ started: false }))).toBe(6);
    expect(await showing(undefined)).toBe(6);
    // a saved pair wins over the old key
    expect(await showing(JSON.stringify({ started: true, progress: { started: true, notStarted: true } }))).toBe(6);
  });

  it('breaks a level tie by the most paid in first, also when sorted ascending', async () => {
    const { box, send, rows, cells, showFinder } = setup();
    const search = ranking.buildingSearch as Entry & { responseData: { rankings: { points: number }[] } };
    const [a, b, ...rest] = search.responseData.rankings;
    send({
      ...search,
      responseData: {
        ...search.responseData,
        rankings: [{ ...(a as object), points: 2 }, { ...(b as object), points: 6892 }, ...rest],
      } as never,
    });
    await tick();
    await showFinder();
    expect(
      rows()
        .map((r) => cells(r)[0])
        .slice(0, 2),
    ).toEqual(['Spieler 2024', 'Spieler 2023']);
    (box.root.querySelector('th[aria-label="Stufe"]') as HTMLElement).click();
    expect(
      rows()
        .map((r) => cells(r)[3])
        .slice(-2),
    ).toEqual(['301', '301']);
    expect(
      rows()
        .map((r) => cells(r)[0])
        .slice(-2),
    ).toEqual(['Spieler 2024', 'Spieler 2023']);
  });

  it('remembers the filter and the tab', async () => {
    const first = setup();
    first.send(ranking.buildingSearch as Entry);
    await tick();
    await first.showFinder();
    first.typeIn(first.input('Stufe ab'), '260');
    first.typeIn(first.type(), 'X_FutureEra_Landmark1');
    await tick();
    expect(first.ui.pref('investments.tab')).toBe('finder');
    expect(JSON.parse(first.ui.pref('investments.finderFilter') ?? '{}')).toEqual({
      type: 'X_FutureEra_Landmark1',
      levelFrom: '260',
      levelTo: '',
      progress: { started: true, notStarted: true },
    });
    const again = setup({
      'investments.tab': 'finder',
      'investments.finderFilter': first.ui.pref('investments.finderFilter') ?? '',
    });
    again.send(ranking.buildingSearch as Entry);
    await tick();
    again.openMenu();
    await tick();
    expect(again.rows()).toHaveLength(4);
    expect(again.input('Stufe ab').value).toBe('260');
  });

  it('fills live when the ranking comes while the tab is open, and the ranking does not open the box', async () => {
    const { box, send, rows, showFinder } = setup();
    send(ranking.page as Entry);
    await tick();
    expect(box.box.isOpen).toBe(false);
    await showFinder();
    expect(rows()).toHaveLength(4);
    send(ranking.buildingSearch as Entry);
    await tick();
    expect(rows()).toHaveLength(10);
  });

  it('says when no foreign building is known', async () => {
    const { box, showFinder } = setup();
    await showFinder();
    expect(box.text).toContain('Noch keine fremden LGs bekannt.');
    expect(box.text).not.toContain('von 0 LGs');
  });

  it('draws an ignored building muted, an owner out of reach not', async () => {
    const { send, rows, cells, showFinder, greatBuildings } = setup();
    send(ranking.page as Entry);
    await tick();
    await greatBuildings.flag('ignored', playerId(2018), 3831, true);
    await showFinder();
    expect(
      rows()
        .map((r) => [cells(r)[0], r.className])
        .filter(([, c]) => c === 'muted'),
    ).toEqual([['Spieler 2018', 'muted']]);
  });

  it('shows its word only on the tab, like the other tabs', async () => {
    const { box, showFinder } = setup();
    await showFinder();
    const tab = [...box.root.querySelectorAll('.tabs button')].find((b) => b.textContent?.includes('LG-Finder'));
    expect(tab?.querySelector('svg')).toBeNull();
  });

  it('names a type the catalog does not know by its id, and says when no row passes', async () => {
    const { box, send, rows, showFinder, type, input, typeIn } = setup();
    const page = ranking.page as Entry & { responseData: { rankings: Record<string, unknown>[] } };
    send({
      ...page,
      responseData: {
        ...page.responseData,
        rankings: [{ ...page.responseData.rankings[0], name: undefined, cityEntityId: 'X_Unknown_Landmark' }],
      },
    });
    await tick();
    await showFinder();
    expect([...type().options].map((o) => o.textContent?.trim())).toEqual(['alle Typen', 'X_Unknown_Landmark']);
    typeIn(input('Stufe ab'), '500');
    await tick();
    expect(rows()).toHaveLength(0);
    expect(box.text).toContain('Kein LG passt zum Filter.');
  });

  it('shows what a building gained since the sighting before, and no funnel beside the owner', async () => {
    const { box, send, showFinder } = setup();
    const page = ranking.page as Entry & { responseData: { rankings: Record<string, unknown>[] } };
    const first = page.responseData.rankings[0] as Record<string, unknown>;
    send({ ...page, responseData: { ...page.responseData, rankings: [{ ...first, points: 100 }] } });
    await tick();
    vi.setSystemTime(11 * DAY);
    send({ ...page, responseData: { ...page.responseData, rankings: [{ ...first, points: 400 }] } });
    await tick();
    await showFinder();
    expect(box.root.querySelector('tbody .growth-tag')?.textContent?.trim()).toBe('+300');
    // the span between the two sightings
    expect(box.root.querySelector('tbody .growth-tag')?.getAttribute('data-tip')).toMatch(
      /^Zwischen .+ und .+ 300 FP eingezahlt$/,
    );
    expect(box.root.querySelector('tbody button[aria-label="Nur diesen Spieler zeigen"]')).toBeNull();
  });
});
