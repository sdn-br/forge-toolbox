import { describe, expect, it } from 'vitest';
import { emptyLevel } from '../src/content/domain/gb-level-preview';
import { calculateOwnShare } from '../src/content/domain/gb-own-share';
import { DEFAULT_COPY } from '../src/content/features/gb-own-share/copy-text';
import {
  MAX_ROWS,
  type PowerLevelInputs,
  type PowerLevelVm,
  powerLevelViewModel,
} from '../src/content/features/gb-power-level/view-model';
import { toBuildingDef } from '../src/content/game/building-defs';
import type { GreatBuildingDef } from '../src/content/model/catalog';
import type { Construction, RankingRow } from '../src/content/model/great-building';
import type { PlaceFactorState } from '../src/content/stores/place-factors';
import type { BuildingDefId, PlayerId } from '../src/shared/ids';
import definitions from './fixtures/gb-definitions.json';

const ROMAN = 'X_EarlyMiddleAge_Landmark1';
const def = (id: string): GreatBuildingDef => {
  const file = definitions.files.find((f) => f.json.id === id);
  const gb = file && toBuildingDef(file.json)?.greatBuilding;
  if (!gb) throw new Error(`no definition ${id}`);
  return gb;
};
const roman = def(ROMAN);
// the recorded production per level 0 to 10: 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6

const LEVEL = 3;
/** the five factors at 90 %, standard */
const factorsOf = (value: number): PlaceFactorState => ({
  choices: Array(5).fill({ value, arc: false }),
  status: 'standard',
  canSave: false,
  canReset: false,
  canAdopt: false,
});
/** what the state module holds for the building, as the box passes it on */
const own = {
  factors: factorsOf(90),
  factorButtons: [80, 90, 100],
  secureExisting: true,
  trust: false,
  exts: [] as number[],
};

/** the open level with the player's 20 on place 2 and a holder with 50 on place 1 */
function rankings(level = LEVEL): RankingRow[] {
  const rows = emptyLevel(roman, level).rankings as RankingRow[];
  return rows.map((r) =>
    r.rank === 1 ? { ...r, name: 'Holder', fp: 50 } : r.rank === 2 ? { ...r, name: 'Ich', self: true, fp: 20 } : r,
  );
}

const construction = (extra: Partial<Construction> = {}, level = LEVEL, maxLevel = 8): Construction => ({
  owner: 1 as PlayerId,
  entityId: 7,
  own: true,
  entity: {
    owner: 1 as PlayerId,
    entityId: 7,
    def: ROMAN as BuildingDefId,
    level,
    maxLevel,
    invested: 70,
    required: emptyLevel(roman, level).required as number,
    connected: true,
  },
  rankings: rankings(level),
  rankingsLevel: level,
  seenAt: 0,
  ...extra,
});

function vm(change: Partial<PowerLevelInputs> = {}): Extract<PowerLevelVm, { kind: 'table' }> {
  const result = powerLevelViewModel({
    construction: construction(),
    greatBuildingName: () => 'Roman',
    greatBuilding: () => roman,
    ...own,
    oneFpForNoReward: true,
    copy: DEFAULT_COPY,
    ...change,
  });
  if (result.kind !== 'table') throw new Error(`no table: ${result.kind}`);
  return result;
}

/** the own share the Eigenanteil box would show for these rankings */
const calcOf = (level: number, real: boolean) => {
  const empty = emptyLevel(roman, level);
  return calculateOwnShare({
    required: empty.required as number,
    rankings: real ? rankings(level) : (empty.rankings as RankingRow[]),
    factor: 90,
    secureExisting: true,
    trust: false,
    oneFpForNoReward: true,
  });
};

describe('the levels of the table', () => {
  it('runs from the open level 10 levels on, one row per construction', () => {
    const t = vm();
    expect(t).toMatchObject({ current: LEVEL, from: LEVEL, to: LEVEL + 10 });
    expect(t.rows.map((r) => [r.level, r.next])).toEqual(
      Array.from({ length: 10 }, (_, i) => [LEVEL + i, LEVEL + i + 1]),
    );
  });

  it('takes the fields, never before the open level and at most 100 rows', () => {
    expect(vm({ from: 1, to: 6 })).toMatchObject({ from: LEVEL, to: 6 });
    expect(vm({ from: 5, to: 4 })).toMatchObject({ from: 5, to: 6 });
    expect(vm({ from: 5, to: 5000 }).rows).toHaveLength(MAX_ROWS);
  });

  it('marks the levels above the unlocked maximum', () => {
    // maximum 8: the construction 7 to 8 is the last one open
    expect(vm({ to: 12 }).rows.map((r) => r.locked)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('own share per row', () => {
  it('uses the real ranking on the open level: what is still open, with what is paid', () => {
    const [first] = vm().rows;
    const calc = calcOf(LEVEL, true);
    expect(first).toMatchObject({ current: true, ownShare: calc.open, paid: 20 });
    expect(calc.open).not.toBe(calcOf(LEVEL, false).open);
    // place 1 is held, so no helper pays there
    expect(first?.places[0]).toBeUndefined();
    expect(first?.places[2]).toEqual({ fp: expect.any(Number), estimate: false });
  });

  it('takes later levels as open and empty, nothing paid', () => {
    const later = vm().rows[2];
    expect(later).toMatchObject({ current: false, ownShare: calcOf(LEVEL + 2, false).open });
    expect(later).not.toHaveProperty('paid');
    expect(later?.places.map((p) => p?.fp)).toEqual(
      calcOf(LEVEL + 2, false).places.map((p) => (p.holder || p.full || p.unoffered ? undefined : p.amount)),
    );
  });

  it('follows the factors per place', () => {
    const cheap = vm({ factors: factorsOf(0) });
    expect(cheap.rows[1]?.places[0]?.fp).toBeLessThan(vm().rows[1]?.places[0]?.fp as number);
  });

  it('marks payments from estimated rewards', () => {
    // past the listed rewards of the era (level 400 for this one) the first place comes from the curve
    const far = vm({ construction: construction({}, 400, 500) });
    expect(far.estimate).toBe(true);
    // the open level has the game's rewards, the later ones are computed
    expect(far.rows[0]?.places.find(Boolean)?.estimate).toBe(false);
    expect(far.rows[1]?.places.find(Boolean)?.estimate).toBe(true);
    expect(vm().estimate).toBe(false);
  });
});

describe('double harvest', () => {
  const harvests = (t: ReturnType<typeof vm>) => t.rows.map((r) => r.harvest);

  it('is exact for the level being built from the open construction', () => {
    const nextProduction = { level: LEVEL, type: 'strategy_points', value: 77 };
    const t = vm({ construction: construction({ nextProduction }) });
    expect(t.rows[0]?.harvest).toEqual({ fp: 77, estimate: false });
    expect(t.rows[1]?.harvest).toEqual({ fp: 3, estimate: false });
  });

  it('has no column for buildings without Forge point production, the Ark or the Temple of Relics', () => {
    const none = def('X_LateMiddleAge_Landmark1');
    const noProduction = vm({ greatBuilding: () => none });
    expect(noProduction.harvestColumn).toBe(false);
    expect(harvests(noProduction).every((h) => h === undefined)).toBe(true);
    for (const id of ['X_FutureEra_Landmark1', 'X_AllAge_Expedition']) {
      const c = construction();
      const excluded = vm({
        construction: {
          ...c,
          entity: { ...(c.entity as NonNullable<Construction['entity']>), def: id as BuildingDefId },
        },
      });
      expect(excluded.harvestColumn).toBe(false);
      expect(harvests(excluded).every((h) => h === undefined)).toBe(true);
    }
  });

  it('shows the net, the running sum and the totals of the plan', () => {
    const t = vm({ construction: construction({}, 4, 20), to: 10 });
    expect(t.rows.map((r) => r.net)).toEqual(t.rows.map((r) => r.ownShare - (r.harvest?.fp ?? 0)));
    expect(t.totals.net).toBe(t.rows.at(-1)?.sum);
    expect(t.totals.harvest).toBe(3 + 3 + 4 + 4 + 5 + 6);
  });
});

describe('the end of the table', () => {
  it('ends at the first level whose reward is unknown', () => {
    // the reward curve ends before level 422
    const t = vm({ construction: construction({}, 419, 500), to: 430 });
    expect(t.rows.map((r) => r.level)).toEqual([419, 420, 421]);
    expect(t.endsAt).toBe(422);
  });

  it('has no end note when every level is known', () => {
    expect(vm().endsAt).toBeUndefined();
  });
});

describe('copy text per row', () => {
  it('names the level of its row', () => {
    const t = vm({ copy: { ...DEFAULT_COPY, level: true, mode: 'all' }, copyPlayer: 'Ich', copyBuilding: 'Roman' });
    expect(t.rows.map((r) => r.copy.split(' ')[2])).toEqual(t.rows.map((r) => `${r.level}→${r.next}`));
    expect(t.rows[1]?.copy).toMatch(/^Ich Roman 4→5 P\d\(\d+\)/);
  });

  it('is the text of the Eigenanteil box on the open level', () => {
    const calc = calcOf(LEVEL, true);
    const t = vm({ copy: { ...DEFAULT_COPY, mode: 'all' }, copyPlayer: 'Ich', copyBuilding: 'Roman' });
    const expected = [
      'Ich',
      'Roman',
      ...[...calc.places]
        .reverse()
        .filter((p) => !p.full && p.amount > 0)
        .map((p) => `P${p.rank}(${p.amount})`),
    ];
    expect(t.rows[0]?.copy).toBe(expected.join(' '));
  });
});

describe('what the table cannot show', () => {
  const kind = (change: Partial<PowerLevelInputs>) => powerLevelViewModel({ ...base(), ...change }).kind;
  const base = (): PowerLevelInputs => ({
    construction: construction(),
    greatBuildingName: () => 'Roman',
    greatBuilding: () => roman,
    ...own,
    oneFpForNoReward: true,
    copy: DEFAULT_COPY,
  });

  it('says so without a construction, a building or a definition', () => {
    expect(kind({ construction: undefined })).toBe('none');
    expect(kind({ construction: construction({ entity: undefined }) })).toBe('noEntity');
    expect(kind({ greatBuilding: () => undefined })).toBe('noDefinition');
  });

  it('asks to reopen when the building levelled since the rankings came', () => {
    expect(kind({ construction: construction({ leveled: { level: 4 } }) })).toBe('leveled');
    expect(kind({ construction: construction({ rankingsLevel: 2 }) })).toBe('leveled');
  });
});
