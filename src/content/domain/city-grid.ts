// Where buildings sit on the city grid: footprints, free tiles, building groups. Pure, so fixtures test it.
import type { BuildingDefId } from '../../shared/ids';
import type { BuildingDef } from '../stores/catalog';
import type { Area, Building } from '../stores/city-model';

/** The tiles a building covers: `width` along x, `length` along y from its top left tile. */
export interface Footprint {
  building: Building;
  def?: BuildingDef;
  x: number;
  y: number;
  width: number;
  length: number;
  /** false while the definition is missing; the building then takes a single tile */
  known: boolean;
}

export interface Tile {
  x: number;
  y: number;
}

/** Inclusive tile bounds. */
export interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Entities the game lists with the city but places beside the grid (seen in the own city, 2026-10-19).
const OFF_GRID = new Set(['off_grid', 'outpost_ship', 'friends_tavern']);

export const onGrid = (b: Building) => !OFF_GRID.has(b.type);

/**
 * Footprints of the buildings on the grid. The entities carry no rotation; the recorded own city fits together
 * without overlap with width along x and length along y, and overlaps when the two are swapped.
 */
export function footprints(buildings: Iterable<Building>, def: (id: BuildingDefId) => BuildingDef | undefined) {
  const out: Footprint[] = [];
  for (const building of buildings) {
    if (!onGrid(building)) continue;
    const d = def(building.def);
    out.push({
      building,
      ...(d && { def: d }),
      x: building.x,
      y: building.y,
      width: d?.size.width ?? 1,
      length: d?.size.length ?? 1,
      known: d !== undefined,
    });
  }
  return out;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Tiles inside the unlocked areas that no building covers, streets included; overlapping areas count once. */
export function freeTiles(areas: Area[], fps: Footprint[]): Tile[] {
  const occupied = new Set<string>();
  for (const f of fps) {
    for (let dx = 0; dx < f.width; dx++) for (let dy = 0; dy < f.length; dy++) occupied.add(key(f.x + dx, f.y + dy));
  }
  const seen = new Set<string>();
  const free: Tile[] = [];
  for (const a of areas) {
    for (let y = a.y; y < a.y + a.length; y++) {
      for (let x = a.x; x < a.x + a.width; x++) {
        const k = key(x, y);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!occupied.has(k)) free.push({ x, y });
      }
    }
  }
  return free;
}

/** The tiles the map has to show: all areas and all buildings. Undefined for an empty city. */
export function gridBounds(areas: Area[], fps: Footprint[]): Bounds | undefined {
  const rects = [...areas, ...fps];
  if (rects.length === 0) return undefined;
  return {
    x1: Math.min(...rects.map((r) => r.x)),
    y1: Math.min(...rects.map((r) => r.y)),
    x2: Math.max(...rects.map((r) => r.x + r.width - 1)),
    y2: Math.max(...rects.map((r) => r.y + r.length - 1)),
  };
}

export type BuildingCategory =
  | 'residential'
  | 'production'
  | 'goods'
  | 'culture'
  | 'military'
  | 'greatBuilding'
  | 'street'
  | 'special'
  | 'other';

export const CATEGORIES: BuildingCategory[] = [
  'residential',
  'production',
  'goods',
  'culture',
  'military',
  'greatBuilding',
  'street',
  'special',
  'other',
];

const CATEGORY_OF: Record<string, BuildingCategory> = {
  residential: 'residential',
  production: 'production',
  goods: 'goods',
  culture: 'culture',
  decoration: 'culture',
  military: 'military',
  greatbuilding: 'greatBuilding',
  street: 'street',
  generic_building: 'special',
  random_production: 'special',
  tower: 'special',
  clan_power_production: 'special',
};

/** Group of a building by the game type of its entity; types the toolbox does not know are `other`. */
export const buildingCategory = (type: string): BuildingCategory => CATEGORY_OF[type] ?? 'other';

/** A building without road connection. Buildings that need no road never come as unconnected. */
export const needsRoad = (b: Building) => !b.connected || b.state.kind === 'unconnected';

/** Part of the name, ignoring case and surrounding spaces; an empty query matches nothing. */
export function matchesName(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q !== '' && name.toLowerCase().includes(q);
}
