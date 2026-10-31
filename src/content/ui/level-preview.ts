// The head of a previewed later level in the great building boxes (LG-Rechner, Eigenanteil): heading, cost, estimate.
import { html } from 'lit-html';
import { formatNumber, t } from '../core/texts';

/** a later level as if it were open and empty */
export interface LevelPreview {
  level: number;
  next: number;
  /** Forge points the level needs; undefined without the definition */
  required?: number;
  /** the owner has not unlocked the level yet */
  locked: boolean;
  /** why there are no places: the definition is not loaded or the reward of the level is unknown */
  unknown?: 'definition' | 'reward';
  /** the rewards are computed, off by up to 5 Forge points */
  estimate: boolean;
}

/** the preview of `level` before its places are known */
export const levelPreview = (level: number, maxLevel: number): LevelPreview => ({
  level,
  next: level + 1,
  locked: level + 1 > maxLevel,
  estimate: false,
});

export const previewHeading = (p: LevelPreview) =>
  html`<p class="warn">${t('gbCalc.previewHeading', { level: p.level, next: p.next })}${
    p.locked ? html` <span class="muted">· ${t('gbCalc.previewLocked')}</span>` : ''
  }</p>`;

/** why the places are missing */
export const previewUnknown = (p: LevelPreview) =>
  html`<p class="muted">${p.unknown === 'definition' ? t('gbCalc.previewNoDefinition') : t('gbCalc.previewNoReward')}</p>`;

export const previewCost = (p: LevelPreview) =>
  p.required === undefined ? '' : html`<p>${t('gbCalc.previewCost', { fp: formatNumber(p.required) })}</p>`;

export const previewEstimate = (p: LevelPreview) =>
  p.estimate ? html`<p class="muted">${t('gbCalc.estimate')}</p>` : '';
