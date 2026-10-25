import { describe, expect, it } from 'vitest';
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
import type { KnownGreatBuilding } from '../src/shared/model';

// HighMiddleAge on level 50 pays 485, 245, 80, 20, 5 FP on places 1 to 5 (the table of the level preview)
const def: GreatBuildingDef = { era: 'HighMiddleAge', levelCosts: Array(10).fill(1000) };
const DEF_ID = buildingDefId('X_HighMiddleAge_Landmark1');
const OTHER_DEF = buildingDefId('X_Unknown_Landmark1');
const ME = playerId(1);
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
const defNames: Record<string, string> = { [DEF_ID]: 'Kathedrale von Aachen', [OTHER_DEF]: 'Leuchtturm' };

const candidates = (buildings: KnownGreatBuilding[]) =>
  possibleInvestments(buildings, (d) => (d === DEF_ID ? def : undefined), 0, ME);

const vm = (buildings: KnownGreatBuilding[], filter: Partial<PossibleFilter> = {}, sort?: PossibleSort) =>
  possibleViewModel({
    candidates: candidates(buildings),
    filter: { ...DEFAULT_FILTER, ...filter },
    sort: sort ?? DEFAULT_POSSIBLE_SORT,
    now: NOW,
    greatBuildingName: (d: BuildingDefId) => defNames[d],
    playerName: (id: PlayerId) => names[id],
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
    expect(v.count).toBe('2 Treffer von 4 LGs');
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
      hit: { rank: 1, cost: '200', profit: '+45 … +285', estimate: false, tier: 'safe' },
      notes: ['Im schlechtesten Fall: P2 mit 200 FP, Gewinn +45'],
      // the largest unit only
      age: 'vor 3 Std.',
    });
  });

  it('marks a building without deposits as maybe locked', () => {
    const [row] = vm([building({ invested: 0 })]).rows;
    expect(row?.notes).toContain('eventuell gesperrt');
  });

  it('without "nur Treffer" shows the rows without a place, empty and last', () => {
    const v = vm([none, safe, possible], { onlyHits: false });
    expect(v.rows.map((r) => r.entityId)).toEqual([1, 2, 3]);
    expect(v.rows[2]?.hit).toBeUndefined();
    // last also in the other direction
    const up = vm([none, safe, possible], { onlyHits: false }, { column: 'profit', desc: false });
    expect(up.rows.map((r) => r.entityId)).toEqual([2, 1, 3]);
  });

  it('filters by a part of the owner and of the building name, ignoring case; the count follows', () => {
    const all = [safe, possible, none, unknown];
    expect(vm(all, { player: 'ber', onlyHits: false }).rows.map((r) => r.entityId)).toEqual([2]);
    expect(vm(all, { name: ' leucht', onlyHits: false }).rows.map((r) => r.entityId)).toEqual([4]);
    expect(vm(all, { player: 'carla' }).count).toBe('0 Treffer von 2 LGs');
  });

  it('sorts by a clicked column, names from the top, numbers from the largest', () => {
    const owner = nextSort(DEFAULT_POSSIBLE_SORT, 'owner', POSSIBLE_DESC_FIRST);
    expect(owner).toEqual({ column: 'owner', desc: false });
    expect(vm([possible, none, safe], { onlyHits: false }, owner).rows.map((r) => r.ownerName)).toEqual([
      'Anna',
      'Bert',
      'Carla',
    ]);
    expect(nextSort(owner, 'owner', POSSIBLE_DESC_FIRST)).toEqual({ column: 'owner', desc: true });
    expect(nextSort(owner, 'seen', POSSIBLE_DESC_FIRST)).toEqual({ column: 'seen', desc: true });
    const tier = vm([possible, safe], {}, { column: 'tier', desc: true });
    expect(tier.rows.map((r) => r.hit?.tier)).toEqual(['safe', 'possible']);
  });

  it('tells when no building of another player is known', () => {
    const v = vm([]);
    expect(v.empty).toBe(true);
    expect(v.rows).toEqual([]);
  });
});
