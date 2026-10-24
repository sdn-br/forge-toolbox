// The snipe helper: which great buildings of a list could be worth a place, from the state the list brings and the
// rankings the toolbox saw before. Every row is calculated on an assumed ranking, in the best and the worst case.
import type { KnownGreatBuilding } from '../../shared/model';
import type { GreatBuildingDef } from '../stores/catalog';
import type { RankingRow } from '../stores/great-building-model';
import { calculateConstruction, type PlaceCalc } from './gb-calculator';
import { emptyLevel } from './gb-level-preview';

/** exact: the ranking is as current as the list; safe: a place pays even in the worst case; possible: only in the best */
export type SnipeTier = 'exact' | 'safe' | 'possible';

/** the best place that is worth taking in one case */
export interface SnipePlace {
  rank: number;
  /** the safe total deposit of the place */
  cost: number;
  profit: number;
}

export interface SnipeHit {
  owner: KnownGreatBuilding['owner'];
  entityId: number;
  cityEntityId: KnownGreatBuilding['cityEntityId'];
  level: number;
  invested: number;
  required: number;
  tier: SnipeTier;
  /** the best place of the best case, of the worst case when only that one pays */
  place: SnipePlace;
  /** the best place of the worst case; missing when no place pays there */
  worst?: SnipePlace;
  /** profit of the worst case (0 when no place pays there) and of the best case; equal when exact */
  profitLow: number;
  profitHigh: number;
  /** the rewards come from the curve, not from game data */
  estimate: boolean;
  /** nothing paid in yet: the building may be locked (not connected or at the unlocked maximum level) */
  maybeLocked: boolean;
  /** when the list or the opened building told the state */
  seenAt: number;
}

export interface SnipeInput {
  buildings: KnownGreatBuilding[];
  greatBuilding(def: KnownGreatBuilding['cityEntityId']): GreatBuildingDef | undefined;
  /** Arc bonus of the session player in percent */
  arcBonus: number;
  /** factor in percent for the rule of a worthwhile place */
  factor: number;
}

export interface SnipeList {
  /** the rows with a worthwhile place, best profit first */
  hits: SnipeHit[];
  /** buildings without a worthwhile place */
  none: number;
  /** buildings the session player invested in; the investments come with their own view */
  ownContribution: number;
  /** buildings whose rewards are unknown (no definition, or a level no table reaches) */
  unknownReward: number;
}

interface Case {
  rankings: RankingRow[];
}

/** The places of the level as the table pays them, nobody on them. The owner's row holds `ownerFp`. */
function assumed(
  places: RankingRow[],
  ownerFp: number,
  holders: Map<number, RankingRow>,
  extra: RankingRow[],
  strongestExtra = 0,
): Case {
  let strongest: number | undefined;
  for (const [rank, row] of holders) {
    if (rank > places.length || row.fp === undefined) continue;
    if (strongest === undefined || row.fp > (holders.get(strongest)?.fp ?? 0)) strongest = rank;
  }
  const grow = strongest ?? 1;
  const rows = places.map((p) => {
    const held = holders.get(p.rank as number);
    const fp = (held?.fp ?? 0) + (p.rank === grow ? strongestExtra : 0);
    return fp > 0 ? { ...p, name: held?.name ?? '', fp } : p;
  });
  return { rankings: [{ name: '', self: false, fp: ownerFp }, ...rows, ...extra] };
}

const worthwhile = (places: PlaceCalc[]): SnipePlace | undefined => {
  let best: SnipePlace | undefined;
  for (const p of places) {
    if (!p.available || !p.worthwhile || p.safeCost === undefined || p.profit === undefined) continue;
    if (!best || p.profit > best.profit) best = { rank: p.rank, cost: p.safeCost, profit: p.profit };
  }
  return best;
};

/**
 * One building of a list. `none` when no place pays, `ownContribution` for a building the player invested in, and
 * `unknownReward` when the rewards of the level are not known.
 */
export function snipeBuilding(
  b: KnownGreatBuilding,
  def: GreatBuildingDef | undefined,
  arcBonus: number,
  factor: number,
): SnipeHit | 'none' | 'ownContribution' | 'unknownReward' {
  if (b.ownContribution) return 'ownContribution';
  const level = def && emptyLevel(def, b.level);
  const places = level?.rankings;
  if (!level || !places) return 'unknownReward';

  const input = { level: b.level, maxLevel: b.maxLevel ?? b.level + 1, connected: b.connected ?? true };
  const solve = (c: Case) =>
    worthwhile(
      calculateConstruction({ ...input, required: b.required, rankings: c.rankings, arcBonus, factor }).places,
    );

  const ranked = b.rankings && b.rankingsLevel === b.level ? b.rankings : undefined;
  const holders = new Map(
    (ranked ?? []).flatMap((r) => (r.rank !== undefined && !r.self ? [[r.rank, r] as const] : [])),
  );
  const sum = b.rankingsInvested ?? 0;
  const beyond = (ranked ?? []).filter((r) => r.rank !== undefined && r.rank > places.length && !r.self);
  const ownerFp = (ranked ?? []).find((r) => r.rank === undefined && !r.self)?.fp ?? 0;
  let exact = false;
  let best: Case;
  let worst: Case;
  if (ranked && b.invested <= sum) {
    exact = true;
    best = worst = assumed(places, ownerFp, holders, beyond);
  } else if (ranked) {
    // the list is newer and the sum grew by delta: unknown deposits, from the owner at best, from the strongest holder at worst
    const delta = b.invested - sum;
    best = assumed(places, ownerFp + delta, holders, beyond);
    worst = assumed(places, ownerFp, holders, beyond, delta);
  } else {
    // nothing known about who holds what: at best the owner paid it all, at worst one player holds it all
    best = assumed(places, b.invested, new Map(), []);
    worst = assumed(places, 0, new Map(), [], b.invested);
  }

  const atBest = solve(best);
  const atWorst = exact ? atBest : solve(worst);
  const place = atBest ?? atWorst;
  if (!place) return 'none';
  const tier: SnipeTier = exact ? 'exact' : atWorst ? 'safe' : 'possible';
  // without a paying place in the worst case the range starts at nothing gained, or at the loss of the one place
  const low = atWorst?.profit ?? Math.min(0, place.profit);
  return {
    owner: b.owner,
    entityId: b.entityId,
    cityEntityId: b.cityEntityId,
    level: b.level,
    invested: b.invested,
    required: b.required,
    tier,
    place,
    ...(atWorst && !exact && { worst: atWorst }),
    profitLow: Math.min(low, place.profit),
    profitHigh: Math.max(low, place.profit),
    estimate: level.reward?.estimate ?? false,
    maybeLocked: b.invested === 0,
    seenAt: b.seenAt,
  };
}

/** The whole list: hits by profit, the rest counted. */
export function snipeList(input: SnipeInput): SnipeList {
  const out: SnipeList = { hits: [], none: 0, ownContribution: 0, unknownReward: 0 };
  for (const b of input.buildings) {
    const r = snipeBuilding(b, input.greatBuilding(b.cityEntityId), input.arcBonus, input.factor);
    if (r === 'none') out.none++;
    else if (r === 'ownContribution') out.ownContribution++;
    else if (r === 'unknownReward') out.unknownReward++;
    else out.hits.push(r);
  }
  out.hits.sort((a, b) => b.profitHigh - a.profitHigh || b.profitLow - a.profitLow);
  return out;
}
