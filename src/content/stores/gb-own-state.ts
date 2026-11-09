// What the Eigenanteil and the Powerleveln box share for an own great building: the factors per place on their three
// levels and the Ext of the open level. Neither box owns it; each reads and writes here and hears of the other's change
// on the bus. The view switches "Absichern" and "Vertrauen" and the Arc bonus are not kept here: both boxes read them
// from the view choices and settings with the helpers below. The settings definitions live in `features/shared/settings.ts`.
import type { ToolboxBus } from '../core/events';
import type { FactorChoice } from '../domain/gb-factor';
import type { GreatBuildingTier } from '../model/catalog';
import { type PlaceFactorState, PlaceFactors, type PrefStore } from './place-factors';
import type { PlayerBonusStore } from './player-bonuses';

/** view choices, kept like the mode of a map rather than in the settings box */
export const SECURE = 'gbOwn.secure';
export const TRUST = 'gbOwn.trust';

/** a switch of the view choices; `fallback` while nothing is kept */
export const viewFlag = (prefs: Pick<PrefStore, 'pref'>, key: string, fallback: boolean) => {
  const value = prefs.pref(key);
  return value === undefined ? fallback : value === 'true';
};

/** the own Arc bonus, both tiers, while its factor button shows (`arcButton`: the value of that setting) */
export const ownArcBonus = (arcButton: boolean, bonuses: PlayerBonusStore) =>
  arcButton ? bonuses.arcBonus() : undefined;

export class GbOwnState {
  private factors: PlaceFactors;
  /** promised payments per building and level; they are typed in for one level only, gone with the page */
  private exts = new Map<string, number[]>();

  /** `single` is the factor of the settings, for all places while no standard is stored */
  constructor(
    private bus: ToolboxBus,
    prefs: PrefStore,
    single: () => FactorChoice,
  ) {
    this.factors = new PlaceFactors(prefs, single);
  }

  /** the factors of the places of a building and where they come from */
  state(def: string): PlaceFactorState {
    return this.factors.state(def);
  }

  /** the factor bar: the same choice for all places, a fixed factor for levels of `tier` */
  setAll(def: string, choice: { value: number; arc: boolean }, tier?: GreatBuildingTier): void {
    this.factors.setAll(def, choice, tier);
    this.changed(def);
  }

  setPlace(def: string, rank: number, value: number, tier?: GreatBuildingTier): void {
    this.factors.setPlace(def, rank, value, tier);
    this.changed(def);
  }

  save(def: string): void {
    this.factors.save(def);
    this.changed(def);
  }

  reset(def: string): void {
    this.factors.reset(def);
    this.changed(def);
  }

  adopt(def: string): void {
    this.factors.adopt(def);
    this.changed(def);
  }

  /** the factor in the settings changed: it sets all places alike again, for every building */
  dropStandard(): void {
    this.factors.dropStandard();
    this.changed(undefined);
  }

  /** promised payments by place for the building's level, index 0 is place 1; none without a level */
  ext(def: string, level: number | undefined): number[] {
    return this.exts.get(`${def}:${level}`) ?? [];
  }

  setExt(def: string, level: number, rank: number, fp: number): void {
    const list = [...this.ext(def, level)];
    list[rank - 1] = fp;
    this.exts.set(`${def}:${level}`, list);
    this.bus.emit('gbOwn.extChanged', { def, level });
  }

  private changed(def: string | undefined) {
    this.bus.emit('gbOwn.factorsChanged', def === undefined ? {} : { def });
  }
}
