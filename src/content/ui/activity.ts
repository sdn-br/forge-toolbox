// How active a player is by foestats: one line under the owner (LG-Rechner, snipe helper), its source in the tooltip.
import { html } from 'lit-html';
import { signed, t } from '../core/texts';
import { type Activity, playerActivity } from '../domain/activity';
import type { FoestatsRecord } from '../stores/foestats';

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

function activityText(a: Activity): string {
  if (a.daysAgo === 0) return t('foestats.activeToday');
  if (a.daysAgo === 1) return t('foestats.activeYesterday');
  if (a.daysAgo !== undefined) return t('foestats.activeDaysAgo', { days: a.daysAgo });
  const flat = a.flatFor ?? 0;
  return flat >= 2 ? t('foestats.flatFor', { days: flat }) : t('foestats.noIncrease');
}

export function activityVm(record: FoestatsRecord | undefined, today: string): ActivityVm | undefined {
  if (!record) return undefined;
  const activity = playerActivity(record.days, today);
  const unreachable = t('foestats.unreachable');
  const { loading } = record;
  if (!activity) {
    const text = loading ? t('foestats.loading') : record.unreachable ? unreachable : t('foestats.noData');
    return { text, idle: false, title: text, loading };
  }
  const newest = record.days.at(-1)?.date ?? '';
  const { week } = activity;
  const known = (n: number | undefined) => (n === undefined ? '?' : signed(n));
  return {
    text: activityText(activity),
    ...(week.days > 0 && {
      week: t('foestats.week', { days: week.days, points: known(week.points), battles: known(week.battles) }),
    }),
    idle: activity.idle,
    loading,
    title: [t('foestats.source', { date: newest }), record.unreachable && t('foestats.stale')]
      .filter(Boolean)
      .join('\n'),
  };
}

/** a new line with the activity, a spinner behind it while foestats is asked */
export const activityLine = (a: ActivityVm) =>
  html`<br />${t('foestats.label')}:
    <span class=${a.idle ? 'gb-activity warn' : 'gb-activity muted'} data-tip=${a.title}>${a.text}${
      a.week ? ` · ${a.week}` : ''
    }</span>${a.loading ? html` <span class="spinner" data-tip=${t('foestats.loading')}></span>` : ''}`;
