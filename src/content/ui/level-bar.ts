// The level field of the great building calculators: the current level shows the live construction, a later one the
// preview of that level.
import { html } from 'lit-html';
import { t } from '../core/texts';
import { headerIcons } from './icons';
import { keepKeys } from './inputs';

export interface LevelChoice {
  /** the level the current construction starts from */
  current: number;
  /** the level in the selector: the previewed one, else the current construction's */
  chosen: number;
  preview: boolean;
}

/** the choice for a construction on `current`; a preview not after it shows the construction (a level up overtook it) */
export function levelChoice(current: number, preview: number | undefined): LevelChoice {
  const later = preview !== undefined && preview > current ? preview : undefined;
  return { current, chosen: later ?? current, preview: later !== undefined };
}

/**
 * The field switches: the current level goes back to the live construction, a later one previews it. The chevrons glued
 * to it step one level, back is shut on the live construction. The button back only shows in the preview. `pick` gets
 * undefined for the live construction.
 */
export function levelBar(l: LevelChoice, pick: (level: number | undefined) => void) {
  const typed = (e: Event) => {
    const value = (e.target as HTMLInputElement).valueAsNumber;
    if (value === l.current) pick(undefined);
    else if (Number.isInteger(value) && value > l.current) pick(value);
  };
  const step = (level: number) => pick(level > l.current ? level : undefined);
  return html`<div class="gb-levels">
    <span>${t('gbCalc.level')}</span>
    <span class="joined">
      <button class="action icon-only prev" ?disabled=${!l.preview} data-tip=${t('gbCalc.previousLevel')}
        aria-label=${t('gbCalc.previousLevel')} @click=${() => step(l.chosen - 1)}>${headerIcons.chevronLeft}</button>
      <input type="number" min=${l.current} step="1" data-tip=${t('gbCalc.previewInput')}
        aria-label=${t('gbCalc.previewInput')} class=${l.preview ? 'active' : ''}
        .value=${String(l.chosen)} @keydown=${keepKeys} @change=${typed} />
      <button class="action icon-only next" data-tip=${t('gbCalc.nextLevel')} aria-label=${t('gbCalc.nextLevel')}
        @click=${() => step(l.chosen + 1)}>${headerIcons.chevronRight}</button>
    </span>
    ${
      l.preview
        ? html`<button class="action" @click=${() => pick(undefined)}>
            ${t('gbCalc.live', { level: l.current, next: l.current + 1 })}</button>`
        : ''
    }
  </div>`;
}
