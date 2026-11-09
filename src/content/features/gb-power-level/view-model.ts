import type { BuildingDefId } from '../../../shared/ids';
import { clamp } from '../../../shared/math';
import type { ArcBonus } from '../../domain/arc-bonus';
import { type DoubleHarvest, hasDoubleHarvest } from '../../domain/gb-double-harvest';
import { alikeOn, effectiveFactor, effectiveFactors } from '../../domain/gb-factor';
import { type LevelCosts, levelCosts } from '../../domain/gb-level-cost';
import type { OwnShareCalc } from '../../domain/gb-own-share';
import { powerLevelPlan } from '../../domain/gb-power-level';
import { levelTier, tierPlaces } from '../../domain/gb-tier';
import type { GreatBuildingDef, GreatBuildingTier, TierStart } from '../../model/catalog';
import type { Construction } from '../../model/great-building';
import type { PlaceFactorState } from '../../stores/place-factors';
import { type FactorButton, factorButtons } from '../../ui/factor-bar';
import { clampTop, type RowWindow, rowWindow } from '../../ui/windowed-rows';
import { type CopyOptions, copyText } from '../gb-own-share/copy-text';

/** the most levels one table shows */
export const MAX_ROWS = 100;
/** levels the table covers from the first one unless the player says otherwise */
export const DEFAULT_SPAN = 10;
/** level rows in view at once, so the default span shows whole; the rest moves by wheel and buttons */
export const VISIBLE_ROWS = 10;

/** the offset kept inside the rows, so a shorter table or a stale offset never leaves it empty */
export const clampScroll = (top: number, rows: number): number => clampTop(top, rows, VISIBLE_ROWS);

export interface PowerLevelInputs {
  /** the last own construction opened */
  construction?: Construction;
  greatBuildingName(def: BuildingDefId): string | undefined;
  /** era, level costs and production of the building; undefined while its definition is not loaded */
  greatBuilding(def: BuildingDefId): GreatBuildingDef | undefined;
  /** the cost of each level of a building that is not open; without it only the levels the definition lists */
  levelCosts?(def: BuildingDefId, gb: GreatBuildingDef): LevelCosts;
  /** the factor of each place, in percent or the Arc bonus, and where they come from */
  factors: PlaceFactorState;
  factorButtons: number[];
  /** the presets on gold levels; none when missing */
  factorButtonsGold?: number[];
  /**
   * the own Arc bonus, both tiers; each level takes the one of its tier, the button the one of the first level. Missing
   * when the setting leaves the button out.
   */
  arcBonus?: ArcBonus;
  /** the tiers of great building levels; the default ones when missing */
  tiers?: TierStart[];
  secureExisting: boolean;
  trust: boolean;
  /** promised payments by place for the open level, index 0 is place 1 */
  exts: number[];
  oneFpForNoReward: boolean;
  copy: CopyOptions;
  copyPlayer?: string;
  copyBuilding?: string;
  /** the first and the last level of the table; missing ones take the open level and 10 more */
  from?: number;
  to?: number;
  /** index of the first level row in view */
  top?: number;
}

/** what one place pays */
export interface PayCell {
  fp: number;
}

export interface PowerRow {
  /** the construction from `level` to `level + 1` */
  level: number;
  next: number;
  /** the open level, calculated with the real ranking */
  current: boolean;
  /** the owner has not unlocked the level yet */
  locked: boolean;
  /** one per place column; missing where no helper pays (held, full or not offered) and P6, P7 on a copper level */
  places: (PayCell | undefined)[];
  /** what the owner pays himself; on the open level what is still open */
  ownShare: number;
  /** the open level only: what the owner has paid already */
  paid?: number;
  /** missing without a Forge point production or without a value for the level */
  harvest?: DoubleHarvest;
  /** own share minus double harvest */
  net: number;
  /** running total of `net` from the first row */
  sum: number;
  /** the copy text of the Eigenanteil box for this level */
  copy: string;
}

export type PowerLevelVm =
  | { kind: 'none' }
  | { kind: 'noEntity' }
  | { kind: 'leveled'; name: string; level: number }
  | { kind: 'noDefinition'; name: string }
  | {
      kind: 'table';
      name: string;
      /** the open level of the building */
      current: number;
      /** the level fields as they count: the table runs from the construction at `from` to the one ending at `to` */
      from: number;
      to: number;
      /** the factor of the free field: the one of place 1 */
      factor: number;
      /** sorted by value; active only when all places of the tier hold it */
      factorButtons: FactorButton[];
      /** the tier of the first row: the buttons and the factor fields belong to it */
      tier: GreatBuildingTier;
      factorState: Omit<PlaceFactorState, 'choices'>;
      /** the place columns: 7 when a gold level is in the table, else 5 */
      places: number;
      /** per place column, index 0 is place 1: the factor in effect in percent, and whether it follows the Arc bonus */
      placeFactors: { factor: number; arc: boolean }[];
      /** the building takes part in the double harvest: the column shows */
      harvestColumn: boolean;
      rows: PowerRow[];
      /** the level rows in view */
      window: RowWindow;
      /** the table ends before `to`: nothing is known about the reward of this level */
      endsAt?: number;
      totals: { ownShare: number; harvest: number; net: number };
    };

/** a whole number from a field, within bounds; anything else takes the fallback */
function level(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = value !== undefined && Number.isFinite(value) ? Math.round(value) : fallback;
  return clamp(n, min, max);
}

export function powerLevelViewModel(input: PowerLevelInputs): PowerLevelVm {
  const c = input.construction;
  if (!c) return { kind: 'none' };
  const entity = c.entity;
  if (!entity) return { kind: 'noEntity' };
  const name = input.greatBuildingName(entity.def) ?? entity.def;
  const atMax = entity.level >= entity.maxLevel;
  // the rankings belong to the level they came for; a new level since leaves the real ranking unknown
  if (!atMax && (c.leveled || c.rankingsLevel !== entity.level))
    return { kind: 'leveled', name, level: c.leveled?.level ?? entity.level };
  const gb = input.greatBuilding(entity.def);
  if (!gb) return { kind: 'noDefinition', name };

  const from = level(input.from, entity.level, entity.level, Number.MAX_SAFE_INTEGER);
  const to = level(input.to, from + DEFAULT_SPAN, from + 1, from + MAX_ROWS);
  const { choices, ...factorState } = input.factors;
  // each row takes the Arc bonus and the fixed factors of its tier; buttons and fields show those of the first row
  const tierAt = (x: number) => levelTier(gb, x + 1, input.tiers);
  // a copper level has five places, the factors of places 6 and 7 count on gold levels only
  const factorAt = (x: number) =>
    effectiveFactors(choices.slice(0, tierPlaces(tierAt(x))), input.arcBonus?.[tierAt(x)], tierAt(x));
  const tier = tierAt(from);
  const arcBonus = input.arcBonus?.[tier];
  const factors = factorAt(from);
  const harvestColumn = hasDoubleHarvest(entity.def, gb);
  const building = input.copyBuilding ?? name;
  const player = input.copyPlayer ?? '';

  const plan = powerLevelPlan({
    def: entity.def,
    greatBuilding: gb,
    costs: input.levelCosts?.(entity.def, gb) ?? levelCosts(gb.levelCosts),
    level: entity.level,
    maxLevel: entity.maxLevel,
    tiers: input.tiers,
    required: entity.required,
    rankings: c.rankings,
    nextProduction: c.nextProduction,
    from,
    to,
    share: {
      factor: factors,
      secureExisting: input.secureExisting,
      trust: input.trust,
      oneFpForNoReward: input.oneFpForNoReward,
      exts: input.exts,
    },
    factorAt,
  });
  // seven place columns only when a gold level is shown
  const places = Math.max(tierPlaces(tier), ...plan.rows.map((r) => tierPlaces(tierAt(r.level))));
  const rows = plan.rows.map<PowerRow>((r) => ({
    level: r.level,
    next: r.level + 1,
    current: r.open,
    locked: r.locked,
    places: payments(r.calc, places),
    ownShare: r.ownShare,
    ...(r.open && { paid: r.calc.myDeposit }),
    ...(r.harvest && { harvest: r.harvest }),
    net: r.net,
    sum: r.sum,
    copy: copyText(r.calc, input.copy, {
      player,
      building,
      level: r.level,
      factor: factorAt(r.level),
      tier: tierAt(r.level),
    }),
  }));
  return {
    kind: 'table',
    name,
    current: entity.level,
    from,
    to,
    factor: factors[0] ?? 0,
    factorButtons: factorButtons(
      tier === 'gold' ? (input.factorButtonsGold ?? []) : input.factorButtons,
      arcBonus,
      alikeOn(choices, tier),
      input.arcBonus,
      tier,
    ),
    tier,
    factorState,
    places,
    placeFactors: choices.slice(0, places).map((c) => ({
      factor: effectiveFactor(c, arcBonus, tier),
      arc: c.arc && arcBonus !== undefined,
    })),
    harvestColumn,
    rows,
    window: rowWindow(input.top ?? 0, rows.length, VISIBLE_ROWS),
    ...(plan.endsAt !== undefined && { endsAt: plan.endsAt }),
    totals: plan.totals,
  };
}

/** the payment per place as the Eigenanteil box shows under „Einzahlen“: none where a holder keeps the place */
function payments(calc: OwnShareCalc, places: number): (PayCell | undefined)[] {
  return Array.from({ length: places }, (_, i) => {
    const p = calc.places.find((x) => x.rank === i + 1);
    return !p || p.holder || p.full || p.unoffered ? undefined : { fp: p.amount };
  });
}
