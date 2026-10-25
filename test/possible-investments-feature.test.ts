// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { investmentsFeature } from '../src/content/features/investments';
import { registerGameHandlers } from '../src/content/game/handlers';
import friendAccept from './fixtures/friend-accept.json';
import contributions from './fixtures/gb-contributions.json';
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
      'Eigentümer',
      'Erreichbar',
      'LG',
      'Stufe',
      'Fortschritt',
      'Platz',
      'Einsatz',
      'Gewinn',
      'Sicherheit',
      'Stand',
    ]);
    // the best profit on top; place, stake and profit as in the snipe helper
    const mine = rows().map((r) => cells(r));
    const helper = rows(snipe).map((r) => cells(r));
    expect(mine.map((c) => c[2])).toEqual(['Orakel von Delphi', 'Zeusstatue']);
    for (const c of mine) {
      const same = helper.find((h) => h[1] === c[2]);
      expect(c.slice(5, 8)).toEqual(same?.slice(4, 7));
    }
    expect(mine[0]?.[0]).toBe('Eigentümer 1001');
    // the owners are known only from their lists, not to the player store
    expect(mine[0]?.[1]).toBe('unbekannt');
    expect(mine[0]?.[9]).toBe('vor 1 Min.');
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
    const only = box.root.querySelector('input[type=checkbox]') as HTMLInputElement;
    expect(only.checked).toBe(true);
    only.checked = false;
    only.dispatchEvent(new Event('change'));
    await tick();
    expect(rows()).toHaveLength(3);
    expect(cells(rows()[2]).slice(2, 9)).toEqual(['Leuchtturm von Alexandria', '9', '10 / 550', '', '', '', '']);
    const name = input('LG');
    name.value = 'zeus';
    name.dispatchEvent(new Event('input'));
    await tick();
    expect(rows().map((r) => cells(r)[2])).toEqual(['Zeusstatue']);
    expect(box.text).toContain('1 mit Gewinn von 1 LGs');
    expect(ui.pref('investments.tab')).toBe('possible');
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}')).toEqual({
      player: '',
      name: 'zeus',
      onlyHits: false,
      onlyReachable: true,
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
    expect((root.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(false);
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
    expect(cells(rows()[0]).slice(2, 6)).toEqual(['Aachener Dom', '75', '251 / 3.062', 'P1']);
    expect(rows()[0]?.querySelector('td.snipe-tier')?.className).toContain('exact');
  });

  it('sorts by a clicked column head', async () => {
    const { box, list, rows, cells, showPossible } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await showPossible();
    const head = (label: string) => box.root.querySelector(`thead th[aria-label="${label}"]`) as HTMLElement;
    head('LG').click();
    await tick();
    expect(rows().map((r) => cells(r)[2])).toEqual(['Orakel von Delphi', 'Zeusstatue']);
    head('LG').click();
    await tick();
    expect(rows().map((r) => cells(r)[2])).toEqual(['Zeusstatue', 'Orakel von Delphi']);
    expect(head('LG').getAttribute('aria-sort')).toBe('descending');
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
    expect(cells(rows()[0])[9]).toBe('vor 3 Std.');
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
    expect(rows().map((r) => cells(r)[1])).toEqual(['Freund', 'Freund']);
    const reach = rows()[0]?.querySelectorAll('td')[1];
    expect(reach?.getAttribute('data-tip')).toBe('Freund');
    send({ requestClass: 'FriendService', requestMethod: 'deleteFriend', requestData: null, responseData: 1001 });
    await tick();
    expect(rows()).toHaveLength(0);
    expect(box.text).toContain('0 mit Gewinn von 0 LGs');
    const reachable = box.root.querySelectorAll('input[type=checkbox]')[1] as HTMLInputElement;
    expect(reachable.parentElement?.textContent).toBe('nur erreichbare');
    expect(reachable.checked).toBe(true);
    reachable.checked = false;
    reachable.dispatchEvent(new Event('change'));
    await tick();
    expect(rows().map((r) => [cells(r)[1], r.className])).toEqual([
      ['nein', 'muted'],
      ['nein', 'muted'],
    ]);
    expect(box.text).toContain('2 mit Gewinn von 2 LGs');
    expect(JSON.parse(ui.pref('investments.filter') ?? '{}')).toMatchObject({ onlyReachable: false });
    send(friendAccept.accept as Entry);
    await tick();
    expect(rows().map((r) => [cells(r)[1], r.className])).toEqual([
      ['Freund', ''],
      ['Freund', ''],
    ]);
  });
});
