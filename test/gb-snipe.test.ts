import { describe, expect, it } from 'vitest';
import { ownerShare, snipeBuilding, snipeList } from '../src/content/domain/gb-snipe';
import type { GreatBuildingDef } from '../src/content/stores/catalog';
import type { RankingRow } from '../src/content/stores/great-building-model';
import { buildingDefId, playerId, worldId } from '../src/shared/ids';
import type { KnownGreatBuilding } from '../src/shared/model';

// HighMiddleAge on level 50 pays 485, 245, 80, 20, 5 FP on places 1 to 5 (the table of the level preview)
const def: GreatBuildingDef = { era: 'HighMiddleAge', levelCosts: Array(10).fill(1000) };
const DEF_ID = buildingDefId('X_HighMiddleAge_Landmark1');

const building = (over: Partial<KnownGreatBuilding> = {}): KnownGreatBuilding => ({
  world: worldId('de20'),
  owner: playerId(1001),
  entityId: 1,
  cityEntityId: DEF_ID,
  level: 50,
  invested: 0,
  required: 800,
  seenAt: 1_000,
  ...over,
});

const owner = (fp: number): RankingRow => ({ name: 'Eigentümer', self: false, fp });
const place = (rank: number, fp?: number): RankingRow => ({
  rank,
  name: fp === undefined ? 'Noch kein Mäzen' : `Spieler ${rank}`,
  self: false,
  ...(fp !== undefined && { fp }),
  reward: { fp: 1, blueprints: 0, medals: 0 },
});
/** a stored ranking of level 50 */
const ranking = (ownerFp: number, ...holders: number[]): Partial<KnownGreatBuilding> => ({
  rankings: [owner(ownerFp), ...[1, 2, 3, 4, 5].map((r) => place(r, holders[r - 1]))],
  rankingsLevel: 50,
  rankingsAt: 900,
  rankingsInvested: ownerFp + holders.reduce((a, b) => a + b, 0),
});

const run = (b: KnownGreatBuilding, arc = 0) => snipeBuilding(b, def, arc);

describe('snipeBuilding', () => {
  it('leaves out a building with an own contribution, before anything else', () => {
    expect(snipeBuilding(building({ ownContribution: true }), undefined, 0)).toBe('ownContribution');
  });

  it('counts a building without a definition or with a level no table reaches as unknown reward', () => {
    expect(snipeBuilding(building(), undefined, 0)).toBe('unknownReward');
    expect(run(building({ level: 600 }))).toBe('unknownReward');
  });

  it('without a ranking takes the best case as empty and the worst as one holder with everything', () => {
    const hit = run(building({ invested: 400 }));
    expect(hit).toMatchObject({
      tier: 'safe',
      // best: the owner paid all, rest 400, place 1 safe at 200; worst: one holder with 400 has place 1 secured,
      // place 2 is safe at 200
      place: { rank: 1, cost: 200, profit: 285 },
      worst: { rank: 2, cost: 200, profit: 45 },
      profitLow: 45,
      profitHigh: 285,
      maybeLocked: false,
      estimate: false,
    });
  });

  it('is only possible when the worst case pays no place', () => {
    const hit = run(building({ invested: 2_000, required: 2_950 }));
    expect(hit).toMatchObject({
      tier: 'possible',
      place: { rank: 1, cost: 475, profit: 10 },
      profitLow: 0,
      profitHigh: 10,
    });
    expect(hit).not.toHaveProperty('worst');
  });

  it('has no hit for a place with a loss, even one cheaper than paying it at a factor', () => {
    // place 1 is safe at 500 for 485: a loss of 15, though below 485 at 1.9
    expect(run(building({ invested: 0, required: 1_000 }))).toBe('none');
  });

  it('has no hit when not even the best case pays a place', () => {
    expect(run(building({ invested: 400, required: 6_000 }))).toBe('none');
  });

  it('is exact with a ranking of the same level and the same sum', () => {
    // owner 100, place 1 holds 300, rest 400: place 1 safe at 350, place 2 at 200
    const hit = run(building({ invested: 400, ...ranking(100, 300) }));
    expect(hit).toMatchObject({
      tier: 'exact',
      place: { rank: 1, cost: 350, profit: 135 },
      profitLow: 135,
      profitHigh: 135,
    });
    expect(hit).not.toHaveProperty('worst');
  });

  it('puts the new deposits on the owner at best and on the strongest holder at worst', () => {
    // 400 on place 1 of 1.000 in all, now 1.300: the holder has between 400 and 700 (rest 1.700, a rich Arc bonus keeps place 1 best)
    const hit = run(building({ invested: 1_300, required: 3_000, ...ranking(600, 400) }), 1000);
    expect(hit).toMatchObject({
      tier: 'safe',
      // (400 + 1.700) / 2 with the holder as ranked, (700 + 1.700) / 2 with all new deposits on him
      place: { rank: 1, cost: 1_050 },
      worst: { rank: 1, cost: 1_200 },
    });
  });

  it('uses the ranking of another level as no ranking', () => {
    const stale = building({ invested: 400, ...ranking(100, 300), rankingsLevel: 49 });
    expect(run(stale)).toEqual(run(building({ invested: 400 })));
  });

  it('flags a building with nothing paid in as maybe locked', () => {
    expect(run(building({ invested: 0 }))).toMatchObject({ maybeLocked: true });
  });

  it('blocks a building at the unlocked maximum level and a not connected one', () => {
    expect(run(building({ invested: 400, maxLevel: 50 }))).toBe('none');
    expect(run(building({ invested: 400, connected: false }))).toBe('none');
  });

  it('rates a level beyond the listed costs with the rewards of the table', () => {
    const hit = run(building({ level: 200, invested: 400 }));
    expect(hit).toMatchObject({ level: 200, estimate: false });
  });
});

describe('snipeList', () => {
  it('sorts the hits by profit and counts what it leaves out', () => {
    const list = snipeList({
      buildings: [
        building({ entityId: 1, invested: 400 }),
        building({ entityId: 2, invested: 400, ...ranking(100, 300) }),
        building({ entityId: 3, invested: 400, required: 6_000 }),
        building({ entityId: 4, ownContribution: true }),
        building({ entityId: 5, cityEntityId: buildingDefId('unknown') }),
      ],
      greatBuilding: (id) => (id === DEF_ID ? def : undefined),
      arcBonus: 0,
    });
    expect(list.hits.map((h) => [h.entityId, h.profitHigh])).toEqual([
      [1, 285],
      [2, 135],
    ]);
    expect(list).toMatchObject({ none: 1, ownContribution: 1, unknownReward: 1 });
  });
});

describe('ownerShare', () => {
  const OWNER = playerId(1001);
  const ownerRow = (fp: number | undefined, over: Partial<RankingRow> = {}): RankingRow => ({
    name: 'Eigentümer',
    self: false,
    ...(fp !== undefined && { fp }),
    ...over,
  });

  it('is current for a ranking of the level whose sum is the progress', () => {
    expect(ownerShare(building({ invested: 400, ...ranking(100, 300) }))).toEqual({ state: 'current', fp: 100 });
  });

  it('is stale, with the time of the ranking, when the progress moved since', () => {
    expect(ownerShare(building({ invested: 450, ...ranking(100, 300) }))).toEqual({
      state: 'stale',
      fp: 100,
      at: 900,
    });
  });

  it('dates a stale share by the sight of the building when the ranking carries no time', () => {
    const b = building({ invested: 450, ...ranking(100, 300), rankingsAt: undefined, seenAt: 1_234 });
    expect(ownerShare(b)).toEqual({ state: 'stale', fp: 100, at: 1_234 });
  });

  it('is unknown without a ranking or with one of another level', () => {
    expect(ownerShare(building({ invested: 400 }))).toEqual({ state: 'unknown' });
    expect(ownerShare(building({ invested: 400, ...ranking(100, 300), rankingsLevel: 49 }))).toEqual({
      state: 'unknown',
    });
  });

  it('is 0 when the owner row has no points', () => {
    const b = building({ invested: 300, ...ranking(0, 300), rankings: [ownerRow(undefined), place(1, 300)] });
    expect(ownerShare(b)).toEqual({ state: 'current', fp: 0 });
  });

  it('is 0 when the ranking has no owner row at all', () => {
    const b = building({ invested: 300, ...ranking(0, 300), rankings: [place(1, 300)] });
    expect(ownerShare(b)).toEqual({ state: 'current', fp: 0 });
  });

  it('finds the owner row by player id, whatever its rank, before the row without a rank', () => {
    const b = building({
      invested: 400,
      ...ranking(100, 300),
      rankings: [ownerRow(100, { player: OWNER, rank: 2 }), ownerRow(7), place(1, 300)],
    });
    expect(ownerShare(b)).toEqual({ state: 'current', fp: 100 });
  });
});
