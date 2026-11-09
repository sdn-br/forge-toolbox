import { describe, expect, it } from 'vitest';
import { knownRowOf, ownDepositGrowth, ownRankedFp } from '../src/content/domain/gb-known-row';
import type { Construction, RankingRow } from '../src/content/model/great-building';
import type { BuildingDefId } from '../src/shared/ids';
import { playerId, worldId } from '../src/shared/ids';

const world = worldId('de20');
const other = (rank: number, fp: number): RankingRow => ({ rank, name: `P${rank}`, self: false, fp });
const me = (rank: number | undefined, fp: number, reward?: number): RankingRow => ({
  ...(rank !== undefined && { rank }),
  name: 'Ich',
  self: true,
  fp,
  ...(reward !== undefined && { reward: { fp: reward } as RankingRow['reward'] }),
});

const open = (rankings: RankingRow[], extra: Partial<Construction> = {}): Construction => ({
  owner: playerId(7),
  entityId: 12,
  own: false,
  entity: {
    owner: playerId(7),
    entityId: 12,
    def: 'X_Gb' as BuildingDefId,
    level: 3,
    maxLevel: 10,
    invested: 40,
    required: 100,
    connected: true,
  },
  rankings,
  seenAt: 500,
  ...extra,
});

describe('ownRankedFp', () => {
  it('reads the own ranked place and is 0 without one', () => {
    expect(ownRankedFp([other(1, 30), me(2, 20)])).toBe(20);
    expect(ownRankedFp([other(1, 30), me(undefined, 20)])).toBe(0);
    expect(ownRankedFp([])).toBe(0);
  });

  it('measures the growth of the own deposit', () => {
    expect(ownDepositGrowth([me(2, 20)], [me(1, 50)])).toBe(30);
    expect(ownDepositGrowth([other(1, 9)], [me(1, 50)])).toBe(50);
  });
});

describe('knownRowOf', () => {
  it('builds the row with the sum of the rankings and the building as the opening told it', () => {
    const row = knownRowOf(open([other(1, 30), other(2, 10)]), world, 900);
    expect(row).toMatchObject({
      world,
      owner: 7,
      entityId: 12,
      cityEntityId: 'X_Gb',
      level: 3,
      invested: 40,
      rankingsLevel: 3,
      rankingsAt: 500,
      rankingsInvested: 40,
      growthBase: 40,
      seenAt: 900,
    });
    expect(row).not.toHaveProperty('ownContribution');
  });

  it('adds the own contribution from a ranked own place', () => {
    const row = knownRowOf(open([other(1, 30), me(2, 20, 4)], { rankingsLevel: 2 }), world, 900);
    expect(row).toMatchObject({
      rankingsLevel: 2,
      ownContribution: true,
      contribution: { rank: 2, forgePoints: 20, reward: 4, at: 900 },
    });
  });

  it('gives no row for an own building or one without an entity', () => {
    expect(knownRowOf(open([], { own: true }), world, 1)).toBeUndefined();
    expect(knownRowOf(open([], { entity: undefined }), world, 1)).toBeUndefined();
  });
});
