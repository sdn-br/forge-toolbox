// Where buildings sit on the city grid: footprints, free tiles, building groups. Pure, so fixtures test it.
import type { BuildingDefId } from '../../shared/ids';
import type { MarkerSpot } from '../../shared/marker-protocol';
import type { BuildingDef, Rect } from '../stores/catalog';
import type { Area, Building } from '../stores/city-model';

/** The tiles a building covers: `width` along x, `length` along y from its top left tile. */
export interface Footprint extends TileRect {
  building: Building;
  def?: BuildingDef;
  /** false while the definition is missing; the building then takes a single tile */
  known: boolean;
}

/** Where an arrow in the game points: the building and its footprint. */
export const spotOf = (f: Footprint): MarkerSpot => ({
  id: f.building.id,
  x: f.x,
  y: f.y,
  width: f.width,
  length: f.length,
});

/** The name a building shows: that of its definition, or its definition id while the definition is missing. */
export const nameOf = (f: Footprint): string => f.def?.name ?? f.building.def;

export interface Tile {
  x: number;
  y: number;
}

/** Inclusive tile bounds. */
export type Bounds = Rect;

// Entities the game lists with the city but places beside the grid (seen in the own city, 2026-10-19). The hubs are the
// Arctic Harbour and the Ocean Terminal with their parts (seen 2026-10-29).
const OFF_GRID = new Set(['off_grid', 'outpost_ship', 'friends_tavern', 'hub_main', 'hub_part']);

const onGrid = (b: Building) => !OFF_GRID.has(b.type);

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

// Numbers instead of "x,y" strings: a late city has thousands of tiles per render. The offset keeps negative
// coordinates apart, the grid stays far within it.
const SPAN = 1 << 16;
const OFFSET = SPAN / 2;

/** A tile as one number, for sets of tiles. */
export const tileKey = (x: number, y: number): number => (y + OFFSET) * SPAN + (x + OFFSET);

/** The tile of a `tileKey`. */
export const keyTile = (k: number): Tile => ({ x: (k % SPAN) - OFFSET, y: Math.floor(k / SPAN) - OFFSET });

/** The keys of the tiles in the areas, in area order; overlapping areas count once. */
export function areaTileKeys(areas: Area[]): Set<number> {
  const keys = new Set<number>();
  for (const a of areas) {
    for (let y = a.y; y < a.y + a.length; y++) for (let x = a.x; x < a.x + a.width; x++) keys.add(tileKey(x, y));
  }
  return keys;
}

/** The keys in `inAreas` (from `areaTileKeys`) of the tiles no building covers, streets included, in their order. */
export function freeTileKeys(inAreas: ReadonlySet<number>, fps: Footprint[]): number[] {
  const occupied = new Set<number>();
  for (const f of fps) {
    for (let dx = 0; dx < f.width; dx++)
      for (let dy = 0; dy < f.length; dy++) occupied.add(tileKey(f.x + dx, f.y + dy));
  }
  const free: number[] = [];
  for (const k of inAreas) if (!occupied.has(k)) free.push(k);
  return free;
}

/** Tiles inside the unlocked areas that no building covers, streets included; overlapping areas count once. */
export const freeTiles = (areas: Area[], fps: Footprint[]): Tile[] =>
  freeTileKeys(areaTileKeys(areas), fps).map(keyTile);

/** A rectangle of tiles, `width` along x and `length` along y: an area, a footprint, a tile on a map. */
export type TileRect = Area;

/** The inclusive tile bounds of a rectangle of tiles. */
export const tileBounds = (r: TileRect): Bounds => ({
  x1: r.x,
  y1: r.y,
  x2: r.x + r.width - 1,
  y2: r.y + r.length - 1,
});

/** The tiles that hold all these rectangles. Undefined when there are none. */
export function gridBounds(rects: TileRect[]): Bounds | undefined {
  if (rects.length === 0) return undefined;
  const bounds = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (const r of rects) {
    const b = tileBounds(r);
    bounds.x1 = Math.min(bounds.x1, b.x1);
    bounds.y1 = Math.min(bounds.y1, b.y1);
    bounds.x2 = Math.max(bounds.x2, b.x2);
    bounds.y2 = Math.max(bounds.y2, b.y2);
  }
  return bounds;
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

export type BuildingCategory = (typeof CATEGORIES)[number];

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
