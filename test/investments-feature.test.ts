// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Ingestion } from '../src/content/core/ingestion';
import { investmentsFeature } from '../src/content/features/investments';
import { registerGameHandlers } from '../src/content/game/handlers';
import { GreatBuildingStore } from '../src/content/stores/great-buildings';
import { playerId, worldId } from '../src/shared/ids';
import contributionFixture from './fixtures/gb-contribution.json';
import contributions from './fixtures/gb-contributions.json';
import { testDb } from './helpers/battle-db';
import { featureContext } from './helpers/feature-context';
import { fakeLayout } from './helpers/layout';

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
      '',
      'Eigentümer 2005',
      'unbekannt',
      'Leuchtturm von Alexandria',
      '30',
      '907 / 924',
      'P1',
      '242',
      '−12',
      '',
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
    // the growth sits beside the bar, in the line every row has, so all rows keep one height
    expect(rows()[0]?.querySelector('td.inv-progress .fp-line .inv-growth')?.textContent).toBe('+400');
    expect(rows()[0]?.closest('table')?.classList.contains('inv-mine')).toBe(true);
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
    expect(line.querySelector('b')?.textContent?.trim()).toBe('0');
    expect(line.querySelector('.profit-icon')?.getAttribute('aria-label')).toBe('Gewinn');
    expect(line.querySelector('b')?.classList.contains('gain')).toBe(false);
    expect(line.querySelector('.muted')?.textContent?.trim()).toBe('· Σ −36');
  });

  it('marks the status with an icon and its word in the tooltip', async () => {
    const { send, rows } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const status = rows()[0]?.querySelectorAll('td')[9];
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
    expect(cells(rows()[0])[7]).toBe('1.886');
    (heads().find((h) => h.textContent?.trim() === 'Einzahlung') as HTMLElement).click();
    await tick();
    expect(cells(rows()[0])[7]).toBe('1');
  });

  it('sorts by several columns: shift appends a level, a plain click starts over', async () => {
    const { send, heads } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const head = (word: string) => heads().find((h) => h.getAttribute('aria-label') === word) as HTMLElement;
    const shift = (word: string) =>
      head(word).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    head('Einzahlung').click();
    await tick();
    shift('Stufe');
    await tick();
    expect(head('Einzahlung').querySelector('.sort-level')?.textContent).toBe('1');
    expect(head('Stufe').querySelector('.sort-level')?.textContent).toBe('2');
    head('Stufe').click();
    await tick();
    expect(head('Einzahlung').querySelector('.sort-level')).toBeNull();
    expect(head('Stufe').className).toContain('sortable');
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

describe('Investitionen: long lists', () => {
  let layout: ReturnType<typeof fakeLayout>;
  beforeEach(() => {
    layout = fakeLayout();
  });
  afterEach(() => layout.restore());

  const button = (box: { root: ParentNode }, word: string) =>
    box.root.querySelector(`.win-nav button[aria-label="${word}"]`) as HTMLElement;
  const hiddenLine = (box: { root: ParentNode }) => box.root.querySelector('.win-hidden')?.textContent?.trim();
  const wheel = (box: { root: ParentNode }, deltaY: number) => {
    const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
    box.root.querySelector('.win-scroll')?.dispatchEvent(event);
    return event;
  };

  /** the box with the twelve own investments, room for `fit` rows; `all` is the whole list as drawn */
  async function listed(fit: number) {
    layout.rows(12);
    const env = setup();
    env.send(contributions.contributions as Entry);
    await tick();
    const texts = () => env.rows().map((r) => env.cells(r).join('|'));
    const all = texts();
    layout.rows(fit);
    layout.resize();
    return { ...env, texts, all };
  }

  it('shows the rows that fit, with the head and nothing else in the table area', async () => {
    const { box, texts, all, heads } = await listed(5);
    expect(texts()).toEqual(all.slice(0, 5));
    expect(heads().length).toBe(10);
    expect(hiddenLine(box)).toBe('noch 7 weitere unten');
    expect(button(box, 'Nach oben').getAttribute('aria-disabled')).toBe('true');
    expect(button(box, 'Nach unten').getAttribute('aria-disabled')).toBe('false');
    expect(box.root.querySelector('.inv-pane > p.gb-me')).not.toBeNull();
  });

  it('shows all rows, greyed buttons and no line, when they fit and when nothing can be measured', async () => {
    const { box, texts, all } = await listed(12);
    expect(texts()).toEqual(all);
    // the buttons keep their room, greyed
    expect([...box.root.querySelectorAll('.win-nav button')].map((b) => b.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
    ]);
    expect(box.root.querySelector('.win-hidden')).toBeNull();
    layout.height(0);
    layout.resize();
    expect(texts()).toEqual(all);
  });

  it('steps a row per click and per wheel step, greys the buttons at the ends and lets the wheel pass there', async () => {
    const { box, texts, all } = await listed(5);
    expect(wheel(box, -100).defaultPrevented).toBe(false);
    button(box, 'Nach unten').click();
    expect(texts()).toEqual(all.slice(1, 6));
    expect(hiddenLine(box)).toBe('1 oben · 6 unten');
    expect(wheel(box, 100).defaultPrevented).toBe(true);
    expect(texts()).toEqual(all.slice(2, 7));
    for (let i = 0; i < 9; i++) button(box, 'Nach unten').click();
    expect(texts()).toEqual(all.slice(7));
    expect(button(box, 'Nach unten').getAttribute('aria-disabled')).toBe('true');
    expect(wheel(box, 100).defaultPrevented).toBe(false);
    button(box, 'Nach oben').click();
    expect(texts()).toEqual(all.slice(6, 11));
  });

  it('windows again when the box is resized and keeps the offset inside the list', async () => {
    const { box, texts, all } = await listed(5);
    for (let i = 0; i < 7; i++) button(box, 'Nach unten').click();
    expect(texts()).toEqual(all.slice(7));
    layout.rows(8);
    layout.resize();
    expect(texts()).toEqual(all.slice(4));
    expect(hiddenLine(box)).toBe('noch 4 weitere oben');
    layout.rows(3);
    layout.resize();
    expect(texts()).toEqual(all.slice(4, 7));
  });

  it('keeps the position when the list is sorted', async () => {
    const { box, texts, all } = await listed(5);
    button(box, 'Nach unten').click();
    button(box, 'Nach unten').click();
    (box.root.querySelectorAll('th.sortable')[3] as HTMLElement).click();
    expect(texts()).toHaveLength(5);
    expect(texts()).not.toEqual(all.slice(2, 7));
    expect(hiddenLine(box)).toBe('2 oben · 5 unten');
  });

  it('asks the box for room for the tabs, the head and two rows so that no second scrollbar appears', () => {
    const { box } = setup();
    // tabs 32, filter row 46, two lines of totals 60, head 22, two rows 46 and the hidden line 21 on top of 45 of frame and padding
    expect(box.options.minHeight).toBeGreaterThanOrEqual(272);
    expect(box.options.defaultSize?.({ width: 1200, height: 900 }).height).toBeGreaterThanOrEqual(
      box.options.minHeight ?? 0,
    );
  });
});

describe('Investitionen: Merken', () => {
  it('scrolls only the table, the tabs, the age and the totals stay above it', async () => {
    const { box, send } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const scroll = box.root.querySelector('.inv-pane > .win-scroll') as HTMLElement;
    expect(scroll.querySelector('.win-area table.inv-table')).not.toBeNull();
    expect(scroll.querySelector('p.gb-me')).toBeNull();
    expect(box.root.querySelector('.inv-pane > p.gb-me')).not.toBeNull();
  });

  it('starts each own row with a star that marks the building', async () => {
    const { box, send, rows, heads } = setup();
    send(contributions.contributions as Entry);
    await tick();
    expect(heads()[0]?.getAttribute('aria-label')).toBe('Merken');
    expect(heads()[0]?.querySelector('svg')).not.toBeNull();
    const star = () => rows()[0]?.querySelector('td:first-child button.star') as HTMLElement;
    expect(star().getAttribute('aria-label')).toBe('Merken');
    star().click();
    await tick();
    expect(star().getAttribute('aria-pressed')).toBe('true');
    expect(star().getAttribute('aria-label')).toBe('Nicht mehr merken');
    expect(box.root.querySelectorAll('button.star[aria-pressed=true]')).toHaveLength(1);
    star().click();
    await tick();
    expect(star().getAttribute('aria-pressed')).toBe('false');
  });

  it('sorts the marked rows first on a click on the star head', async () => {
    const { send, rows, heads, cells } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const last = rows()[rows().length - 1] as Element;
    const name = cells(last)[3];
    (last.querySelector('button.star') as HTMLElement).click();
    await tick();
    (heads()[0] as HTMLElement).click();
    await tick();
    expect(cells(rows()[0])[3]).toBe(name);
    expect(rows()[0]?.querySelector('button.star')?.getAttribute('aria-pressed')).toBe('true');
  });
});

const SOCIAL = (friends: number[]) =>
  ({
    requestClass: 'OtherPlayerService',
    requestMethod: 'getSocialList',
    requestData: null,
    responseData: {
      friends: friends.map((id) => ({ player_id: id, name: `Eigentümer ${id}` })),
      neighbours: [],
      guildMembers: [],
    },
  }) as Entry;

describe('Investitionen: Beziehung in Meine Investitionen', () => {
  it('has the same columns in the same order as the possible tab, the relation after the owner', async () => {
    const { send, heads } = setup();
    send(contributions.contributions as Entry);
    await tick();
    expect(heads().map((th) => th.getAttribute('aria-label'))).toEqual([
      'Merken',
      'Eigentümer',
      'Beziehung',
      'LG',
      'Stufe',
      'Fortschritt',
      'Platz',
      'Einzahlung',
      'Gewinn',
      'Status',
    ]);
    expect(heads()[2]?.querySelector('svg')).not.toBeNull();
  });

  it('shows the reason as an icon with the word in the tooltip, an unknown owner as a word, and sorts by it', async () => {
    const { send, rows, cells, heads } = setup();
    send(SOCIAL([2005, 2008]));
    send(contributions.contributions as Entry);
    await tick();
    const reach = (r: Element) => r.querySelectorAll('td')[2] as HTMLElement;
    const byOwner = (owner: string) => rows().filter((r) => cells(r)[1] === owner);
    expect(reach(byOwner('Eigentümer 2005')[0] as Element).dataset.tip).toBe('Freund');
    expect(reach(byOwner('Eigentümer 2005')[0] as Element).querySelector('svg')).not.toBeNull();
    expect(cells(byOwner('Eigentümer 2001')[0])[2]).toBe('unbekannt');
    (heads()[2] as HTMLElement).click();
    await tick();
    // friends before unknown owners
    expect(
      rows()
        .slice(0, 4)
        .map((r) => cells(r)[1]),
    ).toEqual(['Eigentümer 2005', 'Eigentümer 2008', 'Eigentümer 2008', 'Eigentümer 2008']);
  });

  it('hides an owner out of reach by default and draws him muted, with "keine", once the filter lets him in', async () => {
    const { box, send, rows, cells } = setup();
    send(SOCIAL([2005, 2006]));
    send({ requestClass: 'FriendService', requestMethod: 'deleteFriend', requestData: null, responseData: 2006 });
    send(contributions.contributions as Entry);
    await tick();
    expect(rows()).toHaveLength(10);
    const toggles = [...box.root.querySelectorAll('.inv-reach-filter button')] as HTMLButtonElement[];
    expect(toggles.map((b) => [b.getAttribute('aria-label'), b.getAttribute('aria-pressed')])).toEqual([
      ['Nachbar', 'true'],
      ['Freund', 'true'],
      ['Gilde', 'true'],
      ['keine Beziehung, nicht erreichbar', 'false'],
    ]);
    (toggles[3] as HTMLButtonElement).click();
    await tick();
    expect(rows()).toHaveLength(12);
    const out = rows().filter((r) => cells(r)[1] === 'Eigentümer 2006');
    expect(out.map((r) => [cells(r)[2], r.className])).toEqual([
      ['keine', 'muted'],
      ['keine', 'muted'],
    ]);
    expect(out[0]?.querySelectorAll('td')[2]?.getAttribute('data-tip')).toBe('keine Beziehung, nicht erreichbar');
  });
});

describe('Investitionen: Filter in Meine Investitionen', () => {
  const field = (box: { root: ParentNode }, label: string) =>
    box.root.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  const type = (box: { root: ParentNode }, label: string, value: string) => {
    const f = field(box, label);
    f.value = value;
    f.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const KEY = 'investments.mineFilter';

  it('has the filter row above the totals and the table, with the age at its end', async () => {
    const { box, send } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const kids = [...box.root.querySelectorAll('.inv-pane > *')].map((e) => e.className.split(' ')[0]);
    expect(kids).toEqual(['tabs', 'inv-filter', 'gb-me', 'win-scroll']);
    expect(box.root.querySelector('.inv-filter .inv-count')?.textContent).toContain('Stand: vor');
    expect(field(box, 'Spieler')).not.toBeNull();
    expect(field(box, 'LG')).not.toBeNull();
    expect(box.root.querySelector('.inv-hits-filter')).toBeNull();
  });

  it('filters by a part of the player and of the building, and remembers them apart from the possible tab', async () => {
    const { box, send, rows, cells, ui } = setup();
    send(contributions.contributions as Entry);
    await tick();
    type(box, 'Spieler', 'eigentümer 2008');
    await tick();
    expect(rows()).toHaveLength(3);
    type(box, 'LG', 'arche');
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual(['Die Arche']);
    expect(JSON.parse(ui.pref(KEY) ?? '{}')).toMatchObject({ player: 'eigentümer 2008', name: 'arche' });
    expect(ui.pref('investments.filter')).toBeUndefined();
  });

  it('has toggles for status with the icons of the column, all on, and filters by them', async () => {
    const { box, send, rows, ui } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const toggles = () => [...box.root.querySelectorAll('.inv-status-filter button')] as HTMLButtonElement[];
    expect(toggles().map((b) => [b.getAttribute('data-tip'), b.getAttribute('aria-pressed')])).toEqual([
      ['sicher', 'true'],
      ['unsicher', 'true'],
      ['unbekannt', 'true'],
    ]);
    expect(toggles().every((b) => b.getAttribute('aria-label') === b.getAttribute('data-tip'))).toBe(true);
    const statusIcon = rows()[0]?.querySelector('td.inv-status svg')?.innerHTML;
    expect(toggles()[2]?.querySelector('svg')?.innerHTML).toBe(statusIcon);
    // all twelve rows are unknown
    toggles()[2]?.click();
    await tick();
    expect(rows()).toHaveLength(0);
    expect(box.root.querySelector('.inv-pane')?.textContent).toContain('Kein LG passt zum Filter.');
    expect(JSON.parse(ui.pref(KEY) ?? '{}').status).toEqual({ safe: true, unsafe: true, unknown: false });
    toggles()[2]?.click();
    await tick();
    expect(rows()).toHaveLength(12);
  });

  it('filters by "nur gemerkte", off by default', async () => {
    const { box, send, rows, cells, ui } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const marked = box.root.querySelector('.inv-marked-filter button') as HTMLButtonElement;
    expect(marked.getAttribute('aria-label')).toBe('nur gemerkte');
    expect(marked.getAttribute('aria-pressed')).toBe('false');
    const last = rows()[rows().length - 1] as Element;
    const name = cells(last)[3];
    (last.querySelector('button.star') as HTMLElement).click();
    await tick();
    marked.click();
    await tick();
    expect(rows().map((r) => cells(r)[3])).toEqual([name]);
    expect(JSON.parse(ui.pref(KEY) ?? '{}')).toMatchObject({ onlyMarked: true });
  });

  it('opens with the remembered filters, each missing part at its default, a broken value as all defaults', async () => {
    const open = (saved: string | undefined) => {
      const env = featureContext({ now: () => Date.now() });
      if (saved !== undefined) env.ctx.ui.savePref(KEY, saved);
      investmentsFeature.setup(env.ctx);
      env.menu('investments');
      return env.boxes.get('investments')?.root as HTMLElement;
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    const root = open(
      JSON.stringify({ player: 'Anna', status: { safe: false }, reach: { none: true }, onlyMarked: true }),
    );
    await tick();
    expect((root.querySelector('input[aria-label="Spieler"]') as HTMLInputElement).value).toBe('Anna');
    expect((root.querySelector('input[aria-label="LG"]') as HTMLInputElement).value).toBe('');
    const pressed = (sel: string) =>
      [...root.querySelectorAll(`${sel} button`)].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed('.inv-status-filter')).toEqual(['false', 'true', 'true']);
    expect(pressed('.inv-reach-filter')).toEqual(['true', 'true', 'true', 'true']);
    expect(pressed('.inv-marked-filter')).toEqual(['true']);
    const broken = open('{nope');
    await tick();
    expect(
      [...broken.querySelectorAll('.inv-status-filter button')].map((b) => b.getAttribute('aria-pressed')),
    ).toEqual(['true', 'true', 'true']);
    expect([...broken.querySelectorAll('.inv-reach-filter button')].map((b) => b.getAttribute('aria-pressed'))).toEqual(
      ['true', 'true', 'true', 'false'],
    );
  });

  it('writes the owner into the player field from a funnel at the right edge of the owner cell, and marks it active', async () => {
    const { box, send, rows, cells } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const pick = () => rows()[0]?.querySelector('td.inv-name .inv-pick') as HTMLButtonElement;
    expect(pick().getAttribute('aria-label')).toBe('Nur diesen Spieler zeigen');
    expect(pick().previousElementSibling?.tagName).toBe('A');
    const name = cells(rows()[0])[1] as string;
    pick().click();
    await tick();
    expect(field(box, 'Spieler').value).toBe(name);
    expect(rows()).toHaveLength(1);
    expect(pick().classList.contains('on')).toBe(true);
    expect(pick().getAttribute('aria-label')).toBe('Spielerfilter entfernen');
    pick().click();
    await tick();
    expect(field(box, 'Spieler').value).toBe('');
    expect(rows()).toHaveLength(12);
  });

  it('shows a star beside a marked owner', async () => {
    const { send, rows, players, cells } = setup();
    send(SOCIAL([2005]));
    send(contributions.contributions as Entry);
    await tick();
    players.setMarked(playerId(2005), true);
    await tick();
    const row = rows().find((r) => cells(r)[1] === 'Eigentümer 2005') as Element;
    expect(row.querySelector('.inv-owner .owner-star')?.getAttribute('aria-label')).toBe('Spieler gemerkt');
  });
});

describe('Investitionen: Summenzeile mit Auswahl', () => {
  const lines = (box: { root: ParentNode }) => [...box.root.querySelectorAll('p.gb-me .gb-me-line')] as HTMLElement[];
  const text = (el: Element | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('is one line over all own investments while the filters leave none out', async () => {
    const { box, send } = setup();
    send(contributions.contributions as Entry);
    await tick();
    expect(lines(box)).toHaveLength(1);
    expect(text(lines(box)[0])).toContain('Umlauf: 4.896 FP');
  });

  it('adds a line with the totals of the filtered rows, keeping the line of all, once the filters leave rows out', async () => {
    const { box, send, ui } = setup();
    send(contributions.contributions as Entry);
    await tick();
    const f = box.root.querySelector('input[aria-label="Spieler"]') as HTMLInputElement;
    f.value = 'Eigentümer 2005';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(lines(box)).toHaveLength(2);
    expect(text(lines(box)[0])).toContain('Umlauf: 4.896 FP');
    expect(text(lines(box)[1])).toContain('Umlauf: 242 FP');
    expect(text(lines(box)[1])).toContain('Σ −12');
    const mark = lines(box)[1]?.querySelector('[role=img]');
    expect(mark?.getAttribute('aria-label')).toBe('Auswahl');
    expect(mark?.getAttribute('data-tip')).toBe('Auswahl');
    expect(mark?.querySelector('svg')).not.toBeNull();
    // the filter that leaves nothing out takes the line away again
    f.value = '';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(lines(box)).toHaveLength(1);
    expect(ui.pref('investments.mineFilter')).toBeDefined();
  });

  it('stays above the table, outside the scrolled area', async () => {
    const { box, send } = setup();
    send(contributions.contributions as Entry);
    await tick();
    expect(box.root.querySelector('.inv-pane > p.gb-me')).not.toBeNull();
    expect(box.root.querySelector('.win-scroll p.gb-me')).toBeNull();
  });
});

describe('Investitionen: Meine Investitionen scrolled and filtered', () => {
  let layout: ReturnType<typeof fakeLayout>;
  beforeEach(() => {
    layout = fakeLayout();
  });
  afterEach(() => layout.restore());

  it('clamps the offset when a filter shrinks the list', async () => {
    layout.rows(12);
    const env = setup();
    env.send(contributions.contributions as Entry);
    await tick();
    const texts = () => env.rows().map((r) => env.cells(r).join('|'));
    const all = texts();
    layout.rows(4);
    layout.resize();
    const down = () => env.box.root.querySelector('.win-nav button[aria-label="Nach unten"]') as HTMLElement;
    for (let i = 0; i < 8; i++) down().click();
    expect(texts()).toEqual(all.slice(8));
    const f = env.box.root.querySelector('input[aria-label="LG"]') as HTMLInputElement;
    f.value = 'Zeusstatue';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    expect(texts()).toHaveLength(2);
    // the buttons keep their room, greyed
    expect([...env.box.root.querySelectorAll('.win-nav button')].map((b) => b.getAttribute('aria-disabled'))).toEqual([
      'true',
      'true',
    ]);
    f.value = '';
    f.dispatchEvent(new Event('input', { bubbles: true }));
    expect(texts()).toHaveLength(4);
    expect(env.box.root.querySelector('.win-hidden')?.textContent?.trim()).toBe('noch 8 weitere unten');
  });
});

describe('Investitionen: Ignorieren in Meine Investitionen', () => {
  const lines = (box: { root: ParentNode }) => [...box.root.querySelectorAll('p.gb-me .gb-me-line')] as HTMLElement[];
  const text = (el: Element | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim();
  const buildingEye = (r: Element | undefined) => r?.querySelectorAll('td.inv-name')[1]?.querySelector('button.ignore');
  const ownerEye = (r: Element | undefined) =>
    r?.querySelectorAll('td.inv-name')[0]?.querySelector('.inv-owner button.ignore');
  const showToggle = (box: { root: ParentNode }) =>
    box.root.querySelector('.inv-ignored-filter button') as HTMLButtonElement;
  const owners = (rows: Element[], cells: (r: Element) => (string | undefined)[]) => rows.map((r) => cells(r)[1]);

  it('puts a closed eye beside the building name and, for a known player, beside the owner, next to the funnel', async () => {
    const { send, rows } = setup();
    send(SOCIAL([2005]));
    send(contributions.contributions as Entry);
    await tick();
    const first = rows()[0];
    expect(buildingEye(first)?.getAttribute('aria-label')).toBe('LG ignorieren');
    expect(buildingEye(first)?.getAttribute('data-tip')).toBe('LG ignorieren');
    expect(buildingEye(first)?.getAttribute('aria-pressed')).toBe('false');
    expect(buildingEye(first)?.classList.contains('on')).toBe(false);
    // the owner of the first row is 2005, a friend: the player store knows them
    expect(ownerEye(first)?.getAttribute('aria-label')).toBe('Spieler ignorieren');
    // the eye comes before the funnel, which stays the last thing of the cell
    expect(ownerEye(first)?.nextElementSibling?.classList.contains('inv-pick')).toBe(true);
    expect(first?.querySelector('td.inv-name .inv-owner > :last-child')?.classList.contains('inv-pick')).toBe(true);
    // an owner the store does not know cannot be ignored
    const unknown = rows().find((r) => !text(r)?.includes('Eigentümer 2005'));
    expect(ownerEye(unknown)).toBeNull();
    expect(unknown?.querySelector('td.inv-name .inv-owner > :last-child')?.classList.contains('inv-pick')).toBe(true);
  });

  it('hides an ignored building, keeps it out of every sum and names it apart', async () => {
    const { send, rows, box } = setup();
    send(contributions.contributions as Entry);
    await tick();
    expect(text(lines(box)[0])).toContain('Umlauf: 4.896 FP');
    expect(text(lines(box)[0])).not.toContain('ignoriert');
    (buildingEye(rows()[0]) as HTMLButtonElement).click();
    await tick();
    expect(rows()).toHaveLength(11);
    expect(text(lines(box)[0])).toContain('Umlauf: 4.654 FP');
    expect(text(lines(box)[0])).toContain('1 ignoriert, 242 FP');
    // the selection line only appears when the filters narrow the counted rows
    expect(lines(box)).toHaveLength(1);
  });

  it('shows ignored rows muted with "ignorierte zeigen", the eye stays in the accent and a click releases', async () => {
    const { send, rows, box, ui } = setup();
    send(contributions.contributions as Entry);
    await tick();
    expect(showToggle(box).getAttribute('aria-label')).toBe('ignorierte zeigen');
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('false');
    (buildingEye(rows()[0]) as HTMLButtonElement).click();
    await tick();
    showToggle(box).click();
    await tick();
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(ui.pref('investments.mineFilter') ?? '{}')).toMatchObject({ showIgnored: true });
    expect(rows()).toHaveLength(12);
    const ignored = rows().filter((r) => r.classList.contains('muted'));
    expect(ignored).toHaveLength(1);
    expect(ignored[0]?.getAttribute('data-tip')).toBe('LG ignoriert');
    const eye = buildingEye(ignored[0]) as HTMLButtonElement;
    expect(eye.classList.contains('on')).toBe(true);
    expect(eye.getAttribute('aria-pressed')).toBe('true');
    expect(eye.getAttribute('aria-label')).toBe('Nicht mehr ignorieren');
    // still not in the sums
    expect(text(lines(box)[0])).toContain('Umlauf: 4.654 FP');
    eye.click();
    await tick();
    expect(rows().some((r) => r.classList.contains('muted'))).toBe(false);
    expect(text(lines(box)[0])).toContain('Umlauf: 4.896 FP');
    expect(text(lines(box)[0])).not.toContain('ignoriert');
  });

  it('hides the ignored rows again when "ignorierte zeigen" is switched off', async () => {
    const { send, rows, box } = setup();
    send(contributions.contributions as Entry);
    await tick();
    (buildingEye(rows()[0]) as HTMLButtonElement).click();
    await tick();
    showToggle(box).click();
    await tick();
    expect(rows()).toHaveLength(12);
    showToggle(box).click();
    await tick();
    expect(showToggle(box).getAttribute('aria-pressed')).toBe('false');
    expect(rows()).toHaveLength(11);
  });

  it('ignores every building of a player and names the player as the reason', async () => {
    const { send, rows, box, cells, players } = setup();
    send(SOCIAL([2005]));
    send(contributions.contributions as Entry);
    await tick();
    const before = rows().length;
    const own = rows().filter((r) => cells(r)[1] === 'Eigentümer 2005');
    expect(own.length).toBeGreaterThan(0);
    (ownerEye(own[0]) as HTMLButtonElement).click();
    await tick();
    expect(players.get(playerId(2005))?.ignored).toBe(true);
    expect(rows()).toHaveLength(before - own.length);
    expect(owners(rows(), cells)).not.toContain('Eigentümer 2005');
    showToggle(box).click();
    await tick();
    const shown = rows().filter((r) => cells(r)[1] === 'Eigentümer 2005');
    expect(shown).toHaveLength(own.length);
    expect(shown[0]?.getAttribute('data-tip')).toBe('Spieler ignoriert');
    expect(shown[0]?.classList.contains('muted')).toBe(true);
    const eye = ownerEye(shown[0]) as HTMLButtonElement;
    expect(eye.getAttribute('aria-label')).toBe('Nicht mehr ignorieren');
    expect(eye.classList.contains('on')).toBe(true);
    eye.click();
    await tick();
    expect(players.get(playerId(2005))?.ignored).toBeUndefined();
  });

  it('names both reasons in the row tooltip', async () => {
    const { send, rows, box, cells, ui } = setup();
    send(SOCIAL([2005]));
    send(contributions.contributions as Entry);
    await tick();
    (buildingEye(rows()[0]) as HTMLButtonElement).click();
    await tick();
    showToggle(box).click();
    await tick();
    const first = rows().find((r) => cells(r)[1] === 'Eigentümer 2005' && r.classList.contains('muted')) as Element;
    (ownerEye(first) as HTMLButtonElement).click();
    await tick();
    expect(
      rows()
        .find((r) => r.classList.contains('muted'))
        ?.getAttribute('data-tip'),
    ).toBe('LG ignoriert, Spieler ignoriert');
    expect(ui.pref('investments.mineFilter')).toBeDefined();
  });

  it('reads the saved toggle, a missing or broken one is off', async () => {
    for (const saved of [{ showIgnored: true }, {}, { showIgnored: 'yes' }]) {
      vi.useFakeTimers({ toFake: ['Date'] });
      const env = featureContext({ now: () => Date.now() });
      env.ctx.ui.savePref('investments.mineFilter', JSON.stringify(saved));
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
