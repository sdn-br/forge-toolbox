// The part of the factor bar and the factor column both own-share boxes show: where the five factors come from with
// the buttons that change it, and the narrow field of one place.
import { html } from 'lit-html';
import { t } from '../../core/texts';
import { offButton } from '../../ui/buttons';
import { factorInput } from '../../ui/factor-bar';
import { headerIcons } from '../../ui/icons';

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
  // all three always show, so the bar keeps its width; one that would do nothing is greyed, its tooltip says why
  const mark = STATUS[s.status];
  return html`<span class=${mark.cls} data-tip=${t(mark.label)} aria-label=${t(mark.label)}>${mark.icon}</span>
    ${offButton(s.canSave, t('gbOwn.factorSave'), headerIcons.save, () => actions.saveFactors(), t('gbOwn.factorSaveOff'))}
    ${offButton(s.canReset, t('gbOwn.factorReset'), headerIcons.reset, () => actions.resetFactors(), t('gbOwn.factorResetOff'))}
    ${offButton(s.canAdopt, t('gbOwn.factorAdopt'), headerIcons.adopt, () => actions.adoptFactors(), t('gbOwn.factorAdoptOff'))}`;
}

/** the factor of one place, read as a factor; a place on the Arc bonus is marked, a typed number holds it. `percent`
 * is the factor in effect, `set` gets what was typed in percent. */
export const placeFactorField = (percent: number, arc: boolean, set: (percent: number) => void) =>
  factorInput({
    percent,
    cls: arc ? 'place-factor arc' : 'place-factor',
    tip: arc ? t('gbCalc.arcButton') : t('gbOwn.placeFactorHint'),
    label: t('gbOwn.placeFactorHint'),
    set,
  });
