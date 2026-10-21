// Statistics of a city: area, buildings by group, street efficiency. Pure, so synthetic cities test it.

import type { Area } from '../stores/city-model';
import { type BuildingCategory, buildingCategory, CATEGORIES, type Footprint, freeTiles } from './city-grid';

/** Number of distinct tiles in the areas; overlapping areas count once. */
export function areaTiles(areas: Area[]): number {
  const seen = new Set<string>();
  for (const a of areas) {
    for (let y = a.y; y < a.y + a.length; y++) for (let x = a.x; x < a.x + a.width; x++) seen.add(`${x},${y}`);
  }
  return seen.size;
}

export function areaStats(areas: Area[], fps: Footprint[]): { free: number; total: number } {
  return { free: freeTiles(areas, fps).length, total: areaTiles(areas) };
}

export interface TypeStat {
  category: BuildingCategory;
  count: number;
  /** share of all buildings in percent */
  share: number;
  /** tiles the buildings of the group cover */
  tiles: number;
}

/** Buildings per group, most frequent first; groups without buildings are left out. */
export function typeStats(fps: Footprint[]): { total: number; types: TypeStat[] } {
  const by = new Map<BuildingCategory, { count: number; tiles: number }>();
  for (const f of fps) {
    const c = buildingCategory(f.building.type);
    const s = by.get(c) ?? { count: 0, tiles: 0 };
    s.count++;
    s.tiles += f.width * f.length;
    by.set(c, s);
  }
  const total = fps.length;
  const types = CATEGORIES.flatMap((category) => {
    const s = by.get(category);
    return s ? [{ category, count: s.count, share: (s.count / total) * 100, tiles: s.tiles }] : [];
  });
  // stable sort keeps the group order for equal counts
  types.sort((a, b) => b.count - a.count);
  return { total, types };
}

export interface StreetEfficiency {
  /** street tiles the buildings need, see `neededStreets` */
  needed: number;
  /** street tiles placed */
  placed: number;
  /** needed ÷ placed in percent; missing without streets */
  percent?: number;
  /** some definitions do not name their street requirement; those count as needing none */
  partial: boolean;
}

/**
 * Street tiles a building needs: half its shorter side, rounded up, when it needs a street at all.
 * debt: an approximation; the game names only whether and which street level a building needs, not how many street
 * tiles it takes. ceiling: buildings that share a street count it twice, so 100 % is not the best possible.
 * upgrade: a better model of shared streets if the number proves misleading.
 */
export const neededStreets = (f: Footprint): number =>
  (f.def?.street ?? 0) > 0 ? Math.ceil(Math.min(f.width, f.length) / 2) : 0;

/** Undefined when no definition names a street requirement, so the data is missing altogether. */
export function streetEfficiency(fps: Footprint[]): StreetEfficiency | undefined {
  let needed = 0;
  let placed = 0;
  let known = false;
  let partial = false;
  for (const f of fps) {
    if (buildingCategory(f.building.type) === 'street') {
      placed += f.width * f.length;
      continue;
    }
    if (f.def?.street === undefined) partial = true;
    else known = true;
    needed += neededStreets(f);
  }
  if (!known) return undefined;
  return { needed, placed, ...(placed > 0 && { percent: (needed / placed) * 100 }), partial };
}
