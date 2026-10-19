import type { PlayerId } from '../../shared/ids';
import type { ToolboxBus } from '../core/events';
import type { Building, City } from './city-model';

/** What the visit tells about the relation to the visited player at that moment. */
export interface VisitInfo {
  neighbor: boolean;
  friend: boolean;
  guildMember: boolean;
  canPlunder?: boolean;
  nextInteractionAt?: number;
}

export interface VisitedCity extends City {
  visit: VisitInfo;
}

export class CityStore {
  private ownCity?: City;
  private visitedCity?: VisitedCity;

  constructor(private bus: ToolboxBus) {}

  own(): City | undefined {
    return this.ownCity;
  }

  visited(): VisitedCity | undefined {
    return this.visitedCity;
  }

  setOwn(city: City): void {
    this.ownCity = city;
    this.bus.emit('city.ownChanged', { reset: true });
  }

  setVisited(city: VisitedCity): void {
    this.visitedCity = city;
    this.bus.emit('city.visited', { owner: city.owner });
  }

  /**
   * Changed buildings, routed by owner. The game answers a contribution to a visited great building
   * with a reset or update of that building, which must land in the visited city, not the own one.
   */
  updateBuildings(buildings: Building[]): void {
    const own: number[] = [];
    const visited: number[] = [];
    for (const b of buildings) {
      if (this.ownCity && b.owner === this.ownCity.owner) {
        this.ownCity.buildings.set(b.id, b);
        own.push(b.id);
      } else if (this.visitedCity && b.owner === this.visitedCity.owner) {
        this.visitedCity.buildings.set(b.id, b);
        visited.push(b.id);
      }
    }
    if (own.length) this.bus.emit('city.ownChanged', { buildingIds: own, reset: false });
    if (visited.length && this.visitedCity) {
      this.bus.emit('city.visitedChanged', { owner: this.visitedCity.owner as PlayerId, buildingIds: visited });
    }
  }
}
