import { arcBonus } from '../domain/arc-bonus';
import type { LimitedBonus } from '../model/bonus';
import type { CityStore } from './cities';

/**
 * The bonuses of the session player: the limited bonuses as the game reported them last, and the Arc bonus they add
 * up to with the own great buildings. Nothing is persisted; a change of the limited bonuses emits no event.
 */
export class PlayerBonusStore {
  private limited: LimitedBonus[] = [];

  constructor(private cities: CityStore) {}

  /** limited bonuses of the player; the Arc bonus counts those of type contribution_boost */
  limitedBonuses(): LimitedBonus[] {
    return this.limited;
  }

  setLimited(bonuses: LimitedBonus[]): void {
    this.limited = bonuses;
  }

  /** the Arc bonus in percent, from the own city and the limited bonuses */
  arcBonus(): number {
    return arcBonus(this.cities.own(), this.limited);
  }
}
