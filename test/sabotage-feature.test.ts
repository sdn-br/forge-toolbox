// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHOW_ARMY } from '../src/content/features/sabotage';
import { sabotageFeature } from '../src/content/features/sabotage/index';
import type { BuildingDef } from '../src/content/model/catalog';
import type { Building } from '../src/content/model/city';
import { type BattlePersistence, BattleStore } from '../src/content/stores/battles';
import type { VisitedCity } from '../src/content/stores/cities';
import type { PlayerObservation } from '../src/content/stores/players';
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
  category: 'residential',
  x,
  y: 0,
  connected: true,
  state: resources ? { kind: 'finished', product: { resources } } : { kind: 'idle' },
});

const withBuildings = (owner: number, buildings: Building[]): VisitedCity => ({
  ...city(owner),
  buildings: new Map(buildings.map((b) => [b.id, b])),
});

/** the sabotage feature with a catalog for two plunderable houses, and the rows of "Jetzt plünderbar" */
function markSetup() {
  const env = setup();
  env.ctx.catalog.add(houseDef('Coins', 'Münzhaus'));
  env.ctx.catalog.add(houseDef('Points', 'Punktehaus'));
  const row = (name: string) =>
    [...env.box.root.querySelectorAll('tr.plunder-row')].find((r) => r.textContent?.includes(name)) as HTMLElement;
  const marked = () =>
    [...env.box.root.querySelectorAll('tr.plunder-row.marked')].map((r) => r.querySelector('td')?.textContent);
  return { ...env, row, marked };
}

const coinsAndPoints = (owner: number) =>
  withBuildings(owner, [
    house(5, owner, 'Coins', 0, { money: 900 }),
    house(6, owner, 'Points', 4, { strategy_points: 3 }),
  ]);

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

  it('puts a star on the visited player next to the name and takes it away again', async () => {
    const { ctx, box } = setup();
    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'visit');
    ctx.cities.setVisited(city(1));
    await tick();
    const star = () => box.root.querySelector('button.star') as HTMLElement;
    expect(star().getAttribute('aria-label')).toBe('Merken');
    expect(star().closest('p')?.textContent).toContain('P1');
    star().click();
    await tick();
    expect(ctx.players.get(playerId(1))?.marked).toBe(true);
    expect(star().getAttribute('aria-label')).toBe('Nicht mehr merken');
    expect(star().getAttribute('aria-pressed')).toBe('true');
    star().click();
    await tick();
    expect(ctx.players.get(playerId(1))?.marked).toBeUndefined();
  });

  it('ignores the visited player with the eye after the star and takes it back', async () => {
    const { ctx, box } = setup();
    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'visit');
    ctx.cities.setVisited(city(1));
    await tick();
    const eye = () => box.root.querySelector('button.ignore') as HTMLElement;
    expect(box.root.querySelector('button.star')?.nextElementSibling).toBe(eye());
    eye().click();
    await tick();
    expect(ctx.players.get(playerId(1))?.ignored).toBe(true);
    expect(eye().getAttribute('aria-pressed')).toBe('true');
    eye().click();
    await tick();
    expect(ctx.players.get(playerId(1))?.ignored).toBeUndefined();
  });

  it('shows no star for a visited player the store does not know', async () => {
    const { ctx, box } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.root.querySelector('button.star')).toBeNull();
  });

  describe('arrows from the plunderable rows', () => {
    it('sets an arrow on the building of a row, moves it to the next row and takes it away on the same row', async () => {
      const { ctx, box, marker, row, marked } = markSetup();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      expect([...box.root.querySelectorAll('tr.plunder-row')].map((r) => r.className)).toEqual([
        'plunder-row',
        'plunder-row muted',
      ]);
      expect(row('Münzhaus').dataset.tip).toBe('Im Spiel mit einem Pfeil zeigen');

      row('Münzhaus').click();
      expect(marker.last).toMatchObject({ type: 'show', spots: [{ id: 5, x: 0, y: 0, width: 2, length: 2 }] });
      expect(ctx.markers.current()?.city).toBe(playerId(1));
      expect(marked()).toEqual(['Münzhaus']);
      expect(row('Münzhaus').getAttribute('aria-pressed')).toBe('true');
      expect(row('Münzhaus').dataset.tip).toBe('Pfeil im Spiel entfernen');

      row('Punktehaus').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(marker.shown).toEqual([6]);
      expect(marked()).toEqual(['Punktehaus']);

      row('Punktehaus').click();
      expect(marker.last?.type).toBe('hide');
      expect(marked()).toEqual([]);
      expect(row('Punktehaus').getAttribute('aria-pressed')).toBe('false');
    });

    it('unmarks the row when the arrow is dismissed in the game', async () => {
      const { ctx, marker, row, marked } = markSetup();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      row('Münzhaus').click();
      marker.dismiss([5]);
      expect(ctx.markers.current()).toBeUndefined();
      expect(marked()).toEqual([]);
      // the next click sets it again
      row('Münzhaus').click();
      expect(marked()).toEqual(['Münzhaus']);
    });

    it('takes the arrow away after a plunder of its building, won or repelled, and leaves it for another', async () => {
      const { ctx, row, marked } = markSetup();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      row('Münzhaus').click();
      ctx.bus.emit('plunder.attempted', { opponent: playerId(1), entityId: 6 });
      ctx.bus.emit('plunder.attempted', { opponent: playerId(2), entityId: 5 });
      expect(marked()).toEqual(['Münzhaus']);
      ctx.bus.emit('plunder.attempted', { opponent: playerId(1), entityId: 5 });
      expect(ctx.markers.current()).toBeUndefined();
      expect(marked()).toEqual([]);
    });

    it('drops the arrow when another city is visited and keeps it for the same city', async () => {
      const { ctx, marker, row, marked } = markSetup();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      row('Münzhaus').click();

      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      expect(marked()).toEqual(['Münzhaus']);

      ctx.cities.setVisited(coinsAndPoints(2));
      await tick();
      expect(marker.last?.type).toBe('hide');
      expect(ctx.markers.current()).toBeUndefined();
      expect(marked()).toEqual([]);
    });

    it('drops the arrow back home, so a later visit of the same city shows none, and leaves an arrow set elsewhere alone', async () => {
      const { ctx, marker, row, marked } = markSetup();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      row('Münzhaus').click();
      ctx.cities.showOwn();
      expect(marker.last?.type).toBe('hide');
      expect(ctx.markers.current()).toBeUndefined();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      expect(marked()).toEqual([]);

      ctx.markers.set('cityMap', 'own', [{ id: 9, x: 0, y: 0, width: 1, length: 1 }]);
      ctx.cities.setVisited(coinsAndPoints(2));
      expect(ctx.markers.of('cityMap')?.city).toBe('own');
    });

    it('offers no arrows from the rows while the game shows another city, and again once it shows this one', async () => {
      const { ctx, marker, row, box } = markSetup();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      ctx.cities.showOwn();
      await tick();
      expect(row('Münzhaus')).toBeUndefined();
      expect(box.root.textContent).toContain('Münzhaus');
      expect(marker.posted).toEqual([]);

      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      expect(row('Münzhaus')).toBeDefined();
    });

    it('sets no arrow for a building without a place on the grid', async () => {
      const { ctx, marker, row } = markSetup();
      const city = coinsAndPoints(1);
      const ship = { ...house(5, 1, 'Coins', 0, { money: 900 }), offGrid: true };
      ctx.cities.setVisited({ ...city, buildings: new Map([[5, ship]]) });
      await tick();
      row('Münzhaus').click();
      expect(marker.posted).toEqual([]);
    });
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
    await ctx.settings.of(SHOW_ARMY).set(false);
    expect(box.root.querySelector('details')).toBe(details);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('feudal_knight');
    expect(details.textContent).not.toContain('Angriff / Verteidigung');
  });

  it('shows the attack line of the visited player and follows player updates and shields', async () => {
    // a fixed day: on a day with a clock change, 24 hours later can still be "heute"
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 19, 15, 0));
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
