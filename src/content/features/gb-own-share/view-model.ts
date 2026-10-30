import type { BuildingDefId } from '../../../shared/ids';
import { effectiveFactor, effectiveFactors } from '../../domain/gb-factor';
import { emptyLevel } from '../../domain/gb-level-preview';
import { calculateOwnShare, type OwnPlace, type OwnShareCalc } from '../../domain/gb-own-share';
import type { GreatBuildingDef } from '../../model/catalog';
import type { Construction, RankingRow } from '../../model/great-building';
import { type PlaceFactorState, sameChoice } from '../../stores/place-factors';
import { type FactorButton, factorButtons } from '../../ui/factor-bar';
import { type LevelChoice, levelChoice } from '../../ui/level-bar';
import { type CopyOptions, copyText } from './copy-text';

export {
  COPY_MODES,
  COPY_TOGGLES,
  type CopyMode,
  type CopyOptions,
  copyText,
  DEFAULT_COPY,
} from './copy-text';

export interface OwnShareInputs {
  /** the last own construction opened */
  construction?: Construction;
  /** the level the construction was opened at; a building on another level has stale rankings */
  openedLevel?: number;
  greatBuildingName(def: BuildingDefId): string | undefined;
  /** the factor of each place, in percent or the Arc bonus, and where they come from */
  factors: PlaceFactorState;
  factorButtons: number[];
  /** the own Arc bonus as one more button, sorted in by its value; missing when the setting leaves it out */
  arcBonus?: number;
  secureExisting: boolean;
  trust: boolean;
  /** places without a Forge point reward count as one paid Forge point */
  oneFpForNoReward: boolean;
  /** promised payments by place, index 0 is place 1 */
  exts: number[];
  copy: CopyOptions;
  /** the names in the copy text; a missing building name falls back to the one of the game */
  copyPlayer?: string;
  copyBuilding?: string;
  /** the later level chosen for the preview; undefined shows the open level */
  previewLevel?: number;
  /** era and level costs of the building; undefined (or missing) while its definition is not loaded */
  greatBuilding?(def: BuildingDefId): GreatBuildingDef | undefined;
}

/**
 * A row of the table in paying order: the owner's own Forge points stand as a row before the place they make safe,
 * with the running total of the own share; the first row is what the owner has paid already, the last the rest after
 * the last place.
 */
export type OwnRow =
  /** `fp` to pay now (0 for none) and the total so far; `paid` is what the owner has paid already, first row only */
  | { kind: 'own'; fp: number; total: number; paid: number }
  /** `factor` in percent for the place's field; missing without a Forge point reward, where it changes nothing */
  /** `estimate` marks a payment from a computed reward, in the preview */
  | { kind: 'place'; place: OwnPlace; ext: number; factor?: number; arc?: boolean; estimate?: boolean }
  /** deposits below the paid places, e.g. placeholders a helper pushed down */
  | { kind: 'pushed'; from: number; to: number; fp: number };

export interface CopyVm {
  text: string;
  /** the name of the building in the copy text, kept per building */
  building: string;
}

/** a later level as if it were open and empty, as in the LG-Rechner */
export interface OwnPreviewVm {
  level: number;
  next: number;
  /** Forge points the level needs; undefined without the definition */
  required?: number;
  /** the owner has not unlocked the level yet */
  locked: boolean;
  /** why there are no places: the definition is not loaded or the reward of the level is unknown */
  unknown?: 'definition' | 'reward';
  /** the rewards are computed, off by up to 5 Forge points */
  estimate: boolean;
}

export type OwnShareVm =
  | { kind: 'none' }
  | { kind: 'noEntity' }
  | { kind: 'unconnected'; name: string }
  | { kind: 'leveled'; name: string; level: number }
  | {
      kind: 'current';
      name: string;
      /** the level shown: the open one, or the previewed one */
      level: number;
      next: number;
      /** the level field: the open level or a later one as a preview */
      levels: LevelChoice;
      /** set while a later level is previewed: empty, without deposits, Ext and live Forge points */
      preview?: OwnPreviewVm;
      /** the factor of the free field: the one of place 1 */
      factor: number;
      /** sorted by value; `arc` marks the button of the own Arc bonus; active only when all five places hold it */
      factorButtons: FactorButton[];
      factorState: Omit<PlaceFactorState, 'choices'>;
      secureExisting: boolean;
      trust: boolean;
      rows: OwnRow[];
      ownShare: number;
      myDeposit: number;
      open: number;
      /**
       * Forge points the building has beyond what the rankings show: others paid in, reported without rankings, so
       * their places are unknown until it is opened again. An own contribution brings its rankings and counts not.
       */
      addedLive: number;
      copy: CopyVm;
    }
  /** a previewed level whose places are unknown: no definition, or a reward no table reaches */
  | { kind: 'previewUnknown'; name: string; levels: LevelChoice; preview: OwnPreviewVm };

export function ownShareViewModel(input: OwnShareInputs): OwnShareVm {
  const c = input.construction;
  if (!c) return { kind: 'none' };
  const entity = c.entity;
  if (!entity) return { kind: 'noEntity' };
  const name = input.greatBuildingName(entity.def) ?? entity.def;
  const levels = levelChoice(entity.level, input.previewLevel);
  // at the unlocked maximum the next level cannot be paid into yet, so the box previews it rather than refusing
  const atMax = entity.level >= entity.maxLevel;
  if (levels.preview || atMax) {
    const level = levels.chosen;
    const base = { level, next: level + 1, locked: level + 1 > entity.maxLevel, estimate: false };
    const gb = input.greatBuilding?.(entity.def);
    if (!gb) return { kind: 'previewUnknown', name, levels, preview: { ...base, unknown: 'definition' } };
    const empty = emptyLevel(gb, level);
    if (empty.required === undefined || !empty.reward || !empty.rankings)
      return {
        kind: 'previewUnknown',
        name,
        levels,
        preview: { ...base, required: empty.required, unknown: 'reward' },
      };
    const preview = { ...base, required: empty.required, estimate: empty.reward.estimate };
    return {
      ...ownTable(input, name, level, empty.required, empty.rankings, [], preview.estimate),
      levels,
      preview,
      addedLive: 0,
    };
  }
  if (!entity.connected) return { kind: 'unconnected', name };
  // a new level since the opening: the rankings belong to the old one
  if (c.leveled || entity.level !== (input.openedLevel ?? entity.level))
    return { kind: 'leveled', name, level: c.leveled?.level ?? entity.level };
  return {
    ...ownTable(input, name, entity.level, entity.required, c.rankings, input.exts, false),
    levels,
    addedLive: entity.invested - c.rankings.reduce((sum, r) => sum + (r.fp ?? 0), 0),
  };
}

/** the places of `level` with the factors of the building, the totals and the copy text */
function ownTable(
  input: OwnShareInputs,
  name: string,
  level: number,
  required: number,
  rankings: RankingRow[],
  exts: number[],
  estimate: boolean,
): Omit<Extract<OwnShareVm, { kind: 'current' }>, 'levels' | 'preview' | 'addedLive'> {
  const { choices, ...factorState } = input.factors;
  const factors = effectiveFactors(choices, input.arcBonus);
  const calc = calculateOwnShare({
    required,
    rankings,
    factor: factors,
    secureExisting: input.secureExisting,
    trust: input.trust,
    oneFpForNoReward: input.oneFpForNoReward,
    exts,
  });
  const player = input.copyPlayer ?? '';
  const building = input.copyBuilding ?? name;
  const text = copyText(calc, input.copy, { player, building, level, factor: factors });
  const first = choices[0];
  const alike = first && choices.every((c) => sameChoice(c, first)) ? first : undefined;
  const buttons = factorButtons(input.factorButtons, input.arcBonus, alike);
  return {
    kind: 'current',
    name,
    level,
    next: level + 1,
    factor: factors[0] ?? 0,
    factorButtons: buttons,
    factorState,
    secureExisting: input.secureExisting,
    trust: input.trust,
    rows: ownRows(calc, exts, estimate, (rank) => {
      const choice = choices[rank - 1];
      return (
        choice && { factor: effectiveFactor(choice, input.arcBonus), arc: choice.arc && input.arcBonus !== undefined }
      );
    }),
    ownShare: calc.ownShare,
    myDeposit: calc.myDeposit,
    open: calc.open,
    copy: { text, building },
  };
}

function ownRows(
  calc: OwnShareCalc,
  exts: number[],
  estimate: boolean,
  factorOf: (rank: number) => { factor: number; arc: boolean } | undefined,
): OwnRow[] {
  let total = calc.myDeposit;
  // the first row holds what is paid already and, before place 1, what to pay first
  const rows: OwnRow[] = [];
  const own = (fp: number) => {
    total += fp;
    rows.push({ kind: 'own', fp, total, paid: rows.length ? 0 : calc.myDeposit });
  };
  const first = calc.places[0]?.advance ?? 0;
  if (calc.myDeposit > 0 || first > 0) own(first);
  calc.places.forEach((place, i) => {
    if (i > 0 && place.advance > 0) own(place.advance);
    rows.push({
      kind: 'place',
      place,
      ext: exts[place.rank - 1] ?? 0,
      ...(place.net > 0 && factorOf(place.rank)),
      ...(estimate && { estimate: true }),
    });
  });
  if (calc.pushed) rows.push({ kind: 'pushed', ...calc.pushed });
  if (calc.rest > 0) own(calc.rest);
  return rows;
}
