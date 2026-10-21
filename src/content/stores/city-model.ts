import type { BuildingDefId, EraId, PlayerId, WorldId } from '../../shared/ids';

export type ResourceId = string;

export interface Product {
  resources: Record<ResourceId, number>;
  guildGoods?: Record<ResourceId, number>;
  units?: { type: string; amount: number };
}

/** `product` is missing when the game does not tell, e.g. generic buildings in a visited city. */
export type BuildingState =
  | { kind: 'idle' }
  | { kind: 'producing'; readyAt?: number; product?: Product; motivated?: boolean; boosted?: boolean }
  | { kind: 'finished'; product?: Product; motivated?: boolean }
  | { kind: 'plundered' }
  | { kind: 'unconnected' }
  | { kind: 'constructing'; readyAt?: number }
  | { kind: 'unknown'; gameClass: string };

export interface GreatBuildingState {
  level: number;
  maxLevel: number;
  investedFp?: number;
  fpForLevelUp?: number;
  bonus?: { type: string; value: number; amount?: number };
}

export interface Building {
  id: number;
  owner: PlayerId;
  def: BuildingDefId;
  type: string;
  x: number;
  y: number;
  level?: number;
  connected: boolean;
  state: BuildingState;
  greatBuilding?: GreatBuildingState;
}

/** An unlocked rectangle of the city grid: `width` along x, `length` along y, like building sizes. */
export interface Area {
  x: number;
  y: number;
  width: number;
  length: number;
}

export interface City {
  world: WorldId;
  owner: PlayerId;
  map: string;
  era: EraId;
  takenAt: number;
  buildings: Map<number, Building>;
  /** unlocked areas of the grid; missing when the game did not send them */
  areas?: Area[];
}
