import type { BuildingDefId } from '../../../shared/ids';
import { type DoubleHarvest, doubleHarvest, hasDoubleHarvest } from '../../domain/gb-double-harvest';
import { emptyLevel } from '../../domain/gb-level-preview';
import { calculateOwnShare, type OwnShareCalc } from '../../domain/gb-own-share';
import type { GreatBuildingDef } from '../../stores/catalog';
import type { Construction } from '../../stores/great-building-model';
import { type PlaceFactorState, sameChoice } from '../../stores/place-factors';
import { effectiveFactor, effectiveFactors, type FactorButton, factorButtons } from '../../ui/factor-bar';
import { type CopyOptions, copyText } from '../../ui/own-share-copy';

/** the most levels one table shows */
export const MAX_ROWS = 100;
/** levels the table covers from the first one unless the player says otherwise */
export const DEFAULT_SPAN = 10;
const PLACES = 5;

export interface PowerLevelInputs {
  /** the last own construction opened */
  construction?: Construction;
  greatBuildingName(def: BuildingDefId): string | undefined;
  /** era, level costs and production of the building; undefined while its definition is not loaded */
  greatBuilding(def: BuildingDefId): GreatBuildingDef | undefined;
  /** the factor of each place, in percent or the Arc bonus, and where they come from */
  factors: PlaceFactorState;
  factorButtons: number[];
  /** the own Arc bonus as one more button, sorted in by its value; missing when the setting leaves it out */
  arcBonus?: number;
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
}

/** what one place pays; `estimate` when the reward behind it is computed */
export interface PayCell {
  fp: number;
  estimate: boolean;
}

export interface PowerRow {
  /** the construction from `level` to `level + 1` */
  level: number;
  next: number;
  /** the open level, calculated with the real ranking */
  current: boolean;
  /** the owner has not unlocked the level yet */
  locked: boolean;
  /** places 1 to 5; missing where no helper pays: held, full or not offered */
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
      /** sorted by value; active only when all five places hold it */
      factorButtons: FactorButton[];
      factorState: Omit<PlaceFactorState, 'choices'>;
      /** per place, index 0 is place 1: the factor in effect in percent, and whether it follows the Arc bonus */
      placeFactors: { factor: number; arc: boolean }[];
      /** the building takes part in the double harvest: the column shows */
      harvestColumn: boolean;
      rows: PowerRow[];
      /** a payment comes from a computed reward: the note under the table */
      estimate: boolean;
      /** the table ends before `to`: nothing is known about the reward of this level */
      endsAt?: number;
      totals: { ownShare: number; harvest: number; net: number };
    };

/** a whole number from a field, within bounds; anything else takes the fallback */
function level(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = value !== undefined && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
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
  const factors = effectiveFactors(choices, input.arcBonus);
  const first = choices[0];
  const alike = first && choices.every((c) => sameChoice(c, first)) ? first : undefined;
  const harvestColumn = hasDoubleHarvest(entity.def, gb);
  const building = input.copyBuilding ?? name;
  const player = input.copyPlayer ?? '';

  const rows: PowerRow[] = [];
  let endsAt: number | undefined;
  let sum = 0;
  for (let x = from; x < to; x++) {
    const open = x === entity.level && !atMax;
    const empty = open ? undefined : emptyLevel(gb, x);
    const required = open ? entity.required : empty?.required;
    const rankings = open ? c.rankings : empty?.rankings;
    if (required === undefined || !rankings) {
      endsAt = x;
      break;
    }
    const calc = calculateOwnShare({
      required,
      rankings,
      factor: factors,
      secureExisting: input.secureExisting,
      trust: input.trust,
      oneFpForNoReward: input.oneFpForNoReward,
      exts: open ? input.exts : [],
    });
    const estimate = empty?.reward?.estimate === true;
    const harvest = harvestColumn ? doubleHarvest(entity.def, gb, x, c.nextProduction) : undefined;
    const ownShare = Math.max(0, calc.open);
    const net = ownShare - (harvest?.fp ?? 0);
    sum += net;
    rows.push({
      level: x,
      next: x + 1,
      current: open,
      locked: x + 1 > entity.maxLevel,
      places: payments(calc, estimate),
      ownShare,
      ...(open && { paid: calc.myDeposit }),
      ...(harvest && { harvest }),
      net,
      sum,
      copy: copyText(calc, input.copy, { player, building, level: x, factor: factors }),
    });
  }
  return {
    kind: 'table',
    name,
    current: entity.level,
    from,
    to,
    factor: factors[0] ?? 0,
    factorButtons: factorButtons(input.factorButtons, input.arcBonus, alike),
    factorState,
    placeFactors: choices.map((c) => ({
      factor: effectiveFactor(c, input.arcBonus),
      arc: c.arc && input.arcBonus !== undefined,
    })),
    harvestColumn,
    rows,
    estimate: rows.some((r) => r.places.some((p) => p?.estimate)),
    ...(endsAt !== undefined && { endsAt }),
    totals: {
      ownShare: rows.reduce((s, r) => s + r.ownShare, 0),
      harvest: rows.reduce((s, r) => s + (r.harvest?.fp ?? 0), 0),
      net: sum,
    },
  };
}

/** the payment per place as the Eigenanteil box shows under „Einzahlen“: none where a holder keeps the place */
function payments(calc: OwnShareCalc, estimate: boolean): (PayCell | undefined)[] {
  return Array.from({ length: PLACES }, (_, i) => {
    const p = calc.places.find((x) => x.rank === i + 1);
    return !p || p.holder || p.full || p.unoffered ? undefined : { fp: p.amount, estimate };
  });
}
