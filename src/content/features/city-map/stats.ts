// Statistics of the own city for the side panel of the box "Stadtplan".
import type { BuildingDefId, EraId } from '../../../shared/ids';
import { type TextKey, t } from '../../core/texts';
import { footprints } from '../../domain/city-grid';
import { areaStats, type StreetEfficiency, streetEfficiency, type TypeStat, typeStats } from '../../domain/city-stats';
import { expansionBlocks, type OfferStat, offerStats, placedExpansions } from '../../domain/expansions';
import type { BuildingDef, CityGrid } from '../../stores/catalog';
import type { City, ResourceId } from '../../stores/city-model';
import { CATEGORY_COLORS } from '../../ui/city-colors';

/** What the statistics need beyond the city. */
export interface StatsMeans {
  grid?: CityGrid;
  resources: { known: boolean; amount(id: ResourceId): number };
  eraIndex(era: EraId): number | undefined;
  eraName(era: EraId): string;
}

const KIND_LABELS: Record<string, TextKey> = {
  coins: 'cityMap.kind.coins',
  medals: 'cityMap.kind.medals',
  diamonds: 'cityMap.kind.diamonds',
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
    /** only when there are some */
    unplaced?: number;
    /** missing when the game sent no open expansions */
    offers?: (OfferStat & { label: string; eraName?: string })[];
    resourcesKnown: boolean;
    /** free blocks of the grid; missing without grid or areas */
    blocks?: { now: number; later: number };
  };
}

export function ownCityStats(city: City, def: (id: BuildingDefId) => BuildingDef | undefined, means: StatsMeans) {
  const fps = footprints(city.buildings.values(), def);
  const types = typeStats(fps);
  const unplaced = means.resources.amount('expansions');
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
      ...(unplaced > 0 && { unplaced }),
      ...(city.expansions && {
        offers: offerStats(city.expansions, {
          era: city.era,
          eraIndex: means.eraIndex,
          amount: (id) => means.resources.amount(id),
        }).map((o) => {
          const key = KIND_LABELS[o.kind];
          return { ...o, label: key ? t(key) : o.kind, ...(o.minEra && { eraName: means.eraName(o.minEra) }) };
        }),
      }),
      ...(blocks && { blocks: { now: blocks.now.length, later: blocks.later.length } }),
    },
  };
  return vm;
}
