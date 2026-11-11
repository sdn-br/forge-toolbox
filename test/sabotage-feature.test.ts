// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTO_OPEN, SHOW_ARMY } from '../src/content/features/sabotage';
import { sabotageFeature } from '../src/content/features/sabotage/index';
import type { BuildingDef } from '../src/content/model/catalog';
import type { Building } from '../src/content/model/city';
import type { PlayerObservation } from '../src/content/model/player';
import { AssetStore } from '../src/content/stores/assets';
import { type BattlePersistence, BattleStore } from '../src/content/stores/battles';
import type { VisitedCity } from '../src/content/stores/cities';
import { type AssetIndex, unitPortraitPath } from '../src/shared/cdn-assets';
import { buildingDefId, eraId, guildId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { AttackTimer, FoughtBattle, IncomingAttack, Plunder } from '../src/shared/model';
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
const battle = (opponent: number, defense: number): FoughtBattle => ({
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

function setup(assetIndex?: AssetIndex) {
  // both lookups of a player wait for the same answer: the last battle and the last fought one
  const waiting = new Map<PlayerId, ((battle: FoughtBattle) => void)[]>();
  const wait = (opponent: PlayerId) =>
    new Promise<FoughtBattle>((resolve) => waiting.set(opponent, [...(waiting.get(opponent) ?? []), resolve]));
  const latest = {
    get: (opponent: PlayerId) => (battle: FoughtBattle) => {
      for (const resolve of waiting.get(opponent) ?? []) resolve(battle);
      waiting.delete(opponent);
    },
  };
  const persistence: BattlePersistence = {
    put: async () => {},
    latest: (_world, opponent) => wait(opponent),
    latestFought: (_world, opponent) => wait(opponent),
    list: async () => [],
    summary: async () => ({ battles: 0, won: 0, plunders: 0, repelled: 0, fp: 0 }),
    prune: async () => 0,
  };
  const env = featureContext({
    overrides: ({ bus, world }) => ({
      battles: new BattleStore(bus, world, persistence),
      ...(assetIndex && { assets: new AssetStore(bus, { index: async () => assetIndex }) }),
    }),
  });
  sabotageFeature.setup(env.ctx);
  boxesOfTest.push(...env.boxes.values());
  const box = env.boxes.get('sabotage') as NonNullable<ReturnType<typeof env.boxes.get>>;
  return { ...env, box, latest };
}

/** Boxes of the running test. Closed after it, so lookups of a finished test that resolve late draw nothing into the
 * spies of the next one. */
const boxesOfTest: { box: { close(): void } }[] = [];

/** the tab buttons of the box, Plündern first, Kampf second */
const tabButton = (box: { root: ParentNode }, n: 0 | 1) => box.root.querySelectorAll('.tabs button')[n] as HTMLElement;
const showFight = (box: { root: ParentNode }) => tabButton(box, 1).click();
const noteIcon = (box: { root: ParentNode }) => box.root.querySelector('button.note-icon') as HTMLElement;
const showPlunder = (box: { root: ParentNode }) => tabButton(box, 0).click();

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
    [...env.box.root.querySelectorAll('tr.plunder-row.marked')].map(
      (r) => r.querySelector('td:not(.img) b')?.textContent,
    );
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
    showFight(box);
    const results: Record<number, FoughtBattle> = { 1: battle(1, 111), 2: battle(2, 222) };

    for (const owner of order) {
      latest.get(playerId(owner))?.(results[owner] as FoughtBattle);
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

  it('marks the visited player as good to plunder next to the name and takes it away again', async () => {
    const { ctx, box } = setup();
    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'visit');
    ctx.cities.setVisited(city(1));
    await tick();
    const plunder = () => box.root.querySelector('button.plunder') as HTMLElement;
    expect(plunder().getAttribute('aria-label')).toBe('Gut zu plündern');
    expect(plunder().closest('p')?.textContent).toContain('P1');
    plunder().click();
    await tick();
    expect(ctx.players.get(playerId(1))?.plunderWorthy).toBe(true);
    expect(ctx.players.get(playerId(1))?.marked).toBeUndefined();
    expect(plunder().getAttribute('aria-label')).toBe('Nicht mehr gut zu plündern');
    expect(plunder().getAttribute('aria-pressed')).toBe('true');
    plunder().click();
    await tick();
    expect(ctx.players.get(playerId(1))?.plunderWorthy).toBeUndefined();
  });

  it('marks the visited player as not to attack after the first mark, which it clears', async () => {
    const { ctx, box } = setup();
    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'visit');
    ctx.players.setFlag(playerId(1), 'plunderWorthy', true);
    ctx.cities.setVisited(city(1));
    await tick();
    const noAttack = () => box.root.querySelector('button.no-attack') as HTMLElement;
    expect(box.root.querySelector('button.plunder')?.nextElementSibling).toBe(noAttack());
    noAttack().click();
    await tick();
    expect(ctx.players.get(playerId(1))).toMatchObject({ noAttack: true });
    expect(ctx.players.get(playerId(1))?.plunderWorthy).toBeUndefined();
    expect(noAttack().getAttribute('aria-pressed')).toBe('true');
    noAttack().click();
    await tick();
    expect(ctx.players.get(playerId(1))?.noAttack).toBeUndefined();
  });

  it('draws the open friend invitation next to the name, and the player stays attackable', async () => {
    const { ctx, box } = setup();
    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'visit');
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.root.querySelector('.visit-name .rel-icons')).toBeNull();
    ctx.players.addInvitation(world, observed(1, { canPlunder: false }), true);
    await tick();
    const icon = box.root.querySelector('.visit-name .rel-icons') as HTMLElement;
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon.dataset.tip).toBe('Freundschaftsanfrage');
    expect(box.root.querySelector('.visit-attack')?.textContent).not.toContain('Freund,');
  });

  it('shows neither mark nor the great building marks for a player the store does not know or knows', async () => {
    const { ctx, box } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.root.querySelector('button.plunder, button.no-attack')).toBeNull();
    ctx.players.apply(world, [observed(1, { canPlunder: false })], 'visit');
    await tick();
    expect(box.root.querySelector('button.plunder')).not.toBeNull();
    expect(box.root.querySelector('button.star, button.ignore')).toBeNull();
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
      expect(row('Münzhaus').querySelector<HTMLElement>('td.mark')?.dataset.tip).toBe(
        'Im Spiel mit einer Stecknadel zeigen',
      );

      row('Münzhaus').click();
      expect(marker.last).toMatchObject({ type: 'show', spots: [{ id: 5, x: 0, y: 0, width: 2, length: 2 }] });
      expect(ctx.markers.current()?.city).toBe(playerId(1));
      expect(marked()).toEqual(['Münzhaus']);
      expect(row('Münzhaus').getAttribute('aria-pressed')).toBe('true');
      expect(row('Münzhaus').querySelector<HTMLElement>('td.mark')?.dataset.tip).toBe('Stecknadel im Spiel entfernen');

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

  describe('tabs', () => {
    it('opens on Plündern with the count of plunderable buildings and the totals line, tabs without words', async () => {
      const { ctx, box } = markSetup();
      ctx.cities.setVisited(coinsAndPoints(1));
      await tick();
      expect(tabButton(box, 0).className).toBe('active');
      expect(tabButton(box, 0).textContent?.trim()).toBe('2');
      expect(tabButton(box, 0).dataset.tip).toBe('Plündern');
      expect(tabButton(box, 1).dataset.tip).toBe('Kampf');
      expect(tabButton(box, 1).textContent?.trim()).toBe('');
      expect(box.root.querySelector('table.plunder-table')).not.toBeNull();
      expect(box.text).toContain('Hier hast du noch nicht geplündert.');
      expect(box.text).not.toContain('Jetzt plünderbar');
    });

    it('omits the count when nothing is plunderable', async () => {
      const { ctx, box } = setup();
      ctx.cities.setVisited(city(1));
      await tick();
      expect(tabButton(box, 0).textContent?.trim()).toBe('');
      expect(box.text).toContain('Nichts Plünderbares.');
    });

    it('shows the fight content on Kampf instead, and Plündern again on the way back', async () => {
      const { ctx, box } = markSetup();
      ctx.plunders.record(plunder(1, Date.now()));
      ctx.cities.setVisited(coinsAndPoints(1));
      await vi.waitFor(() => expect(box.text).toContain('1 Plünderung, 4 FP'));
      showFight(box);
      expect(tabButton(box, 1).className).toBe('active');
      expect(box.root.querySelector('table.plunder-table')).toBeNull();
      expect(box.text).toMatch(/Zuletzt heute/);
      expect(box.text).not.toContain('1 Plünderung, 4 FP');
      showPlunder(box);
      expect(box.root.querySelector('table.plunder-table')).not.toBeNull();
    });

    it('says so on Kampf when there is nothing to show', async () => {
      const { ctx, box } = setup();
      await ctx.settings.of(SHOW_ARMY).set(false);
      ctx.cities.setVisited(city(1));
      await tick();
      showFight(box);
      expect(box.text).toContain('Noch nichts zu diesem Spieler aufgezeichnet.');
    });

    it('keeps the chosen tab over redraws and goes back to Plündern on every new visit', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      const { ctx, box } = setup();
      ctx.cities.setVisited(city(1));
      await tick();
      showFight(box);
      vi.advanceTimersByTime(31_000);
      ctx.bus.emit('city.visitedChanged', { owner: playerId(1), buildingIds: [] });
      expect(tabButton(box, 1).className).toBe('active');

      ctx.cities.setVisited(city(1));
      await tick();
      expect(tabButton(box, 0).className).toBe('active');
    });
  });

  describe('note icon', () => {
    it('is faded without a note, tells to create one and shows or hides the card on a click', async () => {
      const { ctx, box } = setup();
      ctx.cities.setVisited(city(1));
      await tick();
      expect(noteIcon(box).className).toBe('note-icon empty');
      expect(noteIcon(box).dataset.tip).toBe('Notiz anlegen');
      expect(noteIcon(box).getAttribute('aria-pressed')).toBe('false');
      noteIcon(box).click();
      expect(box.root.querySelector('.card')).not.toBeNull();
      expect(noteIcon(box).getAttribute('aria-pressed')).toBe('true');
      noteIcon(box).click();
      expect(box.root.querySelector('.card')).toBeNull();
    });

    it('is not faded with a note, which is its tooltip, and closes again on a new visit', async () => {
      const { ctx, box } = setup();
      ctx.notes.setPlayerText(playerId(1), 'hat Schilde');
      ctx.cities.setVisited(city(1));
      await tick();
      expect(noteIcon(box).className).toBe('note-icon');
      expect(noteIcon(box).dataset.tip).toBe('hat Schilde');
      noteIcon(box).click();
      ctx.cities.setVisited(city(1));
      await tick();
      expect(box.root.querySelector('.card')).toBeNull();
    });
  });

  it('shows the last battle when the city did not change meanwhile', async () => {
    const { ctx, box, latest } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    showFight(box);
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
    showFight(box);
    expect(box.text).not.toContain('1 Plünderung, 4 FP');
    expect(box.text).toMatch(/Zuletzt heute \d\d:\d\dR_IronAge_Residential24 Forge-Punkte/);
    expect(box.text).not.toContain('Plünderung verdoppelt');

    ctx.plunders.record(plunder(1, Date.now() + 1000, { doubleLoot: true, resources: { money: 20 } }));
    await vi.waitFor(() =>
      expect(box.text).toMatch(/Zuletzt heute \d\d:\d\dPlünderung verdoppelt\s*R_IronAge_Residential2\s*20 Münzen/),
    );
    showPlunder(box);
    expect(box.text).toContain('2 Plünderungen, 4 FP');
  });

  it('tells when the last plunder of the visited player was repelled', async () => {
    const { ctx, box } = setup();
    ctx.plunders.record(plunder(1, Date.now() - 1000));
    ctx.plunders.record(
      plunder(1, Date.now(), { outcome: 'repelled', entityId: undefined, cityEntityId: undefined, resources: {} }),
    );
    ctx.cities.setVisited(city(1));
    await vi.waitFor(() => expect(box.text).toContain('1 Plünderung, 1 abgewehrt, 4 FP'));
    showFight(box);
    expect(box.text).toMatch(/Zuletzt heute \d\d:\d\d–abgewehrt/);
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
    showFight(box);
    expect(box.text).not.toContain('angegriffen');

    ctx.incoming.record(attack(1, 2, { defense: 'broken' }));
    await vi.waitFor(() =>
      expect(box.text).toMatch(/Hat dich zuletzt heute \d\d:\d\d angegriffen \(Kampf: durchbrochen\)/),
    );
    expect(box.text).toContain('1 Angriff, 0 Plünderungen');
    expect(box.text).not.toContain('abgewehrt');

    ctx.cities.setVisited(city(2));
    await tick();
    showFight(box);
    await vi.waitFor(() => expect(box.text).toContain('(Kampf: gehalten)'));
    expect(box.text).toContain('1 Angriff, 1 abgewehrt, 0 Plünderungen');
  });

  it('shows the note card of the visited player, saves into it and follows changes from elsewhere', async () => {
    const { ctx, box } = setup();
    ctx.cities.setVisited(city(1));
    await tick();
    expect(box.text).not.toContain('Notiz zu diesem Spieler');
    noteIcon(box).click();
    expect(box.text).toContain('Notiz zu diesem Spieler');
    (box.root.querySelector('.note') as HTMLElement).click();
    const textarea = box.root.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'hat **Schilde**';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('blur'));
    expect(ctx.notes.playerPage(playerId(1))?.text).toBe('hat **Schilde**');
    expect(noteIcon(box).dataset.tip).toBe('hat **Schilde**');
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
    showFight(box);
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
    expect(details.querySelector('[data-tip="Einheit: feudal_knight\nLP: 3/10"]')).not.toBeNull();
    expect(details.textContent).toContain('0 % / 111 %');

    details.open = true;
    await ctx.settings.of(SHOW_ARMY).set(false);
    expect(box.root.querySelector('details')).toBe(details);
    expect(details.open).toBe(true);
    expect(details.querySelector('.unit-tile')).not.toBeNull();
    expect(details.textContent).not.toContain('Angriff / Verteidigung');
  });

  it('draws the unit portraits of the last battle once the asset index arrives', async () => {
    const { ctx, box, latest } = setup({ [unitPortraitPath('rogue')]: 'abc' });
    ctx.catalog.setUnitTypes([{ id: 'rogue', name: 'Agent' }]);
    ctx.cities.setVisited(city(1));
    await tick();
    showFight(box);
    latest.get(playerId(1))?.({
      ...battle(1, 111),
      attacker: { bonuses: {}, units: [{ unitTypeId: 'rogue', startHp: 10, endHp: 10 }] },
    });
    await tick();
    expect(box.root.querySelector('details img')).toBeNull();
    await ctx.assets.load('https://foede.innogamescdn.com/cache/ForgeHX-1.js');
    expect(box.root.querySelector('details img')?.getAttribute('src')).toBe(
      'https://foede.innogamescdn.com/assets/shared/unit_portraits/armyuniticons_50x50/armyuniticons_50x50_rogue-abc.jpg',
    );
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

  it('loads the record only while the box is open, and when it opens for the visited city', async () => {
    const { ctx, box, latest, menu } = setup();
    await ctx.settings.of(AUTO_OPEN).set(false);
    const latestBattle = vi.spyOn(ctx.battles, 'latest');
    ctx.cities.setVisited(city(1));
    await tick();
    expect(latestBattle).not.toHaveBeenCalled();
    ctx.bus.emit('battle.recorded', { opponents: [playerId(1)] });
    await tick();
    expect(latestBattle).not.toHaveBeenCalled();

    menu('sabotage');
    await tick();
    expect(latestBattle).toHaveBeenCalledTimes(1);
    latest.get(playerId(1))?.(battle(1, 111));
    await tick();
    showFight(box);
    expect(box.text).toContain('111');
  });

  it('assesses the city once for ticks and arriving parts, and again after the city changed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const { ctx, box, latest } = setup();
    ctx.catalog.add(houseDef('Coins', 'Münzhaus'));
    const def = vi.spyOn(ctx.catalog, 'get');
    ctx.cities.setVisited(coinsAndPoints(1));
    await tick();
    const first = def.mock.calls.length;
    expect(first).toBeGreaterThan(0);

    showFight(box);
    vi.advanceTimersByTime(31_000);
    latest.get(playerId(1))?.(battle(1, 111));
    await tick();
    expect(box.text).toContain('111');
    expect(def.mock.calls.length).toBe(first);

    ctx.bus.emit('city.visitedChanged', { owner: playerId(1), buildingIds: [5] });
    expect(def.mock.calls.length).toBeGreaterThan(first);
  });

  describe('plunder list window', () => {
    /** a city with `n` plunderable houses of the same kind; rows share the loot, so only the names tell them apart */
    function manyHouses(n: number) {
      const env = setup();
      const buildings = Array.from({ length: n }, (_, i) => {
        env.ctx.catalog.add(houseDef(`H${i}`, `Haus ${i}`));
        return house(10 + i, 1, `H${i}`, i * 3, { money: 100 });
      });
      const names = () =>
        [...env.box.root.querySelectorAll('tr.plunder-row')].map((r) => r.querySelector('td:not(.img) b')?.textContent);
      const button = (label: string) =>
        env.box.root.querySelector(`.win-nav button[aria-label="${label}"]`) as HTMLButtonElement | null;
      const wheel = (deltaY: number) => {
        const event = new WheelEvent('wheel', { deltaY, cancelable: true, bubbles: true });
        env.box.root.querySelector('.win-scroll')?.dispatchEvent(event);
        return event;
      };
      const visit = async () => {
        env.ctx.cities.setVisited(withBuildings(1, buildings));
        await tick();
      };
      const area = () => env.box.root.querySelector('.visit-content');
      return { ...env, names, button, wheel, visit, area };
    }

    it('draws at most five rows and offers no buttons for five or fewer', async () => {
      const five = manyHouses(5);
      await five.visit();
      expect(five.names()).toHaveLength(5);
      expect(five.box.root.querySelector('.win-scroll')).toBeNull();

      const seven = manyHouses(7);
      await seven.visit();
      expect(seven.names()).toHaveLength(5);
      expect(seven.box.root.querySelector('.win-scroll')).not.toBeNull();
      expect(seven.box.text).toContain('noch 2 weitere unten');
    });

    it('moves the window by one row with the wheel and the buttons', async () => {
      const { names, button, wheel, visit, box } = manyHouses(7);
      await visit();
      const all = names();
      expect(button('Nach oben')?.classList.contains('off')).toBe(true);

      expect(wheel(100).defaultPrevented).toBe(true);
      expect(names()[0]).not.toBe(all[0]);
      expect(names()).toHaveLength(5);
      const afterWheel = names();
      button('Nach unten')?.click();
      expect(names()[0]).not.toBe(afterWheel[0]);
      // at the end the wheel passes on
      expect(wheel(100).defaultPrevented).toBe(false);
      expect(box.text).toContain('2 weitere oben');

      button('Nach oben')?.click();
      button('Nach oben')?.click();
      expect(names()).toEqual(all);
    });

    it('goes back to the top on a new visit and stays on redraws', async () => {
      const { ctx, names, wheel, visit, box } = manyHouses(7);
      await visit();
      const top = names();
      wheel(100);
      const moved = names();
      expect(moved).not.toEqual(top);

      ctx.bus.emit('city.visitedChanged', { owner: playerId(1), buildingIds: [] });
      showFight(box);
      showPlunder(box);
      expect(names()).toEqual(moved);

      await visit();
      expect(names()).toEqual(top);
    });

    it('toggles the pin of a row in the window', async () => {
      const { ctx, names, wheel, visit, box, marker } = manyHouses(7);
      await visit();
      wheel(100);
      const second = box.root.querySelectorAll('tr.plunder-row')[1] as HTMLElement;
      const name = names()[1];
      second.click();
      expect(marker.last?.type).toBe('show');
      expect(ctx.markers.current()?.city).toBe(playerId(1));
      expect(box.root.querySelectorAll('tr.plunder-row.marked')).toHaveLength(1);
      expect(box.root.querySelector('tr.plunder-row.marked b')?.textContent).toBe(name);
      // the window stayed where it was
      expect(names()[1]).toBe(name);
    });

    it('keeps the content area over redraws and starts a new one on a new visit and a tab switch', async () => {
      const { ctx, box, visit, area } = manyHouses(8);
      await visit();
      const first = area();
      ctx.bus.emit('city.visitedChanged', { owner: playerId(1), buildingIds: [] });
      expect(area()).toBe(first);
      showFight(box);
      expect(area()).not.toBe(first);
      showPlunder(box);
      const second = area();
      await visit();
      expect(area()).not.toBe(second);
    });

    it('gives the Plündern tab no fixed height and the Kampf tab the height measured on Plündern', async () => {
      const { box, visit, area } = manyHouses(8);
      await visit();
      expect((area() as HTMLElement).style.height).toBe('');
      showFight(box);
      // no layout in the test: nothing measured, the Kampf tab has the height of its content
      expect((area() as HTMLElement).style.height).toBe('');
      showPlunder(box);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(437);
      showFight(box);
      expect((area() as HTMLElement).style.height).toBe('437px');
    });

    it('reserves the room of five rows for a list with fewer or none', async () => {
      const { box, visit } = manyHouses(2);
      await visit();
      expect(box.root.querySelector('.visit-content > .plunder-list')).not.toBeNull();
      const none = manyHouses(0);
      await none.visit();
      expect(none.box.root.querySelector('.plunder-list')?.textContent).toContain('Nichts Plünderbares.');
    });

    describe('rows that fit', () => {
      /** a ResizeObserver that runs its callbacks by hand, and a content area with the given sizes */
      function layout() {
        const callbacks: (() => void)[] = [];
        vi.stubGlobal(
          'ResizeObserver',
          class {
            constructor(cb: () => void) {
              callbacks.push(cb);
            }
            observe() {}
            disconnect() {}
          },
        );
        const size = { client: 400, scroll: 400 };
        vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => size.client);
        vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => size.scroll);
        const observed = async () => {
          for (const cb of callbacks) cb();
          await tick();
        };
        return { size, observed };
      }
      afterEach(() => vi.unstubAllGlobals());

      it('lowers the count by one per overflow, never below one, and keeps the reserved room in step', async () => {
        const { size, observed } = layout();
        const { box, visit, names } = manyHouses(8);
        await visit();
        // the content area overflows at every count
        size.scroll = 500;
        await observed();
        expect(names()).toHaveLength(4);
        expect((box.root.querySelector('.plunder-list') as HTMLElement).style.minHeight).toBe(`${4 * 76 + 21}px`);
        for (let n = 0; n < 6; n++) await observed();
        expect(names()).toHaveLength(1);
      });

      it('stops lowering once the content fits, and starts at five again on a new visit and when the area grows', async () => {
        const { size, observed } = layout();
        const { visit, names } = manyHouses(8);
        await visit();
        size.scroll = 500;
        await observed();
        size.scroll = 400;
        await observed();
        expect(names()).toHaveLength(4);

        await visit();
        expect(names()).toHaveLength(5);

        size.scroll = 500;
        await observed();
        expect(names()).toHaveLength(4);
        size.scroll = 400;
        size.client = 600;
        await observed();
        expect(names()).toHaveLength(5);
      });
    });

    it('keeps head and tab bar outside the content area', async () => {
      const { box, visit, area } = manyHouses(2);
      await visit();
      expect(area()?.querySelector('.tabs')).toBeNull();
      expect(box.root.querySelector('.visit-top .tabs')).not.toBeNull();
    });
  });

  describe('plunder row', () => {
    const lootCity = (resources: Record<string, number>) => {
      const env = markSetup();
      env.ctx.cities.setVisited(withBuildings(1, [house(5, 1, 'Coins', 0, resources)]));
      const text = () => env.box.root.querySelector('tr.plunder-row td.text') as HTMLElement;
      const lines = () => [...text().querySelectorAll('.loot > div')].map((d) => d.textContent);
      return { ...env, text, lines };
    };

    it('shows up to six loot items in the game order, nothing summed', async () => {
      const { text, lines } = lootCity({
        money: 1,
        strategy_points: 2,
        supplies: 3,
        population: 4,
        medals: 5,
        premium: 6,
      });
      await tick();
      expect(lines()).toHaveLength(6);
      expect(lines()[0]).toMatch(/^1 /);
      expect(lines()[5]).toMatch(/^6 /);
      expect(text().textContent).not.toContain('weitere');
    });

    it('shows five items and a muted count in the last place beyond six, the whole loot in the tooltip', async () => {
      const { text, lines } = lootCity({
        money: 1,
        strategy_points: 2,
        supplies: 3,
        population: 4,
        medals: 5,
        premium: 6,
        guild_championship: 7,
      });
      await tick();
      expect(lines()).toHaveLength(6);
      expect(lines()[5]).toBe('+2 weitere');
      expect(text().querySelector('.loot > div.muted')?.textContent).toBe('+2 weitere');
      const tip = text().dataset.tip?.split('\n') ?? [];
      expect(tip[0]).toBe('Münzhaus');
      expect(tip).toHaveLength(8);
    });

    it('names the era of a good in the tooltip, not in the row', async () => {
      const { text, lines, ctx } = lootCity({ wine: 5, money: 1 });
      ctx.catalog.setResourceNames({ wine: 'Wein' });
      ctx.catalog.setGoodEras({ wine: eraId('BronzeAge') });
      ctx.catalog.setEras([{ id: eraId('BronzeAge'), name: 'Bronzezeit' }]);
      ctx.cities.setVisited(withBuildings(1, [house(5, 1, 'Coins', 0, { wine: 5, money: 1 })]));
      await tick();
      expect(lines()[0]).toBe('5 Wein');
      expect(text().dataset.tip?.split('\n').slice(1)).toEqual(['5 Wein (Bronzezeit)', '1 Münzen']);
    });

    it('puts the loot tip on the text and the pin tip on the pin', async () => {
      const { box, text } = lootCity({ money: 1 });
      await tick();
      expect(text().dataset.tip?.split('\n')).toHaveLength(2);
      expect(text().dataset.tip).toMatch(/^Münzhaus\n1 /);
      expect((box.root.querySelector('td.mark') as HTMLElement).dataset.tip).toBe(
        'Im Spiel mit einer Stecknadel zeigen',
      );
    });

    it('draws the building image in a fixed frame', async () => {
      const env = setup({ '/city/buildings/R_SS_Test.png': 'abc' });
      env.ctx.catalog.add({ ...houseDef('Coins', 'Münzhaus'), assetId: 'R_Test' });
      env.ctx.cities.setVisited(withBuildings(1, [house(5, 1, 'Coins', 0, { money: 1 })]));
      await tick();
      await env.ctx.assets.load('https://foede.innogamescdn.com/cache/ForgeHX-1.js');
      expect(env.box.root.querySelector('td.img .frame img')).not.toBeNull();
    });
  });
});
