import { formatAgeShort, formatNumber, t } from '../../../core/texts';
import { ownerShare, type SnipeTier } from '../../../domain/gb-snipe';
import type { PossibleInvestment } from '../../../domain/investments';
import { growthSpan } from '../../../ui/fp-bar';
import { countsIgnored } from '../../../ui/ignore';
import { type HitVm, hitSortKeys, hitVm, type OwnerShareCell, ownerShareCell, snipeNotes } from '../../../ui/snipe-hit';
import { type Sort, sortRows } from '../../../ui/sortable';
import { type RowWindow, rowsIn, rowWindow } from '../../../ui/windowed-rows';
import type { GbLookups } from '../../shared/gb-lookups';
import {
  ALL_MARKS,
  type CommonFilter,
  type CommonRowVm,
  commonRowVm,
  DEFAULT_REACH,
  namedSortKeys,
  passesCommon,
  type RowNames,
  rowNames,
  savedRecord,
} from '../rows';

export type PossibleColumn =
  | 'mark'
  | 'owner'
  | 'reach'
  | 'name'
  | 'level'
  | 'progress'
  | 'share'
  | 'rank'
  | 'cost'
  | 'profit'
  | 'ratio'
  | 'tier'
  | 'seen';

export type PossibleSort = Sort<PossibleColumn>;

/** profit first, the best on top, as in the snipe helper */
export const DEFAULT_POSSIBLE_SORT: PossibleSort = [{ column: 'profit', desc: true }];

/** names read from the top; numbers, the best tier and the newest entry from the largest */
export const POSSIBLE_DESC_FIRST: ReadonlySet<PossibleColumn> = new Set([
  'mark',
  'level',
  'progress',
  'share',
  'rank',
  'cost',
  'profit',
  'ratio',
  'tier',
  'seen',
]);

/** what the rows are narrowed to; a view choice of the viewer */
export interface PossibleFilter extends CommonFilter {
  /** which rows the profit toggles show: those with a worthwhile place and those without */
  profit: ProfitFilter;
  /** which tiers let a row through; rows without a tier always pass */
  tier: TierFilter;
}

/** the profit toggles: rows with a worthwhile place, rows without one (none pays, or the reward is unknown) */
export interface ProfitFilter {
  with: boolean;
  without: boolean;
}

/** the profit toggles in their order */
export const PROFIT_TOGGLES: (keyof ProfitFilter)[] = ['with', 'without'];

/** the former toggle "only with profit": on was the default, off showed every row; toggles saved since then win */
export const migrateProfit = (saved: Record<string, unknown>): Record<string, unknown> =>
  saved.onlyHits === false
    ? {
        ...saved,
        profit: { with: true, without: true, ...savedRecord(saved.profit) },
      }
    : saved;

/** a switch per tier of the rating */
export type TierFilter = Record<SnipeTier, boolean>;

/** the tier toggles in their order, the surest first */
export const TIER_TOGGLES: SnipeTier[] = ['exact', 'safe', 'possible'];

export const DEFAULT_FILTER: PossibleFilter = {
  player: '',
  name: '',
  // only the rows with profit, as the former "only with profit" (Nutzer, 2026-11-01)
  profit: { with: true, without: false },
  reach: DEFAULT_REACH,
  tier: { exact: true, safe: true, possible: true },
  mark: ALL_MARKS,
  showIgnored: false,
};

export interface PossibleRowVm extends CommonRowVm {
  /** "300" when the building gained Forge points between its last two sightings on this level */
  growth?: string;
  /** the owner's share of the level */
  share: OwnerShareCell;
  /** the best place; missing when none pays */
  hit?: HitVm;
  /** lines of the row tooltip */
  notes: string[];
  /** "vor 3 Std." since the building or its list was seen */
  age: string;
}

export interface PossibleVm {
  filter: PossibleFilter;
  sort: PossibleSort;
  /** no building of another player is known at all */
  empty: boolean;
  /** the rows in view, those of `scroll` */
  rows: PossibleRowVm[];
  /** which rows of `rows` are in view */
  scroll: RowWindow;
  /** "12 mit Gewinn von 85 LGs" among the buildings the filters leave, the ignored ones not counted */
  count: string;
}

export interface PossibleInput extends GbLookups {
  candidates: PossibleInvestment[];
  filter: PossibleFilter;
  sort: PossibleSort;
  /** rows that fit into the table area, and the index of the first one in view (default the top) */
  visible: number;
  scroll?: number;
  now: number;
}

export type Named = PossibleInvestment & RowNames;

/** undefined for a row without a hit in a column of the hit; such rows go last in either direction */
const sortKey: Record<PossibleColumn, (r: Named) => number | string | undefined> = {
  ...namedSortKeys<Named>(),
  level: (r) => r.building.level,
  share: (r) => {
    const share = ownerShare(r.building);
    return share.state === 'unknown' ? undefined : share.fp;
  },
  ...hitSortKeys<Named>(
    (r) => r.building,
    (r) => r.hit,
  ),
  seen: (r) => r.building.seenAt,
};

/** the rows the filters leave, sorted, with the count: what a scroll leaves as it is */
export interface PossibleRows {
  /** no building of another player is known at all */
  empty: boolean;
  rows: Named[];
  count: string;
}

export type PossibleRowsInput = Omit<PossibleInput, 'visible' | 'scroll' | 'now'>;

export function possibleRows(input: PossibleRowsInput): PossibleRows {
  const { filter, sort } = input;
  const named: Named[] = input.candidates
    .map((c) => ({ ...c, ...rowNames(input, c.building) }))
    .filter(passesCommon(filter))
    .filter((r) => !r.hit || filter.tier[r.hit.tier]);
  const counted = named.filter((r) => !countsIgnored(r.ignored, r.ownerIgnored));
  const hits = counted.filter((r) => r.hit).length;
  const visible = filter.showIgnored ? named : counted;
  const shown = visible.filter((r) => (r.hit ? filter.profit.with : filter.profit.without));
  sortRows(shown, sort, (column) => sortKey[column]);
  return {
    empty: input.candidates.length === 0,
    rows: shown,
    count: t('investments.possible.count', { hits: formatNumber(hits), count: formatNumber(counted.length) }),
  };
}

/** the view of the tab; `rows` from `possibleRows`, kept by the caller while only the scroll changes */
export function possibleViewModel(input: PossibleInput, rows: PossibleRows = possibleRows(input)): PossibleVm {
  const scroll = rowWindow(input.scroll ?? 0, rows.rows.length, input.visible);
  return {
    filter: input.filter,
    sort: input.sort,
    empty: rows.empty,
    // only the rows in view are drawn, so only they get their cells
    rows: rowsIn(rows.rows, scroll).map((r) => {
      const { building: b, hit } = r;
      return {
        ...commonRowVm(input, b, r),
        ...(b.growth !== undefined && growthSpan(b, input.now)),
        share: ownerShareCell(ownerShare(b), input.now),
        ...(hit && { hit: hitVm(hit) }),
        notes: hit ? snipeNotes(hit) : [],
        age: t('investments.ago', { duration: formatAgeShort(input.now - b.seenAt) }),
      };
    }),
    scroll,
    count: rows.count,
  };
}
