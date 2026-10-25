// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { createGbCalculatorFeature } from '../src/content/features/gb-calculator';
import { registerGameHandlers } from '../src/content/game/handlers';
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

const toggle = (box: { root: ParentNode }) => box.root.querySelector('button.snipe-toggle') as HTMLElement | null;
const expanded = (box: { root: ParentNode }) => toggle(box)?.getAttribute('aria-expanded') === 'true';

describe('Snipehilfe: stacked box', () => {
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
    expect(html.indexOf('snipe-toggle')).toBeLessThan(html.indexOf('snipe-sep'));
    expect(html.indexOf('snipe-sep')).toBeLessThan(html.indexOf('Aachener Dom'));
  });

  it('shows one line with count, best hit, owner and age when folded, and the heading when unfolded', async () => {
    const { box, list, advance } = setup();
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
    expect(box.root.querySelector('table')).toBeNull();
  });

  it('says there is no hit in the folded line', async () => {
    const { box, list } = setup();
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
    const { box, list } = setup();
    list([hitZeus()]);
    await tick();
    expect(box.root.querySelector('table')).not.toBeNull();
    toggle(box)?.click();
    await tick();
    expect(box.root.querySelector('table')).toBeNull();
    toggle(box)?.click();
    await tick();
    expect(box.root.querySelector('table')).not.toBeNull();
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
    const { box, list, send } = setup();
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
      'LG',
      'Stufe',
      'Fortschritt',
      'Platz',
      'Einsatz',
      'Gewinn',
      'Sicherheit',
      'Merken',
    ]);
    // the lighthouse has no loaded definition: unknown reward; the others pay a place
    expect(rows()).toHaveLength(2);
    const [, first] = cells(rows()[0]);
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
    expect(rows()[0]?.getAttribute('data-tip')).not.toContain('Eigentümer:');
    advance(10_000);
    open(1909);
    await tick();
    expect(rows()[0]?.getAttribute('data-tip')).toMatch(/^Eigentümer: \d[\d.]* FP$/m);
  });

  it('gives a range as profit when not exact and sorts by a clicked column head', async () => {
    const { box, list, rows, cells } = setup();
    list([withRequired(zeus, 80, 20), withRequired(oracle, 100, 30)]);
    await tick();
    const profits = rows().map((r) => cells(r)[6] ?? '');
    expect(profits.every((p) => /^[+−]?\d[\d.]* … [+−]?\d[\d.]*$|^[+−]?\d[\d.]*$/.test(p))).toBe(true);
    const names = () => rows().map((r) => cells(r)[1]);
    const before = names();
    (box.root.querySelectorAll('th')[1] as HTMLElement).click();
    await tick();
    const ascending = names();
    expect(ascending).toEqual([...before].sort((a, b) => (a ?? '').localeCompare(b ?? '', 'de')));
    (box.root.querySelectorAll('th')[1] as HTMLElement).click();
    await tick();
    expect(names()).toEqual([...ascending].reverse());
    expect(box.root.querySelector('th.desc')?.getAttribute('aria-label')).toBe('LG');
  });

  it('adds a sort level on a shift click', async () => {
    const { box, list } = setup();
    list([withRequired(zeus, 80, 20), withRequired(oracle, 100, 30)]);
    await tick();
    (box.root.querySelectorAll('th')[1] as HTMLElement).dispatchEvent(
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
      box.root.querySelector(`.snipe-nav button[aria-label="${word}"]`) as HTMLElement;
    const hiddenLine = (box: { root: ParentNode }) => box.root.querySelector('.snipe-hidden')?.textContent?.trim();
    const wheel = (box: { root: ParentNode }, deltaY: number) => {
      const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
      box.root.querySelector('.snipe-scroll')?.dispatchEvent(event);
      return event;
    };

    it('shows six rows with the head, no buttons and no line when all fit', async () => {
      const { box, list, rows } = setup();
      list(many(6));
      await tick();
      expect(rows()).toHaveLength(6);
      expect(box.root.querySelector('.snipe-nav')).toBeNull();
      expect(box.root.querySelector('.snipe-hidden')).toBeNull();
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
      expect(box.root.querySelector('.snipe-hidden')?.closest('.snipe-scroll')).toBeNull();
      expect(box.text).toContain('Noch kein fremdes LG geöffnet.');
    });
  });
});

describe('Snipehilfe: marking with a star', () => {
  const stars = (box: { root: ParentNode }) => [...box.root.querySelectorAll('.snipe-table td.snipe-mark button')];

  it('has a star column after the tier, the word in tooltip and label', async () => {
    const { box, list } = setup();
    list([hitZeus(), hitOracle()]);
    await tick();
    const heads = [...box.root.querySelectorAll('.snipe-table th')];
    const last = heads[heads.length - 1];
    expect(last?.getAttribute('aria-label')).toBe('Merken');
    expect(last?.getAttribute('data-tip')).toContain('Merken');
    expect(last?.querySelector('svg')).not.toBeNull();
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
    const header = () => box.root.querySelector('.gb-title')?.closest('p')?.querySelector('button.star') as HTMLElement;
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
