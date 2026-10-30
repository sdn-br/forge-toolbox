// Where buildings sit on the city grid: footprints, free tiles, set adjacency and chain connections, building groups.
// Pure, so fixtures test it.
import type { BuildingDefId } from '../../shared/ids';
import type { BuildingDef, Rect } from '../stores/catalog';
import type { Area, Building } from '../stores/city-model';

/** The tiles a building covers: `width` along x, `length` along y from its top left tile. */
export interface Footprint extends TileRect {
  building: Building;
  def?: BuildingDef;
  /** false while the definition is missing; the building then takes a single tile */
  known: boolean;
}

/** A footprint whose definition is known. */
export interface Placed extends Footprint {
  def: BuildingDef;
}

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
 * The footprint of a building with its definition. The entities carry no rotation; the recorded own city fits together
 * without overlap with width along x and length along y, and overlaps when the two are swapped.
 */
export const place = (building: Building, def: BuildingDef): Placed => ({
  building,
  def,
  x: building.x,
  y: building.y,
  width: def.size.width,
  length: def.size.length,
  known: true,
});

/** Footprints of the buildings on the grid; one without a definition takes a single tile. */
export function footprints(buildings: Iterable<Building>, def: (id: BuildingDefId) => BuildingDef | undefined) {
  const out: Footprint[] = [];
  for (const building of buildings) {
    if (!onGrid(building)) continue;
    const d = def(building.def);
    out.push(d ? place(building, d) : { building, x: building.x, y: building.y, width: 1, length: 1, known: false });
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

/** Calls `visit` with each tile of the rectangle, row by row. */
export function eachTile(r: TileRect, visit: (x: number, y: number) => void) {
  for (let y = r.y; y < r.y + r.length; y++) for (let x = r.x; x < r.x + r.width; x++) visit(x, y);
}

/** The keys of the tiles in the areas, in area order; overlapping areas count once. */
export function areaTileKeys(areas: Area[]): Set<number> {
  const keys = new Set<number>();
  for (const a of areas) eachTile(a, (x, y) => keys.add(tileKey(x, y)));
  return keys;
}

/** The keys in `inAreas` (from `areaTileKeys`) of the tiles no building covers, streets included, in their order. */
export function freeTileKeys(inAreas: ReadonlySet<number>, fps: Footprint[]): number[] {
  const occupied = new Set<number>();
  for (const f of fps) eachTile(f, (x, y) => occupied.add(tileKey(x, y)));
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

const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 <= b2 && b1 <= a2;

/** Touching along an edge. Corners do not count. */
function adjacent(a: Bounds, b: Bounds): boolean {
  const besideX = a.x2 + 1 === b.x1 || b.x2 + 1 === a.x1;
  const besideY = a.y2 + 1 === b.y1 || b.y2 + 1 === a.y1;
  return (besideX && overlaps(a.y1, a.y2, b.y1, b.y2)) || (besideY && overlaps(a.x1, a.x2, b.x1, b.x2));
}

const covers = (outer: Bounds, inner: Bounds) =>
  outer.x1 <= inner.x1 && outer.y1 <= inner.y1 && outer.x2 >= inner.x2 && outer.y2 >= inner.y2;

/** Per set building: how many different other buildings of its set touch it. */
export function setLevels(placed: Placed[]): Map<number, number> {
  const members = placed.filter((p) => p.def.set);
  const levels = new Map<number, number>();
  for (const p of members) {
    const others = new Set(
      members
        .filter(
          (o) => o.def.set?.id === p.def.set?.id && o.def.id !== p.def.id && adjacent(tileBounds(p), tileBounds(o)),
        )
        .map((o) => o.def.id),
    );
    levels.set(p.building.id, others.size);
  }
  return levels;
}

/**
 * Chain links reachable from a chain start without a gap. Every start or link names where the next link has to
 * sit; a link elsewhere breaks the chain. Links with several positions (e.g. intermediate pieces) branch.
 */
export function connectedLinks(placed: Placed[]): Set<number> {
  const links = placed.filter((p) => p.def.chain && !p.def.chain.start);
  const connected = new Set<number>();
  const queue = placed.filter((p) => p.def.chain?.start);
  while (queue.length > 0) {
    const current = queue.shift() as Placed;
    const chain = current.def.chain;
    if (!chain) continue;
    for (const rel of chain.links) {
      const target: Bounds = {
        x1: current.x + rel.x1,
        y1: current.y + rel.y1,
        x2: current.x + rel.x2,
        y2: current.y + rel.y2,
      };
      const next = links.find(
        (l) => l.def.chain?.id === chain.id && !connected.has(l.building.id) && covers(tileBounds(l), target),
      );
      if (next) {
        connected.add(next.building.id);
        queue.push(next);
      }
    }
  }
  return connected;
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
