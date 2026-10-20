// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pvpFeature } from '../src/content/features/pvp/index';
import { KEEP_SETTING } from '../src/content/features/pvp/retention';
import { PAGE_SIZE } from '../src/content/features/pvp/view-model';
import type { BattlePersistence, BattleQuery } from '../src/content/stores/battles';
import type { IncomingPersistence } from '../src/content/stores/incoming';
import type { PlunderPersistence } from '../src/content/stores/plunders';
import { buildingDefId, eraId, playerId, worldId } from '../src/shared/ids';
import type { Battle, IncomingAttack, Plunder } from '../src/shared/model';
import { featureContext } from './helpers/feature-context';

const battle = (battleId: number, opponent: number): Battle => ({
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
  const lists: { query: BattleQuery; resolve: (rows: Battle[]) => void }[] = [];
  const persistence: BattlePersistence = {
    put: async () => {},
    latest: async () => undefined,
    list: (_world, query) => new Promise((resolve) => lists.push({ query, resolve })),
    count: async () => state.total,
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(total = 1, open = true) {
  const stub = controlled(total);
  const env = featureContext(stub.persistence, stub.plunders, stub.incoming);
  pvpFeature.setup(env.ctx);
  if (open) env.menu('pvp');
  return { ...stub, ...env, box: env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>> };
}

afterEach(() => vi.useRealTimers());

describe('pvp feature', () => {
  it('shows only the newest query when an older one resolves last', async () => {
    const { ctx, box, lists } = setup();
    ctx.bus.emit('player.updated', { ids: [], source: 'update' });
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

  it('clamps the page when the total shrinks below it', async () => {
    const { ctx, box, lists, state } = setup(PAGE_SIZE * 3 - 5);
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();
    box.click('Weiter');
    await tick();
    lists[1]?.resolve([battle(2, 111)]);
    await tick();
    box.click('Weiter');
    await tick();
    expect(lists[2]?.query.offset).toBe(PAGE_SIZE * 2);
    lists[2]?.resolve([battle(3, 111)]);
    await tick();
    expect(box.text).toContain('Seite 3 von 3');

    state.total = 5;
    ctx.bus.emit('player.updated', { ids: [], source: 'update' });
    await tick();
    expect(lists[3]?.query.offset).toBe(0);
    lists[3]?.resolve([battle(4, 111)]);
    await tick();
    expect(box.text).toContain('111');
    expect(box.text).not.toContain('Seite');
  });

  it('prunes by the retention setting when it changes and when a session starts', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0));
    const { ctx, persistence } = setup();
    const prune = vi.mocked(persistence.prune);
    const day = 86_400_000;

    await ctx.settings.set('other.setting', true);
    expect(prune).not.toHaveBeenCalled();

    await ctx.settings.set(KEEP_SETTING.key, '30');
    await tick();
    expect(prune).toHaveBeenLastCalledWith(Date.now() - 30 * day);

    prune.mockClear();
    vi.setSystemTime(new Date(2026, 9, 25, 12, 0));
    ctx.bus.emit('session.started', { session: {} as never });
    await tick();
    expect(prune).toHaveBeenCalledExactlyOnceWith(Date.now() - 30 * day);

    prune.mockClear();
    await ctx.settings.set(KEEP_SETTING.key, 'forever');
    ctx.bus.emit('session.started', { session: {} as never });
    await tick();
    expect(prune).not.toHaveBeenCalled();
  });

  it('reloads the list only when pruning deleted something', async () => {
    const { ctx, persistence, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(persistence.prune).mockResolvedValueOnce(3);
    await ctx.settings.set(KEEP_SETTING.key, '30');
    await tick();
    expect(lists.length).toBe(loads + 1);
    await ctx.settings.set(KEEP_SETTING.key, '90');
    await tick();
    expect(lists.length).toBe(loads + 1);
  });

  it('switches to the plunder list and shows the plunder totals of the filter', async () => {
    const { box, lists, plunders } = setup();
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();
    expect(box.text).toContain('1 Plünderung, 12 FP');
    expect(box.text).toContain('111');
    expect(plunders.list).not.toHaveBeenCalled();

    box.click('Plünderungen');
    await tick();
    expect(plunders.list).toHaveBeenCalledWith(worldId('de20'), { limit: PAGE_SIZE, offset: 0 });
    expect(box.text).toContain('333');
    expect(box.text).toContain('12 Forge-Punkte Double Loot');
    expect(box.text).not.toContain('111');
    expect(lists).toHaveLength(1);
  });

  it('lists repelled plunders and pages over plunders and repelled ones together', async () => {
    const stub = controlled();
    const env = featureContext(stub.persistence);
    pvpFeature.setup(env.ctx);
    env.menu('pvp');
    const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
    const at = Date.now();
    env.ctx.plunders.record({ ...plunder(333), at: at - PAGE_SIZE - 1 });
    for (let i = 0; i < PAGE_SIZE; i++) {
      env.ctx.plunders.record({ ...plunder(444), at: at - i, outcome: 'repelled', resources: {}, doubleLoot: false });
    }
    box.click('Plünderungen');
    await vi.waitFor(() => expect(box.text).toContain('1 Plünderung, 20 abgewehrt, 12 FP'));
    expect(box.text).toContain('Seite 1 von 2');
    expect(box.text).toContain('abgewehrt');
    expect(box.text).not.toContain('333');
  });

  it('prunes plunders with the battle retention and reloads when that deleted something', async () => {
    const { ctx, plunders, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(plunders.prune).mockResolvedValueOnce(2);
    await ctx.settings.set(KEEP_SETTING.key, '30');
    await tick();
    expect(plunders.prune).toHaveBeenCalledOnce();
    expect(lists.length).toBe(loads + 1);
  });

  it('switches to the attacks on the own city with their totals and pages over them', async () => {
    const { box, incoming, lists } = setup();
    await tick();
    lists[0]?.resolve([battle(1, 111)]);
    await tick();
    expect(box.text).not.toContain('Kampf: durchbrochen');

    box.click('Angriffe auf mich');
    await tick();
    expect(incoming.list).toHaveBeenCalledWith(worldId('de20'), { limit: PAGE_SIZE, offset: 0 });
    expect(box.text).toContain('1 Angriff, 0 Plünderungen');
    expect(box.text).toContain('555');
    expect(box.text).toContain('Kampf: durchbrochen');
    expect(box.text).not.toContain('111');
    expect(box.text).not.toContain('FP');
  });

  it('filters attacks on the own city by the picked player and follows new ones', async () => {
    const stub = controlled();
    const env = featureContext(stub.persistence, stub.plunders);
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

    box.follow('666');
    await vi.waitFor(() => expect(box.text).toContain('Nur 666'));
    expect(box.text).toContain('0 Angriffe, 1 Plünderung');
    expect(box.text).not.toContain('Kampf: durchbrochen');
  });

  it('prunes attacks on the own city with the battle retention and reloads when that deleted something', async () => {
    const { ctx, incoming, lists } = setup();
    await tick();
    const loads = lists.length;
    vi.mocked(incoming.prune).mockResolvedValueOnce(1);
    await ctx.settings.set(KEEP_SETTING.key, '30');
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
    expect(markers().map((m) => [m.className, m.getAttribute('title')])).toEqual([
      ['marker', 'stark'],
      ['marker dim', 'Notiz hinzufügen'],
    ]);
    expect(box.text).not.toContain('Notiz zu diesem Spieler');

    (markers()[1] as HTMLElement).click();
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
    expect(box.text).toContain('Nur 222');
    expect(markers().map((m) => m.getAttribute('title'))).toEqual(['neu']);
  });

  it('marks the attackers on the own city with their note', async () => {
    const { ctx, box } = setup();
    ctx.notes.setPlayerText(playerId(555), 'Angreifer');
    box.click('Angriffe auf mich');
    await vi.waitFor(() => expect(box.text).toContain('Kampf: durchbrochen'));
    expect(box.root.querySelector('button.marker')?.getAttribute('title')).toBe('Angreifer');
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
      const { ctx, box, lists, plunders } = setup();
      await tick();
      lists[0]?.resolve([battle(1, 111)]);
      await tick();
      box.click('Plünderungen');
      await tick();
      expect(box.text).toContain('333');
      ctx.bus.emit('army.opened', { battleType: 'pvp' });
      await tick();
      lists.at(-1)?.resolve([battle(1, 111)]);
      await tick();
      expect(box.box.isOpen).toBe(true);
      expect(box.text).toContain('111');
      expect(box.text).not.toContain('333');
      expect(plunders.list).toHaveBeenCalledOnce();
    });

    it.each(['gvg', 'guild_expedition', 'campaign', 'pvp_arena'])('stays closed for a %s battle', (battleType) => {
      const { ctx, box } = setup(1, false);
      ctx.bus.emit('army.opened', { battleType });
      expect(box.box.isOpen).toBe(false);
    });

    it('stays closed when the setting is off', async () => {
      const { ctx, box } = setup(1, false);
      await ctx.settings.set('pvp.openWithArmy', false);
      ctx.bus.emit('army.opened', { battleType: 'pvp' });
      expect(box.box.isOpen).toBe(false);
    });

    it('is a setting that is on by default', () => {
      const { ctx } = setup(1, false);
      expect(ctx.settings.defs.find((d) => d.key === 'pvp.openWithArmy')).toMatchObject({
        label: 'pvp.openWithArmy',
        default: true,
      });
      expect(ctx.settings.get('pvp.openWithArmy')).toBe(true);
    });
  });

  describe('name search', () => {
    const seen = (id: number, name: string) => ({
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

    it('lists only battles against players whose name contains the text', async () => {
      const env = featureContext();
      pvpFeature.setup(env.ctx);
      env.ctx.players.apply(worldId('de20'), [seen(111, 'Alpha'), seen(222, 'Beta')], 'visit');
      env.ctx.battles.record(battle(1, 111));
      env.ctx.battles.record(battle(2, 222));
      env.menu('pvp');
      const box = env.boxes.get('pvp') as NonNullable<ReturnType<typeof env.boxes.get>>;
      await vi.waitFor(() => expect(box.text).toContain('Beta'));
      const input = box.root.querySelector('input[type=search]') as HTMLInputElement;
      input.value = 'ALP';
      input.dispatchEvent(new Event('input'));
      await vi.waitFor(() => expect(box.text).not.toContain('Beta'));
      expect(box.text).toContain('Alpha');
    });

    it('keeps the field while the list turns empty, so it keeps its focus', async () => {
      const { box, lists, state } = setup();
      await tick();
      lists[0]?.resolve([battle(1, 111)]);
      await tick();
      const input = box.root.querySelector('input[type=search]') as HTMLInputElement;
      state.total = 0;
      input.value = 'xyz';
      input.dispatchEvent(new Event('input'));
      await tick();
      lists.at(-1)?.resolve([]);
      await tick();
      expect(box.text).toContain('Keine Kämpfe zu diesem Filter.');
      expect(box.root.querySelector('input[type=search]')).toBe(input);
      state.total = 1;
      input.value = '';
      input.dispatchEvent(new Event('input'));
      await tick();
      lists.at(-1)?.resolve([battle(1, 111)]);
      await tick();
      expect(box.text).toContain('111');
      expect(box.root.querySelector('input[type=search]')).toBe(input);
    });

    it('keeps typed keys from the game', async () => {
      const { box } = setup();
      await tick();
      const input = box.root.querySelector('input[type=search]') as HTMLInputElement;
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
});
