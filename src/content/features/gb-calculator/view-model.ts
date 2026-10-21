import type { BuildingDefId } from '../../../shared/ids';
import { calculateConstruction, type PlaceStatus } from '../../domain/gb-calculator';
import type { Construction, RankingRow } from '../../stores/great-building-model';

/** The factor buttons; `arc` uses the Arc bonus of the player. */
export const FACTOR_PRESETS = [80, 90, 100] as const;

export interface FactorChoice {
  /** the factor typed or picked, in percent */
  value: number;
  /** the Arc bonus is the factor */
  arc: boolean;
}

export interface GbHeader {
  name: string;
  level: number;
  next: number;
  /** the highest level the owner has unlocked */
  maxLevel: number;
  owner: string;
  /** Forge points of the bar plus those in packages, which the game opens when contributing; undefined while neither
   * the resources nor the inventory are known */
  availableFp?: number;
  /** the parts of `availableFp`; a part is undefined while its source is not known */
  fpBar?: number;
  fpPackages?: number;
  arcBonus: number;
}

export interface CostCell {
  /** total own deposit */
  cost: number;
  /** what the player still has to add; less than the cost when he already holds a place */
  extra: number;
  /** the available Forge points do not cover the extra */
  short: boolean;
}

export interface PlaceRow {
  rank: number;
  holder?: { name: string; fp: number };
  safe: CostCell;
  demand: CostCell;
  gross: number;
  profit: number;
  rate?: number;
  blueprints: number;
  medals: number;
  status: PlaceStatus;
}

export type GbCalculatorVm =
  | { kind: 'none' }
  | { kind: 'noEntity'; owner: string }
  | {
      kind: 'past';
      header: GbHeader;
      /** the finished level: from `level - 1` to `level` */
      level: number;
      rows: { rank?: number; name: string; fp?: number }[];
    }
  | {
      kind: 'current';
      header: GbHeader;
      factor: FactorChoice;
      /** the factor in effect, in percent */
      effectiveFactor: number;
      blocked?: 'maxLevel' | 'unconnected';
      leveled?: number;
      places: PlaceRow[];
      /** Forge points until the level is full */
      missing: number;
      /** at least one place pays more than it costs */
      profitable: boolean;
    };

export interface GbCalculatorInput {
  /** the foreign construction to show */
  construction?: Construction;
  greatBuildingName(def: BuildingDefId): string | undefined;
  /** the owner's name when the rankings do not tell it */
  playerName(id: Construction['owner']): string | undefined;
  /** Forge points of the bar; undefined while the resources are not known */
  fpBar?: number;
  /** Forge points in the packages of the inventory; undefined while the inventory is not known */
  fpPackages?: number;
  arcBonus: number;
  factor: FactorChoice;
}

const ownerName = (c: Construction, rows: RankingRow[], playerName: GbCalculatorInput['playerName']) =>
  rows.find((r) => r.rank === undefined && r.player === c.owner)?.name ?? playerName(c.owner) ?? String(c.owner);

const cell = (cost: number, extra: number, available?: number): CostCell => ({
  cost,
  extra,
  short: available !== undefined && extra > available,
});

export function gbCalculatorViewModel(input: GbCalculatorInput): GbCalculatorVm {
  const c = input.construction;
  if (!c) return { kind: 'none' };
  const owner = ownerName(c, c.rankings, input.playerName);
  const entity = c.entity;
  if (!entity) return { kind: 'noEntity', owner };
  const availableFp =
    input.fpBar === undefined && input.fpPackages === undefined
      ? undefined
      : (input.fpBar ?? 0) + (input.fpPackages ?? 0);
  const header: GbHeader = {
    name: input.greatBuildingName(entity.def) ?? entity.def,
    level: entity.level,
    next: entity.level + 1,
    maxLevel: entity.maxLevel,
    owner,
    availableFp,
    fpBar: input.fpBar,
    fpPackages: input.fpPackages,
    arcBonus: input.arcBonus,
  };
  if (c.past) {
    return {
      kind: 'past',
      header,
      level: c.past.level,
      rows: c.past.rankings
        .filter((r) => r.fp !== undefined)
        .map((r) => ({ ...(r.rank !== undefined && { rank: r.rank }), name: r.name, fp: r.fp })),
    };
  }
  const effectiveFactor = input.factor.arc ? input.arcBonus : input.factor.value;
  const calc = calculateConstruction({
    ...entity,
    rankings: c.rankings,
    arcBonus: input.arcBonus,
    factor: effectiveFactor,
  });
  const places: PlaceRow[] = calc.places.map((p) => ({
    rank: p.rank,
    ...(p.holder !== undefined && { holder: { name: p.holder, fp: p.holderFp } }),
    safe: cell(p.safeCost, p.safeExtra, availableFp),
    demand: cell(p.demandCost, p.demandExtra, availableFp),
    gross: p.gross,
    profit: p.profit,
    rate: p.rate,
    blueprints: p.blueprints,
    medals: p.medals,
    status: p.status,
  }));
  return {
    kind: 'current',
    header,
    factor: input.factor,
    effectiveFactor,
    ...(calc.blocked && { blocked: calc.blocked }),
    ...(c.leveled && { leveled: c.leveled.level }),
    places,
    missing: Math.max(0, calc.missing),
    profitable: !calc.blocked && !c.leveled && places.some((p) => p.status === 'profit' && p.profit > 0),
  };
}
