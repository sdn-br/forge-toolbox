// The factor buttons of the great building calculators: presets and the own Arc bonus, sorted by value, plus a field.
import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../core/texts';
import type { ArcBonus } from '../domain/arc-bonus';
import { FACTOR_STEP, type FactorChoice, factorOf, fixedFactor, percentOf } from '../domain/gb-factor';
import type { GreatBuildingTier } from '../model/catalog';
import { keepKeys } from './inputs';

export interface FactorButton {
  value: number;
  /** the button of the own Arc bonus */
  arc: boolean;
  active: boolean;
  /** the value as a factor, „1,9“, on gold levels with two decimals, „1,15“ */
  label: string;
  /** the Arc button: both values of the Arc bonus, the button shows the one of the level */
  arcBonuses?: ArcBonus;
}

export interface FactorActions {
  /** a fixed factor for levels of `tier`; that of the other tier stays */
  setFactor(value: number, tier: GreatBuildingTier): void;
  /** the own Arc bonus as the factor */
  useArc(): void;
}

const twoDecimals = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 90 % reads as the factor 1,9; on gold levels, where the Arc bonus is 0 to 50 %, with two decimals: 19 % as 1,19 */
export const factorText = (percent: number, tier: GreatBuildingTier = 'copper') =>
  tier === 'gold' ? twoDecimals.format(factorOf(percent)) : formatNumber(factorOf(percent));

/** both values of the Arc bonus, „Kupfer 93 %, Gold 12 %“ */
export const arcTip = (arc: ArcBonus) =>
  t('gbCalc.arcTiers', { copper: formatNumber(arc.copper), gold: formatNumber(arc.gold) });

/**
 * the presets of the tier and, when given, the own Arc bonus of the level, sorted by value, the chosen one active;
 * without a choice none is. A preset is active when the fixed factor of the tier holds its value. `arcBonuses` are both
 * values for the tooltip of the Arc button.
 */
export function factorButtons(
  presets: number[],
  arcBonus: number | undefined,
  choice: FactorChoice | undefined,
  arcBonuses?: ArcBonus,
  tier: GreatBuildingTier = 'copper',
): FactorButton[] {
  const arc = choice?.arc === true && arcBonus !== undefined;
  const fixed = choice && fixedFactor(choice, tier);
  const label = (value: number) => factorText(value, tier);
  return [
    ...presets.map((value) => ({ value, arc: false, active: !arc && value === fixed, label: label(value) })),
    ...(arcBonus === undefined
      ? []
      : [{ value: arcBonus, arc: true, active: arc, label: label(arcBonus), ...(arcBonuses && { arcBonuses }) }]),
  ].sort((a, b) => a.value - b.value);
}

const arcButtonTip = (b: FactorButton) =>
  b.arcBonuses ? `${t('gbCalc.arcButton')} (${arcTip(b.arcBonuses)})` : t('gbCalc.arcButton');

/** a field that reads `percent` as a factor; `set` gets what was typed in percent */
export function factorInput(f: {
  percent: number;
  cls: string;
  tip: string;
  label: string;
  set: (percent: number) => void;
}) {
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) f.set(percentOf(value));
  };
  return html`<input class=${f.cls} type="number" min="0" max="3" step=${FACTOR_STEP} data-tip=${f.tip}
    aria-label=${f.label} .value=${String(factorOf(f.percent))} @keydown=${keepKeys} @change=${typed} />`;
}

/**
 * the buttons and a field for any other factor, both read as factors; the field is marked while no button is;
 * `extra` goes at the end of the bar
 */
export function factorBar(
  buttons: FactorButton[],
  factor: number,
  actions: FactorActions,
  tier: GreatBuildingTier,
  extra?: TemplateResult,
) {
  return html`<div class="gb-factor">
    <span>${t('gbCalc.factor')}</span>
    ${buttons.map(
      (b) => html`<button class=${b.active ? 'action active' : 'action'} data-tip=${b.arc ? arcButtonTip(b) : ''}
        @click=${() => (b.arc ? actions.useArc() : actions.setFactor(b.value, tier))}>${b.label}</button>`,
    )}
    ${factorInput({
      percent: factor,
      cls: buttons.some((b) => b.active) ? '' : 'active',
      tip: t('gbCalc.factorInput'),
      label: t('gbCalc.factorInput'),
      set: (percent) => actions.setFactor(percent, tier),
    })}
    ${extra ?? ''}
  </div>`;
}
