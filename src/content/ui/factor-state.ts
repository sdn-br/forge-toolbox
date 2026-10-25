// The part of the factor bar and the factor column both own-share boxes show: where the five factors come from with
// the buttons that change it, and the narrow field of one place.
import { html, type TemplateResult } from 'lit-html';
import { t } from '../core/texts';
import { FACTOR_STEP, percentOf } from './factor-bar';
import { headerIcons } from './icons';
import { keepKeys } from './inputs';

/** where the five factors come from, and what each of the three buttons may do now */
export interface FactorLevel {
  status: 'standard' | 'saved' | 'changed';
  canSave: boolean;
  canReset: boolean;
  canAdopt: boolean;
}

export interface FactorLevelActions {
  /** keeps the five factors for this building */
  saveFactors(): void;
  /** drops the building's saved factors and the change */
  resetFactors(): void;
  /** makes the five factors the standard */
  adoptFactors(): void;
}

/** a small icon per status, the words in its tooltip; the checked arrow of the standard never meets an active adopt
 * button, which only works when the factors differ from the standard */
const STATUS = {
  standard: { label: 'gbOwn.factorStandard', icon: headerIcons.adopted, cls: 'factor-status muted' },
  saved: { label: 'gbOwn.factorSaved', icon: headerIcons.castle, cls: 'factor-status saved' },
  changed: { label: 'gbOwn.factorChanged', icon: headerIcons.pencil, cls: 'factor-status muted' },
} as const;

/** the status icon and the buttons that change it, for the `extra` slot of the factor bar */
export function factorLevel(s: FactorLevel, actions: FactorLevelActions) {
  // all three always show, so the bar keeps its width; one that would do nothing is greyed, its tooltip says why.
  // aria-disabled instead of disabled: a disabled button gets no pointer events, so no tooltip
  const button = (on: boolean, label: string, why: string, icon: TemplateResult, action: () => void) =>
    html`<button class=${on ? 'icon' : 'icon off'} aria-disabled=${on ? 'false' : 'true'} data-tip=${on ? label : why}
      aria-label=${label} @click=${() => on && action()}>${icon}</button>`;
  const mark = STATUS[s.status];
  return html`<span class=${mark.cls} data-tip=${t(mark.label)} aria-label=${t(mark.label)}>${mark.icon}</span>
    ${button(s.canSave, t('gbOwn.factorSave'), t('gbOwn.factorSaveOff'), headerIcons.save, () => actions.saveFactors())}
    ${button(s.canReset, t('gbOwn.factorReset'), t('gbOwn.factorResetOff'), headerIcons.reset, () => actions.resetFactors())}
    ${button(s.canAdopt, t('gbOwn.factorAdopt'), t('gbOwn.factorAdoptOff'), headerIcons.adopt, () => actions.adoptFactors())}`;
}

/** the factor of one place, read as a factor; a place on the Arc bonus is marked, a typed number holds it. `percent`
 * is the factor in effect, `set` gets what was typed in percent. */
export function placeFactorField(percent: number, arc: boolean, set: (percent: number) => void) {
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(value)) set(percentOf(value));
  };
  const tip = arc ? t('gbCalc.arcButton') : t('gbOwn.placeFactorHint');
  return html`<input class=${arc ? 'place-factor arc' : 'place-factor'} type="number" min="0" max="3"
    step=${FACTOR_STEP} data-tip=${tip} aria-label=${t('gbOwn.placeFactorHint')}
    .value=${String((100 + percent) / 100)} @keydown=${keepKeys} @change=${typed} />`;
}
