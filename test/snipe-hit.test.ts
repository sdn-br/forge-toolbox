import { describe, expect, it } from 'vitest';
import type { OwnerShare, SnipeHit } from '../src/content/domain/gb-snipe';
import { snipeNotes } from '../src/content/ui/snipe-hit';
import { buildingDefId, playerId } from '../src/shared/ids';

const DAY = 86_400_000;

const hit = (ownerShare: OwnerShare, over: Partial<SnipeHit> = {}): SnipeHit => ({
  owner: playerId(1001),
  entityId: 1,
  cityEntityId: buildingDefId('X_HighMiddleAge_Landmark1'),
  level: 50,
  invested: 400,
  required: 800,
  tier: 'exact',
  place: { rank: 1, cost: 200, profit: 285 },
  profitLow: 285,
  profitHigh: 285,
  estimate: false,
  maybeLocked: false,
  seenAt: 0,
  ownerShare,
  ...over,
});

describe('snipeNotes, the owner line', () => {
  it('names a current share', () => {
    expect(snipeNotes(hit({ state: 'current', fp: 3_200 }), 0)).toEqual(['Eigentümer: 3.200 FP']);
  });

  it('names a stale share with the age of its ranking', () => {
    expect(snipeNotes(hit({ state: 'stale', fp: 320, at: 0 }), 2 * DAY)).toEqual([
      'Eigentümer: 320 FP, Stand vor 2 T.',
    ]);
  });

  it('leaves the line out for an unknown share', () => {
    expect(snipeNotes(hit({ state: 'unknown' }), 0)).toEqual([]);
  });

  it('comes after the other notes', () => {
    const notes = snipeNotes(hit({ state: 'current', fp: 5 }, { maybeLocked: true }), 0);
    expect(notes).toEqual(['eventuell gesperrt', 'Eigentümer: 5 FP']);
  });
});
