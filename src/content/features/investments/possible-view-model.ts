import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import type { Relations } from '../../../shared/model';
import { formatAge, formatNumber, t } from '../../core/texts';
import type { SnipeTier } from '../../domain/gb-snipe';
import type { PossibleInvestment } from '../../domain/investments';
import { progressPercent } from '../../ui/fp-bar';
import { snipeNotes, snipeProfit, snipeProfitKey } from '../../ui/snipe-hit';
import { type Sort, sortRows } from '../../ui/sortable';

export type PossibleColumn =
  | 'owner'
  | 'reach'
  | 'name'
  | 'level'
  | 'progress'
  | 'rank'
  | 'cost'
  | 'profit'
  | 'tier'
  | 'seen';

export type PossibleSort = Sort<PossibleColumn>;

/** profit first, the best on top, as in the snipe helper */
export const DEFAULT_POSSIBLE_SORT: PossibleSort = { column: 'profit', desc: true };

/** names read from the top; numbers, the best tier and the newest entry from the largest */
export const POSSIBLE_DESC_FIRST: ReadonlySet<PossibleColumn> = new Set([
  'level',
  'progress',
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
  /** only owners the player can pay into, and those the player store does not know */
  onlyReachable: boolean;
}

export const DEFAULT_FILTER: PossibleFilter = { player: '', name: '', onlyHits: true, onlyReachable: true };

/** why the player can pay into the owner's buildings; `none` when not at all, `unknown` for an owner never seen */
export type Reach = keyof Relations | 'none' | 'unknown';

/** the first reason in this order names the cell; the reachable ones first when sorted */
const REACH_ORDER: Reach[] = ['neighbor', 'friend', 'guildMember', 'unknown', 'none'];

export interface PossibleRowVm {
  owner: PlayerId;
  entityId: number;
  ownerName: string;
  ownerUrl: string;
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
  /** "12 Treffer von 85 LGs" among the buildings the name and reach filters leave */
  count: string;
}

export interface PossibleInput {
  candidates: PossibleInvestment[];
  filter: PossibleFilter;
  sort: PossibleSort;
  now: number;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  /** undefined for an owner the player store does not know */
  relations(id: PlayerId): Relations | undefined;
  playerUrl(id: PlayerId): string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** "3 Std." for three hours and forty minutes: the largest unit only, so the column stays narrow */
const age = (ms: number) =>
  formatAge(ms >= DAY ? Math.floor(ms / DAY) * DAY : ms >= HOUR ? Math.floor(ms / HOUR) * HOUR : ms);

const TIER_ORDER: Record<SnipeTier, number> = { exact: 2, safe: 1, possible: 0 };

type Named = PossibleInvestment & { ownerName: string; name: string; reasons: Reach[] };

/** the relations that let the player pay in, in the fixed order */
const reasonsOf = (relations: Relations | undefined): Reach[] => {
  if (!relations) return ['unknown'];
  const found = REACH_ORDER.filter((r) => relations[r as keyof Relations] === true);
  return found.length > 0 ? found : ['none'];
};

/** undefined for a row without a hit in a column of the hit; such rows go last in either direction */
const sortKey: Record<PossibleColumn, (r: Named) => number | string | undefined> = {
  owner: (r) => r.ownerName,
  reach: (r) => REACH_ORDER.indexOf(r.reasons[0] as Reach),
  name: (r) => r.name,
  level: (r) => r.building.level,
  progress: ({ building: b }) => progressPercent(b.invested, b.required),
  rank: (r) => r.hit?.place.rank,
  cost: (r) => r.hit?.place.cost,
  profit: (r) => r.hit && snipeProfitKey(r.hit),
  tier: (r) => r.hit && TIER_ORDER[r.hit.tier],
  seen: (r) => r.building.seenAt,
};

const reachTip = (reasons: Reach[]) => {
  const [first] = reasons;
  if (first === 'none' || first === 'unknown') return t(`investments.reachHint.${first}`);
  return reasons.map((r) => t(`investments.reach.${r}`)).join(', ');
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
      reasons: reasonsOf(input.relations(c.building.owner)),
    }))
    .filter((r) => contains(r.ownerName, filter.player) && contains(r.name, filter.name))
    .filter((r) => !filter.onlyReachable || r.reasons[0] !== 'none');
  const hits = named.filter((r) => r.hit).length;
  const shown = filter.onlyHits ? named.filter((r) => r.hit) : named;
  sortRows(shown, sortKey[sort.column], sort.desc);
  return {
    filter,
    sort,
    empty: input.candidates.length === 0,
    rows: shown.map(({ building: b, hit, ownerName, name, reasons }) => ({
      owner: b.owner,
      entityId: b.entityId,
      ownerName,
      ownerUrl: input.playerUrl(b.owner),
      reach: reasons[0] as Reach,
      reasons,
      reachTip: reachTip(reasons),
      name,
      level: b.level,
      invested: formatNumber(b.invested),
      required: formatNumber(b.required),
      rest: formatNumber(Math.max(0, b.required - b.invested)),
      percent: progressPercent(b.invested, b.required),
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
