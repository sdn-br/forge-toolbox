// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { registerGameHandlers } from '../src/content/game/handlers';
import type { GbWindowState } from '../src/shared/gb-window-protocol';
import { playerId } from '../src/shared/ids';
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

/** reads the known buildings of the current setup; it queues behind the writes and the box's own reads */
let drain: (() => Promise<unknown>) | undefined;
/** the stored buildings come back through an in-memory IndexedDB; a fixed wait alone is too short when the whole suite
 * runs, so it first waits for the store */
const tick = async () => {
  await drain?.();
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 5));
};
const MINUTE = 60_000;

function setup(prefs: Record<string, string> = {}) {
  // the stores, the handlers and the box all read the clock; only the date is faked
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(1_000_000);
  const now = () => Date.now();
  const env = featureContext({ now });
  const { ctx } = env;
  for (const [key, value] of Object.entries(prefs)) ctx.ui.savePref(key, value);
  const ingestion = new Ingestion();
  registerGameHandlers(ingestion, { ...ctx, now });
  let tones = 0;
  createGbCalculatorFeature(() => tones++).setup(ctx);
  drain = () => ctx.greatBuildings.known();
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
  // the star cell comes first and has no text; the indices count from the place in the game's list
  const cells = (row: Element | undefined) =>
    [...(row?.querySelectorAll('td:not(.mark-cell)') ?? [])].map((td) => td.textContent?.trim());
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

const toggle = (box: { root: ParentNode }) => box.root.querySelector('button.snipe-fold') as HTMLElement | null;
/** the section is open: its fold line says so, or it has no fold line (the calculator shows no building) but its heading */
const expanded = (box: { root: ParentNode }) => {
  const line = toggle(box);
  return line ? line.getAttribute('aria-expanded') === 'true' : box.root.querySelector('.snipe-head') !== null;
};

const calcToggle = (box: { root: ParentNode }) => box.root.querySelector('button.calc-toggle') as HTMLElement | null;
const calcOpen = (box: { root: ParentNode }) => calcToggle(box)?.getAttribute('aria-expanded') === 'true';
/** the calculator body: its header carries the available forge points */
const calcBody = (box: { text: string }) => box.text.includes('Verfügbare FP');

describe('LG-Rechner: foldable part of the box', () => {
  it("shows today's hint and no fold line while no building is shown", async () => {
    const { box } = setup();
    box.box.open();
    expect(calcToggle(box)).toBeNull();
    expect(box.text).toContain('Noch kein fremdes LG geöffnet.');
  });

  it('folds with a new list and shows one line with building, level and owner', async () => {
    const { box, list, open, advance } = setup();
    advance(10_000);
    open(1909);
    expect(calcBody(box)).toBe(true);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    expect(calcOpen(box)).toBe(false);
    expect(calcBody(box)).toBe(false);
    expect(calcToggle(box)?.textContent).toMatch(/^LG-Rechner: Aachener Dom, Stufe \d+ \(Eigentümer 1001\)$/);
    expect(calcToggle(box)?.querySelector('svg')).not.toBeNull();
  });

  it('unfolds when a building of the list owner is opened', async () => {
    const { box, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    open(1909);
    await tick();
    expect(calcOpen(box)).toBe(true);
    expect(calcBody(box)).toBe(true);
  });

  it('unfolds when a building of another player is opened, which folds the snipe section', async () => {
    const { box, list, open, advance } = setup();
    advance(10_000);
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    expect(calcOpen(box)).toBe(false);
    advance(10_000);
    open(650);
    await tick();
    expect(calcOpen(box)).toBe(true);
    expect(expanded(box)).toBe(false);
  });

  it('folds and unfolds by a click on the line, and keeps what the player chose', async () => {
    const { box, list, open, advance, send } = setup();
    advance(10_000);
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    calcToggle(box)?.click();
    await tick();
    expect(calcBody(box)).toBe(true);
    expect(calcToggle(box)?.getAttribute('aria-expanded')).toBe('true');
    calcToggle(box)?.click();
    await tick();
    expect(calcBody(box)).toBe(false);
    box.box.update();
    send();
    expect(calcOpen(box)).toBe(false);
  });

  it('keeps one part open: folding the snipe section while the calculator is folded unfolds the calculator', async () => {
    const { box, list, open, advance } = setup();
    advance(10_000);
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    expect(expanded(box)).toBe(true);
    expect(calcOpen(box)).toBe(false);
    toggle(box)?.click();
    await tick();
    expect(expanded(box)).toBe(false);
    expect(calcOpen(box)).toBe(true);
  });

  it('keeps one part open: folding the calculator while the snipe section is folded unfolds the snipe section', async () => {
    const { box, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    open(650);
    await tick();
    expect(expanded(box)).toBe(false);
    expect(calcOpen(box)).toBe(true);
    calcToggle(box)?.click();
    await tick();
    expect(calcOpen(box)).toBe(false);
    expect(expanded(box)).toBe(true);
  });

  it('has no fold line on the snipe section while the calculator shows no building, it would be the only part', async () => {
    const { box, list } = setup();
    list([hitZeus()]);
    await tick();
    expect(toggle(box)).toBeNull();
    expect(box.text).toContain('Mögliche Einzahlungen');
    expect(box.root.querySelectorAll('.snipe-table tbody tr')).toHaveLength(1);
  });

  it('has no fold line on the calculator without a list, it is the only part', async () => {
    const { box, open, advance } = setup();
    advance(10_000);
    open(1909);
    await tick();
    expect(calcToggle(box)).toBeNull();
    expect(calcBody(box)).toBe(true);
  });

  it('leaves the snipe section alone when the calculator is toggled', async () => {
    const { box, list, open, advance } = setup();
    advance(10_000);
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    calcToggle(box)?.click();
    await tick();
    expect(expanded(box)).toBe(true);
  });
});

describe('LG-Rechner: follows the windows of the game', () => {
  const shows = (
    bus: { emit(name: 'gbWindow.changed', payload: { state: GbWindowState }): void },
    state: GbWindowState,
  ) => bus.emit('gbWindow.changed', { state });

  /** a list of the owner of 1909 with a hit, then 1909 opened from it: both sections open by the traffic */
  async function overList() {
    const env = setup();
    env.list([hitZeus()]);
    await tick();
    env.advance(10_000);
    env.open(1909);
    await tick();
    return env;
  }

  it('unfolds the calculator and folds the snipe section for a foreign great building over the list', async () => {
    const { box, bus } = await overList();
    expect(expanded(box)).toBe(true);
    shows(bus, 'foreign');
    await tick();
    expect(calcOpen(box)).toBe(true);
    expect(expanded(box)).toBe(false);
  });

  it('folds the snipe section when the window shows before the building of the list owner comes', async () => {
    // the game shows the window first, the traffic brings the building after it (seen on de20, 2026-10-28)
    const { box, bus, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    shows(bus, 'list');
    shows(bus, 'foreign');
    open(1909);
    await tick();
    expect(calcOpen(box)).toBe(true);
    expect(expanded(box)).toBe(false);
  });

  it('unfolds the snipe section and folds the calculator when only the list is left', async () => {
    const { box, bus } = await overList();
    shows(bus, 'foreign');
    shows(bus, 'list');
    await tick();
    expect(expanded(box)).toBe(true);
    expect(calcOpen(box)).toBe(false);
    expect(box.box.isOpen).toBe(true);
  });

  it.each<GbWindowState>(['none', 'own'])('closes the box for %s', async (state) => {
    const { box, bus } = await overList();
    shows(bus, 'foreign');
    shows(bus, state);
    expect(box.box.isOpen).toBe(false);
  });

  it.each<GbWindowState>(['none', 'own'])(
    'stays open for %s when its setting is off, and still folds',
    async (state) => {
      const { box, bus, settings } = await overList();
      expect(settings.get('gbCalc.closeWithoutWindow')).toBe(true);
      await settings.set('gbCalc.closeWithoutWindow', false);
      shows(bus, 'foreign');
      shows(bus, state);
      expect(box.box.isOpen).toBe(true);
      shows(bus, 'list');
      await tick();
      expect(calcOpen(box)).toBe(false);
    },
  );

  it('never opens the box', async () => {
    const { box, bus } = await overList();
    box.box.close();
    shows(bus, 'list');
    shows(bus, 'foreign');
    expect(box.box.isOpen).toBe(false);
  });

  it('keeps a box opened by hand while no window is open, until the next change', async () => {
    const { box, bus } = await overList();
    shows(bus, 'none');
    box.box.open();
    await tick();
    expect(box.box.isOpen).toBe(true);
    shows(bus, 'list');
    shows(bus, 'none');
    expect(box.box.isOpen).toBe(false);
  });

  it('folds no part that would be the only one', async () => {
    const { box, bus, open, advance } = setup();
    // only a building, no list: the calculator is alone and keeps its body
    advance(10_000);
    open(1909);
    await tick();
    shows(bus, 'list');
    await tick();
    expect(calcToggle(box)).toBeNull();
    expect(calcBody(box)).toBe(true);
    // a list while the calculator shows no building: the section keeps its heading
    const other = setup();
    other.list([hitZeus()]);
    await tick();
    other.box.box.open();
    shows(other.bus, 'foreign');
    await tick();
    expect(expanded(other.box)).toBe(true);
    expect(other.box.root.querySelectorAll('.snipe-table tbody tr')).toHaveLength(1);
  });
});

describe('Snipehilfe: stacked box', () => {
  it('shows what a building gained since its previous sighting beside the bar', async () => {
    const { box, list, rows, advance } = setup();
    list([withRequired(zeus, 80, 10)]);
    await tick();
    expect(box.root.querySelector('.growth-tag')).toBeNull();
    advance(10_000);
    list([withRequired(zeus, 80, 15)]);
    await tick();
    const growth = rows()[0]?.querySelector('.fp-line .growth-tag');
    expect(growth?.textContent).toBe('+5');
    expect(growth?.getAttribute('data-tip')).toBe('Seit dem vorigen Stand 5 FP eingezahlt');
  });

  it('shows the calculator without the section until a list comes, and has no tabs', async () => {
    const { box, tones } = setup();
    box.box.open();
    expect(box.root.querySelector('.tabs')).toBeNull();
    expect(toggle(box)).toBeNull();
    expect(box.root.querySelector('hr.snipe-sep')).toBeNull();
    expect(box.text).toContain('Noch kein fremdes LG geöffnet.');
    expect(tones()).toBe(0);
  });

  it('shows the section above a separator and the calculator below', async () => {
    const { box, list, open, advance } = setup();
    advance(10_000);
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    const html = box.root.innerHTML;
    expect(html.indexOf('fold-toggle')).toBeLessThan(html.indexOf('snipe-sep'));
    expect(html.indexOf('snipe-sep')).toBeLessThan(html.indexOf('Aachener Dom'));
  });

  it('shows one line with count, best hit, owner and age when folded, and the heading when unfolded', async () => {
    const { box, list, advance, open } = setup();
    // a building in the calculator, so the section may fold
    open(1909);
    advance(10_000);
    list([hitZeus(), lighthouse, hitOracle()]);
    await tick();
    expect(expanded(box)).toBe(true);
    expect(toggle(box)?.textContent).toContain('Mögliche Einzahlungen');
    expect(toggle(box)?.querySelector('svg')).not.toBeNull();
    advance(2 * MINUTE);
    toggle(box)?.click();
    await tick();
    expect(expanded(box)).toBe(false);
    expect(toggle(box)?.textContent).toMatch(
      /^Mögliche Einzahlungen: 2 mit Gewinn, bester Orakel von Delphi \+97 \(Eigentümer 1001, vor 2 Min\.\)$/,
    );
    expect(box.root.querySelector('table.snipe-table')).toBeNull();
  });

  it('says there is no hit in the folded line', async () => {
    const { box, list, open, advance } = setup();
    // a building in the calculator, so the section may fold
    open(1909);
    advance(10_000);
    box.box.open();
    list([withRequired(zeus, 9_000, 400)]);
    await tick();
    toggle(box)?.click();
    await tick();
    expect(toggle(box)?.textContent).toMatch(
      /^Mögliche Einzahlungen: kein LG mit Gewinn \(Eigentümer 1001, vor 1 Min\.\)$/,
    );
  });

  it('folds and unfolds by a click on the line, the heading line too', async () => {
    const { box, list, open, advance } = setup();
    // a building in the calculator, so the section may fold
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    expect(box.root.querySelector('table.snipe-table')).not.toBeNull();
    toggle(box)?.click();
    await tick();
    expect(box.root.querySelector('table.snipe-table')).toBeNull();
    toggle(box)?.click();
    await tick();
    expect(box.root.querySelector('table.snipe-table')).not.toBeNull();
    expect(expanded(box)).toBe(true);
  });

  it('stays open for a building of the list owner', async () => {
    const { box, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    open(1909);
    await tick();
    expect(expanded(box)).toBe(true);
  });

  it('folds when a building of another player is opened, and a new list unfolds it again', async () => {
    const { box, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    open(650);
    await tick();
    expect(expanded(box)).toBe(false);
    advance(10_000);
    list([hitOracle()]);
    await tick();
    expect(expanded(box)).toBe(true);
  });

  it('stays as the player left it when no list or building comes', async () => {
    const { box, list, send, open, advance } = setup();
    // a building in the calculator, so the section may fold
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    toggle(box)?.click();
    box.box.update();
    await tick();
    send();
    expect(expanded(box)).toBe(false);
  });

  it('neither unfolds nor beeps for a list the game asked for itself', async () => {
    const { box, list, open, advance, tones } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    open(1909);
    await tick();
    toggle(box)?.click();
    await tick();
    const toned = tones();
    list([hitOracle()], 1001);
    await tick();
    expect(expanded(box)).toBe(false);
    expect(tones()).toBe(toned);
  });

  it('opens with a list that has hits, shows the owner, its age and the rows by profit', async () => {
    const { box, list, rows, cells, tones, advance } = setup();
    list([hitZeus(), lighthouse, hitOracle()]);
    await tick();
    expect(box.box.isOpen).toBe(true);
    expect(expanded(box)).toBe(true);
    expect(box.text).toContain('Mögliche Einzahlungen');
    expect(box.text).toMatch(/Eigentümer:\s*Eigentümer 1001/);
    expect(box.text).toContain('Stand: vor 1 Min.');
    advance(4 * MINUTE);
    box.box.update();
    await tick();
    expect(box.text).toContain('Stand: vor 4 Min.');
    expect([...box.root.querySelectorAll('th')].map((th) => th.getAttribute('aria-label'))).toEqual([
      '#',
      'Merken',
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
    const [, first] = cells(rows()[0]);
    expect(['Zeusstatue', 'Orakel von Delphi']).toContain(first);
    expect(box.text).toContain('Belohnung unbekannt: 1');
    expect(tones()).toBe(1);
  });

  it('shows the progress like the investments: a thin bar under the numbers and the rest in the tooltip', async () => {
    const { list, rows } = setup();
    list([withRequired(zeus, 80, 20)]);
    await tick();
    const progress = rows()[0]?.querySelectorAll('td:not(.mark-cell)')[3] as HTMLElement;
    expect(progress.querySelector('.fp-bar')).not.toBeNull();
    expect(progress.dataset.tip).toMatch(/^Fehlt bis zum Level-up: [\d.]+ von [\d.]+ FP$/m);
    expect(progress.dataset.tip).not.toContain('der Stufe sind eingezahlt');
  });

  it('names the building in the tooltip of its cut name, above the notes of the row', async () => {
    const { box, list, rows } = setup();
    list([hitZeus()]);
    await tick();
    const row = rows()[0] as HTMLElement;
    const tip = (row.querySelector('td.name-cell') as HTMLElement).dataset.tip ?? '';
    expect(tip.split('\n')[0]).toBe('Zeusstatue');
    expect(tip).toContain(row.dataset.tip ?? '');
    expect(box.root.querySelectorAll('td.name-cell[data-tip]')).toHaveLength(1);
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

  it('names what the owner paid in the row tooltip once the building was opened, not before', async () => {
    const { list, open, advance, rows } = setup();
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
    const progressTip = () => rows()[0]?.querySelectorAll('td:not(.mark-cell)')[3]?.getAttribute('data-tip') ?? '';
    expect(progressTip()).not.toContain('Eigenanteil:');
    advance(10_000);
    open(1909);
    await tick();
    expect(progressTip()).toMatch(/^Eigenanteil: \d[\d.]* FP$/m);
    expect(rows()[0]?.getAttribute('data-tip')).not.toContain('Eigenanteil:');
  });

  it('shows the best profit with its range in the tooltip and sorts by a clicked column head', async () => {
    const { box, list, rows, cells } = setup();
    list([withRequired(zeus, 80, 20), withRequired(oracle, 100, 30)]);
    await tick();
    const profits = rows().map((r) => cells(r)[6] ?? '');
    expect(profits.every((p) => /^[+−]?\d[\d.]*$/.test(p))).toBe(true);
    const tips = rows().map((r) => r.querySelectorAll('td:not(.mark-cell)')[6]?.getAttribute('data-tip') ?? '');
    expect(tips.some((tip) => /^Gewinn [+−]?\d[\d.]* bis [+−]?\d[\d.]*$/m.test(tip))).toBe(true);
    const names = () => rows().map((r) => cells(r)[1]);
    const before = names();
    (box.root.querySelectorAll('th')[2] as HTMLElement).click();
    await tick();
    const ascending = names();
    expect(ascending).toEqual([...before].sort((a, b) => (a ?? '').localeCompare(b ?? '', 'de')));
    (box.root.querySelectorAll('th')[2] as HTMLElement).click();
    await tick();
    expect(names()).toEqual([...ascending].reverse());
    expect(box.root.querySelector('th.desc')?.getAttribute('aria-label')).toBe('LG');
  });

  it('adds a sort level on a shift click', async () => {
    const { box, list } = setup();
    list([withRequired(zeus, 80, 20), withRequired(oracle, 100, 30)]);
    await tick();
    (box.root.querySelectorAll('th')[2] as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true }),
    );
    await tick();
    expect(box.root.querySelectorAll('th .sort-level')).toHaveLength(2);
    expect(box.root.querySelector('th.asc .sort-level')?.textContent).toBe('2');
  });

  it('numbers the rows in the order of the game and sorts by that number', async () => {
    const { box, list, rows, cells } = setup();
    list([withRequired(zeus, 80, 20), withRequired(oracle, 100, 30)]);
    await tick();
    const order = () => rows().map((r) => cells(r)[0]);
    expect([...order()].sort()).toEqual(['1', '2']);
    (box.root.querySelectorAll('th')[0] as HTMLElement).click();
    await tick();
    expect(order()).toEqual(['1', '2']);
    expect(box.root.querySelector('th.asc')?.getAttribute('aria-label')).toBe('#');
  });

  it('does not open for a list without a hit, and does not beep', async () => {
    const { box, list, tones } = setup();
    list([withRequired(zeus, 9_000, 400)]);
    await tick();
    expect(box.box.isOpen).toBe(false);
    expect(tones()).toBe(0);
    box.box.open();
    expect(expanded(box)).toBe(true);
    expect(box.text).toContain('Kein LG mit lohnendem Platz.');
    expect(box.text).toContain('ohne Gewinn: 1');
  });

  it('unfolds the section of an open box even without a hit', async () => {
    const { box, list } = setup();
    box.box.open();
    list([withRequired(zeus, 9_000, 400)]);
    await tick();
    expect(expanded(box)).toBe(true);
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

  it('a new list replaces the previous one; a building of another player folds the section', async () => {
    const { box, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    advance(10_000);
    open(650);
    await tick();
    expect(expanded(box)).toBe(false);
    advance(10_000);
    list([hitOracle()], 1001);
    await tick();
    expect(expanded(box)).toBe(true);
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
    expect(cells(rows()[0]).slice(1, 4)).toEqual(['Aachener Dom', '75', '2.900 / 3.062']);
    expect(rows()[0]?.querySelector('td.snipe-tier')?.className).not.toContain('exact');
    advance(10_000);
    open(1909);
    await tick();
    expect(expanded(box)).toBe(true);
    // the opening is newer than the list: its state and its ranking make the row exact
    expect(cells(rows()[0]).slice(1, 5)).toEqual(['Aachener Dom', '75', '251 / 3.062', 'P1']);
    expect(rows()[0]?.querySelector('td.snipe-tier')?.className).toContain('exact');
  });

  describe('long lists', () => {
    /** n rows that pay the same place and are numbered 1 … n by their place in the game's list; equal profits keep that order */
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...hitZeus(), entity_id: 5000 + i }));
    const places = (rows: () => Element[], cells: (r: Element | undefined) => (string | undefined)[]) =>
      rows().map((r) => Number(cells(r)[0]));
    const button = (box: { root: ParentNode }, word: string) =>
      box.root.querySelector(`.win-nav button[aria-label="${word}"]`) as HTMLElement;
    const hiddenLine = (box: { root: ParentNode }) => box.root.querySelector('.win-hidden')?.textContent?.trim();
    const wheel = (box: { root: ParentNode }, deltaY: number) => {
      const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
      box.root.querySelector('.snipe-scroll')?.dispatchEvent(event);
      return event;
    };

    it('shows six rows with the head, greyed buttons and no line when all fit', async () => {
      const { box, list, rows } = setup();
      list(many(6));
      await tick();
      expect(rows()).toHaveLength(6);
      // the buttons keep their room, greyed
      expect([...box.root.querySelectorAll('.win-nav button')].map((b) => b.getAttribute('aria-disabled'))).toEqual([
        'true',
        'true',
      ]);
      expect(box.root.querySelector('.win-hidden')).toBeNull();
    });

    it('shows six rows of a longer list and says what is hidden below', async () => {
      const { box, list, rows, cells } = setup();
      list(many(10));
      await tick();
      expect(places(rows, cells)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(box.root.querySelectorAll('thead th').length).toBe(9);
      expect(hiddenLine(box)).toBe('noch 4 weitere unten');
      expect(button(box, 'Nach oben').getAttribute('aria-disabled')).toBe('true');
      expect(button(box, 'Nach unten').getAttribute('aria-disabled')).toBe('false');
      expect(button(box, 'Nach unten').getAttribute('data-tip')).toBe('Nach unten');
    });

    it('steps one row per click and greys the button at each end', async () => {
      const { box, list, rows, cells } = setup();
      list(many(8));
      await tick();
      button(box, 'Nach unten').click();
      await tick();
      expect(places(rows, cells)).toEqual([2, 3, 4, 5, 6, 7]);
      expect(hiddenLine(box)).toBe('1 oben · 1 unten');
      button(box, 'Nach unten').click();
      await tick();
      expect(places(rows, cells)).toEqual([3, 4, 5, 6, 7, 8]);
      expect(hiddenLine(box)).toBe('noch 2 weitere oben');
      expect(button(box, 'Nach unten').getAttribute('aria-disabled')).toBe('true');
      button(box, 'Nach unten').click();
      await tick();
      expect(places(rows, cells)).toEqual([3, 4, 5, 6, 7, 8]);
      button(box, 'Nach oben').click();
      await tick();
      expect(places(rows, cells)).toEqual([2, 3, 4, 5, 6, 7]);
      expect(button(box, 'Nach oben').getAttribute('aria-disabled')).toBe('false');
    });

    it('scrolls by the mouse wheel over the table and lets the wheel pass at the ends', async () => {
      const { box, list, rows, cells } = setup();
      list(many(8));
      await tick();
      expect(wheel(box, -100).defaultPrevented).toBe(false);
      expect(wheel(box, 100).defaultPrevented).toBe(true);
      await tick();
      expect(places(rows, cells)).toEqual([2, 3, 4, 5, 6, 7]);
      wheel(box, 100);
      await tick();
      expect(places(rows, cells)).toEqual([3, 4, 5, 6, 7, 8]);
      expect(wheel(box, 100).defaultPrevented).toBe(false);
      wheel(box, -100);
      await tick();
      expect(places(rows, cells)).toEqual([2, 3, 4, 5, 6, 7]);
    });

    it('keeps the position when the list is sorted or a row changes, and starts at the top for a new list', async () => {
      const { box, list, rows, cells } = setup();
      list(many(9));
      await tick();
      button(box, 'Nach unten').click();
      button(box, 'Nach unten').click();
      await tick();
      expect(places(rows, cells)).toEqual([3, 4, 5, 6, 7, 8]);
      // a click on the head of the profit column turns the order, the equal profits keep the offset and the rows
      (box.root.querySelectorAll('th.sortable')[6] as HTMLElement).click();
      await tick();
      expect(hiddenLine(box)).toBe('2 oben · 1 unten');
      // the same list again from the game is a new list: the top
      list(many(9));
      await tick();
      expect(places(rows, cells)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(hiddenLine(box)).toBe('noch 3 weitere unten');
    });

    it('keeps the calculator part and the section head out of the scrolling rows', async () => {
      const { box, list } = setup();
      list(many(10));
      await tick();
      const scroll = box.root.querySelector('.snipe-scroll');
      expect(scroll?.querySelector('.gb-title')).toBeNull();
      expect(box.root.querySelector('.win-hidden')?.closest('.snipe-scroll')).toBeNull();
      expect(box.text).toContain('Noch kein fremdes LG geöffnet.');
    });
  });
});

describe('Snipehilfe: marking with a star', () => {
  const stars = (box: { root: ParentNode }) => [...box.root.querySelectorAll('.snipe-table td.mark-cell button')];

  it('has a star column between # and the name, as in the investments, the word in tooltip and label', async () => {
    const { box, list } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    const heads = [...box.root.querySelectorAll('.snipe-table th')];
    expect(heads.map((h) => h.getAttribute('aria-label')).slice(0, 3)).toEqual(['#', 'Merken', 'LG']);
    const star = heads[1];
    expect(star?.getAttribute('data-tip')).toContain('Merken');
    expect(star?.querySelector('svg')).not.toBeNull();
    expect(box.root.querySelector('.snipe-table tbody tr td:nth-child(2) button.star')).not.toBeNull();
    expect(stars(box)).toHaveLength(2);
  });

  it('sorts by the tier and by the mark on a click on their heads, the best and the marked first', async () => {
    const { box, greatBuildings, list, rows, cells } = setup();
    list([withRequired(zeus, 80, 20), withRequired(oracle, 100, 30)]);
    await tick();
    const head = (label: string) => box.root.querySelector(`.snipe-table th[aria-label="${label}"]`) as HTMLElement;
    const names = () => rows().map((r) => cells(r)[1]);
    expect(head('Sicherheit').classList.contains('sortable')).toBe(true);
    expect(head('Merken').classList.contains('sortable')).toBe(true);
    const last = names()[names().length - 1];
    await greatBuildings.mark(playerId(1001), last === 'Zeusstatue' ? zeus.entity_id : oracle.entity_id, true);
    head('Merken').click();
    await tick();
    expect(names()[0]).toBe(last);
    expect(head('Merken').classList.contains('desc')).toBe(true);
    head('Sicherheit').click();
    await tick();
    expect(head('Sicherheit').classList.contains('desc')).toBe(true);
  });

  it('marks a building on a click and redraws filled, a second click takes the mark away', async () => {
    const { box, greatBuildings, list } = setup();
    list([hitZeus()]);
    await tick();
    const star = () => stars(box)[0] as HTMLElement;
    expect(star().getAttribute('aria-label')).toBe('Merken');
    expect(star().getAttribute('aria-pressed')).toBe('false');
    const outline = star().innerHTML;
    star().click();
    await tick();
    expect(greatBuildings.isMarked(playerId(1001), zeus.entity_id)).toBe(true);
    expect(star().getAttribute('aria-label')).toBe('Nicht mehr merken');
    expect(star().getAttribute('aria-pressed')).toBe('true');
    expect(star().classList.contains('on')).toBe(true);
    expect(star().innerHTML).not.toBe(outline);
    star().click();
    await tick();
    expect(greatBuildings.isMarked(playerId(1001), zeus.entity_id)).toBe(false);
    expect(star().getAttribute('aria-label')).toBe('Merken');
  });

  it('shows a mark set elsewhere, and the star of the open building in the calculator header', async () => {
    const { box, greatBuildings, list, open, advance } = setup();
    advance(10_000);
    open(1909);
    await tick();
    const header = () =>
      box.root.querySelector('p .gb-title')?.closest('p')?.querySelector('button.star') as HTMLElement;
    expect(header().getAttribute('aria-label')).toBe('Merken');
    header().click();
    await tick();
    expect(greatBuildings.isMarked(playerId(1001), 1909)).toBe(true);
    expect(header().getAttribute('aria-label')).toBe('Nicht mehr merken');
    header().click();
    await tick();
    expect(greatBuildings.isMarked(playerId(1001), 1909)).toBe(false);
    header().click();
    await tick();
    // the same building in a list of its owner shows the mark too
    advance(10_000);
    list([{ ...hitZeus(), entity_id: 1909 }]);
    await tick();
    expect(stars(box)[0]?.getAttribute('aria-label')).toBe('Nicht mehr merken');
  });

  it('keeps the stored mark when the player opens the building again', async () => {
    const { greatBuildings, list, open, advance } = setup();
    list([hitZeus()]);
    await tick();
    await greatBuildings.mark(playerId(1001), zeus.entity_id, true);
    advance(10_000);
    open(1909);
    await tick();
    expect(greatBuildings.isMarked(playerId(1001), zeus.entity_id)).toBe(true);
    expect((await greatBuildings.known()).find((b) => b.entityId === zeus.entity_id)?.marked).toBe(true);
  });
});

describe('Snipehilfe: marking the owner', () => {
  const social = (send: (...e: Entry[]) => void, ...ids: number[]) =>
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
  const ownerStar = (box: { root: ParentNode }) =>
    box.root.querySelector('.gb-owner button.star') as HTMLElement | null;

  it('has no star for an owner the player store does not know', async () => {
    const { box, list } = setup();
    list([hitZeus()]);
    await tick();
    expect(ownerStar(box)).toBeNull();
  });

  it('marks the owner of the list at its name, in the header of the section', async () => {
    const { box, players, list, send } = setup();
    social(send, 1001);
    list([hitZeus()]);
    await tick();
    expect(ownerStar(box)?.closest('p')?.textContent).toContain('Eigentümer 1001');
    expect(ownerStar(box)?.getAttribute('aria-label')).toBe('Merken');
    ownerStar(box)?.click();
    await tick();
    expect(players.get(playerId(1001))?.marked).toBe(true);
    expect(ownerStar(box)?.getAttribute('aria-pressed')).toBe('true');
    ownerStar(box)?.click();
    await tick();
    expect(players.get(playerId(1001))?.marked).toBeUndefined();
    expect(ownerStar(box)?.getAttribute('aria-pressed')).toBe('false');
  });

  it('marks the owner in the header of the calculator too, and both stars follow each other', async () => {
    const { box, players, list, open, send, advance } = setup();
    social(send, 1001);
    advance(10_000);
    open(1909);
    advance(10_000);
    list([hitZeus()]);
    await tick();
    // a new list folds the calculator, the header with its star needs it open
    calcToggle(box)?.click();
    await tick();
    const stars = () => [...box.root.querySelectorAll('.gb-owner button.star')] as HTMLElement[];
    expect(stars()).toHaveLength(2);
    // the second one is the calculator's, below the separator
    stars()[1]?.click();
    await tick();
    expect(players.get(playerId(1001))?.marked).toBe(true);
    expect(stars().map((s) => s.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
  });

  it('keeps the mark of the owner when the social list comes again without them', async () => {
    const { box, players, list, send } = setup();
    social(send, 1001);
    list([hitZeus()]);
    await tick();
    ownerStar(box)?.click();
    await tick();
    social(send);
    await tick();
    expect(players.get(playerId(1001))).toMatchObject({ marked: true, relations: { friend: false } });
    expect(ownerStar(box)?.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks the owner of a building whose opening was not seen, too', async () => {
    const { box, players, send } = setup();
    social(send, 1001);
    // only the construction arrives, so the box has no building for it
    const opening = fixture.openings.find((x) => x.entity.requestData[0] === 1909);
    send(opening?.construction as Entry);
    await tick();
    expect(box.text).not.toContain('Aachener Dom');
    ownerStar(box)?.click();
    await tick();
    expect(players.get(playerId(1001))?.marked).toBe(true);
  });
});

describe('Snipehilfe: ignorierte LGs und Spieler', () => {
  const owner = playerId(1001);
  const showToggle = (box: { root: ParentNode }) =>
    box.root.querySelector('.ignored-filter button') as HTMLButtonElement;
  const social = (send: (...e: Entry[]) => void) =>
    send({
      requestClass: 'OtherPlayerService',
      requestMethod: 'getSocialList',
      requestData: null,
      responseData: { friends: [{ player_id: 1001, name: 'Eigentümer 1001' }], neighbours: [], guildMembers: [] },
    });

  it('leaves an ignored building out of the rows and names how many are ignored', async () => {
    const { box, greatBuildings, list, rows, cells } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    expect(rows()).toHaveLength(2);
    expect(box.text).not.toContain('ignoriert');
    await greatBuildings.ignore(owner, zeus.entity_id, true);
    await tick();
    expect(rows()).toHaveLength(1);
    expect(cells(rows()[0])[1]).toBe('Orakel von Delphi');
    expect(box.text).toContain('ignoriert: 1');
  });

  it('shows ignored rows muted with "ignorierte zeigen", naming the reason, and remembers the toggle', async () => {
    const { box, greatBuildings, list, rows, cells, ui } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await greatBuildings.ignore(owner, zeus.entity_id, true);
    await tick();
    expect(showToggle(box).getAttribute('aria-label')).toBe('ignorierte zeigen');
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('false');
    showToggle(box).click();
    await tick();
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('true');
    expect(ui.pref('snipe.showIgnored')).toBe('true');
    expect(rows()).toHaveLength(2);
    const muted = rows().filter((r) => r.classList.contains('muted'));
    expect(muted).toHaveLength(1);
    expect(cells(muted[0])[1]).toBe('Zeusstatue');
    expect(muted[0]?.getAttribute('data-tip')).toContain('LG ignoriert');
    expect(box.text).toContain('ignoriert: 1');
    showToggle(box).click();
    await tick();
    expect(ui.pref('snipe.showIgnored')).toBe('false');
    expect(rows()).toHaveLength(1);
  });

  it('opens with the remembered toggle', async () => {
    const { box, greatBuildings, list, rows } = setup({ 'snipe.showIgnored': 'true' });
    list([hitZeus(), hitOracle()]);
    await tick();
    await greatBuildings.ignore(owner, zeus.entity_id, true);
    await tick();
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toHaveLength(2);
  });

  it('treats the buildings of an ignored owner as ignored', async () => {
    const { box, players, send, list, rows } = setup();
    social(send);
    list([hitZeus(), hitOracle()]);
    await tick();
    players.setIgnored(owner, true);
    await tick();
    expect(rows()).toHaveLength(0);
    expect(box.text).toContain('Kein LG mit lohnendem Platz.');
    expect(box.text).toContain('ignoriert: 2');
    showToggle(box).click();
    await tick();
    expect(rows()).toHaveLength(2);
    expect(rows()[0]?.getAttribute('data-tip')).toContain('Spieler ignoriert');
  });

  it('does not open the box and does not beep for a list whose hits are all ignored', async () => {
    const { box, greatBuildings, list, tones } = setup();
    list([hitZeus()]);
    await tick();
    expect(tones()).toBe(1);
    box.box.close();
    await greatBuildings.ignore(owner, zeus.entity_id, true);
    // other hits than before: a visible one would open the box and beep
    list([withRequired(zeus, 90)]);
    await tick();
    expect(box.box.isOpen).toBe(false);
    expect(tones()).toBe(1);
  });

  it('does not open the box for a list of an ignored owner', async () => {
    const { box, players, send, list, tones } = setup();
    social(send);
    list([hitZeus()]);
    await tick();
    box.box.close();
    players.setIgnored(owner, true);
    list([withRequired(zeus, 90)]);
    await tick();
    expect(box.box.isOpen).toBe(false);
    expect(tones()).toBe(1);
  });

  it('opens and beeps for the visible hits of a list that also has ignored ones', async () => {
    const { box, greatBuildings, list, tones, rows } = setup();
    list([hitZeus()]);
    await tick();
    box.box.close();
    await greatBuildings.ignore(owner, zeus.entity_id, true);
    list([withRequired(zeus, 90), hitOracle()]);
    await tick();
    expect(box.box.isOpen).toBe(true);
    expect(tones()).toBe(2);
    expect(rows()).toHaveLength(1);
  });

  it('counts only the visible hits in the folded line, also while the ignored ones show, and names the best of them', async () => {
    const { box, greatBuildings, list, open, advance } = setup();
    open(1909);
    advance(10_000);
    box.box.open();
    list([hitZeus(), hitOracle()]);
    await tick();
    // the better hit of the two is the ignored one
    await greatBuildings.ignore(owner, oracle.entity_id, true);
    await tick();
    showToggle(box).click();
    await tick();
    toggle(box)?.click();
    await tick();
    expect(toggle(box)?.textContent).toMatch(/^Mögliche Einzahlungen: 1 mit Gewinn, bester Zeusstatue /);
  });

  it('keeps the toggle while it is on, after the last ignored building is released', async () => {
    const { box, greatBuildings, list, rows } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    await greatBuildings.ignore(owner, zeus.entity_id, true);
    await tick();
    showToggle(box).click();
    await tick();
    await greatBuildings.ignore(owner, zeus.entity_id, false);
    await tick();
    expect(rows()).toHaveLength(2);
    expect(box.text).not.toContain('ignoriert');
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('true');
    showToggle(box).click();
    await tick();
    expect(box.root.querySelector('.ignored-filter')).toBeNull();
  });

  it('has no toggle while nothing is ignored and the toggle is off', async () => {
    const { box, list } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    expect(box.root.querySelector('.ignored-filter')).toBeNull();
  });

  const headerEye = (box: { root: ParentNode }) =>
    box.root.querySelector('.gb-owner button.ignore') as HTMLButtonElement;
  const rowEye = (r: Element | undefined) =>
    r?.querySelector('td.name-cell .row-name button.ignore') as HTMLButtonElement;

  it('puts the eye after the owner star in the section header, for a known player only', async () => {
    const { box, players, send, list, rows } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    expect(headerEye(box)).toBeNull();
    social(send);
    list([hitZeus(), hitOracle()]);
    await tick();
    expect(headerEye(box).getAttribute('aria-label')).toBe('Spieler ignorieren');
    expect(headerEye(box).previousElementSibling?.classList.contains('star')).toBe(true);
    headerEye(box).click();
    await tick();
    expect(players.get(owner)?.ignored).toBe(true);
    // all hits are ignored now, the header stays and releases
    expect(rows()).toHaveLength(0);
    expect(headerEye(box).getAttribute('aria-label')).toBe('Nicht mehr ignorieren');
    expect(headerEye(box).classList.contains('on')).toBe(true);
    headerEye(box).click();
    await tick();
    expect(players.get(owner)?.ignored).toBeUndefined();
    expect(rows()).toHaveLength(2);
  });

  it('puts the building eye at the right edge of the name cell, which ignores and releases a shown ignored row', async () => {
    const { box, greatBuildings, list, rows, cells } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    const zeusRow = () => rows().find((r) => cells(r)[1] === 'Zeusstatue');
    expect(rowEye(zeusRow()).getAttribute('aria-label')).toBe('LG ignorieren');
    expect(rowEye(zeusRow()).getAttribute('aria-pressed')).toBe('false');
    rowEye(zeusRow()).click();
    await tick();
    expect(greatBuildings.isIgnored(owner, zeus.entity_id)).toBe(true);
    expect(rows()).toHaveLength(1);
    showToggle(box).click();
    await tick();
    expect(rowEye(zeusRow()).getAttribute('aria-label')).toBe('Nicht mehr ignorieren');
    expect(rowEye(zeusRow()).classList.contains('on')).toBe(true);
    rowEye(zeusRow()).click();
    await tick();
    expect(greatBuildings.isIgnored(owner, zeus.entity_id)).toBe(false);
    expect(rows().some((r) => r.classList.contains('muted'))).toBe(false);
  });
});
