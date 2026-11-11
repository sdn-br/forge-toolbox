import { describe, expect, it } from 'vitest';
import { type OwnerShare, type SnipeHit, snipeRatio } from '../src/content/domain/gb-snipe';
import { hitSortKeys, hitVm, ownerShareNote, snipeNotes } from '../src/content/ui/snipe-hit';
import { buildingDefId, playerId } from '../src/shared/ids';

const DAY = 86_400_000;

const share = (s: OwnerShare) => s;

const hit = (ownerShare: OwnerShare, over: Partial<SnipeHit> = {}): SnipeHit => ({
  owner: playerId(1001),
  entityId: 1,
  def: buildingDefId('X_HighMiddleAge_Landmark1'),
  level: 50,
  invested: 400,
  required: 800,
  tier: 'exact',
  place: { rank: 1, cost: 200, profit: 285 },
  profitLow: 285,
  profitHigh: 285,
  maybeLocked: false,
  seenAt: 0,
  ownerShare,
  ...over,
});

describe('ownerShareNote, the share of the owner in the progress tooltip', () => {
  it('names a current share', () => {
    expect(ownerShareNote(share({ state: 'current', fp: 3_200 }), 0)).toBe('Eigenanteil: 3.200 FP');
  });

  it('names a stale share with the age of its ranking', () => {
    expect(ownerShareNote(share({ state: 'stale', fp: 320, at: 0 }), 2 * DAY)).toBe(
      'Eigenanteil: 320 FP, Stand vor 2 T.',
    );
  });

  it('leaves the line out for an unknown share', () => {
    expect(ownerShareNote(share({ state: 'unknown' }), 0)).toBeUndefined();
  });

  it('is no longer a note of the row', () => {
    expect(snipeNotes(hit({ state: 'current', fp: 5 }, { maybeLocked: true }))).toEqual(['eventuell gesperrt']);
  });
});

describe('profit per Forge point paid in', () => {
  const unknown = share({ state: 'unknown' });

  it('divides the profit of the place by its stake, 20 on 100 is 0,20, without a range when exact', () => {
    const exact = hit(unknown, { place: { rank: 2, cost: 100, profit: 20 }, profitLow: 20, profitHigh: 20 });
    expect(snipeRatio(exact)).toEqual({ low: 0.2, high: 0.2 });
    expect(hitVm(exact)).toMatchObject({ ratio: '0,20' });
    expect(hitVm(exact)).not.toHaveProperty('ratioRange');
  });

  it('shows the best case and the range from the worst case, from nothing when the worst case has no place', () => {
    const safe = hit(unknown, {
      tier: 'safe',
      place: { rank: 1, cost: 200, profit: 60 },
      worst: { rank: 2, cost: 400, profit: 20 },
      profitLow: 20,
      profitHigh: 60,
    });
    expect(hitVm(safe)).toMatchObject({ ratio: '0,30', ratioRange: 'Gewinn je FP 0,05 bis 0,30' });
    const possible = hit(unknown, {
      tier: 'possible',
      place: { rank: 1, cost: 12, profit: 16 },
      profitLow: 0,
      profitHigh: 16,
    });
    expect(hitVm(possible)).toMatchObject({ ratio: '1,33', ratioRange: 'Gewinn je FP 0,00 bis 1,33' });
  });

  it('sorts by the best case, the worst case breaking ties', () => {
    const key = hitSortKeys<SnipeHit>(
      (h) => h,
      (h) => h,
    ).ratio;
    const a = hit(unknown, {
      place: { rank: 1, cost: 100, profit: 30 },
      worst: { rank: 1, cost: 100, profit: 10 },
      profitLow: 10,
      profitHigh: 30,
    });
    const b = hit(unknown, { place: { rank: 1, cost: 100, profit: 30 }, profitLow: 30, profitHigh: 30 });
    const c = hit(unknown, { place: { rank: 1, cost: 400, profit: 40 }, profitLow: 40, profitHigh: 40 });
    expect((key(b) ?? 0) > (key(a) ?? 0)).toBe(true);
    expect((key(a) ?? 0) > (key(c) ?? 0)).toBe(true);
  });
});
