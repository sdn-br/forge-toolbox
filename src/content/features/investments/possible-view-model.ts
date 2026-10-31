import type { PlayerId } from '../../../shared/ids';
import { formatAgeShort, formatNumber, t, textFilter } from '../../core/texts';
import { ownerShare, type SnipeTier } from '../../domain/gb-snipe';
import type { PossibleInvestment } from '../../domain/investments';
import { passesReach, REACH_ORDER, type Reach, type ReachFilter, reasonsOf } from '../../domain/reach';
import { type ProgressVm, progressVm } from '../../ui/fp-bar';
import { countsIgnored, ignoreNote } from '../../ui/ignore';
import { type HitVm, hitSortKeys, hitVm, type OwnerShareCell, ownerShareCell, snipeNotes } from '../../ui/snipe-hit';
import { type Sort, sortRows } from '../../ui/sortable';
import { type RowWindow, rowWindow } from '../../ui/windowed-rows';
import type { GbLookups } from '../shared/gb-lookups';
import { DEFAULT_REACH, reachTip } from './filter-model';

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
  'tier',
  'seen',
]);

/** what the rows are narrowed to; a view choice of the viewer */
export interface PossibleFilter {
  /** part of the owner's name */
  player: string;
  /** part of the building's name */
  name: string;
  /** only rows with a worthwhile place */
  onlyHits: boolean;
  /** which reasons let a row through; owners the player store does not know always pass */
  reach: ReachFilter;
  /** which tiers let a row through; rows without a tier always pass */
  tier: TierFilter;
  /** only buildings the player marked and buildings of marked owners */
  onlyMarked: boolean;
  /** also the rows of ignored buildings and owners, drawn muted; they never count in the count line */
  showIgnored: boolean;
}

/** a switch per tier of the rating */
export type TierFilter = Record<SnipeTier, boolean>;

/** the tier toggles in their order, the surest first */
export const TIER_TOGGLES: SnipeTier[] = ['exact', 'safe', 'possible'];

export const DEFAULT_FILTER: PossibleFilter = {
  player: '',
  name: '',
  onlyHits: true,
  reach: DEFAULT_REACH,
  tier: { exact: true, safe: true, possible: true },
  onlyMarked: false,
  showIgnored: false,
};

/** the progress of the level for its cell */
export interface PossibleRowVm extends ProgressVm {
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
  /** the player ignores the owner; undefined when the player store does not know the owner, who cannot be ignored */
  ownerIgnored: boolean | undefined;
  /** why the row counts as ignored, in words; missing when it does not */
  ignoreNote?: string;
  /** every reason, each drawn as its icon; a first `none` drawn muted */
  reasons: Reach[];
  /** every reason, for the tooltip */
  reachTip: string;
  name: string;
  level: number;
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
  /** all rows; the view draws those of `scroll` */
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

type Named = PossibleInvestment & {
  ownerName: string;
  name: string;
  reasons: Reach[];
  marked: boolean;
  ownerMarked: boolean;
  ignored: boolean;
  ownerIgnored: boolean | undefined;
};

/** undefined for a row without a hit in a column of the hit; such rows go last in either direction */
const sortKey: Record<PossibleColumn, (r: Named) => number | string | undefined> = {
  mark: (r) => Number(r.marked),
  owner: (r) => r.ownerName,
  reach: (r) => REACH_ORDER.indexOf(r.reasons[0] as Reach),
  name: (r) => r.name,
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

export function possibleViewModel(input: PossibleInput): PossibleVm {
  const { filter, sort } = input;
  const byPlayer = textFilter(filter.player);
  const byName = textFilter(filter.name);
  const named: Named[] = input.candidates
    .map((c) => ({
      ...c,
      ownerName: input.playerName(c.building.owner) ?? String(c.building.owner),
      name: input.greatBuildingName(c.building.cityEntityId) ?? c.building.cityEntityId,
      reasons: reasonsOf(input.relations(c.building.owner)),
      marked: input.isMarked(c.building.owner, c.building.entityId),
      ownerMarked: input.playerMarked(c.building.owner) === true,
      ignored: input.isIgnored(c.building.owner, c.building.entityId),
      ownerIgnored: input.ownerIgnored(c.building.owner),
    }))
    .filter((r) => byPlayer(r.ownerName) && byName(r.name))
    .filter((r) => passesReach(r.reasons, filter.reach))
    .filter((r) => !r.hit || filter.tier[r.hit.tier])
    .filter((r) => !filter.onlyMarked || r.marked || r.ownerMarked);
  const counted = named.filter((r) => !countsIgnored(r.ignored, r.ownerIgnored));
  const hits = counted.filter((r) => r.hit).length;
  const visible = filter.showIgnored ? named : counted;
  const shown = filter.onlyHits ? visible.filter((r) => r.hit) : visible;
  sortRows(shown, sort, (column) => sortKey[column]);
  return {
    filter,
    sort,
    empty: input.candidates.length === 0,
    rows: shown.map(({ building: b, hit, ownerName, name, reasons, marked, ownerMarked, ignored, ownerIgnored }) => ({
      owner: b.owner,
      entityId: b.entityId,
      marked,
      ownerName,
      ownerUrl: input.playerUrl(b.owner),
      ownerMarked,
      ignored,
      ownerIgnored,
      ...ignoreNote(ignored, ownerIgnored),
      reasons,
      reachTip: reachTip(reasons),
      name,
      level: b.level,
      ...progressVm(b.invested, b.required),
      ...(b.growth !== undefined && { growth: formatNumber(b.growth) }),
      share: ownerShareCell(ownerShare(b), input.now),
      ...(hit && { hit: hitVm(hit) }),
      notes: hit ? snipeNotes(hit) : [],
      age: t('investments.ago', { duration: formatAgeShort(input.now - b.seenAt) }),
    })),
    scroll: rowWindow(input.scroll ?? 0, shown.length, input.visible),
    count: t('investments.possible.count', { hits: formatNumber(hits), count: formatNumber(counted.length) }),
  };
}
