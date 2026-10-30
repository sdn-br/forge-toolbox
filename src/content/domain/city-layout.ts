// Where buildings sit relative to each other: set adjacency and chain connections.
import type { BuildingDef, Rect } from '../stores/catalog';
import type { Building } from '../stores/city-model';
import { tileBounds } from './city-grid';

export interface Placed {
  building: Building;
  def: BuildingDef;
  area: Rect;
}

export function place(building: Building, def: BuildingDef): Placed {
  const { x, y } = building;
  return { building, def, area: tileBounds({ x, y, ...def.size }) };
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 <= b2 && b1 <= a2;

/** Touching along an edge. Corners do not count. */
function adjacent(a: Rect, b: Rect): boolean {
  const besideX = a.x2 + 1 === b.x1 || b.x2 + 1 === a.x1;
  const besideY = a.y2 + 1 === b.y1 || b.y2 + 1 === a.y1;
  return (besideX && overlaps(a.y1, a.y2, b.y1, b.y2)) || (besideY && overlaps(a.x1, a.x2, b.x1, b.x2));
}

const covers = (outer: Rect, inner: Rect) =>
  outer.x1 <= inner.x1 && outer.y1 <= inner.y1 && outer.x2 >= inner.x2 && outer.y2 >= inner.y2;

/** Per set building: how many different other buildings of its set touch it. */
export function setLevels(placed: Placed[]): Map<number, number> {
  const members = placed.filter((p) => p.def.set);
  const levels = new Map<number, number>();
  for (const p of members) {
    const others = new Set(
      members
        .filter((o) => o.def.set?.id === p.def.set?.id && o.def.id !== p.def.id && adjacent(p.area, o.area))
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
      const target: Rect = {
        x1: current.area.x1 + rel.x1,
        y1: current.area.y1 + rel.y1,
        x2: current.area.x1 + rel.x2,
        y2: current.area.y1 + rel.y2,
      };
      const next = links.find(
        (l) => l.def.chain?.id === chain.id && !connected.has(l.building.id) && covers(l.area, target),
      );
      if (next) {
        connected.add(next.building.id);
        queue.push(next);
      }
    }
  }
  return connected;
}
