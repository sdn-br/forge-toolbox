import type { PlayerId } from '../../shared/ids';
import type { CityKey } from '../../shared/model';
import type { ToolboxBus } from '../core/events';
import type { Building, City } from '../model/city';

/** What the visit tells about the relation to the visited player at that moment. */
export interface VisitInfo {
  neighbor: boolean;
  friend: boolean;
  guildMember: boolean;
}

export interface VisitedCity extends City {
  visit: VisitInfo;
}

export class CityStore {
  private ownCity?: City;
  private visitedCity?: VisitedCity;
  private shownCity: CityKey = 'own';

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

  /** all buildings of the own city anew, as the game sends them when it loads the main map again */
  replaceOwnBuildings(buildings: Building[]): void {
    if (!this.ownCity) return;
    this.ownCity.buildings = new Map(buildings.map((b) => [b.id, b]));
    this.bus.emit('city.ownChanged', { reset: true });
  }

  /**
   * The city the game shows, as far as its traffic tells: a visit shows that city, the own city returns with
   * `showOwn`. Going home without a request to the game server stays unseen (docs/features/stadtplan.md).
   */
  shown(): CityKey {
    return this.shownCity;
  }

  setVisited(city: VisitedCity): void {
    this.visitedCity = city;
    this.bus.emit('city.visited', { owner: city.owner });
    this.show(city.owner);
  }

  /** the game shows the own city again */
  showOwn(): void {
    this.show('own');
  }

  private show(city: CityKey) {
    if (city === this.shownCity) return;
    this.shownCity = city;
    this.bus.emit('city.shown', { city });
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
