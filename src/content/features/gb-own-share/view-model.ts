import type { BuildingDefId } from '../../../shared/ids';
import { type TextKey, t } from '../../core/texts';
import { calculateOwnShare, type OwnPlace, type OwnShareCalc } from '../../domain/gb-own-share';
import type { Construction } from '../../stores/great-building-model';
import { effectiveFactor, type FactorButton, factorButtons, factorText } from '../../ui/factor-bar';
import { type PlaceFactorState, sameChoice } from './place-factors';

/** which places the copy text names: the safe ones from the top, all free ones, all with Forge points, or a choice */
export type CopyMode = 'auto' | 'autoUnsafe' | 'all' | 'manual';

export interface CopyOptions {
  player: boolean;
  building: boolean;
  level: boolean;
  /** the words „Bitte leveln“ */
  levelUp: boolean;
  /** Forge points per place, P1(4950), or the places alone */
  fp: boolean;
  /** „P“ before the number of a place */
  prefixP: boolean;
  /** place 5 first */
  descending: boolean;
  /** the own share still open at the end, EA(1234) */
  ownPart: boolean;
  /** the factor, 1,9 */
  factor: boolean;
  /** mark places in danger or that level the building: the prefix once in front, the suffix after each such place */
  warn: boolean;
  warnPrefix: string;
  warnSuffix: string;
  mode: CopyMode;
  /** the places picked by hand */
  manual: number[];
}

/** the switches of the copy text with their labels, in the order the settings show them */
export const COPY_TOGGLES: [Exclude<keyof CopyOptions, 'mode' | 'manual' | 'warnPrefix' | 'warnSuffix'>, TextKey][] = [
  ['player', 'gbOwn.copyPlayer'],
  ['building', 'gbOwn.copyBuilding'],
  ['level', 'gbOwn.copyLevel'],
  ['levelUp', 'gbOwn.copyLevelUpOption'],
  ['fp', 'gbOwn.copyFp'],
  ['prefixP', 'gbOwn.copyPrefixP'],
  ['descending', 'gbOwn.copyDescending'],
  ['ownPart', 'gbOwn.copyOwnPartOption'],
  ['factor', 'gbOwn.copyFactor'],
  ['warn', 'gbOwn.copyWarn'],
];

export const COPY_MODES: [CopyMode, TextKey][] = [
  ['auto', 'gbOwn.copyAuto'],
  ['autoUnsafe', 'gbOwn.copyAutoUnsafe'],
  ['all', 'gbOwn.copyAll'],
  ['manual', 'gbOwn.copyManual'],
];

export const DEFAULT_COPY: CopyOptions = {
  player: true,
  building: true,
  level: false,
  levelUp: false,
  fp: true,
  prefixP: true,
  descending: true,
  ownPart: false,
  factor: false,
  warn: false,
  warnPrefix: '!!!',
  warnSuffix: '',
  mode: 'auto',
  manual: [],
};

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
  | { kind: 'blocked'; name: string; reason: 'maxLevel' | 'unconnected' }
  | { kind: 'leveled'; name: string; level: number }
  | {
      kind: 'current';
      name: string;
      level: number;
      next: number;
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
    };

export function ownShareViewModel(input: OwnShareInputs): OwnShareVm {
  const c = input.construction;
  if (!c) return { kind: 'none' };
  const entity = c.entity;
  if (!entity) return { kind: 'noEntity' };
  const name = input.greatBuildingName(entity.def) ?? entity.def;
  if (entity.level >= entity.maxLevel) return { kind: 'blocked', name, reason: 'maxLevel' };
  if (!entity.connected) return { kind: 'blocked', name, reason: 'unconnected' };
  // a new level since the opening: the rankings belong to the old one
  if (c.leveled || entity.level !== (input.openedLevel ?? entity.level))
    return { kind: 'leveled', name, level: c.leveled?.level ?? entity.level };
  const { choices, ...factorState } = input.factors;
  const factors = choices.map((c) => effectiveFactor(c, input.arcBonus));
  const calc = calculateOwnShare({
    required: entity.required,
    rankings: c.rankings,
    factor: factors,
    secureExisting: input.secureExisting,
    trust: input.trust,
    oneFpForNoReward: input.oneFpForNoReward,
    exts: input.exts,
  });
  const player = input.copyPlayer ?? '';
  const building = input.copyBuilding ?? name;
  const text = copyText(calc, input.copy, { player, building, level: entity.level, factor: factors });
  const first = choices[0];
  const alike = first && choices.every((c) => sameChoice(c, first)) ? first : undefined;
  const buttons = factorButtons(input.factorButtons, input.arcBonus, alike);
  return {
    kind: 'current',
    name,
    level: entity.level,
    next: entity.level + 1,
    factor: factors[0] ?? 0,
    factorButtons: buttons,
    factorState,
    secureExisting: input.secureExisting,
    trust: input.trust,
    rows: ownRows(calc, input.exts, (rank) => {
      const choice = choices[rank - 1];
      return (
        choice && { factor: effectiveFactor(choice, input.arcBonus), arc: choice.arc && input.arcBonus !== undefined }
      );
    }),
    ownShare: calc.ownShare,
    myDeposit: calc.myDeposit,
    open: calc.open,
    addedLive: entity.invested - c.rankings.reduce((sum, r) => sum + (r.fp ?? 0), 0),
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

/** the places the copy text names, by its mode */
function copiedPlaces(calc: OwnShareCalc, o: CopyOptions): OwnPlace[] {
  const paying = calc.places.filter((p) => !p.full && p.amount > 0);
  switch (o.mode) {
    case 'auto':
      return paying.filter((p) => calc.safeRanks.includes(p.rank));
    case 'autoUnsafe':
      return paying.filter((p) => !p.holder);
    case 'all':
      return paying;
    case 'manual':
      return paying.filter((p) => o.manual.includes(p.rank));
  }
}

/** the factor as helpers read it: 1,9 when all places share it, else the lowest and the highest, 1,8/1,9 */
function factorsText(factor: number | number[]): string {
  const list = typeof factor === 'number' ? [factor] : factor;
  const low = Math.min(...list);
  const high = Math.max(...list);
  return low === high ? factorText(low) : `${factorText(low)}/${factorText(high)}`;
}

/** One line for the guild chat, e.g. „Ich Arche 135→136 P5(38) P4(209) P3(827)“. Numbers stay plain for pasting. */
export function copyText(
  calc: OwnShareCalc,
  o: CopyOptions,
  /** `factor` in percent, one for all places or one per place */
  about: { player: string; building: string; level: number; factor: number | number[] },
): string {
  const parts: string[] = [];
  if (o.player && about.player) parts.push(about.player);
  if (o.building && about.building) parts.push(about.building);
  if (o.levelUp) parts.push(t('gbOwn.copyLevelUp'));
  if (o.level) parts.push(`${about.level}→${about.level + 1}`);
  if (o.factor) parts.push(factorsText(about.factor));
  const places = copiedPlaces(calc, o);
  if (o.descending) places.reverse();
  // as in the old toolbox, but the prefix only when a marked place is in the text, not for one left out
  const marked = (p: OwnPlace) => o.warn && (p.danger !== undefined || p.levels);
  if (o.warnPrefix && places.some(marked)) parts.unshift(o.warnPrefix);
  for (const p of places) {
    parts.push(`${o.prefixP ? 'P' : ''}${p.rank}${o.fp ? `(${p.amount})` : ''}`);
    if (o.warnSuffix && marked(p)) parts.push(o.warnSuffix);
  }
  if (!places.length && o.mode === 'auto') parts.push(t('gbOwn.copyNoneSafe'));
  if (!places.length && o.mode === 'autoUnsafe') parts.push(t('gbOwn.copyNoneFree'));
  if (o.ownPart) parts.push(`${t('gbOwn.copyOwnPart')}(${Math.max(0, calc.open)})`);
  return parts.join(' ');
}
