// How active a player is by foestats or ScoreDB, as the view model of the activity line; its texts name the site. Only what the stored days tell: foestats'
// status (`is_active`) contradicted its own numbers both ways (seen 2026-10-31), so it is kept with the days but not
// shown.
import type { DataSource } from '../../../shared/activity-source';
import { signed, type TextKey, t } from '../../core/texts';
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

/** the short name of a site in the texts */
const NAMES: Record<DataSource, { source: TextKey }> = {
  foestats: { source: 'foestats.nameFoestats' },
  scoredb: { source: 'foestats.nameScoredb' },
};

/** why there is no activity to tell */
function emptyText(record: FoestatsRecord, name: { source: string }): string {
  if (record.loading) return t('foestats.loading', name);
  if (record.unknown) return t('foestats.unknown', name);
  if (record.unreachable) return t('foestats.unreachable', name);
  return t('foestats.noData', name);
}

/** the activity line of a player; `source` is the site chosen now, which the texts name */
export function activityVm(
  record: FoestatsRecord | undefined,
  today: string,
  source: DataSource,
): ActivityVm | undefined {
  if (!record) return undefined;
  const name = { source: t(NAMES[source].source) };
  const loadingTip = t('foestats.loading', name);
  const activity = playerActivity(record.days, today);
  const { loading } = record;
  if (!activity) {
    const text = emptyText(record, name);
    return { text, idle: false, title: text, loading, loadingTip };
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
    loadingTip,
    title: [t('foestats.source', { date: newest }), record.unreachable && t('foestats.stale', name)]
      .filter(Boolean)
      .join('\n'),
  };
}
