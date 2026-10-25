import { beforeEach, describe, expect, it } from 'vitest';
import { possibleInvestments } from '../src/content/domain/investments';
import {
  DEFAULT_FILTER,
  DEFAULT_POSSIBLE_SORT,
  POSSIBLE_DESC_FIRST,
  type PossibleFilter,
  type PossibleSort,
  possibleViewModel,
} from '../src/content/features/investments/possible-view-model';
import type { GreatBuildingDef } from '../src/content/stores/catalog';
import { nextSort } from '../src/content/ui/sortable';
import { type BuildingDefId, buildingDefId, type PlayerId, playerId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding, Relations } from '../src/shared/model';

// HighMiddleAge on level 50 pays 485, 245, 80, 20, 5 FP on places 1 to 5 (the table of the level preview)
const def: GreatBuildingDef = { era: 'HighMiddleAge', levelCosts: Array(10).fill(1000) };
const DEF_ID = buildingDefId('X_HighMiddleAge_Landmark1');
const OTHER_DEF = buildingDefId('X_Unknown_Landmark1');
const ME = playerId(1);
const EVERY = { neighbor: true, friend: true, guildMember: true, none: true };
const HOUR = 3_600_000;
const NOW = 100 * HOUR;

const building = (over: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
  world: worldId('de20'),
  owner: playerId(1001),
  entityId: 1,
  cityEntityId: DEF_ID,
  level: 50,
  invested: 0,
  required: 800,
  seenAt: NOW,
  ...over,
});

const names: Record<number, string> = { 1001: 'Anna', 1002: 'Bert', 1003: 'Carla' };
const NONE: Relations = { neighbor: false, guildMember: false, friend: false };
/** Anna a neighbour, Bert and Carla friends; others unknown */
let relations: Record<number, Relations> = {};
/** marked buildings as "owner:entity", marked owners by id */
let markedBuildings = new Set<string>();
let markedOwners = new Set<number>();
beforeEach(() => {
  markedBuildings = new Set();
  markedOwners = new Set();
  relations = { 1001: { ...NONE, neighbor: true }, 1002: { ...NONE, friend: true }, 1003: { ...NONE, friend: true } };
});
const defNames: Record<string, string> = { [DEF_ID]: 'Kathedrale von Aachen', [OTHER_DEF]: 'Leuchtturm' };

const candidates = (buildings: KnownGreatBuilding[]) =>
  possibleInvestments(buildings, (d) => (d === DEF_ID ? def : undefined), 0, ME);

const vm = (buildings: KnownGreatBuilding[], filter: Partial<PossibleFilter> = {}, sort?: PossibleSort) =>
  possibleViewModel({
    visible: 100,
    candidates: candidates(buildings),
    filter: { ...DEFAULT_FILTER, ...filter },
    sort: sort ?? DEFAULT_POSSIBLE_SORT,
    now: NOW,
    greatBuildingName: (d: BuildingDefId) => defNames[d],
    playerName: (id: PlayerId) => names[id],
    relations: (id: PlayerId) => relations[id],
    isMarked: (owner: PlayerId, entityId: number) => markedBuildings.has(`${owner}:${entityId}`),
    ownerMarked: (id: PlayerId) => markedOwners.has(id),
    playerUrl: (id: PlayerId) => `https://foestats.example/${id}`,
  });

/** pays place 1 in both cases: safe, +45 to +285 */
const safe = building({ entityId: 1, invested: 400 });
/** pays place 1 only in the best case: possible, 0 to +10 */
const possible = building({ owner: playerId(1002), entityId: 2, invested: 2_000, required: 2_950 });
/** no place pays */
const none = building({ owner: playerId(1003), entityId: 3, invested: 400, required: 6_000 });
/** rewards unknown */
const unknown = building({ owner: playerId(1003), entityId: 4, cityEntityId: OTHER_DEF });

describe('possibleInvestments', () => {
  it('rates every building of others and leaves out the own ones and those with an own contribution', () => {
    const rows = candidates([
      safe,
      none,
      unknown,
      building({ owner: ME, entityId: 9, invested: 400 }),
      building({ entityId: 10, invested: 400, ownContribution: true }),
    ]);
    expect(rows.map((r) => [r.building.entityId, r.hit?.tier])).toEqual([
      [1, 'safe'],
      [3, undefined],
      [4, undefined],
    ]);
  });
});

describe('possibleViewModel', () => {
  it('shows only hits by default, the best profit on top, and counts hits of all buildings', () => {
    const v = vm([possible, none, safe, unknown]);
    expect(v.rows.map((r) => r.entityId)).toEqual([1, 2]);
    expect(v.count).toBe('2 mit Gewinn von 4 LGs');
    expect(v.empty).toBe(false);
  });

  it('builds a row like the snipe helper: place, stake, profit range, tier, worst case in the tooltip', () => {
    const [row] = vm([building({ invested: 400, seenAt: NOW - 3 * HOUR - 40 * 60_000 })]).rows;
    expect(row).toMatchObject({
      ownerName: 'Anna',
      ownerUrl: 'https://foestats.example/1001',
      name: 'Kathedrale von Aachen',
      level: 50,
      invested: '400',
      required: '800',
      rest: '400',
      percent: 50,
      // the cell shows the best case, the range goes to its tooltip
      hit: { rank: 1, cost: '200', profit: '+285', range: 'Gewinn +45 bis +285', estimate: false, tier: 'safe' },
      notes: ['Im schlechtesten Fall: P2 mit 200 FP, Gewinn +45'],
      // the largest unit only
      age: 'vor 3 Std.',
    });
  });

  it('marks a building without deposits as maybe locked', () => {
    const [row] = vm([building({ invested: 0 })]).rows;
    expect(row?.notes).toContain('eventuell gesperrt');
  });

  it('without "nur mit Gewinn" shows the rows without a place, empty and last', () => {
    const v = vm([none, safe, possible], { onlyHits: false });
    expect(v.rows.map((r) => r.entityId)).toEqual([1, 2, 3]);
    expect(v.rows[2]?.hit).toBeUndefined();
    // last also in the other direction
    const up = vm([none, safe, possible], { onlyHits: false }, [{ column: 'profit', desc: false }]);
    expect(up.rows.map((r) => r.entityId)).toEqual([2, 1, 3]);
  });

  it('filters by the tier: a row passes when its tier is on, rows without a tier are not touched, the count follows', () => {
    const all = [safe, possible, none, unknown];
    const tiers = (tier: Partial<PossibleFilter['tier']>, onlyHits = true) =>
      vm(all, { onlyHits, tier: { exact: true, safe: true, possible: true, ...tier } });
    expect(tiers({}).rows.map((r) => r.entityId)).toEqual([1, 2]);
    expect(tiers({ safe: false }).rows.map((r) => r.entityId)).toEqual([2]);
    expect(tiers({ possible: false }).rows.map((r) => r.entityId)).toEqual([1]);
    expect(tiers({ safe: false, possible: false }).rows).toEqual([]);
    expect(tiers({ safe: false }).count).toBe('1 mit Gewinn von 3 LGs');
    // the rows without a place stay, whatever the tiers say
    expect(tiers({ safe: false, possible: false }, false).rows.map((r) => r.entityId)).toEqual([3, 4]);
  });

  it('filters by a part of the owner and of the building name, ignoring case; the count follows', () => {
    const all = [safe, possible, none, unknown];
    expect(vm(all, { player: 'ber', onlyHits: false }).rows.map((r) => r.entityId)).toEqual([2]);
    expect(vm(all, { name: ' leucht', onlyHits: false }).rows.map((r) => r.entityId)).toEqual([4]);
    expect(vm(all, { player: 'carla' }).count).toBe('0 mit Gewinn von 2 LGs');
  });

  it('sorts by a clicked column, names from the top, numbers from the largest', () => {
    const owner = nextSort(DEFAULT_POSSIBLE_SORT, 'owner', POSSIBLE_DESC_FIRST);
    expect(owner).toEqual([{ column: 'owner', desc: false }]);
    expect(vm([possible, none, safe], { onlyHits: false }, owner).rows.map((r) => r.ownerName)).toEqual([
      'Anna',
      'Bert',
      'Carla',
    ]);
    expect(nextSort(owner, 'owner', POSSIBLE_DESC_FIRST)).toEqual([{ column: 'owner', desc: true }]);
    expect(nextSort(owner, 'seen', POSSIBLE_DESC_FIRST)).toEqual([{ column: 'seen', desc: true }]);
    const tier = vm([possible, safe], {}, [{ column: 'tier', desc: true }]);
    expect(tier.rows.map((r) => r.hit?.tier)).toEqual(['safe', 'possible']);
  });

  it('tells when no building of another player is known', () => {
    const v = vm([]);
    expect(v.empty).toBe(true);
    expect(v.rows).toEqual([]);
  });

  it('names the first reason in the cell by a fixed order and every reason in the tooltip', () => {
    relations[1001] = { neighbor: true, guildMember: true, friend: true };
    relations[1002] = { ...NONE, guildMember: true };
    const v = vm([safe, possible]);
    expect(v.rows.map((r) => [r.reach, r.reachTip])).toEqual([
      ['neighbor', 'Nachbar, Freund, Gilde'],
      ['guildMember', 'Gilde'],
    ]);
  });

  it('leaves out owners out of reach by default; without the filter they show as such', () => {
    relations[1002] = NONE;
    expect(vm([safe, possible]).rows.map((r) => r.entityId)).toEqual([1]);
    const all = vm([safe, possible], { reach: EVERY });
    expect(all.rows.map((r) => [r.entityId, r.reach, r.reachTip])).toEqual([
      [1, 'neighbor', 'Nachbar'],
      [2, 'none', 'keine Beziehung, nicht erreichbar'],
    ]);
  });

  it('passes a row when any of its reasons is switched on, an unreachable one when "none" is', () => {
    relations[1001] = { ...NONE, neighbor: true, guildMember: true };
    relations[1002] = { ...NONE, friend: true };
    relations[1003] = NONE;
    const three = { ...safe, entityId: 3, owner: playerId(1003) };
    const ids = (reach: Partial<typeof EVERY>) =>
      vm([safe, possible, three], { reach: { ...EVERY, ...reach } })
        .rows.map((r) => r.entityId)
        .sort();
    expect(ids({})).toEqual([1, 2, 3]);
    expect(ids({ none: false })).toEqual([1, 2]);
    expect(ids({ none: false, neighbor: false })).toEqual([1, 2]);
    expect(ids({ none: false, neighbor: false, guildMember: false })).toEqual([2]);
    expect(ids({ none: false, friend: false })).toEqual([1]);
    expect(ids({ neighbor: false, friend: false, guildMember: false })).toEqual([3]);
  });

  it('keeps owners the player store does not know with every reason off', () => {
    delete relations[1001];
    const off = { neighbor: false, friend: false, guildMember: false, none: false };
    expect(vm([safe], { reach: off }).rows.map((r) => r.reach)).toEqual(['unknown']);
  });

  it('keeps owners the player store does not know in the filter, marked as unknown', () => {
    delete relations[1001];
    const [row] = vm([safe]).rows;
    expect(row).toMatchObject({ reach: 'unknown', reachTip: 'unbekannt: die Toolbox kennt den Spieler noch nicht' });
  });

  it('counts hits among the buildings the name and reach filters leave', () => {
    relations[1002] = NONE;
    expect(vm([safe, possible, none]).count).toBe('1 mit Gewinn von 2 LGs');
    expect(vm([safe, possible, none], { reach: EVERY }).count).toBe('2 mit Gewinn von 3 LGs');
    expect(vm([safe, possible, none], { onlyHits: false }).count).toBe('1 mit Gewinn von 2 LGs');
  });

  it('sorts by reach: the reachable first, unknown before those out of reach', () => {
    relations[1001] = NONE;
    delete relations[1002];
    const sort = nextSort(DEFAULT_POSSIBLE_SORT, 'reach', POSSIBLE_DESC_FIRST);
    expect(sort).toEqual([{ column: 'reach', desc: false }]);
    const v = vm([safe, possible, none], { onlyHits: false, reach: EVERY }, sort);
    expect(v.rows.map((r) => r.reach)).toEqual(['friend', 'unknown', 'none']);
  });
});

describe('marks', () => {
  it('carries the star of each building and sorts the marked ones first', () => {
    markedBuildings.add('1002:2');
    const v = vm([safe, possible], { onlyHits: false, reach: EVERY });
    expect(v.rows.map((r) => [r.entityId, r.marked])).toEqual([
      [1, false],
      [2, true],
    ]);
    const sort = nextSort(DEFAULT_POSSIBLE_SORT, 'mark', POSSIBLE_DESC_FIRST);
    expect(sort).toEqual([{ column: 'mark', desc: true }]);
    expect(vm([safe, possible], { onlyHits: false, reach: EVERY }, sort).rows.map((r) => r.entityId)).toEqual([2, 1]);
  });

  it('shows every row by default and only the marked ones with "nur gemerkte"', () => {
    expect(DEFAULT_FILTER.onlyMarked).toBe(false);
    markedBuildings.add('1001:1');
    const all = [safe, possible, none];
    expect(vm(all, { onlyHits: false }).rows).toHaveLength(3);
    expect(vm(all, { onlyHits: false, onlyMarked: true }).rows.map((r) => r.entityId)).toEqual([1]);
  });

  it('lets a marked owner pass with all of its buildings', () => {
    markedOwners.add(1003);
    const all = [safe, none, unknown];
    expect(vm(all, { onlyHits: false, onlyMarked: true }).rows.map((r) => r.entityId)).toEqual([3, 4]);
  });

  it('tells per row whether the owner is marked, for the star beside the name', () => {
    markedOwners.add(1003);
    const rows = vm([safe, none], { onlyHits: false }).rows;
    expect(rows.map((r) => [r.entityId, r.ownerMarked])).toEqual([
      [1, false],
      [3, true],
    ]);
  });

  it('passes a building that is marked and has a marked owner once', () => {
    markedBuildings.add('1003:3');
    markedOwners.add(1003);
    expect(vm([none], { onlyHits: false, onlyMarked: true }).rows).toHaveLength(1);
  });

  it('counts among the buildings the marks filter leaves', () => {
    markedBuildings.add('1001:1');
    expect(vm([safe, possible, none], { onlyMarked: true }).count).toBe('1 mit Gewinn von 1 LGs');
  });
});

describe('possibleViewModel, the owner share (EA)', () => {
  const DAY = 24 * HOUR;
  /** a ranking of level 50 from two days ago: the owner paid `ownerFp`, the holder of place 1 `holder` */
  const ranked = (ownerFp: number, holder: number): Partial<KnownGreatBuilding> => ({
    rankings: [
      { name: 'Eigentümer', self: false, fp: ownerFp },
      { rank: 1, name: 'Spieler 1', self: false, fp: holder, reward: { fp: 1, blueprints: 0, medals: 0 } },
    ],
    rankingsLevel: 50,
    rankingsAt: NOW - 2 * DAY,
    rankingsInvested: ownerFp + holder,
  });
  const current = building({ entityId: 1, invested: 400, ...ranked(320, 80) });
  const stale = building({ owner: playerId(1002), entityId: 2, invested: 500, ...ranked(100, 300) });
  const unknown = building({ owner: playerId(1003), entityId: 3, invested: 400 });
  const all = { onlyHits: false, reach: EVERY };

  it('shows the share plain when current, muted with the age when stale, and "?" when unknown', () => {
    const v = vm([current, stale, unknown], all);
    expect(Object.fromEntries(v.rows.map((r) => [r.entityId, r.share]))).toEqual({
      1: { text: '320', stale: false, tip: '' },
      2: { text: '100', stale: true, tip: 'Stand vor 2 T.' },
      3: { text: '?', stale: false, tip: '' },
    });
  });

  it('sorts by the share from the largest, and unknown goes last in either direction', () => {
    const sort = nextSort(DEFAULT_POSSIBLE_SORT, 'share', POSSIBLE_DESC_FIRST);
    expect(sort).toEqual([{ column: 'share', desc: true }]);
    expect(vm([unknown, stale, current], all, sort).rows.map((r) => r.entityId)).toEqual([1, 2, 3]);
    expect(vm([unknown, stale, current], all, [{ column: 'share', desc: false }]).rows.map((r) => r.entityId)).toEqual([
      2, 1, 3,
    ]);
  });
});
