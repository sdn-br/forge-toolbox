// What the Eigenanteil and the Powerleveln box share for an own great building: the factors per place on their three
// levels and the Ext of the open level. The factors: the standard for every building, the seven saved for one building,
// and a change in the box not saved, kept per building until the page reloads. Copper levels have five places and use
// places 1 to 5 only. Neither box owns the state; each reads and writes here and hears of the other's change on the bus.
// The view switches and the Arc bonus are not kept here, see `features/shared/gb-own-view.ts`. The settings definitions
// live in `features/shared/settings.ts`.
import type { ToolboxBus } from '../core/events';
import { type FactorChoice, sameChoices, withFixed } from '../domain/gb-factor';
import type { GreatBuildingTier } from '../model/catalog';

/** the places with a reward on a gold level, the most a level has */
const PLACES = 7;
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

export class GbOwnState {
  /** changes not saved, per building definition; gone with the page */
  private drafts = new Map<string, FactorChoice[]>();
  /** promised payments per building and level; they are typed in for one level only, gone with the page */
  private exts = new Map<string, number[]>();

  /** `single` is the factor of the settings, for all places while no standard is stored */
  constructor(
    private bus: ToolboxBus,
    private prefs: PrefStore,
    private single: () => FactorChoice,
  ) {}

  /** the factors chosen as the standard for every building without saved values */
  standard(): FactorChoice[] {
    return (
      parse(this.prefs.pref(STANDARD_KEY), this.single().gold) ??
      Array.from({ length: PLACES }, () => ({ ...this.single() }))
    );
  }

  /** the factors of the places of a building and where they come from */
  state(def: string): PlaceFactorState {
    const standard = this.standard();
    const saved = parse(this.prefs.pref(savedKey(def)), this.single().gold);
    const base = saved ?? standard;
    // a change back to what is in effect anyway is no change
    const draft = this.drafts.get(def);
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
    this.drafts.set(
      def,
      this.state(def).choices.map((c) => (choice.arc ? { ...c, arc: true } : withFixed(c, choice.value, tier))),
    );
    this.changed(def);
  }

  /** a factor typed for one place holds that number on levels of `tier`, also where the place followed the Arc bonus */
  setPlace(def: string, rank: number, value: number, tier: GreatBuildingTier = 'copper'): void {
    const choices = this.state(def).choices.map((c) => ({ ...c }));
    choices[rank - 1] = withFixed(choices[rank - 1] as FactorChoice, value, tier);
    this.drafts.set(def, choices);
    this.changed(def);
  }

  /** the current factors become the saved ones of the building */
  save(def: string): void {
    this.prefs.savePref(savedKey(def), JSON.stringify(this.state(def).choices));
    this.drafts.delete(def);
    this.changed(def);
  }

  /** the building takes the standard again: saved values and the change go */
  reset(def: string): void {
    this.prefs.removePref(savedKey(def));
    this.drafts.delete(def);
    this.changed(def);
  }

  /** the current factors become the standard for every building without saved values */
  adopt(def: string): void {
    this.prefs.savePref(STANDARD_KEY, JSON.stringify(this.state(def).choices));
    this.changed(def);
  }

  /** the factor in the settings changed: it sets all places alike again, for every building */
  dropStandard(): void {
    this.prefs.removePref(STANDARD_KEY);
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
