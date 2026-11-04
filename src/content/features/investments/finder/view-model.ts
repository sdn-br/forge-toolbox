// The tab "LG-Finder": every known building of others, narrowed by type, level and progress.
import type { BuildingDefId } from '../../../../shared/ids';
import type { KnownGreatBuilding } from '../../../../shared/model';
import { formatAgeShort, formatNumber, t } from '../../../core/texts';
import { growthSpan, progressPercent } from '../../../ui/fp-bar';
import { type Sort, sortRows } from '../../../ui/sortable';
import { type RowWindow, rowsIn, rowWindow } from '../../../ui/windowed-rows';
import type { GbLookups } from '../../shared/gb-lookups';
import { type CommonRowVm, commonRowVm, namedSortKeys, type RowNames, rowNames } from '../rows';

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
  /** only buildings with progress on their level */
  started: boolean;
}

export const DEFAULT_FINDER_FILTER: FinderFilter = { type: '', levelFrom: '', levelTo: '', started: false };

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

const sortKey: Record<FinderColumn, (r: Named) => number | string> = {
  ...namedSortKeys<Named>(),
  level: (r) => r.level,
  // the share of the level paid in, as in the other tabs
  progress: (r) => progressPercent(r.invested, r.required),
  seen: (r) => r.seenAt,
};

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
  const defs = [...new Set(buildings.map((b) => b.cityEntityId))];
  const types = defs
    .map((def) => ({ def, name: input.greatBuildingName(def) ?? def }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const rows: Named[] = buildings
    .filter(
      (b) =>
        (filter.type === '' || b.cityEntityId === filter.type) &&
        b.level >= from &&
        b.level <= to &&
        (!filter.started || b.invested > 0),
    )
    .map((b) => ({ ...b, ...rowNames(input, b) }));
  sortRows(rows, input.sort, (column) => sortKey[column]);
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
