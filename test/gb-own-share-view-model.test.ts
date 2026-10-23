import { describe, expect, it } from 'vitest';
import type { PlaceFactorState } from '../src/content/features/gb-own-share/place-factors';
import { DEFAULT_COPY, type OwnShareVm, ownShareViewModel } from '../src/content/features/gb-own-share/view-model';
import type { Construction, RankingRow } from '../src/content/stores/great-building-model';
import type { FactorChoice } from '../src/content/ui/factor-bar';
import type { BuildingDefId, PlayerId } from '../src/shared/ids';

const place = (rank: number, net: number): RankingRow => ({
  rank,
  name: 'Noch kein Mäzen',
  self: false,
  reward: { fp: net, blueprints: 0, medals: 0 },
});
const construction: Construction = {
  owner: 1 as PlayerId,
  entityId: 7,
  own: true,
  entity: {
    owner: 1 as PlayerId,
    entityId: 7,
    def: 'X_Arc' as BuildingDefId,
    level: 10,
    maxLevel: 80,
    invested: 0,
    required: 1000,
    connected: true,
  },
  rankings: [{ name: 'Ich', self: true, fp: 0 }, ...[100, 50, 20, 10, 0].map((net, i) => place(i + 1, net))],
  seenAt: 0,
};

const fixed = (value: number): FactorChoice => ({ value, arc: false });
const ARC: FactorChoice = { value: 90, arc: true };

function vm(choices: FactorChoice[], arcBonus?: number, status: PlaceFactorState['status'] = 'standard') {
  const result = ownShareViewModel({
    construction,
    openedLevel: 10,
    greatBuildingName: () => 'Arche',
    factors: { choices, status, canSave: false, canReset: false, canAdopt: false },
    factorButtons: [80, 90, 100],
    arcBonus,
    secureExisting: true,
    trust: false,
    oneFpForNoReward: true,
    exts: [],
    copy: DEFAULT_COPY,
  });
  return result as Extract<OwnShareVm, { kind: 'current' }>;
}
const places = (v: ReturnType<typeof vm>) =>
  v.rows.flatMap((r) => (r.kind === 'place' ? [{ ask: r.place.ask, factor: r.factor, arc: r.arc }] : []));
const active = (v: ReturnType<typeof vm>) => v.factorButtons.filter((b) => b.active).map((b) => b.value);

describe('the view model of the five factors', () => {
  it('asks each place at its own factor and gives it a field, but not a place without a reward', () => {
    const v = vm([fixed(100), fixed(90), fixed(80), fixed(90), fixed(90)]);
    expect(places(v)).toEqual([
      { ask: 200, factor: 100, arc: false },
      { ask: 95, factor: 90, arc: false },
      { ask: 36, factor: 80, arc: false },
      { ask: 19, factor: 90, arc: false },
      { ask: 1, factor: undefined, arc: undefined },
    ]);
  });

  it('marks a button active only when all five places hold its value', () => {
    expect(active(vm(Array(5).fill(fixed(100))))).toEqual([100]);
    expect(active(vm([fixed(100), ...Array(4).fill(fixed(90))]))).toEqual([]);
    expect(active(vm(Array(5).fill(ARC), 95.5))).toEqual([95.5]);
    // a fixed 95.5 is not the Arc button
    expect(active(vm([fixed(95.5), ...Array(4).fill(ARC)], 95.5))).toEqual([]);
  });

  it('lets a place saved as Arc follow the bonus', () => {
    const choices = [ARC, ...Array(4).fill(fixed(90))];
    expect(places(vm(choices, 95.5))[0]).toEqual({ ask: 196, factor: 95.5, arc: true });
    expect(places(vm(choices, 100))[0]).toEqual({ ask: 200, factor: 100, arc: true });
  });

  it('passes the status on', () => {
    expect(vm(Array(5).fill(fixed(90)), undefined, 'saved').factorState.status).toBe('saved');
  });
});
