import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { formatNumber, t } from '../../core/texts';
import { type Activity, playerActivity } from '../../domain/activity';
import { calculateConstruction, type PlaceCalc, type PlaceStatus } from '../../domain/gb-calculator';
import type { FoestatsRecord } from '../../stores/foestats';
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
  holder?: { name: string; fp: number };
  /** missing below the own place, like demand, profit and rate */
  safe?: CostCell;
  demand?: DemandCell;
  gross: number;
  profit?: number;
  rate?: number;
  blueprints: number;
  medals: number;
  status: PlaceStatus;
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
  /** a player's page at foestats */
  playerUrl(id: PlayerId): string;
  /** Forge points of the bar; undefined while the resources are not known */
  fpBar?: number;
  /** Forge points in the packages of the inventory; undefined while the inventory is not known */
  fpPackages?: number;
  arcBonus: number;
  factor: FactorChoice;
  /** the owner's days at foestats; undefined while foestats is off or was not asked yet */
  foestats?: FoestatsRecord;
  /** the current foestats day, `YYYY-MM-DD` */
  today: string;
}

const signed = (n: number) => `${n > 0 ? '+' : ''}${formatNumber(n)}`;

function activityText(a: Activity): string {
  if (a.daysAgo === 0) return t('foestats.activeToday');
  if (a.daysAgo === 1) return t('foestats.activeYesterday');
  if (a.daysAgo !== undefined) return t('foestats.activeDaysAgo', { days: a.daysAgo });
  const flat = a.flatFor ?? 0;
  return flat >= 2 ? t('foestats.flatFor', { days: flat }) : t('foestats.noIncrease');
}

function activityVm(record: FoestatsRecord | undefined, today: string): ActivityVm | undefined {
  if (!record) return undefined;
  const activity = playerActivity(record.days, today);
  const unreachable = t('foestats.unreachable');
  if (!activity) {
    const text = record.unreachable ? unreachable : t('foestats.noData');
    return { text, idle: false, title: text };
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
    title: [t('foestats.source', { date: newest }), record.unreachable && t('foestats.stale')]
      .filter(Boolean)
      .join('\n'),
  };
}

const ownerName = (c: Construction, rows: RankingRow[], playerName: GbCalculatorInput['playerName']) =>
  rows.find((r) => r.rank === undefined && r.player === c.owner)?.name ?? playerName(c.owner) ?? String(c.owner);

/** no cell below the own place, where nothing can be paid */
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

export function gbCalculatorViewModel(input: GbCalculatorInput): GbCalculatorVm {
  const c = input.construction;
  if (!c) return { kind: 'none' };
  const owner = ownerName(c, c.rankings, input.playerName);
  const ownerUrl = input.playerUrl(c.owner);
  const entity = c.entity;
  if (!entity) return { kind: 'noEntity', owner, ownerUrl };
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
  };
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
    demand: demandCell(p, calc.rest, availableFp),
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
    profitable: !calc.blocked && !c.leveled && places.some((p) => p.status === 'profit' && (p.profit ?? 0) > 0),
  };
}
