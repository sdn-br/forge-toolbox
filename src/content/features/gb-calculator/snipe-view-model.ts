import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { t } from '../../core/texts';
import type { SnipeHit, SnipeList, SnipeTier } from '../../domain/gb-snipe';
import type { FoestatsRecord } from '../../stores/foestats';
import {
  ownerShareNote,
  signed,
  snipeNotes,
  snipeProfit,
  snipeProfitKey,
  snipeProfitRange,
  TIER_ORDER,
} from '../../ui/snipe-hit';
import { type Sort, sortRows } from '../../ui/sortable';
import { clampTop, type RowWindow, rowWindow } from '../../ui/windowed-rows';
import { type ActivityVm, activityVm } from './view-model';

export type SnipeColumn = 'order' | 'name' | 'level' | 'progress' | 'rank' | 'cost' | 'profit' | 'tier' | 'mark';

export type SnipeSort = Sort<SnipeColumn>;

/** profit first, the best on top */
export const DEFAULT_SORT: SnipeSort = [{ column: 'profit', desc: true }];

/** names and the game's order read from the top, numbers from the largest */
export const SNIPE_DESC_FIRST: ReadonlySet<SnipeColumn> = new Set([
  'level',
  'progress',
  'rank',
  'cost',
  'profit',
  'tier',
  'mark',
]);

/** rows of the table in view at once; the rest scrolls */
export const VISIBLE_ROWS = 6;

export type SnipeScroll = RowWindow;

/** the offset kept inside the list, so a shorter list or a stale offset never leaves the table empty */
export const clampScroll = (top: number, rows: number): number => clampTop(top, rows, VISIBLE_ROWS);

export interface SnipeRowVm {
  owner: PlayerId;
  entityId: number;
  /** place in the game's list, from 1 */
  order: number;
  name: string;
  level: number;
  invested: number;
  required: number;
  rank: number;
  cost: number;
  /** "+85" when exact, "+40 … +310" as a range */
  /** the best case; `profitRange` the range for its tooltip when not exact */
  profit: string;
  profitRange?: string;
  /** the rewards are estimated */
  estimate: boolean;
  tier: SnipeTier;
  /** the player put a star on the building */
  marked: boolean;
  /** lines of the row tooltip */
  notes: string[];
  /** what the owner paid in, for the progress tooltip; missing when unknown */
  ownerShare?: string;
}

export type SnipeVm =
  | { kind: 'none' }
  | {
      kind: 'list';
      /** the player the list belongs to, with the foestats link and activity as on the LG tab */
      owner: string;
      ownerId: PlayerId;
      ownerUrl: string;
      /** the player put a star on the owner; missing when the player store does not know them */
      ownerMarked?: boolean;
      activity?: ActivityVm;
      /** when the list came; the view shows its age as of drawing */
      at: number;
      sort: SnipeSort;
      rows: SnipeRowVm[];
      /** which rows of `rows` are in view */
      scroll: SnipeScroll;
      /** the hit with the highest profit, whatever the sort; missing without hits */
      best?: { name: string; profit: string };
      /** counts under the table, those that are 0 left out */
      counts: string[];
    };

export interface SnipeInput {
  /** the list shown; missing before the first one */
  list?: { owner: PlayerId; ownerName?: string; at: number; entityIds: Iterable<number> };
  result?: SnipeList;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  playerUrl(id: PlayerId): string;
  isMarked(owner: PlayerId, entityId: number): boolean;
  playerMarked(id: PlayerId): boolean | undefined;
  /** what foestats knows about the owner of the list; missing while foestats is off */
  foestats?: FoestatsRecord;
  today: string;
  /** the time the age in a row tooltip counts to */
  now: number;
  sort: SnipeSort;
  /** index of the first row in view; default the top */
  scroll?: number;
}

const activityOf = (record: FoestatsRecord | undefined, today: string) => {
  const activity = activityVm(record, today);
  return activity ? { activity } : {};
};

const withProfitRange = (range: string | undefined) => (range === undefined ? {} : { profitRange: range });

const withOwnerShare = (note: string | undefined) => (note === undefined ? {} : { ownerShare: note });

const sortKey: Record<SnipeColumn, (r: SnipeHit, name: string, order: number, marked: boolean) => number | string> = {
  order: (_, __, order) => order,
  name: (_, name) => name,
  level: (r) => r.level,
  progress: (r) => (r.required > 0 ? r.invested / r.required : 0),
  rank: (r) => r.place.rank,
  cost: (r) => r.place.cost,
  profit: snipeProfitKey,
  tier: (r) => TIER_ORDER[r.tier],
  mark: (_, __, ___, marked) => Number(marked),
};

export function snipeViewModel(input: SnipeInput): SnipeVm {
  const { list, result } = input;
  if (!list || !result) return { kind: 'none' };
  const name = (h: SnipeHit) => input.greatBuildingName(h.cityEntityId) ?? h.cityEntityId;
  const places = new Map([...list.entityIds].map((id, i) => [id, i + 1]));
  const order = (h: SnipeHit) => places.get(h.entityId) ?? 0;
  const hits = sortRows(
    [...result.hits],
    input.sort,
    (column) => (h) => sortKey[column](h, name(h), order(h), input.isMarked(h.owner, h.entityId)),
  );
  const rows = hits.map<SnipeRowVm>((h) => ({
    owner: h.owner,
    entityId: h.entityId,
    order: order(h),
    name: name(h),
    level: h.level,
    invested: h.invested,
    required: h.required,
    rank: h.place.rank,
    cost: h.place.cost,
    profit: snipeProfit(h),
    ...withProfitRange(snipeProfitRange(h)),
    estimate: h.estimate,
    tier: h.tier,
    marked: input.isMarked(h.owner, h.entityId),
    notes: snipeNotes(h),
    ...withOwnerShare(ownerShareNote(h.ownerShare, input.now)),
  }));
  const counts = [
    result.none > 0 && t('snipe.countNone', { count: result.none }),
    result.ownContribution > 0 && t('snipe.countOwn', { count: result.ownContribution }),
    result.unknownReward > 0 && t('snipe.countUnknown', { count: result.unknownReward }),
  ].filter((c): c is string => typeof c === 'string');
  const best = [...result.hits].sort((a, b) => snipeProfitKey(b) - snipeProfitKey(a))[0];
  const ownerMarked = input.playerMarked(list.owner);
  return {
    kind: 'list',
    owner: list.ownerName ?? input.playerName(list.owner) ?? String(list.owner),
    ownerId: list.owner,
    ownerUrl: input.playerUrl(list.owner),
    ...(ownerMarked !== undefined && { ownerMarked }),
    ...activityOf(input.foestats, input.today),
    at: list.at,
    sort: input.sort,
    rows,
    scroll: rowWindow(input.scroll ?? 0, rows.length, VISIBLE_ROWS),
    ...(best && { best: { name: name(best), profit: signed(best.profitHigh) } }),
    counts,
  };
}
