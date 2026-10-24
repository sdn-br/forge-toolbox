import type { BuildingDefId, PlayerId } from '../../../shared/ids';
import { formatDuration, formatNumber, t } from '../../core/texts';
import type { Investment, InvestmentStatus, Investments } from '../../domain/investments';

/** the tabs of the box; "Mögliche Investitionen" joins later */
export type InvestmentsTab = 'mine';
export const TABS: InvestmentsTab[] = ['mine'];

export type InvestmentColumn = 'owner' | 'name' | 'level' | 'rank' | 'deposit' | 'profit' | 'status' | 'progress';

/** a column and its direction; without a sort the rows keep the default order (growth first, then the rest to the level up ascending) */
export interface InvestmentSort {
  column: InvestmentColumn;
  /** largest first */
  desc: boolean;
}

/** a click on a column head: the same column turns around, another starts with its natural direction */
export function nextSort(current: InvestmentSort | undefined, column: InvestmentColumn): InvestmentSort {
  if (current?.column === column) return { column, desc: !current.desc };
  // names, places, status and progress (nearest level up) read from the top, deposit and profit from the largest
  return { column, desc: column === 'deposit' || column === 'profit' || column === 'level' };
}

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
  /** "+44" when others paid in since the building was last open or, never opened, since the first town hall list */
  growth?: string;
  growthFp?: string;
}

export type InvestmentsVm = {
  tab: InvestmentsTab;
  /** "5 Minuten" since the last town hall list; missing when none was seen */
  age?: string;
  sort?: InvestmentSort;
  rows: InvestmentRowVm[];
  totals: { circulating: string; profitSafe: string; profitTotal: string };
};

export interface InvestmentsInput {
  tab: InvestmentsTab;
  investments: Investments;
  /** when the last town hall list came */
  listedAt?: number;
  now: number;
  sort?: InvestmentSort;
  greatBuildingName(def: BuildingDefId): string | undefined;
  playerName(id: PlayerId): string | undefined;
  playerUrl(id: PlayerId): string;
}

const MINUTE = 60_000;

export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatNumber(Math.abs(n))}`;

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
  if (sort) {
    const key = sortKey[sort.column];
    const sign = sort.desc ? -1 : 1;
    // stable: equal keys keep the default order
    named.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return sign * (typeof x === 'string' ? x.localeCompare(String(y), 'de') : x - (y as number));
    });
  }
  const { totals } = input.investments;
  return {
    tab: input.tab,
    ...(input.listedAt !== undefined && {
      age: formatDuration(Math.max(MINUTE, input.now - input.listedAt)),
    }),
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
      percent: r.required > 0 ? Math.min(100, (r.invested / r.required) * 100) : 0,
      ...(r.growth !== undefined && {
        growth: t('investments.growth', { growth: formatNumber(r.growth) }),
        growthFp: formatNumber(r.growth),
      }),
    })),
    totals: {
      circulating: formatNumber(totals.circulating),
      profitSafe: signed(totals.profitSafe),
      profitTotal: signed(totals.profitTotal),
    },
  };
}
