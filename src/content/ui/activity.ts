// How active a player is by foestats: one line under the owner (LG-Rechner, snipe helper), its source in the tooltip.
import { html } from 'lit-html';
import { t } from '../core/texts';

/** one line about the owner's activity, a tooltip with its source */
export interface ActivityVm {
  text: string;
  /** change of points and battles over the last days */
  week?: string;
  /** several days without an increase */
  idle: boolean;
  title: string;
  /** foestats is being asked right now */
  loading: boolean;
}

/** a new line with the activity, a spinner behind it while foestats is asked */
export const activityLine = (a: ActivityVm) =>
  html`<br />${t('foestats.label')}:
    <span class=${a.idle ? 'gb-activity warn' : 'gb-activity muted'} data-tip=${a.title}>${a.text}${
      a.week ? ` · ${a.week}` : ''
    }</span>${a.loading ? html` <span class="spinner" data-tip=${t('foestats.loading')}></span>` : ''}`;
