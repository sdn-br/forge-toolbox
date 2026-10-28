import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { Relations } from '../../../shared/model';
import { formatAge, formatNumber, signed, t } from '../../core/texts';
import {
  type Investment,
  type InvestmentStatus,
  type Investments,
  type InvestmentTotals,
  sumTotals,
} from '../../domain/investments';
import { progressPercent } from '../../ui/fp-bar';
import { ignoreNote } from '../../ui/ignore';
import { type Sort, sortRows } from '../../ui/sortable';
import { type RowWindow, rowWindow } from '../../ui/windowed-rows';
import {
  contains,
  DEFAULT_REACH,
  passesReach,
  REACH_ORDER,
  type Reach,
  type ReachFilter,
  reachTip,
  reasonsOf,
} from './filter-model';

/** the tabs of the box: the own investments and the buildings of others worth a place */
export type InvestmentsTab = 'mine' | 'possible';
export const TABS: InvestmentsTab[] = ['mine', 'possible'];

export type InvestmentColumn =
  | 'mark'
  | 'owner'
  | 'reach'
  | 'name'
  | 'level'
  | 'rank'
  | 'deposit'
  | 'profit'
  | 'status'
  | 'progress';

/** a switch per status; a row stays when its status is on */
export type StatusFilter = Record<InvestmentStatus, boolean>;

/** the status toggles in their order, the surest first */
export const STATUS_TOGGLES: InvestmentStatus[] = ['safe', 'unsafe', 'unknown'];

/** what the own rows are narrowed to; a view choice of the viewer, kept apart from that of the possible tab */
export interface MineFilter {
  /** part of the owner's name */
  player: string;
  /** part of the building's name */
  name: string;
  /** which reasons let a row through; owners the player store does not know always pass */
  reach: ReachFilter;
  /** only buildings the player marked and buildings of marked owners */
  onlyMarked: boolean;
  status: StatusFilter;
  /** also the rows of ignored buildings and owners, drawn muted */
  showIgnored: boolean;
}

export const DEFAULT_MINE_FILTER: MineFilter = {
  player: '',
  name: '',
  reach: DEFAULT_REACH,
  onlyMarked: false,
  status: { safe: true, unsafe: true, unknown: true },
  showIgnored: false,
};

/** without a sort the rows keep the default order (growth first, then the rest to the level up ascending) */
export type InvestmentSort = Sort<InvestmentColumn>;

/** names, places, status and progress (nearest level up) read from the top, deposit, profit and level from the largest */
export const INVESTMENT_DESC_FIRST: ReadonlySet<InvestmentColumn> = new Set(['mark', 'deposit', 'profit', 'level']);

export interface InvestmentRowVm {
  owner: PlayerId;
  entityId: number;
  /** the player put a star on the building */
  marked: boolean;
  ownerName: string;
  ownerUrl: string;
  /** the player put a star on the owner */
  ownerMarked: boolean;
  /** the player ignores the building */
  ignored: boolean;
  /** the player ignores the owner; missing when the player store does not know the owner, who cannot be ignored */
  ownerIgnored?: boolean;
  /** why the row counts as ignored, in words; missing when it does not */
  ignoreNote?: string;
  /** the first reason, `none` drawn muted */
  reach: Reach;
  /** every reason, each drawn as its icon */
  reasons: Reach[];
  /** every reason, for the tooltip */
  reachTip: string;
  name: string;
  level: number;
  rank: number;
  deposit: string;
  profit: string;
  gross: string;
  status: InvestmentStatus;
  rest: string;
  invested: string;
  required: string;
  /** paid in of the level, 0 to 100, for the bar */
  percent: number;
  /** "44" when others paid in since the building was last open or, never opened, since the first town hall list */
  growth?: string;
}

/** the totals as drawn; `gain` when the safe profit is above 0, so the line shows it green */
export interface TotalsVm {
  circulating: string;
  profitSafe: string;
  profitTotal: string;
  gain: boolean;
  /** "3 ignoriert, 1.200 FP": the ignored rows, which no sum counts; missing without any */
  ignored?: string;
}

export type InvestmentsVm = {
  filter: MineFilter;
  /** no own investment is known at all */
  empty: boolean;
  /** "5 Minuten" since the last town hall list; missing when none was seen */
  age?: string;
  sort?: InvestmentSort;
  /** all rows; the view draws those of `scroll` */
  rows: InvestmentRowVm[];
  /** which rows of `rows` are in view */
  scroll: RowWindow;
  /** over all own investments but the ignored ones, whatever the filters leave */
  totals: TotalsVm;
  /** over the filtered rows; missing while the filters leave out none */
  selection?: TotalsVm;
};

export interface InvestmentsInput {
  investments: Investments;
  /** when the last town hall list came */
  listedAt?: number;
  now: number;
  sort?: InvestmentSort;
  /** rows that fit into the table area, and the index of the first one in view (default the top) */
  visible: number;
  scroll?: number;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  playerUrl(id: PlayerId): string;
  isMarked(owner: PlayerId, entityId: number): boolean;
  /** the player put a star on the owner */
  ownerMarked(owner: PlayerId): boolean;
  isIgnored(owner: PlayerId, entityId: number): boolean;
  /** undefined for an owner the player store does not know */
  ownerIgnored(owner: PlayerId): boolean | undefined;
  filter: MineFilter;
  /** undefined for an owner the player store does not know */
  relations(id: PlayerId): Relations | undefined;
}

const STATUS_ORDER: Record<InvestmentStatus, number> = { safe: 0, unsafe: 1, unknown: 2 };

type Named = Investment & {
  ownerName: string;
  name: string;
  marked: boolean;
  ownerMarked: boolean;
  ignored: boolean;
  ownerIgnored: boolean | undefined;
  /** the building or its owner is ignored */
  counted: boolean;
  reasons: Reach[];
};

const sortKey: Record<InvestmentColumn, (r: Named) => number | string> = {
  mark: (r) => Number(r.marked),
  owner: (r) => r.ownerName,
  reach: (r) => REACH_ORDER.indexOf(r.reasons[0] as Reach),
  name: (r) => r.name,
  level: (r) => r.level,
  rank: (r) => r.rank,
  deposit: (r) => r.forgePoints,
  profit: (r) => r.profit,
  status: (r) => STATUS_ORDER[r.status],
  // the bar fills towards the level up: the least rest is the most progress
  progress: (r) => r.rest,
};

const totalsVm = (totals: InvestmentTotals, ignored?: Investment[]): TotalsVm => ({
  circulating: formatNumber(totals.circulating),
  profitSafe: signed(totals.profitSafe),
  profitTotal: signed(totals.profitTotal),
  gain: totals.profitSafe > 0,
  ...(ignored &&
    ignored.length > 0 && {
      ignored: t('investments.ignoredTotals', {
        count: formatNumber(ignored.length),
        fp: formatNumber(sumTotals(ignored).circulating),
      }),
    }),
});

export function investmentsViewModel(input: InvestmentsInput): InvestmentsVm {
  const { sort, filter } = input;
  const all: Named[] = input.investments.rows
    .map((r) => ({
      ...r,
      ownerName: input.playerName(r.owner) ?? String(r.owner),
      name: input.greatBuildingName(r.cityEntityId) ?? r.cityEntityId,
      marked: input.isMarked(r.owner, r.entityId),
      ownerMarked: input.ownerMarked(r.owner),
      ignored: input.isIgnored(r.owner, r.entityId),
      ownerIgnored: input.ownerIgnored(r.owner),
      reasons: reasonsOf(input.relations(r.owner)),
    }))
    .map((r) => ({ ...r, counted: !r.ignored && r.ownerIgnored !== true }));
  const named = all
    .filter((r) => filter.showIgnored || r.counted)
    .filter((r) => contains(r.ownerName, filter.player) && contains(r.name, filter.name))
    .filter((r) => passesReach(r.reasons, filter.reach))
    .filter((r) => filter.status[r.status])
    .filter((r) => !filter.onlyMarked || r.marked || r.ownerMarked);
  const counted = all.filter((r) => r.counted);
  const selected = named.filter((r) => r.counted);
  // stable: equal keys keep the default order
  if (sort) sortRows(named, sort, (column) => sortKey[column]);
  return {
    ...(input.listedAt !== undefined && { age: formatAge(input.now - input.listedAt) }),
    ...(sort && { sort }),
    filter,
    empty: all.length === 0,
    rows: named.map((r) => ({
      owner: r.owner,
      entityId: r.entityId,
      marked: r.marked,
      ownerName: r.ownerName,
      ownerUrl: input.playerUrl(r.owner),
      ownerMarked: r.ownerMarked,
      ignored: r.ignored,
      ...(r.ownerIgnored !== undefined && { ownerIgnored: r.ownerIgnored }),
      ...ignoreNote(r.ignored, r.ownerIgnored),
      reach: r.reasons[0] as Reach,
      reasons: r.reasons,
      reachTip: reachTip(r.reasons),
      name: r.name,
      level: r.level,
      rank: r.rank,
      deposit: formatNumber(r.forgePoints),
      profit: signed(r.profit),
      gross: formatNumber(r.gross),
      status: r.status,
      rest: formatNumber(r.rest),
      invested: formatNumber(r.invested),
      required: formatNumber(r.required),
      percent: progressPercent(r.invested, r.required),
      ...(r.growth !== undefined && { growth: formatNumber(r.growth) }),
    })),
    scroll: rowWindow(input.scroll ?? 0, named.length, input.visible),
    totals: totalsVm(
      sumTotals(counted),
      all.filter((r) => !r.counted),
    ),
    ...(selected.length < counted.length && { selection: totalsVm(sumTotals(selected)) }),
  };
}
