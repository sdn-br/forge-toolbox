import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { formatNumber, t } from '../../core/texts';
import { type Activity, playerActivity } from '../../domain/activity';
import {
  type ConstructionCalc,
  calculateConstruction,
  type PlaceCalc,
  type PlaceStatus,
} from '../../domain/gb-calculator';
import { type LevelUpAndFirst, levelUpAndFirst, previewLevel } from '../../domain/gb-level-preview';
import type { GreatBuildingDef } from '../../stores/catalog';
import type { FoestatsRecord } from '../../stores/foestats';
import type { Construction, RankingRow } from '../../stores/great-building-model';
import { effectiveFactor as effective, type FactorButton, type FactorChoice, factorButtons } from '../../ui/factor-bar';
import { type LevelChoice, levelChoice } from '../../ui/level-bar';

export interface GbHeader {
  name: string;
  level: number;
  next: number;
  /** the highest level the owner has unlocked */
  maxLevel: number;
  owner: string;
  /** the owner's page at foestats */
  ownerUrl: string;
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
}

export interface CostCell {
  /** total own deposit */
  cost: number;
  /** what the player still has to add; less than the cost when he already holds a place */
  extra: number;
  /** the available Forge points do not cover the extra */
  short: boolean;
}

/** one line about the owner's activity, a tooltip with its source */
export interface ActivityVm {
  text: string;
  /** change of points and battles over the last days */
  week?: string;
  /** several days without an increase */
  idle: boolean;
  title: string;
  /** foestats is being asked right now */
  loading: boolean;
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
  /** the holder cannot be passed anymore: shown instead of a safe cost, in the own row as a check mark */
  secured: boolean;
  /** stays on every place: it is the owner's offer, he makes the place safe himself */
  demand?: DemandCell;
  gross: number;
  profit?: number;
  rate?: number;
  /** the own row only: the own deposit in percent of the reward, what the place costs if nobody passes */
  depositRate?: number;
  /** missing in the preview, a future level does not tell them */
  blueprints?: number;
  medals?: number;
  /** the reward is computed, not game data */
  estimate?: boolean;
  status: PlaceStatus;
}

/** the selected later level as if it were open and empty */
export interface PreviewVm {
  level: number;
  next: number;
  /** Forge points the level needs; undefined without the definition */
  required?: number;
  /** the owner has not unlocked the level yet */
  locked: boolean;
  /** why there are no places: the definition is not loaded or the reward of the level is unknown */
  unknown?: 'definition' | 'reward';
  /** the rewards are computed, off by up to 5 Forge points */
  estimate: boolean;
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
  | { kind: 'noEntity'; owner: string; ownerUrl: string }
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
      /** at least one place pays more than it costs */
      profitable: boolean;
    };

export interface GbCalculatorInput {
  /** the foreign construction to show */
  construction?: Construction;
  greatBuildingName(def: BuildingDefId): string | undefined;
  /** the owner's name when the rankings do not tell it */
  playerName(id: Construction['owner']): string | undefined;
  /** a player's page at foestats */
  playerUrl(id: PlayerId): string;
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
  /** the owner's days at foestats; undefined while foestats is off or was not asked yet */
  foestats?: FoestatsRecord;
  /** the current foestats day, `YYYY-MM-DD` */
  today: string;
  /** the level chosen for the preview; undefined shows the current construction */
  previewLevel?: number;
  /** era and level costs of the building; undefined while its definition is not loaded */
  greatBuilding(def: BuildingDefId): GreatBuildingDef | undefined;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;

function activityText(a: Activity): string {
  if (a.daysAgo === 0) return t('foestats.activeToday');
  if (a.daysAgo === 1) return t('foestats.activeYesterday');
  if (a.daysAgo !== undefined) return t('foestats.activeDaysAgo', { days: a.daysAgo });
  const flat = a.flatFor ?? 0;
  return flat >= 2 ? t('foestats.flatFor', { days: flat }) : t('foestats.noIncrease');
}

export function activityVm(record: FoestatsRecord | undefined, today: string): ActivityVm | undefined {
  if (!record) return undefined;
  const activity = playerActivity(record.days, today);
  const unreachable = t('foestats.unreachable');
  const { loading } = record;
  if (!activity) {
    const text = loading ? t('foestats.loading') : record.unreachable ? unreachable : t('foestats.noData');
    return { text, idle: false, title: text, loading };
  }
  const newest = record.days.at(-1)?.date ?? '';
  const { week } = activity;
  const known = (n: number | undefined) => (n === undefined ? '?' : signed(n));
  return {
    text: activityText(activity),
    ...(week.days > 0 && {
      week: t('foestats.week', { days: week.days, points: known(week.points), battles: known(week.battles) }),
    }),
    idle: activity.idle,
    loading,
    title: [t('foestats.source', { date: newest }), record.unreachable && t('foestats.stale')]
      .filter(Boolean)
      .join('\n'),
  };
}

const ownerName = (c: Construction, rows: RankingRow[], playerName: GbCalculatorInput['playerName']) =>
  rows.find((r) => r.rank === undefined && r.player === c.owner)?.name ?? playerName(c.owner) ?? String(c.owner);

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
  // a price only where the place can be had, or for the own place while it is not safe
  const priced = p.available || (p.mine && !p.secured);
  return {
    rank: p.rank,
    ...(p.holder !== undefined && { holder: { name: p.holder, fp: p.holderFp } }),
    safe: priced ? cell(p.safeCost, p.safeExtra, available) : undefined,
    secured: p.secured,
    demand: demandCell(p, rest, available),
    gross: p.gross,
    profit: p.available || p.mine ? p.profit : undefined,
    rate: priced ? p.rate : undefined,
    ...(p.depositRate !== undefined && { depositRate: p.depositRate }),
    blueprints: p.blueprints,
    medals: p.medals,
    status: p.status,
  };
}

function meVm(calc: ConstructionCalc): MeVm {
  const own = calc.places.find((p) => p.mine);
  const open = calc.places.filter(
    (p) => (p.available || (p.mine && !p.secured)) && (calc.myRank === undefined || p.rank <= calc.myRank),
  );
  const worthwhile = open.filter((p) => p.worthwhile);
  const best = worthwhile.reduce<PlaceCalc | undefined>(
    (b, p) => (b && (b.profit ?? 0) >= (p.profit ?? 0) ? b : p),
    undefined,
  );
  const targets = worthwhile.map((p) => ({
    rank: p.rank,
    cost: p.safeCost as number,
    extra: p.safeExtra as number,
    best: p === best,
  }));
  return {
    fp: calc.myDeposit,
    ...(calc.myRank !== undefined && { rank: calc.myRank }),
    ...(own && { secured: own.secured }),
    targets,
    ...(open.length > 0 && worthwhile.length === 0 && { noneWorthwhile: true }),
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
  const base = { level, next: level + 1, locked: level + 1 > maxLevel, estimate: false, places: [] };
  if (!gb) return { ...base, unknown: 'definition' };
  const p = previewLevel({ greatBuilding: gb, level, arcBonus, factor });
  if (!p.calc || !p.reward) return { ...base, required: p.required, unknown: 'reward' };
  const { calc, reward } = p;
  return {
    ...base,
    required: p.required,
    estimate: reward.estimate,
    places: calc.places.map((place) => {
      const { blueprints: _b, medals: _m, ...row } = placeRow(place, calc.rest);
      return { ...row, ...(reward.estimate && { estimate: true }) };
    }),
  };
}

export function gbCalculatorViewModel(input: GbCalculatorInput): GbCalculatorVm {
  const c = input.construction;
  if (!c) return { kind: 'none' };
  const owner = ownerName(c, c.rankings, input.playerName);
  const ownerUrl = input.playerUrl(c.owner);
  const entity = c.entity;
  if (!entity) return { kind: 'noEntity', owner, ownerUrl };
  // the preview starts where the live construction ends; a level up can overtake a chosen level
  const levels = levelChoice(entity.level, input.previewLevel);
  const preview = levels.preview ? levels.chosen : undefined;
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
    ownerUrl,
    ...(input.foestats && { activity: activityVm(input.foestats, input.today) }),
    availableFp,
    fpBar: input.fpBar,
    fpPackages: input.fpPackages,
    arcBonus: input.arcBonus,
    levels,
  };
  const arcButton = input.arcButton ? input.arcBonus : undefined;
  const effectiveFactor = effective(input.factor, arcButton);
  const buttons = factorButtons(input.factorButtons, arcButton, input.factor);
  const live = { ...entity, rankings: c.rankings, arcBonus: input.arcBonus, factor: effectiveFactor };
  const levelUp = c.past || c.leveled ? undefined : levelUpAndFirst(live, input.greatBuilding(entity.def));
  if (preview !== undefined) {
    return {
      kind: 'preview',
      header,
      factorButtons: buttons,
      effectiveFactor,
      preview: previewVm(input.greatBuilding(entity.def), preview, entity.maxLevel, input.arcBonus, effectiveFactor),
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
  const calc = calculateConstruction({
    ...entity,
    rankings: c.rankings,
    arcBonus: input.arcBonus,
    factor: effectiveFactor,
  });
  const places = calc.places.map((p) => placeRow(p, calc.rest, availableFp));
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
    profitable: !calc.blocked && !c.leveled && places.some((p) => p.status === 'profit' && (p.profit ?? 0) > 0),
  };
}
