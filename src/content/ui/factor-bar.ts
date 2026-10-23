// The factor buttons of the great building calculators: presets and the own Arc bonus, sorted by value, plus a field.
import { html } from 'lit-html';
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

/** 90 % reads as the factor 1,9 helpers know */
export const factorText = (percent: number) => formatNumber((100 + percent) / 100);

/** the factor in effect: the Arc bonus only while its button shows */
export const effectiveFactor = (choice: FactorChoice, arcBonus: number | undefined) =>
  choice.arc && arcBonus !== undefined ? arcBonus : choice.value;

/** the presets and, when given, the own Arc bonus, sorted by value, the chosen one active */
export function factorButtons(presets: number[], arcBonus: number | undefined, choice: FactorChoice): FactorButton[] {
  const arc = choice.arc && arcBonus !== undefined;
  return [
    ...presets.map((value) => ({ value, arc: false, active: !arc && value === choice.value })),
    ...(arcBonus === undefined ? [] : [{ value: arcBonus, arc: true, active: arc }]),
  ].sort((a, b) => a.value - b.value);
}

/** a factor as typed, 1,955, back to percent with one decimal, 95.5 */
export const percentOf = (factor: number) => Math.round((factor - 1) * 1000) / 10;

/** the buttons and a field for any other factor, both read as factors; the field is marked while no button is */
export function factorBar(buttons: FactorButton[], factor: number, actions: FactorActions) {
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) actions.setFactor(percentOf(value));
  };
  return html`<div class="gb-factor">
    <span>${t('gbCalc.factor')}</span>
    ${buttons.map(
      (b) => html`<button class=${b.active ? 'active' : ''} data-tip=${b.arc ? t('gbCalc.arcButton') : ''}
        @click=${() => (b.arc ? actions.useArc() : actions.setFactor(b.value))}>${factorText(b.value)}</button>`,
    )}
    <input type="number" min="0" max="3" step="0.001" data-tip=${t('gbCalc.factorInput')}
      aria-label=${t('gbCalc.factorInput')} class=${buttons.some((b) => b.active) ? '' : 'active'}
      .value=${String((100 + factor) / 100)} @keydown=${keepKeys} @change=${typed} />
  </div>`;
}
