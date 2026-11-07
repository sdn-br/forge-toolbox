// The progress line of the great building boxes (LG-Rechner, Eigenanteil): the running level paid in over a thin bar,
// or a previewed later level in its place, heading and cost over an empty bar.
import { html } from 'lit-html';
import { formatNumber, t } from '../core/texts';
import { fpBar, progressPercent } from './fp-bar';

/**
 * paid in of the running level with a thin bar under it, as the investments show it; `missing` is what is left to the
 * level up (the LG-Rechner counts it from the rankings), `ownerFp` splits the paid in
 */
export function levelProgress(invested: number, required: number, missing = required - invested, ownerFp?: number) {
  const values = {
    invested: formatNumber(invested),
    required: formatNumber(required),
    fp: formatNumber(Math.max(0, missing)),
  };
  const text = ownerFp
    ? html`<span data-tip=${t('gbCalc.progressSplit', { owner: formatNumber(ownerFp), patrons: formatNumber(invested - ownerFp) })}
        >${t('gbCalc.progressOwner', { ...values, owner: formatNumber(ownerFp) })}</span
      >`
    : html`<span>${t('gbCalc.progress', values)}</span>`;
  return html`<div class="gb-progress">
    ${text}
    ${fpBar(progressPercent(invested, required))}
  </div>`;
}

/** a later level as if it were open and empty */
export interface LevelPreview {
  level: number;
  next: number;
  /** Forge points the level needs; undefined without the definition */
  required?: number;
  /** the owner has not unlocked the level yet */
  locked: boolean;
  /** why there are no places: the definition is not loaded or does not tell the cost of the level */
  unknown?: 'definition' | 'reward';
}

/** the preview of `level` before its places are known */
export const levelPreview = (level: number, maxLevel: number): LevelPreview => ({
  level,
  next: level + 1,
  locked: level + 1 > maxLevel,
});

/** why the places are missing */
export const previewUnknown = (p: LevelPreview) =>
  html`<p class="muted">${p.unknown === 'definition' ? t('gbCalc.previewNoDefinition') : t('gbCalc.previewNoReward')}</p>`;

/**
 * The heading in the place of the progress line, with "0 / cost" and an empty bar under it: the bars below keep their
 * height when the box switches between the running level and a preview.
 */
export const previewProgress = (p: LevelPreview) =>
  html`<div class="gb-progress">
    <span class="warn">${t('gbCalc.previewHeading', { level: p.level, next: p.next })}${
      p.required === undefined ? '' : `: ${t('gbCalc.previewProgress', { fp: formatNumber(p.required) })}`
    }</span>${p.locked ? html` <span class="muted">· ${t('gbCalc.previewLocked')}</span>` : ''}
    ${fpBar(0)}
  </div>`;
