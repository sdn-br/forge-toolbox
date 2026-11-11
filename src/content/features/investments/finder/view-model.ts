// The tab "LG-Finder": every known building of others, narrowed by type, level and progress.
import type { BuildingDefId } from '../../../../shared/ids';
import type { KnownGreatBuilding } from '../../../../shared/model';
import { formatAgeShort, formatNumber, t } from '../../../core/texts';
import { growthSpan, progressPercent } from '../../../ui/fp-bar';
import { type Sort, sortRows } from '../../../ui/sortable';
import { type RowWindow, rowsIn, rowWindow } from '../../../ui/windowed-rows';
import type { GbLookups } from '../../shared/gb-lookups';
import { type CommonRowVm, commonRowVm, namedSortKeys, type RowNames, rowNames, savedRecord } from '../rows';

export type FinderColumn = 'owner' | 'reach' | 'name' | 'level' | 'progress' | 'seen';

export type FinderSort = Sort<FinderColumn>;

/** the highest level on top */
export const DEFAULT_FINDER_SORT: FinderSort = [{ column: 'level', desc: true }];

/** names read from the top; numbers and the newest entry from the largest */
export const FINDER_DESC_FIRST: ReadonlySet<FinderColumn> = new Set(['level', 'progress', 'seen']);

/** what the rows are narrowed to; a view choice of the viewer. The levels are the fields as typed, empty is open */
export interface FinderFilter {
  /** a building definition, empty for every type */
  type: string;
  levelFrom: string;
  levelTo: string;
  /** which rows the progress toggles show: those with progress on their level and those without */
  progress: StartedFilter;
}

/** the progress toggles: buildings with something paid in on their level, buildings with nothing */
export interface StartedFilter {
  started: boolean;
  notStarted: boolean;
}

/** the progress toggles in their order */
export const STARTED_TOGGLES: (keyof StartedFilter)[] = ['started', 'notStarted'];

export const DEFAULT_FINDER_FILTER: FinderFilter = {
  type: '',
  levelFrom: '',
  levelTo: '',
  progress: { started: true, notStarted: true },
};

/** the former toggle "only started": on showed the started rows alone, off all; toggles saved since then win */
export const migrateStarted = (saved: Record<string, unknown>): Record<string, unknown> =>
  saved.started === true
    ? { ...saved, progress: { started: true, notStarted: false, ...savedRecord(saved.progress) } }
    : saved;

/** a type of the type choice: the definition and its name */
export interface FinderType {
  def: BuildingDefId;
  name: string;
}

export interface FinderRowVm extends CommonRowVm {
  /** the building has the gold tier */
  gold: boolean;
  /** "vor 3 T." since the building was last seen */
  age: string;
}

export interface FinderVm {
  filter: FinderFilter;
  sort: FinderSort;
  /** the types of the known buildings, by name */
  types: FinderType[];
  /** no building of another player is known at all */
  empty: boolean;
  rows: FinderRowVm[];
  scroll: RowWindow;
  /** "12 von 85 LGs" */
  count: string;
}

export interface FinderInput extends GbLookups {
  buildings: KnownGreatBuilding[];
  filter: FinderFilter;
  sort: FinderSort;
  visible: number;
  scroll?: number;
  now: number;
}

type Named = KnownGreatBuilding & RowNames;

const sortKey: Record<FinderColumn | 'invested', (r: Named) => number | string> = {
  ...namedSortKeys<Named>(),
  level: (r) => r.level,
  // the share of the level paid in, as in the other tabs
  progress: (r) => progressPercent(r.invested, r.required),
  seen: (r) => r.seenAt,
  invested: (r) => r.invested,
};

/** equal levels are told apart by what is paid in, the most first, whichever way the levels run */
const withTiebreak = (sort: FinderSort): Sort<FinderColumn | 'invested'> =>
  sort.flatMap((l) => (l.column === 'level' ? [l, { column: 'invested' as const, desc: true }] : [l]));

/** a level field as a bound; empty or not a number is open */
const bound = (typed: string): number | undefined => {
  const n = Number.parseInt(typed, 10);
  return Number.isFinite(n) ? n : undefined;
};

/** the rows the filter leaves, sorted, with the types and the count: what a scroll leaves as it is */
export interface FinderRows {
  empty: boolean;
  types: FinderType[];
  rows: Named[];
  count: string;
}

export type FinderRowsInput = Omit<FinderInput, 'visible' | 'scroll' | 'now'>;

export function finderRows(input: FinderRowsInput): FinderRows {
  const { filter, buildings } = input;
  const from = bound(filter.levelFrom) ?? Number.NEGATIVE_INFINITY;
  const to = bound(filter.levelTo) ?? Number.POSITIVE_INFINITY;
  const defs = [...new Set(buildings.map((b) => b.def))];
  const types = defs
    .map((def) => ({ def, name: input.greatBuildingName(def) ?? def }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const rows: Named[] = buildings
    .filter(
      (b) =>
        (filter.type === '' || b.def === filter.type) &&
        b.level >= from &&
        b.level <= to &&
        (b.invested > 0 ? filter.progress.started : filter.progress.notStarted),
    )
    .map((b) => ({ ...b, ...rowNames(input, b) }));
  sortRows(rows, withTiebreak(input.sort), (column) => sortKey[column]);
  return {
    empty: buildings.length === 0,
    types,
    rows,
    count: t('investments.finder.count', {
      count: formatNumber(rows.length),
      total: formatNumber(buildings.length),
    }),
  };
}

/** the view of the tab; `rows` from `finderRows`, kept by the caller while only the scroll changes */
export function finderViewModel(input: FinderInput, rows: FinderRows = finderRows(input)): FinderVm {
  const scroll = rowWindow(input.scroll ?? 0, rows.rows.length, input.visible);
  return {
    filter: input.filter,
    sort: input.sort,
    types: rows.types,
    empty: rows.empty,
    rows: rowsIn(rows.rows, scroll).map((b) => ({
      ...commonRowVm(input, b, b),
      ...(b.growth !== undefined && growthSpan(b, input.now)),
      gold: b.tier === 'gold',
      age: t('investments.ago', { duration: formatAgeShort(input.now - b.seenAt) }),
    })),
    scroll,
    count: rows.count,
  };
}
