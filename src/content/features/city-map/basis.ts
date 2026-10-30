// What the map and the statistics of the box "Stadtplan" both derive from the own city. A render computes it once and
// hands it to both, since the box redraws on every change of resources, city or selection.
import { areaTileKeys, type Footprint, freeTileKeys } from '../../domain/city-grid';
import { type ExpansionBlocks, expansionBlocks } from '../../domain/expansions';
import type { CityGrid } from '../../model/catalog';
import type { City } from '../../model/city';

export interface CityBasis {
  /** the buildings on the grid */
  fps: Footprint[];
  /** missing while the unlocked areas are unknown */
  area?: {
    /** distinct tiles of the areas */
    total: number;
    /** tile keys of the free tiles in the areas, see `tileKey` */
    free: number[];
  };
  /** the blocks of the grid; missing without grid or areas */
  blocks?: ExpansionBlocks;
}

export function cityBasis(city: City, fps: Footprint[], grid?: CityGrid): CityBasis {
  const basis: CityBasis = { fps };
  if (!city.areas) return basis;
  const keys = areaTileKeys(city.areas);
  basis.area = { total: keys.size, free: freeTileKeys(keys, fps) };
  if (grid) basis.blocks = expansionBlocks(grid, city.areas, city.blocked);
  return basis;
}
