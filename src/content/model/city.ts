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

export const CATEGORIES = [
  'residential',
  'production',
  'goods',
  'culture',
  'military',
  'greatBuilding',
  'street',
  'special',
  'other',
] as const;

/** Group of a building, for the city map and its stats; decorations count as culture. */
export type BuildingCategory = (typeof CATEGORIES)[number];

export interface Building {
  id: number;
  owner: PlayerId;
  def: BuildingDefId;
  category: BuildingCategory;
  /** listed with the city but placed beside the grid, e.g. the outpost ship or the friends tavern */
  offGrid?: boolean;
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

/** How an expansion is paid: diamonds, as a reward only (research, provinces), or medals of the Quantum Incursions. */
export type ExpansionKind = 'diamonds' | 'reward' | 'quantum';

interface ExpansionOfferBase {
  minEra?: EraId;
  /** every price the game names; whether they are alternatives is assumed, not checked */
  cost: Record<ResourceId, number>;
}

/**
 * An expansion the player has not obtained yet, from the startup data. A kind the toolbox does not know keeps the
 * game's name in `gameType`, to show it as it is.
 */
export type ExpansionOffer =
  | (ExpansionOfferBase & { kind: ExpansionKind })
  | (ExpansionOfferBase & { kind: 'unknown'; gameType: string });

export interface City {
  world: WorldId;
  owner: PlayerId;
  map: string;
  era: EraId;
  takenAt: number;
  buildings: Map<number, Building>;
  /** unlocked areas of the grid; missing when the game did not send them */
  areas?: Area[];
  /** blocked areas of the grid, assumed not to be buyable; own city only */
  blocked?: Area[];
  /** expansions not obtained yet; own city only */
  expansions?: ExpansionOffer[];
}
