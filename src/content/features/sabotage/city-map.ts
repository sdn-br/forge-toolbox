// The visited city as a map: plunderable buildings stand out, everything else is muted by group.
import type { BuildingDefId } from '../../../shared/ids';
import { formatResources, t } from '../../core/texts';
import type { Plunderable } from '../../domain/assess-city';
import { buildingCategory, footprints } from '../../domain/city-grid';
import type { BuildingDef } from '../../stores/catalog';
import type { City } from '../../stores/city-model';
import { categoryLegend, mutedColor } from '../../ui/city-colors';
import type { CityMapData, LegendItem, MapTile } from '../../ui/city-map';

export const PLUNDERABLE_FILL = '#ffd23f';
export const PLUNDERABLE_OUTLINE = '#ffffff';

export interface VisitedMapVm {
  data: CityMapData;
  legend: LegendItem[];
}

interface Catalog {
  get(id: BuildingDefId): BuildingDef | undefined;
  resourceName(id: string): string | undefined;
}

export function visitedCityMap(city: City, plunderable: Plunderable[], catalog: Catalog): VisitedMapVm {
  const loot = new Map(plunderable.map((p) => [p.building, p]));
  const fps = footprints(city.buildings.values(), (id) => catalog.get(id));
  // plunderable ones last, so from above nothing covers their frame
  fps.sort((a, b) => Number(loot.has(a.building.id)) - Number(loot.has(b.building.id)));
  const tiles: MapTile[] = fps.map((f) => {
    const name = f.def?.name ?? f.building.def;
    const p = loot.get(f.building.id);
    const rect = { x: f.x, y: f.y, width: f.width, length: f.length };
    if (p) {
      const tooltip = `${name}\n${formatResources(p.resources, catalog)}`;
      return { ...rect, fill: PLUNDERABLE_FILL, outline: PLUNDERABLE_OUTLINE, strong: true, tooltip };
    }
    return { ...rect, fill: mutedColor(buildingCategory(f.building.type)), tooltip: name };
  });
  return {
    data: { areas: city.areas ?? [], tiles },
    legend: [{ color: PLUNDERABLE_FILL, label: t('cityMap.plunderable') }, ...categoryLegend(true)],
  };
}
