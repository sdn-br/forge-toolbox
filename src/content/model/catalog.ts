import type { BuildingDefId } from '../../shared/ids';
import type { Product } from './city';

export interface Boost {
  type: string;
  feature: string;
  value: number;
}

export type BoostsByEra = Record<string, Boost[]>;

/** Area relative to the top left corner of a building, both corners inclusive. */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LevelBonus {
  level: number;
  boosts: BoostsByEra;
}

export interface BuildingDef {
  id: BuildingDefId;
  name: string;
  generic: boolean;
  type?: string;
  size: { width: number; length: number };
  /** street level the building needs to work, 0 for none; missing when the definition does not tell */
  street?: number;
  flags: { motivatable: boolean; polishable: boolean; plunderable: boolean };
  boostsByEra: BoostsByEra;
  productByEra: Record<string, Product>;
  /** set membership: bonus level n needs n different adjacent buildings of the same set */
  set?: { id: string; bonuses: LevelBonus[] };
  /** chain membership: `links` are where the next link has to sit, `bonuses` what this link adds once connected */
  chain?: { id: string; start: boolean; links: Rect[]; bonuses: LevelBonus[] };
  /** great buildings only: the era of the building itself and the Forge points of the first levels */
  greatBuilding?: GreatBuildingDef;
}

export interface GreatBuildingDef {
  /** era of the building (`requirements.min_era`), `AllAge` for the buildings of every era */
  era: string;
  /** `strategy_points_for_upgrade`: Forge points from level i to i + 1, index 0-based; the game lists ten */
  levelCosts: number[];
  /**
   * Forge points the building produces per level (`production_bonus.values`, index = level, the game lists 0 to 10);
   * only for buildings whose production bonus is of type `strategy_points`
   */
  fpProduction?: number[];
}

/** The main city grid from the metadata `grid-<hash>`: top left tiles of its 4 × 4 blocks. */
export interface CityGrid {
  width: number;
  height: number;
  blocks: { x: number; y: number }[];
}
