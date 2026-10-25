import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { formatDuration, formatNumber, t } from '../../core/texts';
import type { SnipeTier } from '../../domain/gb-snipe';
import type { PossibleInvestment } from '../../domain/investments';
import { snipeNotes, snipeProfit, snipeProfitKey } from '../../ui/snipe-hit';

export type PossibleColumn = 'owner' | 'name' | 'level' | 'progress' | 'rank' | 'cost' | 'profit' | 'tier' | 'seen';

export interface PossibleSort {
  column: PossibleColumn;
  /** largest first */
  desc: boolean;
}

/** profit first, the best on top, as in the snipe helper */
export const DEFAULT_POSSIBLE_SORT: PossibleSort = { column: 'profit', desc: true };

/** a click on a column head: the same column turns around, another starts with its natural direction */
export function nextPossibleSort(current: PossibleSort, column: PossibleColumn): PossibleSort {
  if (current.column === column) return { column, desc: !current.desc };
  // names read from the top; numbers, the best tier and the newest entry from the largest
  return { column, desc: column !== 'owner' && column !== 'name' };
}

/** what the rows are narrowed to; a view choice of the viewer */
export interface PossibleFilter {
  /** part of the owner's name */
  player: string;
  /** part of the building's name */
  name: string;
  /** only rows with a worthwhile place */
  onlyHits: boolean;
}

export const DEFAULT_FILTER: PossibleFilter = { player: '', name: '', onlyHits: true };

export interface PossibleRowVm {
  owner: PlayerId;
  entityId: number;
  ownerName: string;
  ownerUrl: string;
  name: string;
  level: number;
  invested: string;
  required: string;
  rest: string;
  /** paid in of the level, 0 to 100, for the bar */
  percent: number;
  /** the best place; missing when none pays */
  hit?: { rank: number; cost: string; profit: string; estimate: boolean; tier: SnipeTier };
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
  rows: PossibleRowVm[];
  /** "12 Treffer von 85 LGs" among the buildings the name filters leave */
  count: string;
}

export interface PossibleInput {
  candidates: PossibleInvestment[];
  filter: PossibleFilter;
  sort: PossibleSort;
  now: number;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  playerUrl(id: PlayerId): string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 Std." for three hours and forty minutes: the largest unit only, so the column stays narrow */
const age = (ms: number) =>
  formatDuration(
    ms >= DAY ? Math.floor(ms / DAY) * DAY : ms >= HOUR ? Math.floor(ms / HOUR) * HOUR : Math.max(MINUTE, ms),
  );

const TIER_ORDER: Record<SnipeTier, number> = { exact: 2, safe: 1, possible: 0 };

type Named = PossibleInvestment & { ownerName: string; name: string };

const percentOf = ({ building: b }: PossibleInvestment) =>
  b.required > 0 ? Math.min(100, (b.invested / b.required) * 100) : 0;

/** undefined for a row without a hit in a column of the hit; such rows go last in either direction */
const sortKey: Record<PossibleColumn, (r: Named) => number | string | undefined> = {
  owner: (r) => r.ownerName,
  name: (r) => r.name,
  level: (r) => r.building.level,
  progress: percentOf,
  rank: (r) => r.hit?.place.rank,
  cost: (r) => r.hit?.place.cost,
  profit: (r) => r.hit && snipeProfitKey(r.hit),
  tier: (r) => r.hit && TIER_ORDER[r.hit.tier],
  seen: (r) => r.building.seenAt,
};

const contains = (text: string, part: string) =>
  text.toLocaleLowerCase('de').includes(part.trim().toLocaleLowerCase('de'));

export function possibleViewModel(input: PossibleInput): PossibleVm {
  const { filter, sort } = input;
  const named: Named[] = input.candidates
    .map((c) => ({
      ...c,
      ownerName: input.playerName(c.building.owner) ?? String(c.building.owner),
      name: input.greatBuildingName(c.building.cityEntityId) ?? c.building.cityEntityId,
    }))
    .filter((r) => contains(r.ownerName, filter.player) && contains(r.name, filter.name));
  const hits = named.filter((r) => r.hit).length;
  const shown = filter.onlyHits ? named.filter((r) => r.hit) : named;
  const key = sortKey[sort.column];
  const sign = sort.desc ? -1 : 1;
  shown.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === undefined || y === undefined) return Number(x === undefined) - Number(y === undefined);
    return sign * (typeof x === 'string' ? x.localeCompare(String(y), 'de') : x - (y as number));
  });
  return {
    filter,
    sort,
    empty: input.candidates.length === 0,
    rows: shown.map(({ building: b, hit, ownerName, name }) => ({
      owner: b.owner,
      entityId: b.entityId,
      ownerName,
      ownerUrl: input.playerUrl(b.owner),
      name,
      level: b.level,
      invested: formatNumber(b.invested),
      required: formatNumber(b.required),
      rest: formatNumber(Math.max(0, b.required - b.invested)),
      percent: percentOf({ building: b }),
      ...(hit && {
        hit: {
          rank: hit.place.rank,
          cost: formatNumber(hit.place.cost),
          profit: snipeProfit(hit),
          estimate: hit.estimate,
          tier: hit.tier,
        },
      }),
      notes: hit ? snipeNotes(hit) : [],
      age: t('investments.ago', { duration: age(input.now - b.seenAt) }),
    })),
    count: t('investments.possible.count', { hits: formatNumber(hits), count: formatNumber(named.length) }),
  };
}
