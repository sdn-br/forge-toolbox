import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { t } from '../../core/texts';
import type { SnipeHit, SnipeList, SnipeTier } from '../../domain/gb-snipe';
import type { FoestatsRecord } from '../../stores/foestats';
import { signed, snipeNotes, snipeProfit, snipeProfitKey } from '../../ui/snipe-hit';
import { type ActivityVm, activityVm } from './view-model';

export type SnipeColumn = 'order' | 'name' | 'level' | 'progress' | 'rank' | 'cost' | 'profit';

export interface SnipeSort {
  column: SnipeColumn;
  /** largest first */
  desc: boolean;
}

/** profit first, the best on top */
export const DEFAULT_SORT: SnipeSort = { column: 'profit', desc: true };

/** a click on a column head: the same column turns around, another starts with its natural direction */
export function nextSort(current: SnipeSort, column: SnipeColumn): SnipeSort {
  if (current.column === column) return { column, desc: !current.desc };
  // names and the game's order read from the top, numbers from the largest
  return { column, desc: column !== 'name' && column !== 'order' };
}

/** rows of the table in view at once; the rest scrolls */
export const VISIBLE_ROWS = 6;

export interface SnipeScroll {
  /** index of the first row in view */
  top: number;
  /** rows hidden above and below */
  above: number;
  below: number;
}

/** the offset kept inside the list, so a shorter list or a stale offset never leaves the table empty */
export function clampScroll(top: number, rows: number): number {
  return Math.max(0, Math.min(top, rows - VISIBLE_ROWS));
}

export interface SnipeRowVm {
  owner: PlayerId;
  entityId: number;
  /** place in the game's list, from 1 */
  order: number;
  name: string;
  level: number;
  invested: number;
  required: number;
  /** invested in percent of the cost, whole */
  percent: number;
  rank: number;
  cost: number;
  /** "+85" when exact, "+40 … +310" as a range */
  profit: string;
  /** the rewards are estimated */
  estimate: boolean;
  tier: SnipeTier;
  /** lines of the row tooltip */
  notes: string[];
}

export type SnipeVm =
  | { kind: 'none' }
  | {
      kind: 'list';
      /** the player the list belongs to, with the foestats link and activity as on the LG tab */
      owner: string;
      ownerUrl: string;
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
  /** what foestats knows about the owner of the list; missing while foestats is off */
  foestats?: FoestatsRecord;
  today: string;
  sort: SnipeSort;
  /** index of the first row in view; default the top */
  scroll?: number;
}

const activityOf = (record: FoestatsRecord | undefined, today: string) => {
  const activity = activityVm(record, today);
  return activity ? { activity } : {};
};

const sortKey: Record<SnipeColumn, (r: SnipeHit, name: string, order: number) => number | string> = {
  order: (_, __, order) => order,
  name: (_, name) => name,
  level: (r) => r.level,
  progress: (r) => (r.required > 0 ? r.invested / r.required : 0),
  rank: (r) => r.place.rank,
  cost: (r) => r.place.cost,
  profit: snipeProfitKey,
};

export function snipeViewModel(input: SnipeInput): SnipeVm {
  const { list, result } = input;
  if (!list || !result) return { kind: 'none' };
  const name = (h: SnipeHit) => input.greatBuildingName(h.cityEntityId) ?? h.cityEntityId;
  const places = new Map([...list.entityIds].map((id, i) => [id, i + 1]));
  const order = (h: SnipeHit) => places.get(h.entityId) ?? 0;
  const key = sortKey[input.sort.column];
  const sign = input.sort.desc ? -1 : 1;
  const hits = [...result.hits].sort((a, b) => {
    const x = key(a, name(a), order(a));
    const y = key(b, name(b), order(b));
    return sign * (typeof x === 'string' ? x.localeCompare(String(y), 'de') : x - (y as number));
  });
  const rows = hits.map<SnipeRowVm>((h) => ({
    owner: h.owner,
    entityId: h.entityId,
    order: order(h),
    name: name(h),
    level: h.level,
    invested: h.invested,
    required: h.required,
    percent: h.required > 0 ? Math.floor((h.invested / h.required) * 100) : 0,
    rank: h.place.rank,
    cost: h.place.cost,
    profit: snipeProfit(h),
    estimate: h.estimate,
    tier: h.tier,
    notes: snipeNotes(h),
  }));
  const counts = [
    result.none > 0 && t('snipe.countNone', { count: result.none }),
    result.ownContribution > 0 && t('snipe.countOwn', { count: result.ownContribution }),
    result.unknownReward > 0 && t('snipe.countUnknown', { count: result.unknownReward }),
  ].filter((c): c is string => typeof c === 'string');
  const best = [...result.hits].sort((a, b) => snipeProfitKey(b) - snipeProfitKey(a))[0];
  const top = clampScroll(input.scroll ?? 0, rows.length);
  return {
    kind: 'list',
    owner: list.ownerName ?? input.playerName(list.owner) ?? String(list.owner),
    ownerUrl: input.playerUrl(list.owner),
    ...activityOf(input.foestats, input.today),
    at: list.at,
    sort: input.sort,
    rows,
    scroll: { top, above: top, below: Math.max(0, rows.length - top - VISIBLE_ROWS) },
    ...(best && { best: { name: name(best), profit: signed(best.profitHigh) } }),
    counts,
  };
}
