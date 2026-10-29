// What the Eigenanteil and the Powerleveln box share for an own great building: the factors per place on their three
// levels and the Ext of the open level. Neither box owns it; each reads and writes here and hears of the other's change
// on the bus. The view switches "Absichern" and "Vertrauen" and the Arc bonus are not kept here: both boxes read them
// from the view choices and settings with the helpers below.
import type { ToolboxBus } from '../core/events';
import type { Settings } from '../core/settings';
import { arcBonus } from '../domain/gb-calculator';
import type { FactorChoice } from '../domain/gb-factor';
import type { CityStore } from './cities';
import type { GreatBuildingStore } from './great-buildings';
import { type PlaceFactorState, PlaceFactors, type PrefStore } from './place-factors';

/** the settings of the Eigenanteil group the factors rest on */
export const FACTOR = 'gbOwn.factor';
export const FACTOR_ARC = 'gbOwn.factorArc';
export const ARC_BUTTON = 'gbOwn.arcButton';
export const ONE_FP = 'gbOwn.oneFpForNoReward';
/** view choices, kept like the mode of a map rather than in the settings box */
export const SECURE = 'gbOwn.secure';
export const TRUST = 'gbOwn.trust';

/** a switch of the view choices; `fallback` while nothing is kept */
export const viewFlag = (prefs: Pick<PrefStore, 'pref'>, key: string, fallback: boolean) => {
  const value = prefs.pref(key);
  return value === undefined ? fallback : value === 'true';
};

/** the own Arc bonus while its factor button shows */
export const ownArcBonus = (settings: Settings, cities: CityStore, greatBuildings: GreatBuildingStore) =>
  settings.get(ARC_BUTTON) ? arcBonus(cities.own(), greatBuildings.limitedBonuses()) : undefined;

export class GbOwnState {
  private factors: PlaceFactors;
  /** promised payments per building and level; they are typed in for one level only, gone with the page */
  private exts = new Map<string, number[]>();

  /** `single` is the factor of the settings, for all five places while no standard of five is stored */
  constructor(
    private bus: ToolboxBus,
    prefs: PrefStore,
    single: () => FactorChoice,
  ) {
    this.factors = new PlaceFactors(prefs, single);
  }

  /** the five factors of a building and where they come from */
  state(def: string): PlaceFactorState {
    return this.factors.state(def);
  }

  /** the factor bar: the same choice for all five places */
  setAll(def: string, choice: FactorChoice): void {
    this.factors.setAll(def, choice);
    this.changed(def);
  }

  setPlace(def: string, rank: number, value: number): void {
    this.factors.setPlace(def, rank, value);
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

  /** the factor in the settings changed: it sets all five places alike again, for every building */
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

/** the state of a world: the factor of the settings is the single factor of the places */
export const createGbOwnState = (bus: ToolboxBus, prefs: PrefStore, settings: Settings) =>
  new GbOwnState(bus, prefs, () => ({ value: settings.number(FACTOR), arc: settings.get(FACTOR_ARC) }));
