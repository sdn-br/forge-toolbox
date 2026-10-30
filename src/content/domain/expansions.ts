// Expansions of the own city: placed ones, free blocks of the grid, what the player can buy. Pure.
import type { EraId } from '../../shared/ids';
import type { CityGrid } from '../stores/catalog';
import type { Area, ExpansionOffer, ResourceId } from '../stores/city-model';
import type { ResearchExpansion } from '../stores/research';
import type { TileRect } from './city-grid';
import { areaTiles } from './city-stats';

const BLOCK = 4;
/** the start area of 16 × 16 tiles holds 16 blocks */
const START_BLOCKS = 16;

/** Unlocked blocks beyond the start area. */
export const placedExpansions = (areas: Area[]): number =>
  Math.max(0, Math.floor(areaTiles(areas) / (BLOCK * BLOCK)) - START_BLOCKS);

export interface ExpansionBlocks {
  unlocked: number;
  blocked: number;
  /** free blocks sharing an edge with an unlocked block */
  now: TileRect[];
  /** the other free blocks */
  later: TileRect[];
}

const covers = (areas: Area[], x: number, y: number) =>
  areas.some((a) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.length);

/**
 * The blocks of the grid: unlocked when the areas cover their top left tile, blocked when the blocked areas do,
 * free otherwise. Blocked blocks are assumed not to be buyable.
 */
export function expansionBlocks(grid: CityGrid, areas: Area[], blocked: Area[] | undefined): ExpansionBlocks {
  const out: ExpansionBlocks = { unlocked: 0, blocked: 0, now: [], later: [] };
  const free: TileRect[] = [];
  for (const b of grid.blocks) {
    if (covers(areas, b.x, b.y)) out.unlocked++;
    else if (blocked && covers(blocked, b.x, b.y)) out.blocked++;
    else free.push({ x: b.x, y: b.y, width: BLOCK, length: BLOCK });
  }
  for (const f of free) {
    const neighbors = [
      [f.x - BLOCK, f.y],
      [f.x + BLOCK, f.y],
      [f.x, f.y - BLOCK],
      [f.x, f.y + BLOCK],
    ] as const;
    (neighbors.some(([x, y]) => covers(areas, x, y)) ? out.now : out.later).push(f);
  }
  return out;
}

type OfferKind = 'diamonds' | 'reward' | 'quantum';

export interface OfferStat {
  /** an own kind (`OfferKind`), or the game type for kinds the toolbox does not know */
  kind: string;
  total: number;
  /** how many the player can buy in a row, cheapest first; missing for kinds nobody buys and unknown kinds */
  buyable?: number;
  /** price of the first one the player cannot buy yet, among those of a reached era */
  next?: number;
  /** the earliest era of those not reached yet */
  minEra?: EraId;
}

/**
 * Kinds in the game's order with the resource that pays them. Reward expansions (`tileset_reward`) come as rewards
 * only: their entries name coins and diamonds, yet the game sells none of them (seen 2026-10-21).
 */
const KINDS: { type: string; kind: OfferKind; pay?: ResourceId }[] = [
  { type: 'tileset_premium', kind: 'diamonds', pay: 'premium' },
  { type: 'tileset_reward', kind: 'reward' },
  { type: 'raidMedals', kind: 'quantum', pay: 'guild_raids_medals' },
];

export interface PlayerMeans {
  era: EraId;
  eraIndex: (era: EraId) => number | undefined;
  amount: (resource: ResourceId) => number;
}

export function offerStats(offers: ExpansionOffer[], means: PlayerMeans): OfferStat[] {
  const own = means.eraIndex(means.era);
  // an unknown era counts as not reached
  const reached = (o: ExpansionOffer) => {
    if (!o.minEra) return true;
    const need = means.eraIndex(o.minEra);
    return own !== undefined && need !== undefined && own >= need;
  };
  const stats: OfferStat[] = [];
  for (const { type, kind, pay } of KINDS) {
    const of = offers.filter((o) => o.kind === type);
    if (of.length === 0) continue;
    if (!pay) {
      stats.push({ kind, total: of.length });
      continue;
    }
    const later = of.flatMap((o) => (o.minEra && !reached(o) ? [o.minEra] : []));
    later.sort((a, b) => (means.eraIndex(a) ?? Infinity) - (means.eraIndex(b) ?? Infinity));
    const prices = of
      .filter(reached)
      .map((o) => o.cost[pay])
      .filter((p): p is number => p !== undefined)
      .sort((a, b) => a - b);
    let left = means.amount(pay);
    let buyable = 0;
    for (const price of prices) {
      if (price > left) break;
      left -= price;
      buyable++;
    }
    const next = prices[buyable];
    stats.push({
      kind,
      total: of.length,
      buyable,
      ...(next !== undefined && { next }),
      ...(later[0] && { minEra: later[0] }),
    });
  }
  const known = new Set(KINDS.map((k) => k.type));
  const others = new Map<string, number>();
  for (const o of offers) if (!known.has(o.kind)) others.set(o.kind, (others.get(o.kind) ?? 0) + 1);
  for (const [kind, total] of others) stats.push({ kind, total });
  return stats;
}

/** Where the open reward expansions come from. */
export interface RewardSources {
  /** main city expansions of the technologies not unlocked yet */
  fromResearch: number;
  /** name of the first of those technologies along the tree */
  nextTech?: string;
  /**
   * the open ones research does not explain, assumed to come from the provinces of the continent map;
   * missing when none are left, or when research alone exceeds the open ones (then the assumption is wrong)
   */
  fromMap?: number;
}

/** `open` is the number of `tileset_reward` entries; undefined while research metadata or progress are unknown. */
export function rewardSources(
  open: number,
  research: ResearchExpansion[] | undefined,
  unlocked: ReadonlySet<string> | undefined,
): RewardSources | undefined {
  if (!research || !unlocked) return undefined;
  const ahead = research.filter((r) => !unlocked.has(r.tech));
  const fromResearch = ahead.reduce((sum, r) => sum + r.amount, 0);
  const fromMap = open - fromResearch;
  return {
    fromResearch,
    ...(ahead[0] && { nextTech: ahead[0].name }),
    ...(fromMap > 0 && { fromMap }),
  };
}
