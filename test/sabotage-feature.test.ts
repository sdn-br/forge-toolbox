// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_OUTLINE } from '../src/content/features/sabotage/city-map';
import { sabotageFeature } from '../src/content/features/sabotage/index';
import { type BattlePersistence, BattleStore } from '../src/content/stores/battles';
import type { BuildingDef } from '../src/content/stores/catalog';
import type { VisitedCity } from '../src/content/stores/cities';
import type { Building } from '../src/content/stores/city-model';
import type { PlayerObservation } from '../src/content/stores/players';
import { CityMap, type CityMapData } from '../src/content/ui/city-map';
import { buildingDefId, eraId, guildId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { AttackTimer, Battle, IncomingAttack, Plunder } from '../src/shared/model';
import { featureContext } from './helpers/feature-context';

const world = worldId('de20');
const city = (owner: number): VisitedCity => ({
  world,
  owner: playerId(owner),
  era: eraId('ColonialAge'),
  map: 'main',
  takenAt: 0,
  buildings: new Map(),
  visit: { neighbor: true, friend: false, guildMember: false },
});

/** A battle whose measured defense shows as `defense` percent. */
const battle = (opponent: number, defense: number): Battle => ({
  world,
  battleId: opponent,
  at: Date.now(),
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: { defense_boost: defense }, units: [] },
});

const plunder = (opponent: number, at: number, change: Partial<Plunder> = {}): Plunder => ({
  world,
  at,
  opponent: playerId(opponent),
  outcome: 'plundered',
  entityId: 350,
  cityEntityId: buildingDefId('R_IronAge_Residential2'),
  resources: { strategy_points: 4 },
  doubleLoot: false,
  ...change,
});

function setup() {
  const latest = new Map<PlayerId, (battle: Battle) => void>();
  const persistence: BattlePersistence = {
    put: async () => {},
    latest: (_world, opponent) => new Promise((resolve) => latest.set(opponent, resolve)),
    list: async () => [],
    count: async () => 0,
    prune: async () => 0,
  };
  const env = featureContext({
    overrides: ({ bus, world }) => ({ battles: new BattleStore(bus, world, persistence) }),
  });
  sabotageFeature.setup(env.ctx);
  boxesOfTest.push(...env.boxes.values());
  const box = env.boxes.get('sabotage') as NonNullable<ReturnType<typeof env.boxes.get>>;
  return { ...env, box, latest };
}

/** Boxes of the running test. Closed after it, so lookups of a finished test that resolve late draw nothing into the
 * spies of the next one. */
const boxesOfTest: { box: { close(): void } }[] = [];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const HOUR = 3_600_000;
const observed = (id: number, attack: AttackTimer): PlayerObservation => ({
  id: playerId(id),
  name: `P${id}`,
  avatar: '',
  cityName: '',
  era: eraId('ColonialAge'),
  score: 0,
  rank: 0,
  active: true,
  guild: null,
  attack,
});

afterEach(() => {
  for (const each of boxesOfTest.splice(0)) each.box.close();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const houseDef = (id: string, name: string): BuildingDef => ({
  id: buildingDefId(id),
  name,
  generic: false,
  size: { width: 2, length: 2 },
  flags: { motivatable: false, polishable: false, plunderable: true },
  boostsByEra: {},
  productByEra: {},
});

const house = (id: number, owner: number, def: string, x: number, resources?: Record<string, number>): Building => ({
  id,
  owner: playerId(owner),
  def: buildingDefId(def),
  type: 'residential',
  x,
  y: 0,
  connected: true,
  state: resources ? { kind: 'finished', product: { resources } } : { kind: 'idle' },
});

const withBuildings = (owner: number, buildings: Building[]): VisitedCity => ({
  ...city(owner),
  buildings: new Map(buildings.map((b) => [b.id, b])),
});

/** the sabotage feature with a catalog for two plunderable houses, and the map data it draws */
function mapSetup() {
  const env = setup();
  env.ctx.catalog.add(houseDef('Coins', 'Münzhaus'));
  env.ctx.catalog.add(houseDef('Points', 'Punktehaus'));
  const render = vi.spyOn(CityMap.prototype, 'render');
  const focus = vi.spyOn(CityMap.prototype, 'focus');
  const mapBox = env.boxes.get('visitedCityMap') as NonNullable<ReturnType<typeof env.boxes.get>>;
  const drawn = () => render.mock.lastCall?.[0] as CityMapData;
  const row = (name: string) =>
    [...env.box.root.querySelectorAll('tr.plunder-row')].find((r) => r.textContent?.includes(name)) as HTMLElement;
  return { ...env, mapBox, drawn, focus, row };
}

describe('sabotage feature', () => {
  it.each([
    ['older lookup resolves last', [2, 1]],
    ['older lookup resolves first', [1, 2]],
  ])('after a fast city switch shows the last visited city only (%s)', async (_name, order) => {
    const { ctx, box, latest } = setup();
    ctx.cities.setVisited(city(1));
    ctx.cities.setVisited(city(2));
    await tick();
    const results: Record<number, Battle> = { 1: battle(1, 111), 2: battle(2, 222) };

    for (const owner of order) {
      latest.get(playerId(owner))?.(results[owner] as Battle);
      await tick();
    }

    expect(box.text).toContain('Gemessen');
    expect(box.text).toContain('222');
    expect(box.text).not.toContain('111');
  });

  it('links the visited player and their guild to foestats in a new tab', async () => {
    const { ctx, box } = setup();
    ctx.players.apply(
      world,
      [{ ...observed(1, { canPlunder: false }), guild: { id: guildId(77), name: 'Gilde' } }],
      'visit',
    );
    ctx.cities.setVisited(city(1));
    await tick();
    const links = [...box.root.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href'), a.target]);
    expect(links).toEqual([
      ['P1', 'https://foestats.com/de/de20/players/1', '_blank'],
      ['Gilde', 'https://foestats.com/de/de20/guilds/77', '_blank'],
    ]);
  });

  it('opens the city map of the visited player in its own box and remembers its view mode', async () => {
    const { ctx, box, mapBox } = mapSetup();
    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'update');
    ctx.cities.setVisited(withBuildings(1, [house(5, 1, 'R_Test_House', 0)]));
    await tick();
    expect(box.root.querySelector('canvas')).toBeNull();
    expect(mapBox.box.isOpen).toBe(false);

    (box.root.querySelector('button.map-button') as HTMLButtonElement).click();
    expect(mapBox.box.isOpen).toBe(true);
    expect(mapBox.title).toBe('Stadtplan P1');
    expect(mapBox.root.querySelector('canvas')).not.toBeNull();
    mapBox.click('Isometrisch');
    expect(ctx.ui.pref('cityMap.visited.mode')).toBe('iso');
  });

  it('offers no city map for a city without buildings', async () => {
    const { ctx, box } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.root.querySelector('button.map-button')).toBeNull();
  });

  it('opens the map from a plunderable row, frames and centers that building, and moves to the next one', async () => {
    const { ctx, box, mapBox, drawn, focus, row } = mapSetup();
    ctx.cities.setVisited(
      withBuildings(1, [house(5, 1, 'Coins', 0, { money: 900 }), house(6, 1, 'Points', 4, { strategy_points: 3 })]),
    );
    await tick();
    expect([...box.root.querySelectorAll('tr.plunder-row')].map((r) => r.className)).toEqual([
      'plunder-row',
      'plunder-row muted',
    ]);

    row('Münzhaus').click();
    expect(mapBox.box.isOpen).toBe(true);
    const coins = { x: 0, y: 0, width: 2, length: 2 };
    expect(focus).toHaveBeenLastCalledWith(coins);
    await tick();
    expect(drawn().focus).toEqual({ rect: coins, color: FOCUS_OUTLINE });

    row('Punktehaus').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const points = { x: 4, y: 0, width: 2, length: 2 };
    expect(focus).toHaveBeenLastCalledWith(points);
    await tick();
    expect(drawn().focus?.rect).toEqual(points);
  });

  it('shows the whole city without the framed building when opened from the map button', async () => {
    const { ctx, box, drawn, row } = mapSetup();
    const whole = vi.spyOn(CityMap.prototype, 'showCity');
    ctx.cities.setVisited(withBuildings(1, [house(5, 1, 'Coins', 0, { money: 900 })]));
    await tick();
    row('Münzhaus').click();
    await tick();
    expect(drawn().focus).toBeDefined();

    (box.root.querySelector('button.map-button') as HTMLButtonElement).click();
    await tick();
    expect(drawn().focus).toBeUndefined();
    expect(whole).toHaveBeenCalled();
  });

  it('follows the visited city in the map box and drops the framed building', async () => {
    const { ctx, box, mapBox, drawn, row } = mapSetup();
    ctx.players.apply(world, [observed(2, { canPlunder: false })], 'update');
    ctx.cities.setVisited(withBuildings(1, [house(5, 1, 'Coins', 0, { money: 900 })]));
    await tick();
    row('Münzhaus').click();
    await tick();
    expect(drawn().focus).toBeDefined();

    ctx.cities.setVisited(withBuildings(2, [house(7, 2, 'Points', 8)]));
    await tick();
    expect(mapBox.box.isOpen).toBe(true);
    expect(mapBox.title).toBe('Stadtplan P2');
    expect(drawn().focus).toBeUndefined();
    expect(drawn().tiles.map((t) => t.x)).toEqual([8]);
    expect(box.root.querySelector('tr.plunder-row')).toBeNull();
  });

  it('shows the last battle when the city did not change meanwhile', async () => {
    const { ctx, box, latest } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.text).not.toContain('Gemessen');
    latest.get(playerId(1))?.(battle(1, 111));
    await tick();
    expect(box.text).toContain('111');
  });

  it('shows the last plunder and the totals of the visited player, and follows new plunders', async () => {
    const { ctx, box } = setup();
    ctx.plunders.record(plunder(1, Date.now() - 1000));
    ctx.plunders.record(plunder(2, Date.now()));
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('1 Plünderung, 4 FP'));
    expect(box.text).toContain('R_IronAge_Residential2: 4 Forge-Punkte');
    expect(box.text).not.toContain('Double Loot');

    ctx.plunders.record(plunder(1, Date.now() + 1000, { doubleLoot: true, resources: { money: 20 } }));
    await vi.waitFor(() => expect(box.text).toContain('2 Plünderungen, 4 FP'));
    expect(box.text).toMatch(/20 Münzen\s+Double Loot/);
  });

  it('tells when the last plunder of the visited player was repelled', async () => {
    const { ctx, box } = setup();
    ctx.plunders.record(plunder(1, Date.now() - 1000));
    ctx.plunders.record(
      plunder(1, Date.now(), { outcome: 'repelled', entityId: undefined, cityEntityId: undefined, resources: {} }),
    );
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('1 Plünderung, 1 abgewehrt, 4 FP'));
    expect(box.text).toMatch(/Zuletzt heute \d\d:\d\d: abgewehrt/);
    expect(box.text).not.toContain('R_IronAge_Residential2');
  });

  it('tells when the visited player was never plundered', async () => {
    const { ctx, box } = setup();
    ctx.plunders.record(plunder(2, Date.now()));
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('Hier hast du noch nicht geplündert.'));
  });

  it('tells when the visited player last attacked the own city and follows new attacks, nothing when never', async () => {
    const { ctx, box } = setup();
    const attack = (attacker: number, key: number, change: Partial<IncomingAttack> = {}): IncomingAttack => ({
      world,
      kind: 'battle',
      key,
      at: Date.now(),
      attacker: playerId(attacker),
      defense: 'held',
      ...change,
    });
    ctx.incoming.record(attack(2, 1));
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('Hier hast du noch nicht geplündert.'));
    expect(box.text).not.toContain('angegriffen');

    ctx.incoming.record(attack(1, 2, { defense: 'broken' }));
    await vi.waitFor(() =>
      expect(box.text).toMatch(/Hat dich zuletzt heute \d\d:\d\d angegriffen \(Kampf: durchbrochen\)/),
    );
    expect(box.text).toContain('1 Angriff, 0 Plünderungen');
    expect(box.text).not.toContain('abgewehrt');

    ctx.cities.setVisited(city(2));
    await vi.waitFor(() => expect(box.text).toContain('(Kampf: gehalten)'));
    expect(box.text).toContain('1 Angriff, 1 abgewehrt, 0 Plünderungen');
  });

  it('shows the note card of the visited player, saves into it and follows changes from elsewhere', async () => {
    const { ctx, box } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.text).toContain('Notiz zu diesem Spieler');
    (box.root.querySelector('.note') as HTMLElement).click();
    const textarea = box.root.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'hat **Schilde**';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('blur'));
    expect(ctx.notes.playerPage(playerId(1))?.text).toBe('hat **Schilde**');
    expect(box.root.querySelector('strong')?.textContent).toBe('Schilde');

    ctx.notes.setPlayerText(playerId(1), '*neu*');
    expect(box.root.querySelector('em')?.textContent).toBe('neu');
    ctx.notes.setPlayerText(playerId(2), 'other player');
    expect(box.text).not.toContain('other player');
  });

  it('shows the last battle against the visited player as collapsible details', async () => {
    const { ctx, box, latest } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.root.querySelector('details')).toBeNull();
    latest.get(playerId(1))?.({
      ...battle(1, 111),
      result: 'lost',
      auto: false,
      rounds: 4,
      attacker: { bonuses: {}, units: [{ unitTypeId: 'rogue', startHp: 10, endHp: 0 }] },
      defender: { bonuses: { defense_boost: 111 }, units: [{ unitTypeId: 'feudal_knight', startHp: 10, endHp: 3 }] },
    });
    await tick();
    const details = box.root.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')?.textContent).toMatch(/Letzter Kampf heute \d\d:\d\d: verloren/);
    expect(details.textContent).toContain('verloren, manuell, 4 Runden');
    expect(details.textContent).toContain('feudal_knight');
    expect(details.textContent).toContain('3/10 LP');
    expect(details.textContent).toContain('0 % / 111 %');

    details.open = true;
    await ctx.settings.set('sabotage.showArmy', false);
    expect(box.root.querySelector('details')).toBe(details);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('feudal_knight');
    expect(details.textContent).not.toContain('Angriff / Verteidigung');
  });

  it('shows the attack line of the visited player and follows player updates and shields', async () => {
    const { ctx, box } = setup();
    ctx.players.apply(world, [observed(1, { canPlunder: false, nextInteractionAt: Date.now() + 2 * HOUR })], 'update');
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toMatch(/Wieder angreifbar in (1 Std\. 59 Min\.|2 Std\.) \(ab /));

    ctx.shields.record([{ world, player: playerId(1), expiresAt: Date.now() + 24 * HOUR }]);
    await vi.waitFor(() => expect(box.text).toMatch(/Stadt geschützt bis \d\d\.\d\d\., \d\d:\d\d \(noch /));
    expect(box.text).not.toContain('Wieder angreifbar');

    // a shield of another player changes nothing here
    ctx.shields.record([{ world, player: playerId(2), expiresAt: Date.now() + HOUR }]);
    ctx.players.apply(world, [observed(1, { canPlunder: true, nextInteractionAt: Date.now() + 24 * HOUR })], 'update');
    await vi.waitFor(() => expect(box.text).toMatch(/Plünderbar noch (23 Std\. 59 Min\.|1 T\.) \(bis morgen /));

    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'update');
    await vi.waitFor(() => expect(box.text).toContain('Stadt geschützt bis'));
  });

  it('tells a visited friend cannot be attacked', async () => {
    const { ctx, box } = setup();
    ctx.cities.setVisited({ ...city(1), visit: { neighbor: false, friend: true, guildMember: false } });
    await vi.waitFor(() => expect(box.text).toContain('Freund, nicht angreifbar'));
  });

  it('shows a plain neighbour as attackable', async () => {
    const { ctx, box } = setup();
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('angreifbar'));
    expect(box.text).not.toMatch(/nicht angreifbar|Wieder angreifbar/);
  });

  it('counts down while the box stays open and drops the line once the timer ran out', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 15, 0));
    const { ctx, box } = setup();
    ctx.players.apply(world, [observed(1, { canPlunder: false, nextInteractionAt: Date.now() + 2 * HOUR })], 'update');
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('Wieder angreifbar in 2 Std. (ab heute 17:00)'));

    vi.advanceTimersByTime(31 * 60_000);
    await vi.waitFor(() => expect(box.text).toContain('Wieder angreifbar in 1 Std. 29 Min. (ab heute 17:00)'));

    vi.advanceTimersByTime(90 * 60_000);
    await vi.waitFor(() => expect(box.text).not.toContain('Wieder angreifbar'));
    expect(box.text).toContain('angreifbar');
  });
});
