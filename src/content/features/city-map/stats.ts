// Statistics of the own city for the side panel of the box "Stadtplan".
import type { BuildingDefId, EraId } from '../../../shared/ids';
import { type TextKey, t } from '../../core/texts';
import { footprints } from '../../domain/city-grid';
import { areaStats, type StreetEfficiency, streetEfficiency, type TypeStat, typeStats } from '../../domain/city-stats';
import {
  expansionBlocks,
  type OfferStat,
  offerStats,
  placedExpansions,
  type RewardSources,
  rewardSources,
} from '../../domain/expansions';
import type { BuildingDef, CityGrid } from '../../stores/catalog';
import type { City, ExpansionOffer, ResourceId } from '../../stores/city-model';
import type { ResearchExpansion } from '../../stores/research';
import { CATEGORY_COLORS } from '../../ui/city-colors';

/** What the statistics need beyond the city. */
export interface StatsMeans {
  grid?: CityGrid;
  resources: { known: boolean; amount(id: ResourceId): number };
  research: { expansions(): ResearchExpansion[] | undefined; unlocked(): ReadonlySet<string> | undefined };
  eraIndex(era: EraId): number | undefined;
  eraName(era: EraId): string;
}

const KIND_LABELS: Record<string, TextKey> = {
  diamonds: 'cityMap.kind.diamonds',
  reward: 'cityMap.kind.reward',
  quantum: 'cityMap.kind.quantum',
};

export type Offer = OfferStat & {
  label: string;
  eraName?: string;
  /** reward expansions only: the resource `expansions`, won but not placed yet; missing while resources are unknown */
  placeable?: number;
  /** reward expansions only: where the open ones come from; missing while research is unknown */
  sources?: RewardSources;
};

export interface OwnStatsVm {
  /** missing while the unlocked areas are unknown */
  area?: { free: number; total: number };
  buildings: number;
  /** groups with their legend color, most frequent first */
  types: (TypeStat & { label: string; color: string })[];
  /** missing when the definitions name no street requirement */
  streets?: StreetEfficiency;
  expansions: {
    placed?: number;
    /** missing when the game sent no open expansions */
    offers?: Offer[];
    resourcesKnown: boolean;
    /** free blocks of the grid; missing without grid or areas */
    blocks?: { now: number; later: number };
  };
}

export function ownCityStats(city: City, def: (id: BuildingDefId) => BuildingDef | undefined, means: StatsMeans) {
  const fps = footprints(city.buildings.values(), def);
  const types = typeStats(fps);
  const blocks = means.grid && city.areas && expansionBlocks(means.grid, city.areas, city.blocked);
  const streets = streetEfficiency(fps);
  const vm: OwnStatsVm = {
    buildings: types.total,
    types: types.types.map((s) => ({ ...s, label: t(`category.${s.category}`), color: CATEGORY_COLORS[s.category] })),
    ...(streets && { streets }),
    ...(city.areas && { area: areaStats(city.areas, fps) }),
    expansions: {
      resourcesKnown: means.resources.known,
      ...(city.areas && { placed: placedExpansions(city.areas) }),
      ...(city.expansions && { offers: offers(city, city.expansions, means) }),
      ...(blocks && { blocks: { now: blocks.now.length, later: blocks.later.length } }),
    },
  };
  return vm;
}

function offers(city: City, open: ExpansionOffer[], means: StatsMeans): Offer[] {
  const stats = offerStats(open, {
    era: city.era,
    eraIndex: means.eraIndex,
    amount: (id) => means.resources.amount(id),
  });
  const placeable = means.resources.known ? means.resources.amount('expansions') : undefined;
  // won expansions stay placeable when none is open any more; the reward kind sits after the diamond one
  if (placeable && !stats.some((o) => o.kind === 'reward')) {
    const at = stats.findIndex((o) => o.kind !== 'diamonds');
    stats.splice(at < 0 ? stats.length : at, 0, { kind: 'reward', total: 0 });
  }
  return stats.map((o) => {
    const key = KIND_LABELS[o.kind];
    const offer: Offer = { ...o, label: key ? t(key) : o.kind, ...(o.minEra && { eraName: means.eraName(o.minEra) }) };
    if (o.kind !== 'reward') return offer;
    const sources = rewardSources(o.total, means.research.expansions(), means.research.unlocked());
    return { ...offer, ...(placeable !== undefined && { placeable }), ...(sources && { sources }) };
  });
}
