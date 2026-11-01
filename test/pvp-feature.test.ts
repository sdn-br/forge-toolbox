// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toggleDef } from '../src/content/core/settings';
import { OPEN_WITH_ARMY } from '../src/content/features/pvp';
import { pvpFeature } from '../src/content/features/pvp/index';
import { KEEP_SETTING } from '../src/content/features/pvp/retention';
import { type BattlePersistence, type BattleQuery, BattleStore } from '../src/content/stores/battles';
import { type IncomingPersistence, IncomingStore } from '../src/content/stores/incoming';
import type { PlayerObservation } from '../src/content/stores/players';
import { type PlunderPersistence, PlunderStore } from '../src/content/stores/plunders';
import { FALLBACK_ROWS } from '../src/content/ui/fit-rows';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { BattleWithPlunder, FoughtBattle, IncomingAttack, Plunder } from '../src/shared/model';
import { featureContext } from './helpers/feature-context';
import type { TestStoresOptions } from './helpers/stores';

const battle = (battleId: number, opponent: number): FoughtBattle => ({
  world: worldId('de20'),
  battleId,
  at: Date.now(),
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});

const plunder = (opponent: number): Plunder => ({
  world: worldId('de20'),
  at: Date.now(),
  opponent: playerId(opponent),
  outcome: 'plundered',
  entityId: 350,
  cityEntityId: buildingDefId('R_IronAge_Residential2'),
  resources: { strategy_points: 12 },
  doubleLoot: true,
});

const attack = (attacker: number): IncomingAttack => ({
  world: worldId('de20'),
  kind: 'battle',
  key: 1,
  at: Date.now(),
  attacker: playerId(attacker),
  defense: 'broken',
});

/** Persistence whose list calls stay open until the test resolves them. */
function controlled(total = 1) {
  const lists: { query: BattleQuery; resolve: (rows: BattleWithPlunder[]) => void }[] = [];
  const persistence: BattlePersistence = {
    put: async () => {},
    latest: async () => undefined,
    list: (_world, query) => new Promise((resolve) => lists.push({ query, resolve })),
    latestFought: async () => undefined,
    summary: vi.fn(async () => ({ battles: state.total, won: state.total, plunders: 0, repelled: 0, fp: 0 })),
    prune: vi.fn(async () => 0),
  };
  const plunders: PlunderPersistence = {
    put: async () => {},
    latest: async () => undefined,
    list: vi.fn(async () => [plunder(333)]),
    totals: async () => ({ count: 1, repelled: 0, fp: 12 }),
    prune: vi.fn(async () => 0),
  };
  const incoming: IncomingPersistence = {
    add: async () => {},
    latest: async () => undefined,
    list: vi.fn(async () => [attack(555)]),
    totals: async () => ({ battles: 1, held: 0, plunders: 0 }),
    prune: vi.fn(async () => 0),
  };
  const state = { total };
  return { persistence, plunders, incoming, lists, state };
}

/** stores on the given stub persistence, the others stay on the in-memory database */
const stubbed =
  (stub: {
    battles?: BattlePersistence;
    plunders?: PlunderPersistence;
    incoming?: IncomingPersistence;
  }): TestStoresOptions['overrides'] =>
  ({ bus, world }) => ({
    ...(stub.battles && { battles: new BattleStore(bus, world, stub.battles) }),
    ...(stub.plunders && { plunders: new PlunderStore(bus, world, stub.plunders) }),
    ...(stub.incoming && { incoming: new IncomingStore(bus, world, stub.incoming) }),
  });

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(total = 3, open = true) {
  const stub = controlled(total);
  const env = featureContext({
    overrides: stubbed({ battles: stub.persistence, plunders: stub.plunders, incoming: stub.incoming }),
  });
  pvpFeature.setup(env.ctx);
  if (open) env.menu('pvp');
  return { ...stub, ...env, box: env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>> };
}

afterEach(() => vi.useRealTimers());

const OTHER = toggleDef({ key: 'other.setting', group: 'pvp.title', label: 'pvp.title', default: false });

/** the visible rows the window draws without a measured area (ui/fit-rows.ts) */
const VISIBLE = FALLBACK_ROWS;
/** what a load asks for: a window above and below the one in view */
const SLICE = 3 * VISIBLE;

const seen = (id: number, name: string): PlayerObservation => ({
  id: playerId(id),
  name,
  avatar: '',
  cityName: '',
  era: eraId('ColonialAge'),
  score: 0,
  rank: 0,
  active: true,
  guild: null,
});

type TestBox = ReturnType<typeof setup>['box'];

/** the name cell of the row of this player */
const nameCell = (box: TestBox, name: string) => {
  const cell = [...box.root.querySelectorAll('td.name-cell')].find((td) => td.querySelector('a')?.textContent === name);
  if (!cell) throw new Error(`no row of "${name}"`);
  return cell;
};
const funnel = (box: TestBox, name: string) => nameCell(box, name).querySelector('button.inv-pick') as HTMLElement;
const field = (box: TestBox) => box.root.querySelector('input[type=search]') as HTMLInputElement;
const type = (box: TestBox, text: string) => {
  field(box).value = text;
  field(box).dispatchEvent(new Event('input'));
};

describe('pvp feature', () => {
  it('shows only the newest query when an older one resolves last', async () => {
    const { ctx, box, lists } = setup();
    await tick();
    ctx.bus.emit('battle.recorded', { opponents: [playerId(111)] });
    await tick();
    expect(lists).toHaveLength(2);
    const updatesBefore = box.updates.length;

    lists[1]?.resolve([battle(2, 222)]);
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();

    expect(box.text).toContain('222');
    expect(box.text).not.toContain('111');
    expect(box.updates.length - updatesBefore).toBe(1);
  });

  it('fills the box and leaves out the paging', () => {
    const { box } = setup();
    expect(box.options).toMatchObject({ fill: true, resizable: true });
    expect(box.text).not.toContain('Seite');
  });

  it('prunes by the retention setting when it changes and when a session starts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0));
    const { ctx, persistence } = setup();
    const prune = vi.mocked(persistence.prune);
    const day = 86_400_000;

    await ctx.settings.register(OTHER).set(true);
    expect(prune).not.toHaveBeenCalled();

    await ctx.settings.of(KEEP_SETTING).set('30');
    await tick();
    expect(prune).toHaveBeenLastCalledWith(Date.now() - 30 * day);

    prune.mockClear();
    vi.setSystemTime(new Date(2026, 9, 25, 12, 0));
    ctx.bus.emit('session.started', { session: {} as never });
    await tick();
    expect(prune).toHaveBeenCalledExactlyOnceWith(Date.now() - 30 * day);

    prune.mockClear();
    await ctx.settings.of(KEEP_SETTING).set('forever');
    ctx.bus.emit('session.started', { session: {} as never });
    await tick();
    expect(prune).not.toHaveBeenCalled();
  });

  it('reloads the list only when pruning deleted something', async () => {
    const { ctx, persistence, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(persistence.prune).mockResolvedValueOnce(3);
    await ctx.settings.of(KEEP_SETTING).set('30');
    await tick();
    expect(lists.length).toBe(loads + 1);
    await ctx.settings.of(KEEP_SETTING).set('90');
    await tick();
    expect(lists.length).toBe(loads + 1);
  });

  it('prunes plunders with the battle retention and reloads when that deleted something', async () => {
    const { ctx, plunders, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(plunders.prune).mockResolvedValueOnce(2);
    await ctx.settings.of(KEEP_SETTING).set('30');
    await tick();
    expect(plunders.prune).toHaveBeenCalledOnce();
    expect(lists.length).toBe(loads + 1);
  });

  it('has the tabs battles and attacks on the own city, no plunders tab', async () => {
    const { box } = setup();
    await tick();
    const tabs = [...box.root.querySelectorAll('.tabs button')].map((b) => b.textContent?.trim());
    expect(tabs).toEqual(['Kämpfe', 'Angriffe auf mich']);
  });

  it('switches to the attacks on the own city with their totals', async () => {
    const { box, incoming, lists } = setup();
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();
    expect(box.text).not.toContain('Kampf: durchbrochen');

    box.click('Angriffe auf mich');
    await tick();
    expect(incoming.list).toHaveBeenCalledWith(worldId('de20'), { limit: SLICE, offset: 0 });
    expect(box.text).toContain('1 Angriff, 0 Plünderungen');
    expect(box.text).toContain('555');
    expect(box.text).toContain('Kampf: durchbrochen');
    expect(box.text).not.toContain('111');
    expect(box.text).not.toContain('FP');
    // the sack filter belongs to the battles
    expect(box.root.querySelector('[aria-label="nur Kämpfe mit Plünderung"]')).toBeNull();
    expect(box.root.querySelector('[aria-label="nur gut zu plündern"]')).not.toBeNull();
  });

  it('filters attacks on the own city with the funnel and follows new ones', async () => {
    const stub = controlled();
    const env = featureContext({ overrides: stubbed({ battles: stub.persistence, plunders: stub.plunders }) });
    pvpFeature.setup(env.ctx);
    env.menu('pvp');
    const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
    box.click('Angriffe auf mich');
    await vi.waitFor(() => expect(box.text).toContain('Noch keine Angriffe auf dich gespeichert.'));
    env.ctx.incoming.record(attack(555));
    env.ctx.incoming.record({
      ...attack(666),
      kind: 'plunder',
      key: 2,
      defense: undefined,
      cityEntityId: buildingDefId('R_X'),
    });
    await vi.waitFor(() => expect(box.text).toContain('1 Angriff, 1 Plünderung'));
    expect(box.text).toContain('Plünderung: R_X');

    funnel(box, '666').click();
    expect(field(box).value).toBe('666');
    await vi.waitFor(() => expect(box.text).toContain('0 Angriffe, 1 Plünderung'));
    expect(box.text).not.toContain('Kampf: durchbrochen');
    expect(funnel(box, '666').getAttribute('aria-pressed')).toBe('true');

    env.ctx.incoming.record({ ...attack(666), key: 3, defense: 'held' });
    await vi.waitFor(() => expect(box.text).toContain('1 Angriff, 1 abgewehrt, 1 Plünderung'));

    funnel(box, '666').click();
    expect(field(box).value).toBe('');
    await vi.waitFor(() => expect(box.text).toContain('Kampf: durchbrochen'));
  });

  it('prunes attacks on the own city with the battle retention and reloads when that deleted something', async () => {
    const { ctx, incoming, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(incoming.prune).mockResolvedValueOnce(1);
    await ctx.settings.of(KEEP_SETTING).set('30');
    await tick();
    expect(incoming.prune).toHaveBeenCalledOnce();
    expect(lists.length).toBe(loads + 1);
  });

  it('marks each row with the note of the opponent and opens the note card from the marker', async () => {
    const { ctx, box, lists } = setup();
    ctx.notes.setPlayerText(playerId(111), '**stark**');
    await tick();
    for (const list of lists) list.resolve([battle(1, 111), battle(2, 222)]);
    await tick();
    const markers = () => [...box.root.querySelectorAll('button.marker')];
    expect(markers().map((m) => [m.className, m.getAttribute('data-tip')])).toEqual([
      ['marker', 'stark'],
      ['marker dim', 'Notiz hinzufügen'],
    ]);
    expect(box.text).not.toContain('Notiz zu diesem Spieler');

    (markers()[1] as HTMLElement).click();
    expect(field(box).value).toBe('222');
    const textarea = box.root.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    textarea.value = 'neu';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('blur'));
    expect(ctx.notes.playerPage(playerId(222))?.text).toBe('neu');
    await tick();
    expect(lists.at(-1)?.query.opponents).toEqual([playerId(222)]);
    lists.at(-1)?.resolve([battle(2, 222)]);
    await tick();
    expect(markers().map((m) => m.getAttribute('data-tip'))).toEqual(['neu']);
  });

  it('shows the note card while the field names one known player exactly', async () => {
    const env = featureContext();
    pvpFeature.setup(env.ctx);
    env.ctx.players.apply(worldId('de20'), [seen(111, 'Alpha'), seen(222, 'Alphabet')], 'visit');
    env.menu('pvp');
    const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
    type(box, 'alp');
    expect(box.root.querySelector('section.card')).toBeNull();
    type(box, 'alpha');
    expect(box.root.querySelector('section.card')).not.toBeNull();
  });

  it('marks the attackers on the own city with their note', async () => {
    const { ctx, box } = setup();
    ctx.notes.setPlayerText(playerId(555), 'Angreifer');
    box.click('Angriffe auf mich');
    await vi.waitFor(() => expect(box.text).toContain('Kampf: durchbrochen'));
    expect(box.root.querySelector('button.marker')?.getAttribute('data-tip')).toBe('Angreifer');
  });

  describe('with the army window', () => {
    it('opens the box on the battles tab for a pvp battle', async () => {
      const { ctx, box, lists } = setup(1, false);
      expect(box.box.isOpen).toBe(false);
      ctx.bus.emit('army.opened', { battleType: 'pvp' });
      expect(box.box.isOpen).toBe(true);
      await tick();
      lists[0]?.resolve([battle(1, 111)]);
      await tick();
      expect(box.text).toContain('111');
    });

    it('only switches an open box to the battles tab', async () => {
      const { ctx, box, lists, incoming } = setup();
      await tick();
      lists[0]?.resolve([battle(1, 111)]);
      await tick();
      box.click('Angriffe auf mich');
      await tick();
      expect(box.text).toContain('555');
      ctx.bus.emit('army.opened', { battleType: 'pvp' });
      await tick();
      lists.at(-1)?.resolve([battle(1, 111)]);
      await tick();
      expect(box.box.isOpen).toBe(true);
      expect(box.text).toContain('111');
      expect(box.text).not.toContain('555');
      expect(incoming.list).toHaveBeenCalledOnce();
    });

    it.each(['gvg', 'guild_expedition', 'campaign', 'pvp_arena'])('stays closed for a %s battle', (battleType) => {
      const { ctx, box } = setup(1, false);
      ctx.bus.emit('army.opened', { battleType });
      expect(box.box.isOpen).toBe(false);
    });

    it('writes the opponent the page module read from the army window into the name field', async () => {
      const { ctx, box, lists } = setup(1, false);
      ctx.bus.emit('army.opened', { battleType: 'pvp' });
      ctx.bus.emit('army.target', { opponent: playerId(222) });
      await tick();
      expect(lists.at(-1)?.query.opponents).toEqual([playerId(222)]);
      expect(field(box).value).toBe('222');
      expect(box.box.isOpen).toBe(true);
    });

    it('stays on all battles without the opponent', async () => {
      const { ctx, lists } = setup(1, false);
      ctx.bus.emit('army.opened', { battleType: 'pvp' });
      await tick();
      expect(lists.at(-1)?.query.opponents).toBeUndefined();
    });

    it('neither opens nor picks for an opponent while the box is closed', async () => {
      const { ctx, box, lists } = setup(1, false);
      ctx.bus.emit('army.target', { opponent: playerId(222) });
      await tick();
      expect(box.box.isOpen).toBe(false);
      expect(lists).toHaveLength(0);
    });

    it('stays closed when the setting is off', async () => {
      const { ctx, box } = setup(1, false);
      await ctx.settings.of(OPEN_WITH_ARMY).set(false);
      ctx.bus.emit('army.opened', { battleType: 'pvp' });
      expect(box.box.isOpen).toBe(false);
    });

    it('is a setting that is on by default', () => {
      const { ctx } = setup(1, false);
      expect(ctx.settings.defs.find((d) => d.key === 'pvp.openWithArmy')).toMatchObject({
        label: 'pvp.openWithArmy',
        default: true,
      });
      expect(ctx.settings.of(OPEN_WITH_ARMY).get()).toBe(true);
    });
  });

  describe('filters', () => {
    it('lists only battles against players whose name contains the text', async () => {
      const env = featureContext();
      pvpFeature.setup(env.ctx);
      env.ctx.players.apply(worldId('de20'), [seen(111, 'Alpha'), seen(222, 'Beta')], 'visit');
      env.ctx.battles.record(battle(1, 111));
      env.ctx.battles.record(battle(2, 222));
      env.menu('pvp');
      const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
      await vi.waitFor(() => expect(box.text).toContain('Beta'));
      type(box, 'ALP');
      await vi.waitFor(() => expect(box.text).not.toContain('Beta'));
      expect(box.text).toContain('Alpha');
    });

    it('writes the exact name with the funnel, which filters to that player alone; the name links to foestats', async () => {
      const { ctx, box, lists } = setup();
      ctx.players.apply(worldId('de20'), [seen(111, 'Ann'), seen(222, 'Anna')], 'visit');
      await tick();
      lists[0]?.resolve([battle(1, 111), battle(2, 222)]);
      await tick();
      const link = nameCell(box, 'Ann').querySelector('a') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('https://foestats.com/de/de20/players/111');
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');

      funnel(box, 'Ann').click();
      expect(field(box).value).toBe('Ann');
      await tick();
      expect(lists.at(-1)?.query).toMatchObject({ opponents: [playerId(111)], offset: 0 });
    });

    it('asks the store for the players with the star or warning mark, combined with the name', async () => {
      const { ctx, box, lists } = setup();
      ctx.players.apply(worldId('de20'), [seen(111, 'Alpha'), seen(222, 'Alpine'), seen(333, 'Beta')], 'visit');
      ctx.players.setPlunderWorthy(playerId(111), true);
      ctx.players.setPlunderWorthy(playerId(333), true);
      ctx.players.setNoAttack(playerId(222), true);
      await tick();
      box.click('nur gut zu plündern');
      await tick();
      expect(lists.at(-1)?.query.opponents).toEqual([playerId(111), playerId(333)]);
      type(box, 'alp');
      await tick();
      expect(lists.at(-1)?.query.opponents).toEqual([playerId(111)]);
      box.click('nur gut zu plündern');
      box.click('nur nicht angreifen');
      await tick();
      expect(lists.at(-1)?.query.opponents).toEqual([playerId(222)]);
    });

    it('asks for battles with a plunder only, summary and list alike', async () => {
      const { box, lists, persistence } = setup();
      await tick();
      box.click('nur Kämpfe mit Plünderung');
      await tick();
      expect(lists.at(-1)?.query).toMatchObject({ withPlunder: true, offset: 0, limit: SLICE });
      expect(persistence.summary).toHaveBeenLastCalledWith(worldId('de20'), { withPlunder: true });
      box.click('nur Kämpfe mit Plünderung');
      await tick();
      expect(lists.at(-1)?.query.withPlunder).toBeUndefined();
    });

    it('sums up what the filter matches', async () => {
      const env = featureContext();
      pvpFeature.setup(env.ctx);
      const at = Date.now() - 60_000;
      env.ctx.battles.record({ ...battle(1, 111), at });
      env.ctx.battles.record({ ...battle(2, 111), at: at - 2 * 86_400_000 });
      env.ctx.plunders.record({ ...plunder(111), at: at + 1000 });
      env.menu('pvp');
      const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
      await vi.waitFor(() => expect(box.text).toContain('2 Kämpfe, 2 gewonnen · 1 Plünderung, 12 FP'));
      box.click('nur Kämpfe mit Plünderung');
      await vi.waitFor(() => expect(box.text).toContain('1 Kampf, 1 gewonnen · 1 Plünderung, 12 FP'));
    });

    it('keeps the field while the list turns empty, so it keeps its focus', async () => {
      const { box, lists, state } = setup();
      await tick();
      lists[0]?.resolve([battle(1, 111)]);
      await tick();
      const input = field(box);
      state.total = 0;
      type(box, 'xyz');
      await tick();
      lists.at(-1)?.resolve([]);
      await tick();
      expect(box.text).toContain('Keine Kämpfe zu diesem Filter.');
      expect(field(box)).toBe(input);
      state.total = 1;
      type(box, '');
      await tick();
      lists.at(-1)?.resolve([battle(1, 111)]);
      await tick();
      expect(box.text).toContain('111');
      expect(field(box)).toBe(input);
    });

    it('keeps typed keys from the game', async () => {
      const { box } = setup();
      await tick();
      const input = field(box);
      const game = vi.fn();
      box.root.addEventListener('keydown', game);
      box.root.addEventListener('keyup', game);
      box.root.addEventListener('keypress', game);
      for (const type of ['keydown', 'keypress', 'keyup']) {
        input.dispatchEvent(new KeyboardEvent(type, { key: 'a', bubbles: true }));
      }
      expect(game).not.toHaveBeenCalled();
    });
  });

  describe('PvP marks in the rows', () => {
    it('toggles the marks of a known player and shows the warning mark of a player not to attack', async () => {
      const { ctx, box, lists } = setup();
      ctx.players.apply(worldId('de20'), [seen(111, 'Alpha')], 'visit');
      ctx.players.setNoAttack(playerId(111), true);
      await tick();
      lists[0]?.resolve([battle(1, 111), battle(2, 222)]);
      await tick();
      const known = nameCell(box, 'Alpha');
      expect(known.querySelector('button.no-attack')?.getAttribute('aria-pressed')).toBe('true');
      expect(known.querySelector('button.plunder')?.getAttribute('aria-pressed')).toBe('false');
      // a player the store does not know cannot be marked
      expect(nameCell(box, '222').querySelector('button.plunder, button.no-attack')).toBeNull();

      (known.querySelector('button.plunder') as HTMLElement).click();
      expect(ctx.players.plunderWorthy(playerId(111))).toBe(true);
      expect(ctx.players.noAttack(playerId(111))).toBe(false);
      await tick();
      expect(nameCell(box, 'Alpha').querySelector('button.plunder')?.getAttribute('aria-pressed')).toBe('true');
      // no new read without a filter on the marks
      expect(lists).toHaveLength(1);
    });
  });

  describe('row window', () => {
    it('loads the slice around the window as it scrolls, and from the top again on a change of filter', async () => {
      const { box, lists } = setup(100);
      await tick();
      expect(lists[0]?.query).toMatchObject({ offset: 0, limit: SLICE });
      lists[0]?.resolve(Array.from({ length: SLICE }, (_, i) => battle(i + 1, 1000 + i)));
      await tick();
      expect(box.text).toContain('noch 80 weitere unten');
      expect(box.root.querySelectorAll('tr.battle-row')).toHaveLength(VISIBLE);

      // inside the loaded slice the window reads nothing
      for (let i = 0; i < 40; i++) box.click('Nach unten');
      await tick();
      expect(lists).toHaveLength(1);
      expect(box.text).toContain('1040');
      expect(box.text).not.toContain('1039');

      box.click('Nach unten');
      await tick();
      expect(lists).toHaveLength(2);
      expect(lists[1]?.query).toMatchObject({ offset: 41 - VISIBLE, limit: SLICE });

      type(box, 'x');
      await tick();
      expect(lists.at(-1)?.query).toMatchObject({ offset: 0 });
    });

    it('reads the attacks on the own city in slices too', async () => {
      const { box, incoming } = setup();
      await tick();
      vi.mocked(incoming.list).mockClear();
      box.click('Angriffe auf mich');
      await tick();
      expect(incoming.list).toHaveBeenCalledWith(worldId('de20'), { limit: SLICE, offset: 0 });
    });
  });

  describe('battle details', () => {
    const fought = (battleId: number, opponent: number): FoughtBattle => ({
      ...battle(battleId, opponent),
      attacker: { bonuses: { attack_boost: 50 }, units: [{ unitTypeId: 'rogue', startHp: 10, endHp: 8 }] },
      defender: { bonuses: { defense_boost: 70 }, units: [{ unitTypeId: 'feudal_knight', startHp: 10, endHp: 0 }] },
    });

    async function shown(rows: BattleWithPlunder[] = [fought(1, 111), fought(2, 222)]) {
      const env = setup();
      await tick();
      env.lists[0]?.resolve(rows);
      await tick();
      const row = (n: number) => env.box.root.querySelectorAll('tr.battle-row')[n] as HTMLElement;
      return { ...env, row };
    }

    /** the tab of the side panel, by its tooltip */
    const tab = (box: TestBox, tip: string) =>
      box.root.querySelector(`button.side-tab[data-tip="${tip}"]`) as HTMLElement;
    const panel = (box: TestBox) => box.root.querySelector('.side-panel')?.textContent ?? '';
    /** the headings and lines of the panel, one entry each */
    const lines = (box: TestBox) =>
      [...box.root.querySelectorAll('.side-panel h2, .side-panel p')].map((e) => e.textContent?.trim());

    it('shows a clicked battle in the side panel with both armies and the result, and clears it on a second click', async () => {
      const { box, row, lists } = await shown();
      expect(box.root.querySelector('.side-panel')).toBeNull();

      row(1).click();
      expect(row(1).classList.contains('selected')).toBe(true);
      expect(row(0).classList.contains('selected')).toBe(false);
      expect(panel(box)).toContain('222');
      expect(panel(box)).toContain('Deine Einheiten');
      expect(panel(box)).toContain('rogue');
      expect(panel(box)).toContain('8/10 LP');
      expect(panel(box)).toContain('feudal_knight');
      expect(panel(box)).toContain('gefallen');
      expect(panel(box)).toContain('gewonnen, Autokampf, 1 Runde');
      expect(panel(box)).toContain('50 % / 0 %');
      expect(panel(box)).toContain('0 % / 70 %');
      // the battle comes from the loaded slice, no new query; all rows keep one height
      expect(lists).toHaveLength(1);
      expect(box.root.querySelectorAll('tbody tr')).toHaveLength(2);

      row(0).click();
      expect(panel(box)).toContain('111');
      expect(box.root.querySelectorAll('tr.battle-row.selected')).toHaveLength(1);
      row(0).click();
      expect(box.root.querySelectorAll('tr.battle-row.selected')).toHaveLength(0);
      expect(box.root.querySelector('.side-drawer')).toBeNull();
    });

    it('shows the tab only while a battle is selected, the tab folds the panel and keeps the selection', async () => {
      const { box, row } = await shown();
      expect(box.root.querySelector('.side-drawer')).toBeNull();
      row(0).click();
      expect(panel(box)).toContain('111');
      tab(box, 'Kampfdetails ausblenden').click();
      expect(box.root.querySelector('.side-panel')).toBeNull();
      expect(box.root.querySelector('.side-tab')).not.toBeNull();
      expect(row(0).classList.contains('selected')).toBe(true);
      tab(box, 'Kampfdetails zeigen').click();
      expect(panel(box)).toContain('111');
      // folded in, a new selection opens it again
      tab(box, 'Kampfdetails ausblenden').click();
      row(1).click();
      expect(panel(box)).toContain('222');
      row(1).click();
      expect(box.root.querySelector('.side-drawer')).toBeNull();
    });

    it('has no panel on the attacks on the own city', async () => {
      const { box, row } = await shown();
      row(0).click();
      box.click('Angriffe auf mich');
      await tick();
      expect(box.root.querySelector('.side-drawer')).toBeNull();
    });

    it('does not select a row when its buttons are clicked', async () => {
      const { box } = await shown();
      (box.root.querySelector('button.marker') as HTMLElement).click();
      funnel(box, '222').click();
      expect(box.root.querySelector('tr.battle-row.selected')).toBeNull();
    });

    it('marks a battle with its plunder by the sack and shows the plunder in the panel', async () => {
      const { box, row } = await shown([
        { ...fought(1, 111), plunder: plunder(111) },
        { ...fought(2, 222), plunder: { ...plunder(222), outcome: 'repelled', resources: {}, doubleLoot: false } },
        fought(3, 333),
      ]);
      const sacks = [...box.root.querySelectorAll('td.pvp-loot')].map((td) => td.querySelector('[role=img]'));
      expect(sacks.map((s) => s?.getAttribute('aria-label'))).toEqual([
        'Geplündert',
        'Plünderung abgewehrt',
        undefined,
      ]);

      row(0).click();
      expect(lines(box).slice(-3)).toEqual(['Plünderung', 'R_IronAge_Residential2', '12 Forge-Punkte Double Loot']);
      row(1).click();
      expect(lines(box).slice(-3)).toEqual(['Plünderung', 'R_IronAge_Residential2', 'abgewehrt']);
    });

    it('shows an inferred battle in the panel with its plunder and a line that the battle was not recorded', async () => {
      const at = Date.now();
      const { box, row } = await shown([
        {
          world: worldId('de20'),
          battleId: -at,
          at,
          opponent: playerId(111),
          result: 'won',
          inferred: true,
          plunderAt: at,
          plunder: { ...plunder(111), at },
        },
      ]);
      expect(row(0).textContent).toContain('spätestens');
      expect(row(0).textContent).toContain('erschlossen');
      expect(row(0).textContent).not.toContain('%');
      row(0).click();
      expect(box.root.querySelector('.side-panel .battle')).toBeNull();
      expect(panel(box)).toContain('der Kampf selbst ist nicht aufgezeichnet');
      expect(lines(box).slice(-3)).toEqual(['Plünderung', 'R_IronAge_Residential2', '12 Forge-Punkte Double Loot']);
    });

    it('clears the selection on a change of filter, and the window fills again when the filter goes', async () => {
      const { box, row, lists, state } = await shown([fought(1, 111), fought(2, 222)]);
      row(0).click();
      type(box, '111');
      await tick();
      expect(box.root.querySelector('tr.battle-row.selected')).toBeNull();
      expect(box.root.querySelector('.side-drawer')).toBeNull();
      lists.at(-1)?.resolve([fought(1, 111)]);
      await tick();
      row(0).click();
      expect(panel(box)).toContain('111');

      state.total = 100;
      type(box, '');
      await tick();
      lists.at(-1)?.resolve(Array.from({ length: SLICE }, (_, i) => fought(i + 1, 1000 + i)));
      await tick();
      expect(box.root.querySelectorAll('tr.battle-row')).toHaveLength(VISIBLE);
      expect(box.text).toContain('noch 80 weitere unten');
      expect(box.root.querySelector('tr.battle-row.selected')).toBeNull();
    });

    it('keeps the selection on scroll and live updates while the battle is still listed', async () => {
      const { box, row, lists, ctx, state } = await shown([fought(1, 111), fought(2, 222)]);
      row(1).click();
      box.click('Nach unten');
      ctx.bus.emit('plunder.recorded', { opponents: [playerId(222)] });
      await tick();
      lists.at(-1)?.resolve([fought(1, 111), { ...fought(2, 222), plunder: plunder(222) }]);
      await tick();
      expect(row(1).classList.contains('selected')).toBe(true);
      expect(lines(box)).toContain('Plünderung');

      // read again without it, the slice spans the whole list: it was replaced or deleted
      state.total = 1;
      ctx.bus.emit('battle.recorded', { opponents: [playerId(222)] });
      await tick();
      lists.at(-1)?.resolve([fought(1, 111)]);
      await tick();
      expect(box.root.querySelector('.side-drawer')).toBeNull();
    });

    it('shows the plunder of a battle when it is recorded after the battle', async () => {
      const env = featureContext();
      pvpFeature.setup(env.ctx);
      env.menu('pvp');
      const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
      const at = Date.now() - 60_000;
      env.ctx.battles.record({ ...battle(1, 111), at });
      await vi.waitFor(() => expect(box.root.querySelectorAll('tr.battle-row')).toHaveLength(1));
      expect(box.root.querySelector('td.pvp-loot [role=img]')).toBeNull();
      env.ctx.plunders.record({ ...plunder(111), at: at + 1000 });
      await vi.waitFor(() =>
        expect(box.root.querySelector('td.pvp-loot [role=img]')?.getAttribute('aria-label')).toBe('Geplündert'),
      );
      expect(box.root.querySelectorAll('tr.battle-row')).toHaveLength(1);
    });
  });
});

describe('pvp feature loading', () => {
  it('loads once for several events of one task', async () => {
    const { ctx, lists } = setup();
    await tick();
    const loads = lists.length;
    ctx.bus.emit('battle.recorded', { opponents: [playerId(1)] });
    ctx.bus.emit('plunder.recorded', { opponents: [playerId(1)] });
    ctx.bus.emit('incoming.recorded', { opponents: [playerId(1)] });
    await tick();
    expect(lists.length).toBe(loads + 1);
  });

  it('reads no attack totals on the battles tab and no battle summary on the attacks tab', async () => {
    const stub = controlled();
    const incomingTotals = vi.spyOn(stub.incoming, 'totals');
    const env = featureContext({
      overrides: stubbed({ battles: stub.persistence, plunders: stub.plunders, incoming: stub.incoming }),
    });
    pvpFeature.setup(env.ctx);
    env.menu('pvp');
    const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
    await tick();
    expect(stub.persistence.summary).toHaveBeenCalledTimes(1);
    expect(incomingTotals).not.toHaveBeenCalled();
    box.click('Angriffe auf mich');
    await tick();
    expect(stub.persistence.summary).toHaveBeenCalledTimes(1);
    expect(incomingTotals).toHaveBeenCalledTimes(1);
  });

  it('ignores records of players the filter does not show', async () => {
    const { ctx, lists } = setup();
    await tick();
    ctx.bus.emit('army.target', { opponent: playerId(111) });
    await tick();
    const loads = lists.length;
    ctx.bus.emit('battle.recorded', { opponents: [playerId(222)] });
    await tick();
    expect(lists.length).toBe(loads);
    ctx.bus.emit('battle.recorded', { opponents: [playerId(222), playerId(111)] });
    await tick();
    expect(lists.length).toBe(loads + 1);
  });

  it('rebuilds without reading on player and note changes while no filter goes by the players', async () => {
    const { ctx, box, lists } = setup();
    await tick();
    const loads = lists.length;
    const updates = box.updates.length;
    ctx.bus.emit('player.updated', { ids: [playerId(111)], source: 'update' });
    ctx.bus.emit('note.changed', {});
    await tick();
    expect(lists.length).toBe(loads);
    expect(box.updates.length).toBe(updates + 2);
  });

  it('reads again on a player change while the name field or a mark filter goes by the players', async () => {
    const { ctx, box, lists } = setup();
    await tick();
    box.click('nur nicht angreifen');
    await tick();
    const loads = lists.length;
    ctx.bus.emit('player.updated', { ids: [playerId(111)], source: 'noAttack' });
    await tick();
    expect(lists.length).toBe(loads + 1);
  });
});
