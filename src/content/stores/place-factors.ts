// The factor of each of the seven places of an own great building, on three levels: the standard for every building,
// the seven saved for one building, and a change in the box not saved, kept per building until the page reloads.
// Copper levels have five places and use places 1 to 5 only.
import { type FactorChoice, fixedFactor, withFixed } from '../domain/gb-factor';
import { tierPlaces } from '../domain/gb-tier';
import type { GreatBuildingTier } from '../model/catalog';

/** the places with a reward on a gold level, the most a level has */
export const PLACES = 7;
/** the places stored before 2026-11-05, when every level had five */
const OLD_PLACES = 5;

/** which level the factors come from */
export type FactorStatus = 'standard' | 'saved' | 'changed';

export interface PlaceFactorState {
  /** one choice per place, index 0 is place 1 */
  choices: FactorChoice[];
  status: FactorStatus;
  /** a change is there to save for the building */
  canSave: boolean;
  /** saved values or a change are there to drop */
  canReset: boolean;
  /** the factors differ from the standard */
  canAdopt: boolean;
}

/** where the levels are kept: the view choices of the ui state */
export interface PrefStore {
  pref(key: string): string | undefined;
  savePref(key: string, value: string): void;
  removePref(key: string): void;
}

/** the factors chosen as the standard; without it the single setting sets all places */
export const STANDARD_KEY = 'gbOwn.factorDefault';
/** the factors saved for one building, by its definition */
export const savedKey = (def: string) => `gbOwn.factors.${def}`;

/** both follow the Arc bonus, or both hold the same fixed factors on copper and on gold levels */
export const sameChoice = (a: FactorChoice, b: FactorChoice) => sameOn(a, b, 'copper') && sameOn(a, b, 'gold');

/** alike on a level of `tier`: both follow the Arc bonus, or both hold the same fixed factor of the tier */
export const sameOn = (a: FactorChoice, b: FactorChoice, tier: GreatBuildingTier) =>
  a.arc === b.arc && (a.arc || fixedFactor(a, tier) === fixedFactor(b, tier));

/** the choice all places of a level of `tier` share, else undefined; a copper level looks at places 1 to 5 only */
export const alikeOn = (choices: FactorChoice[], tier: GreatBuildingTier): FactorChoice | undefined => {
  const first = choices[0];
  return first && choices.slice(0, tierPlaces(tier)).every((c) => sameOn(c, first, tier)) ? first : undefined;
};
const sameChoices = (a: FactorChoice[], b: FactorChoice[]) => a.every((c, i) => sameChoice(c, b[i] as FactorChoice));

/**
 * seven choices as stored; anything else, e.g. from an older version, counts as not stored. Five choices (stored before
 * 2026-11-05) get places 6 and 7 as a copy of place 5, both factors, and a choice without `gold` takes `gold`, the gold
 * factor of the settings. The next save stores all seven.
 */
function parse(text: string | undefined, gold: number | undefined): FactorChoice[] | undefined {
  if (!text) return undefined;
  try {
    const list: unknown = JSON.parse(text);
    if (!Array.isArray(list) || (list.length !== PLACES && list.length !== OLD_PLACES)) return undefined;
    const ok = list.every(
      (c) => typeof c === 'object' && c !== null && Number.isFinite(c.value) && typeof c.arc === 'boolean',
    );
    const goldOf = (c: { gold?: unknown }) => (Number.isFinite(c.gold) ? (c.gold as number) : gold);
    if (!ok) return undefined;
    const choices: FactorChoice[] = list.map((c) => {
      const g = goldOf(c);
      return { value: c.value, arc: c.arc, ...(g !== undefined && { gold: g }) };
    });
    while (choices.length < PLACES) choices.push({ ...(choices[OLD_PLACES - 1] as FactorChoice) });
    return choices;
  } catch {
    return undefined;
  }
}

export class PlaceFactors {
  /** changes not saved, per building definition; gone with the page */
  private changed = new Map<string, FactorChoice[]>();

  /** `single` is the factor of the settings, for all places while no standard is stored */
  constructor(
    private prefs: PrefStore,
    private single: () => FactorChoice,
  ) {}

  standard(): FactorChoice[] {
    return (
      parse(this.prefs.pref(STANDARD_KEY), this.single().gold) ??
      Array.from({ length: PLACES }, () => ({ ...this.single() }))
    );
  }

  state(def: string): PlaceFactorState {
    const standard = this.standard();
    const saved = parse(this.prefs.pref(savedKey(def)), this.single().gold);
    const base = saved ?? standard;
    // a change back to what is in effect anyway is no change
    const draft = this.changed.get(def);
    const changed = draft && !sameChoices(draft, base) ? draft : undefined;
    const choices = changed ?? base;
    return {
      choices,
      status: changed ? 'changed' : saved ? 'saved' : 'standard',
      canSave: changed !== undefined,
      canReset: changed !== undefined || saved !== undefined,
      canAdopt: !sameChoices(choices, standard),
    };
  }

  /**
   * the factor bar: the same choice for all seven places; a fixed factor for levels of `tier`, that of the other tier
   * stays
   */
  setAll(def: string, choice: { value: number; arc: boolean }, tier: GreatBuildingTier = 'copper'): void {
    this.changed.set(
      def,
      this.state(def).choices.map((c) => (choice.arc ? { ...c, arc: true } : withFixed(c, choice.value, tier))),
    );
  }

  /** a factor typed for one place holds that number on levels of `tier`, also where the place followed the Arc bonus */
  setPlace(def: string, rank: number, value: number, tier: GreatBuildingTier = 'copper'): void {
    const choices = this.state(def).choices.map((c) => ({ ...c }));
    choices[rank - 1] = withFixed(choices[rank - 1] as FactorChoice, value, tier);
    this.changed.set(def, choices);
  }

  /** the current factors become the saved ones of the building */
  save(def: string): void {
    this.prefs.savePref(savedKey(def), JSON.stringify(this.state(def).choices));
    this.changed.delete(def);
  }

  /** the building takes the standard again: saved values and the change go */
  reset(def: string): void {
    this.prefs.removePref(savedKey(def));
    this.changed.delete(def);
  }

  /** the current factors become the standard for every building without saved values */
  adopt(def: string): void {
    this.prefs.savePref(STANDARD_KEY, JSON.stringify(this.state(def).choices));
  }

  /** the factor in the settings changed: it sets all places alike again */
  dropStandard(): void {
    this.prefs.removePref(STANDARD_KEY);
  }
}
