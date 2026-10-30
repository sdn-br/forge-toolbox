import { describe, expect, it } from 'vitest';
import { emptyLevel } from '../src/content/domain/gb-level-preview';
import { calculateOwnShare } from '../src/content/domain/gb-own-share';
import { type PowerLevelInput, powerLevelPlan } from '../src/content/domain/gb-power-level';
import { toBuildingDef } from '../src/content/game/building-defs';
import type { GreatBuildingDef } from '../src/content/stores/catalog';
import type { RankingRow } from '../src/content/stores/great-building-model';
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
const SHARE = { factor: 90, secureExisting: true, trust: false, oneFpForNoReward: true };

/** the open level with the player's 20 on place 2 and a holder with 50 on place 1 */
function rankings(level = LEVEL): RankingRow[] {
  const rows = emptyLevel(roman, level).rankings as RankingRow[];
  return rows.map((r) =>
    r.rank === 1 ? { ...r, name: 'Holder', fp: 50 } : r.rank === 2 ? { ...r, name: 'Ich', self: true, fp: 20 } : r,
  );
}

const plan = (change: Partial<PowerLevelInput> = {}, level = LEVEL, maxLevel = 8) =>
  powerLevelPlan({
    def: ROMAN,
    greatBuilding: roman,
    level,
    maxLevel,
    required: emptyLevel(roman, level).required as number,
    rankings: rankings(level),
    from: level,
    to: level + 10,
    share: { ...SHARE, exts: [] },
    ...change,
  });

const calcOf = (level: number, real: boolean, exts: number[] = []) => {
  const empty = emptyLevel(roman, level);
  return calculateOwnShare({
    ...SHARE,
    required: empty.required as number,
    rankings: real ? rankings(level) : (empty.rankings as RankingRow[]),
    exts,
  });
};

describe('powerLevelPlan', () => {
  it('takes the open level with its real ranking and later ones open and empty', () => {
    const { rows } = plan();
    expect(rows.map((r) => r.level)).toEqual(Array.from({ length: 10 }, (_, i) => LEVEL + i));
    expect(rows[0]).toMatchObject({ open: true, calc: calcOf(LEVEL, true), ownShare: calcOf(LEVEL, true).open });
    expect(rows[2]).toMatchObject({ open: false, calc: calcOf(LEVEL + 2, false) });
  });

  it('counts the promised payments on the open level only', () => {
    const { rows } = plan({ share: { ...SHARE, exts: [30] } });
    expect(rows[0]?.calc).toEqual(calcOf(LEVEL, true, [30]));
    expect(rows[1]?.calc).toEqual(calcOf(LEVEL + 1, false));
  });

  it('has no open row at the unlocked maximum: every level is empty', () => {
    const { rows } = plan({}, 8, 8);
    expect(rows[0]).toMatchObject({ level: 8, open: false, locked: true, calc: calcOf(8, false) });
  });

  it('marks the levels above the unlocked maximum', () => {
    // maximum 8: the construction 7 to 8 is the last one open
    expect(plan({ to: 12 }).rows.map((r) => r.locked)).toEqual([
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

  it('marks levels whose rewards come from the curve', () => {
    // past the listed rewards of the era (level 400 for this one) the first place comes from the curve
    const { rows } = plan({}, 400, 500);
    expect(rows.map((r) => r.estimate).slice(0, 2)).toEqual([false, true]);
  });

  it('takes the double harvest exact up to level 10 from the definition: the production of level X + 1', () => {
    // levels 4 to 9 take the entries 5 to 10
    const { rows } = plan({ to: 10 }, 4, 20);
    expect(rows.map((r) => r.harvest)).toEqual([3, 3, 4, 4, 5, 6].map((fp) => ({ fp, estimate: false })));
  });

  it('takes the double harvest of the level being built from the open construction', () => {
    const { rows } = plan({ nextProduction: { level: LEVEL, type: 'strategy_points', value: 77 } });
    expect(rows[0]?.harvest).toEqual({ fp: 77, estimate: false });
    expect(rows[1]?.harvest).toEqual({ fp: 3, estimate: false });
  });

  it('estimates the double harvest above level 10', () => {
    // the production at level 10 is 6: × 11 / 10 = 6.6 → 7, × 20 / 10 = 12
    const { rows } = plan({ to: 20 }, 9, 40);
    expect(rows[0]?.harvest).toEqual({ fp: 6, estimate: false });
    expect(rows[1]?.harvest).toEqual({ fp: 7, estimate: true });
    expect(rows.at(-1)?.harvest).toEqual({ fp: 12, estimate: true });
  });

  it('has no double harvest for a building without Forge point production', () => {
    const none = def('X_LateMiddleAge_Landmark1');
    expect(plan({ def: 'X_LateMiddleAge_Landmark1', greatBuilding: none }).rows.every((r) => !r.harvest)).toBe(true);
  });

  it('keeps the net and the running sum: own share minus harvest, added up from the first row', () => {
    const p = plan();
    let sum = 0;
    for (const r of p.rows) {
      expect(r.ownShare).toBe(Math.max(0, r.calc.open));
      expect(r.net).toBe(r.ownShare - (r.harvest?.fp ?? 0));
      sum += r.net;
      expect(r.sum).toBe(sum);
    }
    expect(p.totals).toEqual({
      ownShare: p.rows.reduce((s, r) => s + r.ownShare, 0),
      harvest: p.rows.reduce((s, r) => s + (r.harvest?.fp ?? 0), 0),
      net: sum,
    });
  });

  it('ends at the first level whose reward is unknown', () => {
    // the reward curve ends before level 422
    const p = plan({ to: 430 }, 419, 500);
    expect(p.rows.map((r) => r.level)).toEqual([419, 420, 421]);
    expect(p.endsAt).toBe(422);
    expect(plan().endsAt).toBeUndefined();
  });
});
