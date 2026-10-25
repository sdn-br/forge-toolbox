import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { Relations } from '../../../shared/model';
import { formatAge, formatNumber, t } from '../../core/texts';
import { type OwnerShare, ownerShare, type SnipeTier } from '../../domain/gb-snipe';
import type { PossibleInvestment } from '../../domain/investments';
import { progressPercent } from '../../ui/fp-bar';
import { ignoreNote } from '../../ui/ignore';
import { snipeNotes, snipeProfit, snipeProfitKey, snipeProfitRange, TIER_ORDER } from '../../ui/snipe-hit';
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

export interface PossibleRowVm {
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
  invested: string;
  required: string;
  rest: string;
  /** paid in of the level, 0 to 100, for the bar */
  percent: number;
  /** the owner's share of the level: "320", "?" when unknown; `stale` when drawn muted, with its age as the tip */
  share: { text: string; stale: boolean; tip: string };
  /** the best place; missing when none pays */
  /** `profit` is the best case, `range` the range for its tooltip when not exact */
  hit?: { rank: number; cost: string; profit: string; range?: string; estimate: boolean; tier: SnipeTier };
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

export interface PossibleInput {
  candidates: PossibleInvestment[];
  filter: PossibleFilter;
  sort: PossibleSort;
  /** rows that fit into the table area, and the index of the first one in view (default the top) */
  visible: number;
  scroll?: number;
  now: number;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  /** undefined for an owner the player store does not know */
  relations(id: PlayerId): Relations | undefined;
  isMarked(owner: PlayerId, entityId: number): boolean;
  /** the player put a star on the owner */
  ownerMarked(owner: PlayerId): boolean;
  isIgnored(owner: PlayerId, entityId: number): boolean;
  /** undefined for an owner the player store does not know */
  ownerIgnored(owner: PlayerId): boolean | undefined;
  playerUrl(id: PlayerId): string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "3 Std." for three hours and forty minutes: the largest unit only, so the column stays narrow */
const age = (ms: number) =>
  formatAge(ms >= DAY ? Math.floor(ms / DAY) * DAY : ms >= HOUR ? Math.floor(ms / HOUR) * HOUR : ms);

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
  progress: ({ building: b }) => progressPercent(b.invested, b.required),
  share: (r) => {
    const share = ownerShare(r.building);
    return share.state === 'unknown' ? undefined : share.fp;
  },
  rank: (r) => r.hit?.place.rank,
  cost: (r) => r.hit?.place.cost,
  profit: (r) => r.hit && snipeProfitKey(r.hit),
  tier: (r) => r.hit && TIER_ORDER[r.hit.tier],
  seen: (r) => r.building.seenAt,
};

const shareCell = (share: OwnerShare, now: number): PossibleRowVm['share'] =>
  share.state === 'unknown'
    ? { text: '?', stale: false, tip: '' }
    : {
        text: formatNumber(share.fp),
        stale: share.state === 'stale',
        tip: share.state === 'stale' ? t('investments.shareStale', { age: formatAge(now - share.at) }) : '',
      };

const withRange = (range: string | undefined) => (range === undefined ? {} : { range });

export function possibleViewModel(input: PossibleInput): PossibleVm {
  const { filter, sort } = input;
  const named: Named[] = input.candidates
    .map((c) => ({
      ...c,
      ownerName: input.playerName(c.building.owner) ?? String(c.building.owner),
      name: input.greatBuildingName(c.building.cityEntityId) ?? c.building.cityEntityId,
      reasons: reasonsOf(input.relations(c.building.owner)),
      marked: input.isMarked(c.building.owner, c.building.entityId),
      ownerMarked: input.ownerMarked(c.building.owner),
      ignored: input.isIgnored(c.building.owner, c.building.entityId),
      ownerIgnored: input.ownerIgnored(c.building.owner),
    }))
    .filter((r) => contains(r.ownerName, filter.player) && contains(r.name, filter.name))
    .filter((r) => passesReach(r.reasons, filter.reach))
    .filter((r) => !r.hit || filter.tier[r.hit.tier])
    .filter((r) => !filter.onlyMarked || r.marked || r.ownerMarked);
  const counted = named.filter((r) => !r.ignored && r.ownerIgnored !== true);
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
      ...(ownerIgnored !== undefined && { ownerIgnored }),
      ...ignoreNote(ignored, ownerIgnored),
      reach: reasons[0] as Reach,
      reasons,
      reachTip: reachTip(reasons),
      name,
      level: b.level,
      invested: formatNumber(b.invested),
      required: formatNumber(b.required),
      rest: formatNumber(Math.max(0, b.required - b.invested)),
      percent: progressPercent(b.invested, b.required),
      share: shareCell(ownerShare(b), input.now),
      ...(hit && {
        hit: {
          rank: hit.place.rank,
          cost: formatNumber(hit.place.cost),
          profit: snipeProfit(hit),
          ...withRange(snipeProfitRange(hit)),
          estimate: hit.estimate,
          tier: hit.tier,
        },
      }),
      notes: hit ? snipeNotes(hit) : [],
      age: t('investments.ago', { duration: age(input.now - b.seenAt) }),
    })),
    scroll: rowWindow(input.scroll ?? 0, shown.length, input.visible),
    count: t('investments.possible.count', { hits: formatNumber(hits), count: formatNumber(counted.length) }),
  };
}
