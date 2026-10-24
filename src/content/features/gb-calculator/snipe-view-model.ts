import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { formatNumber, t } from '../../core/texts';
import type { SnipeHit, SnipeList, SnipePlace, SnipeTier } from '../../domain/gb-snipe';

export type SnipeColumn = 'name' | 'level' | 'progress' | 'rank' | 'cost' | 'profit';

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
  return { column, desc: column !== 'name' };
}

export interface SnipeRowVm {
  owner: PlayerId;
  entityId: number;
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
      /** the player the list belongs to */
      owner: string;
      /** when the list came; the view shows its age as of drawing */
      at: number;
      sort: SnipeSort;
      rows: SnipeRowVm[];
      /** counts under the table, those that are 0 left out */
      counts: string[];
    };

export interface SnipeInput {
  /** the list shown; missing before the first one */
  list?: { owner: PlayerId; ownerName?: string; at: number };
  result?: SnipeList;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  sort: SnipeSort;
}

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`;

function profitText(h: SnipeHit): string {
  return h.profitLow === h.profitHigh ? signed(h.profitHigh) : `${signed(h.profitLow)} … ${signed(h.profitHigh)}`;
}

const worstNote = (w: SnipePlace) =>
  t('snipe.worst', { rank: w.rank, cost: formatNumber(w.cost), profit: signed(w.profit) });

const sortKey: Record<SnipeColumn, (r: SnipeHit, name: string) => number | string> = {
  name: (_, name) => name,
  level: (r) => r.level,
  progress: (r) => (r.required > 0 ? r.invested / r.required : 0),
  rank: (r) => r.place.rank,
  cost: (r) => r.place.cost,
  profit: (r) => r.profitHigh * 1e9 + r.profitLow,
};

export function snipeViewModel(input: SnipeInput): SnipeVm {
  const { list, result } = input;
  if (!list || !result) return { kind: 'none' };
  const name = (h: SnipeHit) => input.greatBuildingName(h.cityEntityId) ?? h.cityEntityId;
  const key = sortKey[input.sort.column];
  const sign = input.sort.desc ? -1 : 1;
  const hits = [...result.hits].sort((a, b) => {
    const x = key(a, name(a));
    const y = key(b, name(b));
    return sign * (typeof x === 'string' ? x.localeCompare(String(y), 'de') : x - (y as number));
  });
  const rows = hits.map<SnipeRowVm>((h) => ({
    owner: h.owner,
    entityId: h.entityId,
    name: name(h),
    level: h.level,
    invested: h.invested,
    required: h.required,
    percent: h.required > 0 ? Math.floor((h.invested / h.required) * 100) : 0,
    rank: h.place.rank,
    cost: h.place.cost,
    profit: profitText(h),
    estimate: h.estimate,
    tier: h.tier,
    notes: [h.worst && worstNote(h.worst), h.maybeLocked && t('snipe.maybeLocked')].filter(
      (n): n is string => typeof n === 'string',
    ),
  }));
  const counts = [
    result.none > 0 && t('snipe.countNone', { count: result.none }),
    result.ownContribution > 0 && t('snipe.countOwn', { count: result.ownContribution }),
    result.unknownReward > 0 && t('snipe.countUnknown', { count: result.unknownReward }),
  ].filter((c): c is string => typeof c === 'string');
  return {
    kind: 'list',
    owner: list.ownerName ?? input.playerName(list.owner) ?? String(list.owner),
    at: list.at,
    sort: input.sort,
    rows,
    counts,
  };
}
