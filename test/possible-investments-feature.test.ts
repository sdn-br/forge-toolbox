// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { investmentsFeature } from '../src/content/features/investments';
import { registerGameHandlers } from '../src/content/game/handlers';
import { playerId } from '../src/shared/ids';
import friendAccept from './fixtures/friend-accept.json';
import contributions from './fixtures/gb-contributions.json';
import definitions from './fixtures/gb-definitions.json';
import levelUp from './fixtures/gb-level-up.json';
import fixture from './fixtures/great-buildings.json';
import { featureContext } from './helpers/feature-context';
import { fakeLayout } from './helpers/layout';

interface Entry {
  requestClass: string;
  requestMethod: string;
  requestData: unknown;
  responseData: unknown;
}

/** reads the known buildings of the current setup; it queues behind the writes and the boxes' own reads */
let drain: (() => Promise<unknown>) | undefined;
/** the stored buildings come back through an in-memory IndexedDB; a fixed wait is too short when the whole suite runs */
const tick = async () => {
  await drain?.();
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
const MINUTE = 60_000;

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
/** rows that pay a place, as in the snipe helper's tests: Zeusstatue P1 pays 45, Orakel 75 */
const hitZeus = (): Row => ({ ...zeus, max_progress: 80 });
const hitOracle = (): Row => ({ ...oracle, max_progress: 100, current_progress: 30 });

function setup() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000_000);
  const now = () => Date.now();
  const env = featureContext({ now });
  const { ctx } = env;
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now });
  // the calculator owns the factor the snipe helper and the possible investments rate places with
  createGbCalculatorFeature(() => {}).setup(ctx);
  investmentsFeature.setup(ctx);
  drain = () => ctx.greatBuildings.known();
  const box = env.boxes.get('investments') as NonNullable<ReturnType<typeof env.boxes.get>>;
  const snipe = env.boxes.get('gbCalculator') as NonNullable<ReturnType<typeof env.boxes.get>>;
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
  const list = (responseData: Row[], owner = 1001) =>
    send({
      requestClass: 'GreatBuildingsService',
      requestMethod: 'getOtherPlayerOverview',
      requestData: [owner],
      responseData,
    });
  const rows = (b = box) => [...b.root.querySelectorAll('tbody tr')];
  const cells = (row: Element | undefined) =>
    [...(row?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.replace(/\s+/g, ' ').trim());
  /** opens the box on the possible investments */
  const showPossible = async () => {
    if (!box.box.isOpen) env.menu('investments');
    box.click('Mögliche Investitionen');
    await tick();
  };
  const open = (entityId: number) => {
    const o = fixture.openings.find((x) => x.entity.requestData[0] === entityId);
    if (!o) throw new Error(`no opening ${entityId}`);
    send(o.entity as Entry);
    send(o.construction as Entry);
  };
  const input = (label: string) => box.root.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  return { ...env, ...ctx, box, snipe, send, list, open, rows, cells, showPossible, input };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Investitionen: Mögliche Investitionen', () => {
  it('rates the buildings of the lists of others as the snipe helper does', async () => {
    const { box, snipe, list, rows, cells, showPossible } = setup();
    list([hitZeus(), lighthouse, hitOracle()]);
    await tick();
    await showPossible();
    expect([...box.root.querySelectorAll('thead th')].map((th) => th.getAttribute('aria-label'))).toEqual([
      'Merken',
      'Eigentümer',
      'Beziehung',
      'LG',
      'Stufe',
      'Fortschritt',
      'Eigenanteil des Eigentümers',
      'Platz',
      'Einsatz',
      'Gewinn',
      'Sicherheit',
      'Stand',
    ]);
    // the best profit on top; place, stake and profit as in the snipe helper
    const mine = rows().map((r) => cells(r));
    const helper = rows(snipe).map((r) => cells(r));
    expect(mine.map((c) => c[3])).toEqual(['Orakel von Delphi', 'Zeusstatue']);
    for (const c of mine) {
      const same = helper.find((h) => h[2] === c[3]);
      expect(c.slice(7, 10)).toEqual(same?.slice(5, 8));
    }
    expect(mine[0]?.[1]).toBe('Eigentümer 1001');
    // the owners are known only from their lists, not to the player store
    expect(mine[0]?.[2]).toBe('unbekannt');
    expect(mine[0]?.[11]).toBe('vor 1 Min.');
    const tier = rows()[0]?.querySelector('td.snipe-tier');
    expect(tier?.getAttribute('aria-label')).toContain('sicher');
    expect(tier?.querySelector('svg')).not.toBeNull();
    // the Zeusstatue has nothing paid in
    expect(rows()[1]?.getAttribute('data-tip')).toContain('eventuell gesperrt');
    expect(rows()[0]?.querySelector('td.inv-progress .fp-bar')).not.toBeNull();
    // the lighthouse has no loaded definition: no place
    expect(box.text).toContain('2 mit Gewinn von 3 LGs');
  });

  it('shows the rows without a place when "nur mit Gewinn" is off, and remembers the filters and the tab', async () => {
    const { box, list, rows, cells, showPossible, input, ui } = setup();
    list([hitZeus(), lighthouse, hitOracle()]);
    await tick();
    await showPossible();
    const only = box.root.querySelector('.inv-hits-filter button') as HTMLButtonElement;
    expect(only.getAttribute('aria-pressed')).toBe('true');
    expect(only.getAttribute('aria-label')).toBe('nur mit Gewinn');
    only.click();
    await tick();
    expect(rows()).toHaveLength(3);
    expect(cells(rows()[2]).slice(3, 11)).toEqual(['Leuchtturm von Alexandria', '9', '10 / 550', '?', '', '', '', '']);
    const name = input('LG');
    name.value = 'zeus';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['Zeusstatue']);
    expect(box.text).toContain('1 mit Gewinn von 1 LGs');
    expect(ui.pref('investments.tab')).toBe('possible');
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}')).toEqual({
      player: '',
      name: 'zeus',
      onlyHits: false,
      reach: { neighbor: true, friend: true, guildMember: true, none: false },
      tier: { exact: true, safe: true, possible: true },
      onlyMarked: false,
      showIgnored: false,
    });
  });

  it('opens with the remembered tab and filters', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = featureContext({ now: () => Date.now() });
    env.ctx.ui.savePref('investments.tab', 'possible');
    env.ctx.ui.savePref('investments.filter', JSON.stringify({ player: 'Anna', name: '', onlyHits: false }));
    investmentsFeature.setup(env.ctx);
    drain = () => env.ctx.greatBuildings.known();
    env.menu('investments');
    await tick();
    const root = env.boxes.get('investments')?.root as HTMLElement;
    expect(root.querySelector('.tabs button.active')?.textContent).toBe('Mögliche Investitionen');
    expect((root.querySelector('input[aria-label="Spieler"]') as HTMLInputElement).value).toBe('Anna');
    expect(root.querySelector('.inv-hits-filter button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it.each([
    [{ onlyReachable: true }, [true, true, true, false]],
    [{ onlyReachable: false }, [true, true, true, true]],
    [{ reach: { neighbor: false, friend: true, guildMember: false, none: true } }, [false, true, false, true]],
    [{}, [true, true, true, false]],
  ])('reads the stored filter %j as the reason toggles %j', async (stored, pressed) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = featureContext({ now: () => Date.now() });
    env.ctx.ui.savePref('investments.tab', 'possible');
    env.ctx.ui.savePref('investments.filter', JSON.stringify({ player: '', name: '', onlyHits: false, ...stored }));
    investmentsFeature.setup(env.ctx);
    drain = () => env.ctx.greatBuildings.known();
    env.menu('investments');
    await tick();
    const root = env.boxes.get('investments')?.root as HTMLElement;
    const buttons = [...root.querySelectorAll('.inv-reach-filter button')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed') === 'true')).toEqual(pressed);
  });

  it('filters by the tier with three icon toggles, remembers them and reads old stored filters', async () => {
    const { box, list, rows, showPossible, ui } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    const toggles = () => [...box.root.querySelectorAll('.inv-tier-filter button')] as HTMLButtonElement[];
    expect(toggles().map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([
      ['exakt', 'true'],
      ['sicher', 'true'],
      ['möglich', 'true'],
    ]);
    expect(toggles().every((b) => b.getAttribute('data-tip') === b.getAttribute('aria-label'))).toBe(true);
    expect(toggles().every((b) => b.querySelector('svg') !== null)).toBe(true);
    const tiers = () => rows().map((r) => r.querySelector('td.snipe-tier')?.className.replace('snipe-tier ', ''));
    const before = tiers();
    expect(before).toHaveLength(2);
    const order = ['exact', 'safe', 'possible'];
    const first = before[0] as string;
    (toggles()[order.indexOf(first)] as HTMLButtonElement).click();
    await tick();
    expect(toggles().map((x) => x.getAttribute('aria-pressed'))).toEqual(
      order.map((tier) => (tier === first ? 'false' : 'true')),
    );
    expect(tiers()).toEqual(before.filter((tier) => tier !== first));
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}').tier).toMatchObject({ [first]: false });
  });

  it.each([
    [{}, [true, true, true]],
    [{ tier: { exact: true, safe: false, possible: true } }, [true, false, true]],
    [{ tier: { safe: false } }, [true, false, true]],
  ])('reads the stored filter %j as the tier toggles %j', async (stored, pressed) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = featureContext({ now: () => Date.now() });
    env.ctx.ui.savePref('investments.tab', 'possible');
    env.ctx.ui.savePref('investments.filter', JSON.stringify({ player: '', name: '', onlyHits: false, ...stored }));
    investmentsFeature.setup(env.ctx);
    drain = () => env.ctx.greatBuildings.known();
    env.menu('investments');
    await tick();
    const root = env.boxes.get('investments')?.root as HTMLElement;
    const buttons = [...root.querySelectorAll('.inv-tier-filter button')];
    expect(buttons.map((b) => b.getAttribute('aria-pressed') === 'true')).toEqual(pressed);
  });

  it('scrolls only the table, the tabs, filters and count stay above it', async () => {
    const { box, list, showPossible } = setup();
    list([hitZeus()], 1001);
    await tick();
    await showPossible();
    const scroll = box.root.querySelector('.inv-pane > .win-scroll') as HTMLElement;
    expect(scroll.querySelector('.win-area table.inv-possible')).not.toBeNull();
    expect(scroll.querySelector('.inv-filter, .tabs')).toBeNull();
    expect(box.root.querySelector('.inv-pane > .inv-filter')).not.toBeNull();
  });

  it('writes the owner into the player filter from the row', async () => {
    const { box, list, rows, input, showPossible, ui } = setup();
    list([hitZeus()], 1001);
    list([{ ...hitOracle(), player: { player_id: 1002, name: 'Bert' } }], 1002);
    await tick();
    await showPossible();
    expect(rows()).toHaveLength(2);
    const pick = rows()[0]?.querySelector('td.inv-name .inv-pick') as HTMLButtonElement;
    expect(pick.getAttribute('aria-label')).toBe('Nur diesen Spieler zeigen');
    expect(pick.getAttribute('data-tip')).toBe('Nur diesen Spieler zeigen');
    // the filter sits after the name, the name stays the link
    expect(pick.previousElementSibling?.tagName).toBe('A');
    const name = pick.previousElementSibling?.textContent;
    pick.click();
    await tick();
    expect(input('Spieler').value).toBe(name);
    expect(rows()).toHaveLength(1);
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}').player).toBe(name);
    expect(box.text).toContain('1 mit Gewinn von 1 LGs');
  });

  it('marks the funnel of the owner the player field names exactly, a click on it empties the field', async () => {
    const { list, rows, input, showPossible } = setup();
    list([hitZeus()], 1001);
    list([{ ...hitOracle(), player: { player_id: 1002, name: 'Bert' } }], 1002);
    await tick();
    await showPossible();
    const pick = () => rows()[0]?.querySelector('td.inv-name .inv-pick') as HTMLButtonElement;
    const type = async (value: string) => {
      input('Spieler').value = value;
      input('Spieler').dispatchEvent(new Event('input'));
      await tick();
    };
    // a part of the name filters, but marks no funnel
    await type('ber');
    expect(rows()).toHaveLength(1);
    expect(pick().classList.contains('on')).toBe(false);
    // the whole name, typed by hand and in any case, marks it like a click
    await type(' bert ');
    expect(pick().classList.contains('on')).toBe(true);
    expect(pick().getAttribute('aria-pressed')).toBe('true');
    expect(pick().getAttribute('aria-label')).toBe('Spielerfilter entfernen');
    expect(pick().querySelector('path')?.getAttribute('fill')).toBe('currentColor');
    pick().click();
    await tick();
    expect(input('Spieler').value).toBe('');
    expect(rows()).toHaveLength(2);
    expect(rows().some((r) => r.querySelector('.inv-pick.on'))).toBe(false);
  });

  it('uses the stored ranking of an opened building: the row turns exact', async () => {
    const { list, open, rows, cells, showPossible } = setup();
    // the Aachener Dom of owner 1001 (entity 1909, level 75), listed with 2.900 paid in, then opened with 251
    const dom: Row = {
      entity_id: 1909,
      city_entity_id: 'X_EarlyMiddleAge_Landmark2',
      name: 'Aachener Dom',
      level: 75,
      current_progress: 2_900,
      max_progress: 3062,
      player: { player_id: 1001, name: 'Eigentümer 1001' },
    };
    vi.setSystemTime(Date.now() + 10_000);
    list([dom]);
    await tick();
    await showPossible();
    expect(rows()[0]?.querySelector('td.snipe-tier')?.className).not.toContain('exact');
    vi.setSystemTime(Date.now() + 10_000);
    open(1909);
    await tick();
    expect(cells(rows()[0]).slice(3, 6)).toEqual(['Aachener Dom', '75', '251 / 3.062']);
    expect(cells(rows()[0])[7]).toBe('P1');
    expect(rows()[0]?.querySelector('td.snipe-tier')?.className).toContain('exact');
  });

  it('shows the share of the owner: "?" until the building was opened, plain when current, muted when stale', async () => {
    const { box, list, open, rows, showPossible } = setup();
    const dom: Row = {
      entity_id: 1909,
      city_entity_id: 'X_EarlyMiddleAge_Landmark2',
      name: 'Aachener Dom',
      level: 75,
      current_progress: 2_900,
      max_progress: 3062,
      player: { player_id: 1001, name: 'Eigentümer 1001' },
    };
    const share = () => rows()[0]?.querySelectorAll('td')[6] as HTMLElement;
    list([dom]);
    await tick();
    await showPossible();
    const head = box.root.querySelector('thead th[aria-label="Eigenanteil des Eigentümers"]') as HTMLElement | null;
    expect(head?.textContent?.trim()).toBe('EA');
    expect(head?.getAttribute('data-tip')).toBe(
      'Eigenanteil des Eigentümers\nKlick sortiert nach Eigenanteil des Eigentümers\nUmschalt+Klick: weitere Sortierung',
    );
    expect(share().textContent).toBe('?');
    vi.setSystemTime(Date.now() + 10_000);
    open(1909);
    await tick();
    expect(share().textContent).toMatch(/^\d[\d.]*$/);
    expect(share().className).not.toContain('muted');
    // the list moves the progress on: the ranking is of an earlier state, its number stays, drawn muted with its age
    const fp = share().textContent;
    vi.setSystemTime(Date.now() + 5 * MINUTE);
    list([{ ...dom, current_progress: 2_950 }]);
    await tick();
    expect(share().textContent).toBe(fp);
    expect(share().className).toContain('muted');
    expect(share().getAttribute('data-tip')).toBe('Stand vor 5 Min.');
  });

  it('sorts by a clicked column head', async () => {
    const { box, list, rows, cells, showPossible } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    const head = (label: string) => box.root.querySelector(`thead th[aria-label="${label}"]`) as HTMLElement;
    head('LG').click();
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['Orakel von Delphi', 'Zeusstatue']);
    head('LG').click();
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['Zeusstatue', 'Orakel von Delphi']);
    expect(head('LG').getAttribute('aria-sort')).toBe('descending');
  });

  it('adds a sort level on a shift click, numbers the heads and resets on a plain click', async () => {
    const { box, list, showPossible } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    const head = (label: string) => box.root.querySelector(`thead th[aria-label="${label}"]`) as HTMLElement;
    const click = (label: string, shiftKey: boolean) =>
      head(label).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));
    // the default order is profit, largest first
    expect(head('Gewinn').className).toContain('desc');
    click('LG', true);
    await tick();
    expect(head('Gewinn').querySelector('.sort-level')?.textContent).toBe('1');
    expect(head('LG').querySelector('.sort-level')?.textContent).toBe('2');
    expect(head('LG').getAttribute('data-tip')).toContain('Sortiert nach Gewinn, dann LG');
    click('LG', true);
    await tick();
    expect(head('LG').className).toContain('desc');
    expect(head('LG').querySelector('.sort-level')?.textContent).toBe('2');
    click('LG', false);
    await tick();
    expect(head('Gewinn').querySelector('.sort-level')).toBeNull();
    expect(head('LG').querySelector('.sort-level')).toBeNull();
    expect(head('LG').className).toContain('asc');
  });

  it('fills live when another list comes and tells when nothing is known', async () => {
    const { box, list, rows, showPossible } = setup();
    await showPossible();
    expect(box.text).toContain('Noch keine fremden LGs bekannt.');
    list([hitZeus()]);
    await tick();
    expect(rows()).toHaveLength(1);
    list([hitOracle()], 1002);
    await tick();
    expect(rows()).toHaveLength(2);
  });

  it('opens on the own investments when the town hall list arrives', async () => {
    const { box, send, showPossible, ui } = setup();
    await showPossible();
    send(contributions.contributions as Entry);
    await tick();
    expect(box.root.querySelector('.tabs button.active')?.textContent).toBe('Meine Investitionen');
    expect(ui.pref('investments.tab')).toBe('mine');
  });

  it('leaves out buildings with an own contribution and counts them nowhere', async () => {
    const { box, send, showPossible } = setup();
    send(contributions.contributions as Entry);
    await tick();
    await showPossible();
    // the town hall list holds only buildings with an own place
    expect(box.text).toContain('Noch keine fremden LGs bekannt.');
  });

  it('shows the age of an entry by its largest unit', async () => {
    const { box, list, rows, cells, showPossible } = setup();
    list([hitZeus()]);
    await tick();
    vi.setSystemTime(Date.now() + 3 * 60 * MINUTE + 40 * MINUTE);
    await showPossible();
    expect(cells(rows()[0])[11]).toBe('vor 3 Std.');
    expect(box.text).not.toContain('40 Min.');
  });

  it('rates the buildings of others only for their tab, once until an input changes', async () => {
    const { box, list, catalog, bus } = setup();
    box.box.open();
    list([hitZeus(), lighthouse, hitOracle()]);
    await tick();
    const rewards = vi.spyOn(catalog, 'get');
    box.box.update();
    expect(rewards).not.toHaveBeenCalled();
    box.click('Mögliche Investitionen');
    expect(rewards).toHaveBeenCalled();
    rewards.mockClear();
    box.box.update();
    expect(rewards).not.toHaveBeenCalled();
    bus.emit('catalog.updated', { defs: [] });
    expect(rewards).toHaveBeenCalled();
  });

  it('shows why an owner is reachable, hides those out of reach and follows the friend messages live', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { box, send, list, rows, cells, showPossible, ui } = setup();
    // the owner of both buildings is the friend of the recorded invitation
    send({
      requestClass: 'OtherPlayerService',
      requestMethod: 'getSocialList',
      requestData: null,
      responseData: { friends: [{ player_id: 1001, name: 'Eigentümer 1001' }], neighbours: [], guildMembers: [] },
    });
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    // a reason is its icon with the word in the tooltip; out of reach stays a word
    const reach = (r: Element) => r.querySelectorAll('td')[2];
    expect(rows().map((r) => reach(r)?.getAttribute('data-tip'))).toEqual(['Freund', 'Freund']);
    expect(reach(rows()[0] as Element)?.querySelector('svg')).not.toBeNull();
    send({ requestClass: 'FriendService', requestMethod: 'deleteFriend', requestData: null, responseData: 1001 });
    await tick();
    expect(rows()).toHaveLength(0);
    expect(box.text).toContain('0 mit Gewinn von 0 LGs');
    const toggles = [...box.root.querySelectorAll('.inv-reach-filter button')] as HTMLButtonElement[];
    expect(toggles.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([
      ['Nachbar', 'true'],
      ['Freund', 'true'],
      ['Gilde', 'true'],
      ['keine Beziehung, nicht erreichbar', 'false'],
    ]);
    expect(toggles.every((b) => b.getAttribute('data-tip') === b.getAttribute('aria-label'))).toBe(true);
    (toggles[3] as HTMLButtonElement).click();
    await tick();
    expect(rows().map((r) => [cells(r)[2], r.className])).toEqual([
      ['keine', 'muted'],
      ['keine', 'muted'],
    ]);
    expect(box.text).toContain('2 mit Gewinn von 2 LGs');
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}')).toMatchObject({ reach: { none: true } });
    send(friendAccept.accept as Entry);
    await tick();
    expect(rows().map((r) => [reach(r)?.getAttribute('data-tip'), r.className])).toEqual([
      ['Freund', ''],
      ['Freund', ''],
    ]);
  });
});

describe('Investitionen: long lists of possible investments', () => {
  let layout: ReturnType<typeof fakeLayout>;
  beforeEach(() => {
    layout = fakeLayout();
  });
  afterEach(() => layout.restore());

  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...hitZeus(), entity_id: 5000 + i }));
  const button = (box: { root: ParentNode }, word: string) =>
    box.root.querySelector(`.win-nav button[aria-label="${word}"]`) as HTMLElement;
  const hiddenLine = (box: { root: ParentNode }) => box.root.querySelector('.win-hidden')?.textContent?.trim();

  /** ten possible investments with room for `fit` rows, the tab shown; `texts` reads the drawn rows */
  async function listed(fit: number) {
    layout.rows(10);
    const env = setup();
    env.list([...many(8), ...[0, 1].map((i) => ({ ...hitOracle(), entity_id: 6000 + i }))]);
    await tick();
    await env.showPossible();
    const texts = () => env.rows().map((r) => env.cells(r).join('|'));
    const all = texts();
    layout.rows(fit);
    layout.resize();
    return { ...env, texts, all };
  }

  it('shows the rows that fit and moves by a row', async () => {
    const { box, texts, all } = await listed(4);
    expect(texts()).toEqual(all.slice(0, 4));
    expect(hiddenLine(box)).toBe('noch 6 weitere unten');
    expect(box.root.querySelector('.inv-pane > .inv-filter')).not.toBeNull();
    button(box, 'Nach unten').click();
    expect(texts()).toEqual(all.slice(1, 5));
  });

  it('clamps the offset when a filter shrinks the list and keeps the window on a sort', async () => {
    const { box, texts, all, input } = await listed(4);
    for (let i = 0; i < 6; i++) button(box, 'Nach unten').click();
    expect(texts()).toEqual(all.slice(6));
    (box.root.querySelectorAll('th.sortable')[7] as HTMLElement).click();
    expect(hiddenLine(box)).toBe('noch 6 weitere oben');
    const field = input('LG');
    const type = (value: string) => {
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };
    type('Orakel');
    expect(texts()).toHaveLength(2);
    // the buttons keep their room, greyed
    expect([...box.root.querySelectorAll('.win-nav button')].map((b) => b.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
    ]);
    // the list grows back, the offset stays where the shorter list clamped it
    type('');
    expect(texts()).toHaveLength(4);
    expect(hiddenLine(box)).toBe('noch 6 weitere unten');
    type('nothing');
    expect(box.root.querySelector('.win-scroll')).toBeNull();
  });

  it('keeps an offset for each tab', async () => {
    layout.rows(12);
    const env = setup();
    env.send(contributions.contributions as Entry);
    env.list(many(10));
    await tick();
    const { box } = env;
    const texts = () => env.rows().map((r) => env.cells(r).join('|'));
    box.click('Meine Investitionen');
    await tick();
    const mine = texts();
    layout.rows(4);
    layout.resize();
    button(box, 'Nach unten').click();
    button(box, 'Nach unten').click();
    expect(texts()).toEqual(mine.slice(2, 6));
    box.click('Mögliche Investitionen');
    await tick();
    expect(hiddenLine(box)).toBe('noch 6 weitere unten');
    button(box, 'Nach unten').click();
    box.click('Meine Investitionen');
    await tick();
    expect(texts()).toEqual(mine.slice(2, 6));
  });
});

describe('Investitionen: Merken', () => {
  const star = (r: Element | undefined) => r?.querySelector('td:first-child button.star') as HTMLElement;

  it('starts every row with a star and the column head is the star, the word in tooltip and label', async () => {
    const { box, list, rows, showPossible } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    const head = box.root.querySelector('thead th') as HTMLElement;
    expect(head.getAttribute('aria-label')).toBe('Merken');
    expect(head.getAttribute('data-tip')).toContain('Merken');
    expect(head.querySelector('svg')).not.toBeNull();
    expect(rows().map((r) => star(r)?.getAttribute('aria-label'))).toEqual(['Merken', 'Merken']);
  });

  it('marks a building on a click, redraws it filled and keeps it in the other views', async () => {
    const { greatBuildings, snipe, list, rows, showPossible } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    star(rows()[1])?.click();
    await tick();
    expect(greatBuildings.isMarked(playerId(1001), zeus.entity_id)).toBe(true);
    expect(rows().map((r) => star(r)?.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    // the snipe helper shows the same mark
    const marked = [...snipe.root.querySelectorAll('.snipe-table td.snipe-mark button')].map((b) =>
      b.getAttribute('aria-pressed'),
    );
    expect(marked.sort()).toEqual(['false', 'true']);
    star(rows()[1])?.click();
    await tick();
    expect(rows().map((r) => star(r)?.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
  });

  it('shows only the marked buildings with "nur gemerkte", which is off by default and remembered', async () => {
    const { box, list, rows, cells, showPossible, ui, greatBuildings } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await greatBuildings.mark(playerId(1001), zeus.entity_id, true);
    await showPossible();
    const marked = box.root.querySelector('.inv-marked-filter button') as HTMLButtonElement;
    expect(marked.getAttribute('aria-label')).toBe('nur gemerkte');
    expect(marked.getAttribute('aria-pressed')).toBe('false');
    expect(rows()).toHaveLength(2);
    marked.click();
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['Zeusstatue']);
    expect(box.text).toContain('1 mit Gewinn von 1 LGs');
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}')).toMatchObject({ onlyMarked: true });
  });

  it('opens with the remembered "nur gemerkte"', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const env = featureContext({ now: () => Date.now() });
    env.ctx.ui.savePref('investments.tab', 'possible');
    env.ctx.ui.savePref('investments.filter', JSON.stringify({ onlyMarked: true }));
    investmentsFeature.setup(env.ctx);
    drain = () => env.ctx.greatBuildings.known();
    env.menu('investments');
    await tick();
    const root = env.boxes.get('investments')?.root as HTMLElement;
    expect(root.querySelector('.inv-marked-filter button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('lets the buildings of a marked owner pass "nur gemerkte"', async () => {
    const { box, send, list, rows, cells, showPossible, players } = setup();
    send({
      requestClass: 'OtherPlayerService',
      requestMethod: 'getSocialList',
      requestData: null,
      responseData: {
        friends: [
          { player_id: 1001, name: 'Eigentümer 1001' },
          { player_id: 1002, name: 'Eigentümer 1002' },
        ],
        neighbours: [],
        guildMembers: [],
      },
    });
    list([hitZeus()], 1001);
    list([{ ...hitOracle(), player: { player_id: 1002, name: 'Eigentümer 1002' } }], 1002);
    await tick();
    await showPossible();
    expect(rows()).toHaveLength(2);
    players.setMarked(playerId(1002), true);
    await tick();
    // a marked owner carries a star beside the name, the other none
    const ownerStar = (row: Element | undefined) => row?.querySelector('.inv-owner .owner-star');
    const byName = (name: string) => rows().find((r) => cells(r)[3] === name);
    expect(ownerStar(byName('Orakel von Delphi'))?.getAttribute('aria-label')).toBe('Spieler gemerkt');
    expect(ownerStar(byName('Zeusstatue'))).toBeNull();
    (box.root.querySelector('.inv-marked-filter button') as HTMLButtonElement).click();
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['Orakel von Delphi']);
    // the mark comes live: marking the other owner shows its building too
    players.setMarked(playerId(1001), true);
    await tick();
    expect(rows()).toHaveLength(2);
  });
});

describe('Investitionen: Ignorieren in Mögliche Investitionen', () => {
  const buildingEye = (r: Element | undefined) => r?.querySelectorAll('td.inv-name')[1]?.querySelector('button.ignore');
  const ownerEye = (r: Element | undefined) =>
    r?.querySelectorAll('td.inv-name')[0]?.querySelector('.inv-owner button.ignore');
  const showToggle = (box: { root: ParentNode }) =>
    box.root.querySelector('.inv-ignored-filter button') as HTMLButtonElement;
  const byName = (rows: Element[], cells: (r: Element) => (string | undefined)[], name: string) =>
    rows.find((r) => cells(r)[3] === name) as Element;
  const social = (send: (e: Entry) => void, ids: number[]) =>
    send({
      requestClass: 'OtherPlayerService',
      requestMethod: 'getSocialList',
      requestData: null,
      responseData: {
        friends: ids.map((id) => ({ player_id: id, name: `Eigentümer ${id}` })),
        neighbours: [],
        guildMembers: [],
      },
    });

  it('shows the eyes faint beside the building name and the known owner, none for an unknown owner', async () => {
    const { list, rows, send, showPossible } = setup();
    social(send, [1001]);
    list([hitZeus()], 1001);
    list([{ ...hitOracle(), player: { player_id: 1002, name: 'Bert' } }], 1002);
    await tick();
    await showPossible();
    const [known, unknown] = [
      rows().find((r) => r.textContent?.includes('Zeusstatue')),
      rows().find((r) => r.textContent?.includes('Orakel')),
    ];
    expect(buildingEye(known)?.getAttribute('aria-label')).toBe('LG ignorieren');
    expect(buildingEye(unknown)?.getAttribute('aria-label')).toBe('LG ignorieren');
    expect(ownerEye(known)?.getAttribute('aria-label')).toBe('Spieler ignorieren');
    expect(ownerEye(known)?.nextElementSibling?.classList.contains('inv-pick')).toBe(true);
    expect(ownerEye(unknown)).toBeNull();
  });

  it('hides an ignored building, counts without it and shows it muted with "ignorierte zeigen"', async () => {
    const { box, list, rows, cells, showPossible, ui } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    expect(box.text).toContain('2 mit Gewinn von 2 LGs');
    (buildingEye(byName(rows(), cells, 'Zeusstatue')) as HTMLButtonElement).click();
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['Orakel von Delphi']);
    expect(box.text).toContain('1 mit Gewinn von 1 LGs');
    expect(showToggle(box).getAttribute('aria-label')).toBe('ignorierte zeigen');
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('false');
    showToggle(box).click();
    await tick();
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}')).toMatchObject({ showIgnored: true });
    expect(
      rows()
        .map((r) => cells(r)[3])
        .sort(),
    ).toEqual(['Orakel von Delphi', 'Zeusstatue']);
    expect(box.text).toContain('1 mit Gewinn von 1 LGs');
    const zeus = byName(rows(), cells, 'Zeusstatue');
    expect(zeus.classList.contains('muted')).toBe(true);
    expect(zeus.getAttribute('data-tip')).toContain('LG ignoriert');
    const eye = buildingEye(zeus) as HTMLButtonElement;
    expect(eye.classList.contains('on')).toBe(true);
    expect(eye.getAttribute('aria-label')).toBe('Nicht mehr ignorieren');
    expect(byName(rows(), cells, 'Orakel von Delphi').classList.contains('muted')).toBe(false);
    eye.click();
    await tick();
    expect(rows().some((r) => r.classList.contains('muted'))).toBe(false);
  });

  it('ignores all buildings of a player and says so in the row tooltip', async () => {
    const { list, rows, cells, showPossible, box, send, players } = setup();
    social(send, [1001, 1002]);
    list([hitZeus()], 1001);
    list([{ ...hitOracle(), player: { player_id: 1002, name: 'Eigentümer 1002' } }], 1002);
    await tick();
    await showPossible();
    (ownerEye(byName(rows(), cells, 'Zeusstatue')) as HTMLButtonElement).click();
    await tick();
    expect(players.get(playerId(1001))?.ignored).toBe(true);
    expect(rows().map((r) => cells(r)[3])).toEqual(['Orakel von Delphi']);
    showToggle(box).click();
    await tick();
    const zeus = byName(rows(), cells, 'Zeusstatue');
    expect(zeus.getAttribute('data-tip')).toContain('Spieler ignoriert');
    expect(ownerEye(zeus)?.getAttribute('aria-label')).toBe('Nicht mehr ignorieren');
    (ownerEye(zeus) as HTMLButtonElement).click();
    await tick();
    expect(players.get(playerId(1001))?.ignored).toBeUndefined();
  });

  it('reads the saved toggle, a missing or broken one is off', async () => {
    for (const saved of [{ showIgnored: true }, {}, { showIgnored: 1 }]) {
      vi.useFakeTimers({ toFake: ['Date'] });
      const env = featureContext({ now: () => Date.now() });
      env.ctx.ui.savePref('investments.tab', 'possible');
      env.ctx.ui.savePref('investments.filter', JSON.stringify(saved));
      investmentsFeature.setup(env.ctx);
      drain = () => env.ctx.greatBuildings.known();
      env.menu('investments');
      await tick();
      const root = env.boxes.get('investments')?.root as HTMLElement;
      const on = root.querySelector('.inv-ignored-filter button')?.getAttribute('aria-pressed');
      expect(on).toBe(saved.showIgnored === true ? 'true' : 'false');
    }
  });
});
