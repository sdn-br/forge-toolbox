// The factor buttons of the great building calculators: presets and the own Arc bonus, sorted by value, plus a field.
import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../core/texts';
import { keepKeys } from './inputs';

/** the factor picked: a number in percent, or the own Arc bonus, which follows the bonus when it changes */
export interface FactorChoice {
  value: number;
  arc: boolean;
}

export interface FactorButton {
  value: number;
  /** the button of the own Arc bonus */
  arc: boolean;
  active: boolean;
}

export interface FactorActions {
  setFactor(value: number): void;
  /** the own Arc bonus as the factor */
  useArc(): void;
}

/** 90 % is the factor 1,9 helpers know */
export const factorOf = (percent: number) => (100 + percent) / 100;

/** 90 % reads as the factor 1,9 */
export const factorText = (percent: number) => formatNumber(factorOf(percent));

/** the factor in effect: the Arc bonus only while its button shows */
export const effectiveFactor = (choice: FactorChoice, arcBonus: number | undefined) =>
  choice.arc && arcBonus !== undefined ? arcBonus : choice.value;

/** the factor of each place, one choice per place */
export const effectiveFactors = (choices: FactorChoice[], arcBonus: number | undefined) =>
  choices.map((c) => effectiveFactor(c, arcBonus));

/** the presets and, when given, the own Arc bonus, sorted by value, the chosen one active; without a choice none is */
export function factorButtons(
  presets: number[],
  arcBonus: number | undefined,
  choice: FactorChoice | undefined,
): FactorButton[] {
  const arc = choice?.arc === true && arcBonus !== undefined;
  return [
    ...presets.map((value) => ({ value, arc: false, active: !arc && value === choice?.value })),
    ...(arcBonus === undefined ? [] : [{ value: arcBonus, arc: true, active: arc }]),
  ].sort((a, b) => a.value - b.value);
}

/** what the arrows of a factor field add: 1,9 → 1,91; typing still takes 1,955 */
export const FACTOR_STEP = 0.01;

/** a factor as typed, 1,955, back to percent with one decimal, 95.5 */
export const percentOf = (factor: number) => Math.round((factor - 1) * 1000) / 10;

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
export function factorBar(buttons: FactorButton[], factor: number, actions: FactorActions, extra?: TemplateResult) {
  return html`<div class="gb-factor">
    <span>${t('gbCalc.factor')}</span>
    ${buttons.map(
      (b) => html`<button class=${b.active ? 'action active' : 'action'} data-tip=${b.arc ? t('gbCalc.arcButton') : ''}
        @click=${() => (b.arc ? actions.useArc() : actions.setFactor(b.value))}>${factorText(b.value)}</button>`,
    )}
    ${factorInput({
      percent: factor,
      cls: buttons.some((b) => b.active) ? '' : 'active',
      tip: t('gbCalc.factorInput'),
      label: t('gbCalc.factorInput'),
      set: (percent) => actions.setFactor(percent),
    })}
    ${extra ?? ''}
  </div>`;
}
