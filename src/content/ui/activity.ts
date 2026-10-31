// How active a player is by foestats: one line under the owner (LG-Rechner, snipe helper), its source in the tooltip.
// foestats' own status comes first as a quick hint, then what the stored days tell.
import { html } from 'lit-html';
import { signed, t } from '../core/texts';
import { type Activity, playerActivity } from '../domain/activity';
import type { FoestatsRecord } from '../stores/foestats';

/** one line about the owner's activity, a tooltip with its source */
export interface ActivityVm {
  text: string;
  /** change of points and battles over the last days */
  week?: string;
  /** several days without an increase, or inactive by foestats' status */
  idle: boolean;
  title: string;
  /** foestats is being asked right now */
  loading: boolean;
}

/** what the stored days tell; nothing when they tell nothing yet and foestats' status stands alone */
function ownText(a: Activity): string | undefined {
  if (a.daysAgo === 0) return t('foestats.activeToday');
  if (a.daysAgo === 1) return t('foestats.activeYesterday');
  if (a.daysAgo !== undefined) return t('foestats.activeDaysAgo', { days: a.daysAgo });
  const flat = a.flatFor ?? 0;
  if (flat >= 2) return t('foestats.flatFor', { days: flat });
  return a.active === undefined ? t('foestats.noIncrease') : undefined;
}

const statusText = (a: Activity) =>
  a.active === undefined ? undefined : t(a.active ? 'foestats.statusActive' : 'foestats.statusInactive');

export function activityVm(record: FoestatsRecord | undefined, today: string): ActivityVm | undefined {
  if (!record) return undefined;
  const activity = playerActivity(record.days, today);
  const { loading } = record;
  if (!activity) {
    const text = loading
      ? t('foestats.loading')
      : record.unknown
        ? t('foestats.unknown')
        : record.unreachable
          ? t('foestats.unreachable')
          : t('foestats.noData');
    return { text, idle: false, title: text, loading };
  }
  const newest = record.days.at(-1)?.date ?? '';
  const { week } = activity;
  const known = (n: number | undefined) => (n === undefined ? '?' : signed(n));
  const change = { days: week.days, points: known(week.points), battles: known(week.battles) };
  return {
    text: [statusText(activity), ownText(activity)].filter(Boolean).join(' · '),
    ...(week.days > 0 && { week: t(week.days === 1 ? 'foestats.oneDay' : 'foestats.week', change) }),
    idle: activity.idle || activity.active === false,
    loading,
    title: [
      activity.active !== undefined && t('foestats.statusSource'),
      t('foestats.source', { date: newest }),
      record.unreachable && t('foestats.stale'),
    ]
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
