import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { formatAge, formatNumber } from '../../core/texts';
import type { Investment, InvestmentStatus, Investments } from '../../domain/investments';
import { progressPercent } from '../../ui/fp-bar';
import { signed } from '../../ui/snipe-hit';
import { type Sort, sortRows } from '../../ui/sortable';

/** the tabs of the box: the own investments and the buildings of others worth a place */
export type InvestmentsTab = 'mine' | 'possible';
export const TABS: InvestmentsTab[] = ['mine', 'possible'];

export type InvestmentColumn = 'owner' | 'name' | 'level' | 'rank' | 'deposit' | 'profit' | 'status' | 'progress';

/** without a sort the rows keep the default order (growth first, then the rest to the level up ascending) */
export type InvestmentSort = Sort<InvestmentColumn>;

/** names, places, status and progress (nearest level up) read from the top, deposit, profit and level from the largest */
export const INVESTMENT_DESC_FIRST: ReadonlySet<InvestmentColumn> = new Set(['deposit', 'profit', 'level']);

export interface InvestmentRowVm {
  owner: PlayerId;
  entityId: number;
  ownerName: string;
  ownerUrl: string;
  name: string;
  level: number;
  rank: number;
  deposit: string;
  profit: string;
  gross: string;
  status: InvestmentStatus;
  rest: string;
  invested: string;
  required: string;
  /** paid in of the level, 0 to 100, for the bar */
  percent: number;
  /** "44" when others paid in since the building was last open or, never opened, since the first town hall list */
  growth?: string;
}

export type InvestmentsVm = {
  /** "5 Minuten" since the last town hall list; missing when none was seen */
  age?: string;
  sort?: InvestmentSort;
  rows: InvestmentRowVm[];
  /** `gain` when the safe profit is above 0, so the line shows it green */
  totals: { circulating: string; profitSafe: string; profitTotal: string; gain: boolean };
};

export interface InvestmentsInput {
  investments: Investments;
  /** when the last town hall list came */
  listedAt?: number;
  now: number;
  sort?: InvestmentSort;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  playerUrl(id: PlayerId): string;
}

const STATUS_ORDER: Record<InvestmentStatus, number> = { safe: 0, unsafe: 1, unknown: 2 };

type Named = Investment & { ownerName: string; name: string };

const sortKey: Record<InvestmentColumn, (r: Named) => number | string> = {
  owner: (r) => r.ownerName,
  name: (r) => r.name,
  level: (r) => r.level,
  rank: (r) => r.rank,
  deposit: (r) => r.forgePoints,
  profit: (r) => r.profit,
  status: (r) => STATUS_ORDER[r.status],
  // the bar fills towards the level up: the least rest is the most progress
  progress: (r) => r.rest,
};

export function investmentsViewModel(input: InvestmentsInput): InvestmentsVm {
  const named: Named[] = input.investments.rows.map((r) => ({
    ...r,
    ownerName: input.playerName(r.owner) ?? String(r.owner),
    name: input.greatBuildingName(r.cityEntityId) ?? r.cityEntityId,
  }));
  const { sort } = input;
  // stable: equal keys keep the default order
  if (sort) sortRows(named, sortKey[sort.column], sort.desc);
  const { totals } = input.investments;
  return {
    ...(input.listedAt !== undefined && { age: formatAge(input.now - input.listedAt) }),
    ...(sort && { sort }),
    rows: named.map((r) => ({
      owner: r.owner,
      entityId: r.entityId,
      ownerName: r.ownerName,
      ownerUrl: input.playerUrl(r.owner),
      name: r.name,
      level: r.level,
      rank: r.rank,
      deposit: formatNumber(r.forgePoints),
      profit: signed(r.profit),
      gross: formatNumber(r.gross),
      status: r.status,
      rest: formatNumber(r.rest),
      invested: formatNumber(r.invested),
      required: formatNumber(r.required),
      percent: progressPercent(r.invested, r.required),
      ...(r.growth !== undefined && { growth: formatNumber(r.growth) }),
    })),
    totals: {
      circulating: formatNumber(totals.circulating),
      profitSafe: signed(totals.profitSafe),
      profitTotal: signed(totals.profitTotal),
      gain: totals.profitSafe > 0,
    },
  };
}
