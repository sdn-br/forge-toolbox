import type { BuildingDefId } from '../../../shared/ids';
import type { ArcBonus } from '../../domain/arc-bonus';
import { alikeOn, effectiveFactor, effectiveFactors } from '../../domain/gb-factor';
import { type LevelCosts, levelCosts } from '../../domain/gb-level-cost';
import { emptyLevel } from '../../domain/gb-level-preview';
import { calculateOwnShare, type OwnPlace, type OwnShareCalc } from '../../domain/gb-own-share';
import { levelTier, tierPlaces } from '../../domain/gb-tier';
import type { GreatBuildingDef, GreatBuildingTier, TierStart } from '../../model/catalog';
import type { Construction, RankingRow } from '../../model/great-building';
import type { PlaceFactorState } from '../../stores/gb-own-state';
import { type FactorButton, factorButtons } from '../../ui/factor-bar';
import { type LevelChoice, levelChoice } from '../../ui/level-bar';
import { type LevelPreview, levelPreview } from '../../ui/level-preview';
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
  /** the presets on gold levels; none when missing */
  factorButtonsGold?: number[];
  /**
   * the own Arc bonus as one more button, sorted in by its value: the one of the tier of the level shown; missing when
   * the setting leaves it out
   */
  arcBonus?: ArcBonus;
  /** the tiers of great building levels; the default ones when missing */
  tiers?: TierStart[];
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
  /** the cost of each level of a building that is not open; without it only the levels the definition lists */
  levelCosts?(def: BuildingDefId, gb: GreatBuildingDef): LevelCosts;
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
  | { kind: 'place'; place: OwnPlace; ext: number; factor?: number; arc?: boolean }
  /** deposits below the paid places, e.g. placeholders a helper pushed down */
  | { kind: 'pushed'; from: number; to: number; fp: number };

export interface CopyVm {
  text: string;
  /** the name of the building in the copy text, kept per building */
  building: string;
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
      preview?: LevelPreview;
      /** Forge points paid into the level shown and what it costs, for the progress line; 0 paid in a preview */
      invested: number;
      required: number;
      /** the factor of the free field: the one of place 1 */
      factor: number;
      /** sorted by value; `arc` marks the button of the own Arc bonus; active only when all places of the tier hold it */
      factorButtons: FactorButton[];
      /** the tier of the level shown: the buttons and a factor typed belong to it */
      tier: GreatBuildingTier;
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
  /** a previewed level whose places are unknown: no definition, or no cost of the level */
  | { kind: 'previewUnknown'; name: string; levels: LevelChoice; preview: LevelPreview };

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
    const base = levelPreview(level, entity.maxLevel);
    const gb = input.greatBuilding?.(entity.def);
    if (!gb) return { kind: 'previewUnknown', name, levels, preview: { ...base, unknown: 'definition' } };
    const costs = input.levelCosts?.(entity.def, gb) ?? levelCosts(gb.levelCosts);
    const empty = emptyLevel(gb, level, costs(level), input.tiers);
    if (empty.required === undefined || !empty.rankings)
      return { kind: 'previewUnknown', name, levels, preview: { ...base, unknown: 'reward' } };
    const preview = { ...base, required: empty.required };
    return {
      ...ownTable(input, name, gb, level, empty.required, empty.rankings, []),
      levels,
      preview,
      invested: 0,
      addedLive: 0,
    };
  }
  if (!entity.connected) return { kind: 'unconnected', name };
  // a new level since the opening: the rankings belong to the old one
  if (c.leveled || entity.level !== (input.openedLevel ?? entity.level))
    return { kind: 'leveled', name, level: c.leveled?.level ?? entity.level };
  return {
    ...ownTable(input, name, input.greatBuilding?.(entity.def), entity.level, entity.required, c.rankings, input.exts),
    levels,
    invested: entity.invested,
    addedLive: entity.invested - c.rankings.reduce((sum, r) => sum + (r.fp ?? 0), 0),
  };
}

/**
 * the places of `level` with the factors of the building, the totals and the copy text; the Arc bonus, the fixed
 * factors and the buttons of its tier
 */
function ownTable(
  input: OwnShareInputs,
  name: string,
  gb: GreatBuildingDef | undefined,
  level: number,
  required: number,
  rankings: RankingRow[],
  exts: number[],
): Omit<Extract<OwnShareVm, { kind: 'current' }>, 'levels' | 'preview' | 'invested' | 'addedLive'> {
  const { choices, ...factorState } = input.factors;
  const tier = levelTier(gb, level + 1, input.tiers);
  const arcBonus = input.arcBonus?.[tier];
  // a copper level has five places, the factors of places 6 and 7 count on gold levels only
  const factors = effectiveFactors(choices.slice(0, tierPlaces(tier)), arcBonus, tier);
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
  const text = copyText(calc, input.copy, { player, building, level, factor: factors, tier });
  const presets = tier === 'gold' ? (input.factorButtonsGold ?? []) : input.factorButtons;
  const buttons = factorButtons(presets, arcBonus, alikeOn(choices, tier), input.arcBonus, tier);
  return {
    kind: 'current',
    name,
    level,
    next: level + 1,
    required,
    factor: factors[0] ?? 0,
    factorButtons: buttons,
    tier,
    factorState,
    secureExisting: input.secureExisting,
    trust: input.trust,
    rows: ownRows(calc, exts, (rank) => {
      const choice = choices[rank - 1];
      return choice && { factor: effectiveFactor(choice, arcBonus, tier), arc: choice.arc && arcBonus !== undefined };
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
    });
  });
  if (calc.pushed) rows.push({ kind: 'pushed', ...calc.pushed });
  if (calc.rest > 0) own(calc.rest);
  return rows;
}
