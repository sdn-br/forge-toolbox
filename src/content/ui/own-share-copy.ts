// The copy text of an own great building for the guild chat and what it is made of, shared by the Eigenanteil box and
// the Powerleveln box: the switches, their defaults, reading them from the settings and the text itself.

import type { Settings } from '../core/settings';
import { type TextKey, t } from '../core/texts';
import type { OwnPlace, OwnShareCalc } from '../domain/gb-own-share';
import { factorText } from './factor-bar';

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

/** the options that are switches, the others are texts and the choice of places */
type CopyToggle = Exclude<keyof CopyOptions, 'mode' | 'manual' | 'warnPrefix' | 'warnSuffix'>;

/** the switches of the copy text with their labels, in the order the settings show them */
export const COPY_TOGGLES: [CopyToggle, TextKey][] = [
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
function factorsText(factors: number[]): string {
  const low = Math.min(...factors);
  const high = Math.max(...factors);
  return low === high ? factorText(low) : `${factorText(low)}/${factorText(high)}`;
}

/** One line for the guild chat, e.g. „Ich Arche 135→136 P5(38) P4(209) P3(827)“. Numbers stay plain for pasting. */
export function copyText(
  calc: OwnShareCalc,
  o: CopyOptions,
  /** `factor` in percent, one per place */
  about: { player: string; building: string; level: number; factor: number[] },
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

/** the settings and view choices the copy text reads; the Eigenanteil box registers them */
export const COPY_PLAYER = 'gbOwn.copy.playerName';
export const COPY_MODE = 'gbOwn.copy.mode';
export const COPY_MANUAL = 'gbOwn.copy.manual';
export const COPY_WARN_PREFIX = 'gbOwn.copy.warnPrefix';
export const COPY_WARN_SUFFIX = 'gbOwn.copy.warnSuffix';
export const copyToggleKey = (option: string) => `gbOwn.copy.${option}`;
/** the name of one building in the copy text, a view choice kept per building definition */
export const copyBuildingKey = (def: string) => `gbOwn.copy.building.${def}`;

/** the copy options as the settings hold them */
export function readCopyOptions(settings: Settings): CopyOptions {
  return {
    ...(Object.fromEntries(COPY_TOGGLES.map(([o]) => [o, settings.get(copyToggleKey(o))])) as Pick<
      CopyOptions,
      CopyToggle
    >),
    warnPrefix: settings.text(COPY_WARN_PREFIX),
    warnSuffix: settings.text(COPY_WARN_SUFFIX),
    mode: settings.choice(COPY_MODE) as CopyMode,
    manual: settings.numbers(COPY_MANUAL),
  };
}
