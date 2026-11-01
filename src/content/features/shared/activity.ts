// How active a player is by foestats, as the view model of the activity line. Only what the stored days tell: foestats'
// status (`is_active`) contradicted its own numbers both ways (seen 2026-10-31), so it is kept with the days but not
// shown.
import { signed, t } from '../../core/texts';
import { type Activity, playerActivity } from '../../domain/activity';
import type { FoestatsRecord } from '../../stores/foestats';
import type { ActivityVm } from '../../ui/activity';

/** what the stored days tell */
function ownText(a: Activity): string {
  if (a.daysAgo === 0) return t('foestats.activeToday');
  if (a.daysAgo === 1) return t('foestats.activeYesterday');
  if (a.daysAgo !== undefined) return t('foestats.activeDaysAgo', { days: a.daysAgo });
  const flat = a.flatFor ?? 0;
  if (flat >= 2) return t('foestats.flatFor', { days: flat });
  return t('foestats.noIncrease');
}

/** why there is no activity to tell */
function emptyText(record: FoestatsRecord): string {
  if (record.loading) return t('foestats.loading');
  if (record.unknown) return t('foestats.unknown');
  if (record.unreachable) return t('foestats.unreachable');
  return t('foestats.noData');
}

export function activityVm(record: FoestatsRecord | undefined, today: string): ActivityVm | undefined {
  if (!record) return undefined;
  const activity = playerActivity(record.days, today);
  const { loading } = record;
  if (!activity) {
    const text = emptyText(record);
    return { text, idle: false, title: text, loading };
  }
  const newest = record.days.at(-1)?.date ?? '';
  const { week } = activity;
  const known = (n: number | undefined) => (n === undefined ? '?' : signed(n));
  const change = { days: week.days, points: known(week.points), battles: known(week.battles) };
  return {
    text: ownText(activity),
    week: week.days > 0 ? t(week.days === 1 ? 'foestats.oneDay' : 'foestats.week', change) : undefined,
    idle: activity.idle,
    loading,
    title: [t('foestats.source', { date: newest }), record.unreachable && t('foestats.stale')]
      .filter(Boolean)
      .join('\n'),
  };
}
