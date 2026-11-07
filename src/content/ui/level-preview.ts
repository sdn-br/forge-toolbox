// The head of a previewed later level in the great building boxes (LG-Rechner, Eigenanteil): heading and cost.
import { html } from 'lit-html';
import { formatNumber, t } from '../core/texts';
import { fpBar } from './fp-bar';

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

export const previewHeading = (p: LevelPreview) =>
  html`<p class="warn">${t('gbCalc.previewHeading', { level: p.level, next: p.next })}${
    p.locked ? html` <span class="muted">· ${t('gbCalc.previewLocked')}</span>` : ''
  }</p>`;

/** why the places are missing */
export const previewUnknown = (p: LevelPreview) =>
  html`<p class="muted">${p.unknown === 'definition' ? t('gbCalc.previewNoDefinition') : t('gbCalc.previewNoReward')}</p>`;

/**
 * The heading in the place of the progress line, with "0 / cost" and an empty bar under it: the LG-Rechner keeps the
 * level and factor bars below at the same height when it switches between the running level and a preview.
 */
export const previewProgress = (p: LevelPreview) =>
  html`<div class="gb-progress">
    <span class="warn">${t('gbCalc.previewHeading', { level: p.level, next: p.next })}${
      p.required === undefined ? '' : `: ${t('gbCalc.previewProgress', { fp: formatNumber(p.required) })}`
    }</span>${p.locked ? html` <span class="muted">· ${t('gbCalc.previewLocked')}</span>` : ''}
    ${fpBar(0)}
  </div>`;

export const previewCost = (p: LevelPreview) =>
  p.required === undefined ? '' : html`<p>${t('gbCalc.previewCost', { fp: formatNumber(p.required) })}</p>`;
