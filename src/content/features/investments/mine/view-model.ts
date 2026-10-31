import { formatAge, formatNumber, signed, t } from '../../../core/texts';
import {
  type Investment,
  type InvestmentStatus,
  type Investments,
  type InvestmentTotals,
  sumTotals,
} from '../../../domain/investments';
import { countsIgnored } from '../../../ui/ignore';
import { type Sort, sortRows } from '../../../ui/sortable';
import { type RowWindow, rowsIn, rowWindow } from '../../../ui/windowed-rows';
import type { GbLookups } from '../../shared/gb-lookups';
import {
  type CommonFilter,
  type CommonRowVm,
  commonRowVm,
  DEFAULT_REACH,
  namedSortKeys,
  passesCommon,
  type RowNames,
  rowNames,
} from '../rows';

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
export interface MineFilter extends CommonFilter {
  status: StatusFilter;
}

export const DEFAULT_MINE_FILTER: MineFilter = {
  player: '',
  name: '',
  reach: DEFAULT_REACH,
  onlyMarked: false,
  status: { safe: true, unsafe: true, unknown: true },
  showIgnored: false,
};

/** without a level the rows keep the default order (growth first, then the rest to the level up ascending) */
export type InvestmentSort = Sort<InvestmentColumn>;

/** names, places, status and progress (nearest level up) read from the top, deposit, profit and level from the largest */
export const INVESTMENT_DESC_FIRST: ReadonlySet<InvestmentColumn> = new Set(['mark', 'deposit', 'profit', 'level']);

export interface InvestmentRowVm extends CommonRowVm {
  rank: number;
  deposit: string;
  profit: string;
  gross: string;
  status: InvestmentStatus;
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
  /** "Stand: vor 5 Min." since the last town hall list, or the hint that none was seen */
  age: string;
  sort: InvestmentSort;
  /** the rows in view, those of `scroll` */
  rows: InvestmentRowVm[];
  /** which rows of `rows` are in view */
  scroll: RowWindow;
  /** over all own investments but the ignored ones, whatever the filters leave */
  totals: TotalsVm;
  /** over the filtered rows; missing while the filters leave out none */
  selection?: TotalsVm;
};

export interface InvestmentsInput extends GbLookups {
  investments: Investments;
  /** when the last town hall list came */
  listedAt?: number;
  now: number;
  sort: InvestmentSort;
  /** rows that fit into the table area, and the index of the first one in view (default the top) */
  visible: number;
  scroll?: number;
  filter: MineFilter;
}

const STATUS_ORDER: Record<InvestmentStatus, number> = { safe: 0, unsafe: 1, unknown: 2 };

export type Named = Investment &
  RowNames & {
    /** neither the building nor its owner is ignored */
    counted: boolean;
  };

const sortKey: Record<InvestmentColumn, (r: Named) => number | string> = {
  ...namedSortKeys<Named>(),
  level: (r) => r.level,
  rank: (r) => r.rank,
  deposit: (r) => r.forgePoints,
  profit: (r) => r.profit,
  status: (r) => STATUS_ORDER[r.status],
  // the bar fills towards the level up: the least rest is the most progress
  progress: (r) => r.rest,
};

const totalsVm = (totals: InvestmentTotals, ignored: Investment[] = []): TotalsVm => ({
  circulating: formatNumber(totals.circulating),
  profitSafe: signed(totals.profitSafe),
  profitTotal: signed(totals.profitTotal),
  gain: totals.profitSafe > 0,
  ...(ignored.length > 0 && {
    ignored: t('investments.ignoredTotals', {
      count: formatNumber(ignored.length),
      fp: formatNumber(sumTotals(ignored).circulating),
    }),
  }),
});

/** the rows the filters leave, sorted, with the totals: what a scroll leaves as it is */
export interface MineRows {
  /** no own investment is known at all */
  empty: boolean;
  rows: Named[];
  totals: TotalsVm;
  selection?: TotalsVm;
}

export type MineRowsInput = Omit<InvestmentsInput, 'listedAt' | 'now' | 'visible' | 'scroll'>;

export function mineRows(input: MineRowsInput): MineRows {
  const { sort, filter } = input;
  const all: Named[] = input.investments.rows.map((r) => {
    const names = rowNames(input, r);
    return { ...r, ...names, counted: !countsIgnored(names.ignored, names.ownerIgnored) };
  });
  const passes = passesCommon(filter);
  const named = all
    .filter((r) => filter.showIgnored || r.counted)
    .filter(passes)
    .filter((r) => filter.status[r.status]);
  const counted = all.filter((r) => r.counted);
  const selected = named.filter((r) => r.counted);
  // stable: equal keys keep the default order
  sortRows(named, sort, (column) => sortKey[column]);
  return {
    empty: all.length === 0,
    rows: named,
    totals: totalsVm(
      sumTotals(counted),
      all.filter((r) => !r.counted),
    ),
    ...(selected.length < counted.length && { selection: totalsVm(sumTotals(selected)) }),
  };
}

/** the view of the tab; `rows` from `mineRows`, kept by the caller while only the scroll changes */
export function investmentsViewModel(input: InvestmentsInput, rows: MineRows = mineRows(input)): InvestmentsVm {
  const scroll = rowWindow(input.scroll ?? 0, rows.rows.length, input.visible);
  return {
    age:
      input.listedAt === undefined
        ? t('investments.noList')
        : t('gb.age', { duration: formatAge(input.now - input.listedAt) }),
    sort: input.sort,
    filter: input.filter,
    empty: rows.empty,
    // only the rows in view are drawn, so only they get their cells
    rows: rowsIn(rows.rows, scroll).map((r) => ({
      ...commonRowVm(input, r, r),
      rank: r.rank,
      deposit: formatNumber(r.forgePoints),
      profit: signed(r.profit),
      gross: formatNumber(r.gross),
      status: r.status,
    })),
    scroll,
    totals: rows.totals,
    ...(rows.selection && { selection: rows.selection }),
  };
}
