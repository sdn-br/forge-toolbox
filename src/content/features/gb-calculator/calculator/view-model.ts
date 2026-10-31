import type { BuildingDefId } from '../../../../shared/ids';
import {
  availableForgePoints,
  type ConstructionCalc,
  calculateConstruction,
  constructionOf,
  ownAdvice,
  type PlaceCalc,
  type PlaceStatus,
  priced,
  profitablePlaces,
} from '../../../domain/gb-calculator';
import { effectiveFactor as effective, type FactorChoice } from '../../../domain/gb-factor';
import { previewLevel } from '../../../domain/gb-level-preview';
import { ownerRow } from '../../../domain/gb-snipe';
import { type LevelUpAndFirst, levelUpAndFirst } from '../../../domain/gb-strategy';
import type { GreatBuildingDef } from '../../../model/catalog';
import type { Construction } from '../../../model/great-building';
import { type ActivityVm, activityVm } from '../../../ui/activity';
import { type FactorButton, factorButtons } from '../../../ui/factor-bar';
import { ignoreWords } from '../../../ui/ignore';
import { type LevelChoice, levelChoice } from '../../../ui/level-bar';
import { type LevelPreview, levelPreview } from '../../../ui/level-preview';
import { type OwnerVm, ownerVm } from '../../../ui/owner-line';
import type { GbLookups } from '../lookups';

export interface GbHeader extends OwnerVm {
  name: string;
  level: number;
  next: number;
  /** the highest level the owner has unlocked */
  maxLevel: number;
  /** how active the owner is by foestats; missing while foestats is off or not asked yet */
  activity?: ActivityVm;
  /** Forge points of the bar plus those in packages, which the game opens when contributing; undefined while neither
   * the resources nor the inventory are known */
  availableFp?: number;
  /** the parts of `availableFp`; a part is undefined while its source is not known */
  fpBar?: number;
  fpPackages?: number;
  arcBonus: number;
  /** the level selector: live or a preview of a later level */
  levels: LevelChoice;
  /** the player put a star on the building */
  marked: boolean;
  /** the player ignores the building */
  ignored: boolean;
  /** why the building counts as ignored, one word per reason; missing when it does not */
  ignoreWords?: string[];
}

export interface CostCell {
  /** total own deposit */
  cost: number;
  /** what the player still has to add; less than the cost when he already holds a place */
  extra: number;
  /** the available Forge points do not cover the extra */
  short: boolean;
}

/** the demand cell: the cost and what to know about the deal */
export interface DemandCell extends CostCell {
  /** set when the demand is more than can still be paid: what can be paid until the level up */
  overRest?: number;
  /** below the safe cost: the place holds only by agreement */
  belowSafe: boolean;
  /** gross minus demand */
  profit: number;
}

export interface PlaceRow {
  rank: number;
  /** the current holder and his deposit (column Investiert); the own deposit in the own row */
  holder?: { name: string; fp: number };
  /** only where the place can be had, and in the own row while it is not safe; profit and rate likewise */
  safe?: CostCell;
  /** the holder cannot be passed anymore: shown instead of a safe cost, in the own row as the circled check */
  secured: boolean;
  /** stays on every place: it is the owner's offer, he makes the place safe himself */
  demand?: DemandCell;
  gross: number;
  profit?: number;
  rate?: number;
  /** the own row only: the own deposit in percent of the reward, what the place costs if nobody passes */
  depositRate?: number;
  status: PlaceStatus;
}

/** the selected later level as if it were open and empty */
export interface PreviewVm extends LevelPreview {
  places: PlaceRow[];
}

/** the player's own deposit on the construction, shown above the places */
export interface MeVm {
  /** the own deposit, 0 when the player has not paid in yet */
  fp: number;
  /** missing when the deposit holds no rank */
  rank?: number;
  /** the own place cannot be passed anymore; missing when the rank pays no reward */
  secured?: boolean;
  /** level now with everything missing, then take place 1 of the next level; only when that pays */
  levelUp?: LevelUpAndFirst;
  /**
   * the places the player can still make safe, from the first down to the own one: the safe total and what he has to
   * add; `best` marks the one with the highest profit. Only places that are worthwhile.
   */
  targets: { rank: number; cost: number; extra: number; best: boolean }[];
  /** places could be had, but none is worthwhile */
  noneWorthwhile?: boolean;
}

export type GbCalculatorVm =
  | { kind: 'none' }
  | ({ kind: 'noEntity' } & OwnerVm)
  | {
      kind: 'past';
      header: GbHeader;
      /** the finished level: from `level - 1` to `level` */
      level: number;
      /** `url` is the player's page at foestats, missing for deleted players */
      rows: { rank?: number; name: string; url?: string; fp?: number }[];
    }
  | {
      kind: 'preview';
      header: GbHeader;
      /** sorted by value, the own Arc bonus among them while its setting shows it */
      factorButtons: FactorButton[];
      effectiveFactor: number;
      preview: PreviewVm;
      /** set when the preview shows the level right after the current one and leveling into its place 1 pays */
      levelUp?: LevelUpAndFirst;
    }
  | {
      kind: 'current';
      header: GbHeader;
      /** sorted by value, the own Arc bonus among them while its setting shows it */
      factorButtons: FactorButton[];
      /** the factor in effect, in percent */
      effectiveFactor: number;
      blocked?: 'maxLevel' | 'unconnected';
      leveled?: number;
      places: PlaceRow[];
      /** missing when the building is blocked */
      me?: MeVm;
      /** Forge points until the level is full */
      missing: number;
      /** paid in of the level and its costs, for the progress line in the head */
      invested: number;
      required: number;
      /** what the owner paid into the level; missing when nothing */
      ownerFp?: number;
      /** the places that pay more than they cost, as the domain has them, for the tone; none while the level is stale */
      profitable: PlaceCalc[];
    };

export interface GbCalculatorInput extends GbLookups {
  /** the foreign construction to show */
  construction?: Construction;
  /** Forge points of the bar; undefined while the resources are not known */
  fpBar?: number;
  /** Forge points in the packages of the inventory; undefined while the inventory is not known */
  fpPackages?: number;
  arcBonus: number;
  factor: FactorChoice;
  /** the factor presets in percent */
  factorButtons: number[];
  /** the own Arc bonus shows as one more button */
  arcButton: boolean;
  /** the level chosen for the preview; undefined shows the current construction */
  previewLevel?: number;
  /** era and level costs of the building; undefined while its definition is not loaded */
  greatBuilding(def: BuildingDefId): GreatBuildingDef | undefined;
}

/** no cell where nothing can be paid */
const cell = (cost: number | undefined, extra: number | undefined, available?: number): CostCell | undefined =>
  cost === undefined || extra === undefined
    ? undefined
    : { cost, extra, short: available !== undefined && extra > available };

function demandCell(p: PlaceCalc, rest: number, available?: number): DemandCell | undefined {
  const base = cell(p.demandCost, p.demandExtra, available);
  if (!base || p.demandProfit === undefined) return undefined;
  return {
    ...base,
    ...(p.demandOverRest && { overRest: rest }),
    belowSafe: p.demandBelowSafe === true,
    profit: p.demandProfit,
  };
}

function placeRow(p: PlaceCalc, rest: number, available?: number): PlaceRow {
  return {
    rank: p.rank,
    ...(p.holder !== undefined && { holder: { name: p.holder, fp: p.holderFp } }),
    safe: priced(p) ? cell(p.safeCost, p.safeExtra, available) : undefined,
    secured: p.secured,
    demand: demandCell(p, rest, available),
    gross: p.gross,
    profit: p.available || p.mine ? p.profit : undefined,
    rate: priced(p) ? p.rate : undefined,
    ...(p.depositRate !== undefined && { depositRate: p.depositRate }),
    status: p.status,
  };
}

function meVm(calc: ConstructionCalc): MeVm {
  const own = calc.places.find((p) => p.mine);
  const advice = ownAdvice(calc);
  return {
    fp: calc.myDeposit,
    ...(calc.myRank !== undefined && { rank: calc.myRank }),
    ...(own && { secured: own.secured }),
    targets: advice.targets.map((p) => ({
      rank: p.rank,
      cost: p.safeCost as number,
      extra: p.safeExtra as number,
      best: p === advice.best,
    })),
    ...(advice.noneWorthwhile && { noneWorthwhile: true }),
  };
}

/** A later level, empty: the own Forge points do not limit a plan, blueprints and medals are not known. */
function previewVm(
  gb: GreatBuildingDef | undefined,
  level: number,
  maxLevel: number,
  arcBonus: number,
  factor: number,
): PreviewVm {
  const base = { ...levelPreview(level, maxLevel), places: [] };
  if (!gb) return { ...base, unknown: 'definition' };
  const p = previewLevel({ greatBuilding: gb, level, arcBonus, factor });
  if (!p.calc || !p.reward) return { ...base, required: p.required, unknown: 'reward' };
  const { calc, reward } = p;
  return {
    ...base,
    required: p.required,
    estimate: reward.estimate,
    places: calc.places.map((place) => placeRow(place, calc.rest)),
  };
}

export function gbCalculatorViewModel(input: GbCalculatorInput): GbCalculatorVm {
  const c = input.construction;
  if (!c) return { kind: 'none' };
  const owner = ownerVm(
    input,
    c.owner,
    ownerRow(c.rankings, c.owner)?.name ?? input.playerName(c.owner) ?? String(c.owner),
  );
  const entity = c.entity;
  if (!entity) return { kind: 'noEntity', ...owner };
  // the preview starts where the live construction ends; a level up can overtake a chosen level
  const levels = levelChoice(entity.level, input.previewLevel);
  const preview = levels.preview ? levels.chosen : undefined;
  const availableFp = availableForgePoints(input.fpBar, input.fpPackages);
  const ignored = input.isIgnored(c.owner, c.entityId);
  const foestats = input.foestats(c.owner);
  const words = ignoreWords(ignored, owner.ownerIgnored);
  const header: GbHeader = {
    name: input.greatBuildingName(entity.def) ?? entity.def,
    level: entity.level,
    next: entity.level + 1,
    maxLevel: entity.maxLevel,
    ...owner,
    ...(foestats && { activity: activityVm(foestats, input.today) }),
    availableFp,
    fpBar: input.fpBar,
    fpPackages: input.fpPackages,
    arcBonus: input.arcBonus,
    levels,
    marked: input.isMarked(c.owner, c.entityId),
    ignored,
    ...(words.length > 0 && { ignoreWords: words }),
  };
  const arcButton = input.arcButton ? input.arcBonus : undefined;
  const effectiveFactor = effective(input.factor, arcButton);
  const buttons = factorButtons(input.factorButtons, arcButton, input.factor);
  const live = constructionOf(entity, c.rankings, { arcBonus: input.arcBonus, factor: effectiveFactor });
  const calc = calculateConstruction(live);
  const gb = input.greatBuilding(entity.def);
  const levelUp = c.past || c.leveled ? undefined : levelUpAndFirst(live, calc, gb);
  if (preview !== undefined) {
    return {
      kind: 'preview',
      header,
      factorButtons: buttons,
      effectiveFactor,
      preview: previewVm(gb, preview, entity.maxLevel, input.arcBonus, effectiveFactor),
      ...(levelUp && preview === levelUp.nextLevel && { levelUp }),
    };
  }
  if (c.past) {
    return {
      kind: 'past',
      header,
      level: c.past.level,
      rows: c.past.rankings
        .filter((r) => r.fp !== undefined)
        .map((r) => ({
          ...(r.rank !== undefined && { rank: r.rank }),
          name: r.name,
          ...(r.player !== undefined && { url: input.playerUrl(r.player) }),
          fp: r.fp,
        })),
    };
  }
  const places = calc.places.map((p) => placeRow(p, calc.rest, availableFp));
  const ownerFp = ownerRow(c.rankings, c.owner)?.fp;
  return {
    kind: 'current',
    header,
    factorButtons: buttons,
    effectiveFactor,
    ...(calc.blocked && { blocked: calc.blocked }),
    ...(c.leveled && { leveled: c.leveled.level }),
    places,
    ...(!calc.blocked && { me: { ...meVm(calc), ...(levelUp && { levelUp }) } }),
    missing: Math.max(0, calc.missing),
    invested: entity.invested,
    required: entity.required,
    ...(ownerFp && { ownerFp }),
    profitable: c.leveled ? [] : profitablePlaces(calc),
  };
}
