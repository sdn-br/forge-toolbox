// The factor of each of the five places of an own great building, on three levels: the standard for every building,
// the five saved for one building, and a change in the box not saved, kept per building until the page reloads.
import type { FactorChoice } from '../ui/factor-bar';

/** the places with a reward */
export const PLACES = 5;

/** which level the five factors come from */
export type FactorStatus = 'standard' | 'saved' | 'changed';

export interface PlaceFactorState {
  /** one choice per place, index 0 is place 1 */
  choices: FactorChoice[];
  status: FactorStatus;
  /** a change is there to save for the building */
  canSave: boolean;
  /** saved values or a change are there to drop */
  canReset: boolean;
  /** the five differ from the standard */
  canAdopt: boolean;
}

/** where the levels are kept: the view choices of the ui state */
export interface PrefStore {
  pref(key: string): string | undefined;
  savePref(key: string, value: string): void;
  removePref(key: string): void;
}

/** the five chosen as the standard; without it the single setting sets all five */
export const STANDARD_KEY = 'gbOwn.factorDefault';
/** the five saved for one building, by its definition */
export const savedKey = (def: string) => `gbOwn.factors.${def}`;

/** both follow the Arc bonus, or both hold the same number */
export const sameChoice = (a: FactorChoice, b: FactorChoice) => a.arc === b.arc && (a.arc || a.value === b.value);
const sameChoices = (a: FactorChoice[], b: FactorChoice[]) => a.every((c, i) => sameChoice(c, b[i] as FactorChoice));

/** five choices as stored; anything else, e.g. from an older version, counts as not stored */
function parse(text: string | undefined): FactorChoice[] | undefined {
  if (!text) return undefined;
  try {
    const list: unknown = JSON.parse(text);
    if (!Array.isArray(list) || list.length !== PLACES) return undefined;
    const ok = list.every(
      (c) => typeof c === 'object' && c !== null && Number.isFinite(c.value) && typeof c.arc === 'boolean',
    );
    return ok ? list.map((c) => ({ value: c.value, arc: c.arc })) : undefined;
  } catch {
    return undefined;
  }
}

export class PlaceFactors {
  /** changes not saved, per building definition; gone with the page */
  private changed = new Map<string, FactorChoice[]>();

  /** `single` is the factor of the settings, for all five places while no standard of five is stored */
  constructor(
    private prefs: PrefStore,
    private single: () => FactorChoice,
  ) {}

  standard(): FactorChoice[] {
    return parse(this.prefs.pref(STANDARD_KEY)) ?? Array.from({ length: PLACES }, () => ({ ...this.single() }));
  }

  state(def: string): PlaceFactorState {
    const standard = this.standard();
    const saved = parse(this.prefs.pref(savedKey(def)));
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

  /** the factor bar: the same choice for all five places */
  setAll(def: string, choice: FactorChoice): void {
    this.changed.set(
      def,
      this.state(def).choices.map((c) => ({ value: choice.arc ? c.value : choice.value, arc: choice.arc })),
    );
  }

  /** a factor typed for one place holds that number, also where the place followed the Arc bonus */
  setPlace(def: string, rank: number, value: number): void {
    const choices = this.state(def).choices.map((c) => ({ ...c }));
    choices[rank - 1] = { value, arc: false };
    this.changed.set(def, choices);
  }

  /** the current five become the saved ones of the building */
  save(def: string): void {
    this.prefs.savePref(savedKey(def), JSON.stringify(this.state(def).choices));
    this.changed.delete(def);
  }

  /** the building takes the standard again: saved values and the change go */
  reset(def: string): void {
    this.prefs.removePref(savedKey(def));
    this.changed.delete(def);
  }

  /** the current five become the standard for every building without saved values */
  adopt(def: string): void {
    this.prefs.savePref(STANDARD_KEY, JSON.stringify(this.state(def).choices));
  }

  /** the factor in the settings changed: it sets all five places alike again */
  dropStandard(): void {
    this.prefs.removePref(STANDARD_KEY);
  }
}
