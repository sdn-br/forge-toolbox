// How active a player is by foestats or ScoreDB and the score the game told, as the view model of the activity line; its texts name the site. Only what the stored days tell: foestats'
// status (`is_active`) contradicted its own numbers both ways (seen 2026-10-31), so it is kept with the days but not
// shown.
import type { DataSource } from '../../../shared/activity-source';
import { foestatsDay } from '../../../shared/foestats';
import { formatNumber, formatWhen, signed, type TextKey, t } from '../../core/texts';
import { type Activity, playerActivity } from '../../domain/activity';
import type { FoestatsRecord } from '../../stores/foestats';
import type { ActivityVm } from '../../ui/activity';

/** `13.11.` for `2026-11-13` */
const shortDay = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.`;

/** the points of a player as the game told them, and when */
export interface GameScore {
  score: number;
  at: number;
}

/** what the stored days tell */
function daysText(a: Activity): string {
  if (a.lastActive !== undefined) return t('foestats.lastChange', { date: shortDay(a.lastActive) });
  const flat = a.flatFor ?? 0;
  if (flat >= 2) return t('foestats.flatFor', { days: flat });
  return t('foestats.noChange');
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

/**
 * The activity line of a player; `source` is the site chosen now, which the texts name. A score the game told on a
 * later day than the newest stored one gives the change since that day: the stored day has no time of day (ScoreDB
 * even dates its newest value a day back), the game's score has one, so a score of the same day is not compared.
 */
export function activityVm(
  record: FoestatsRecord | undefined,
  today: string,
  source: DataSource,
  game?: GameScore,
  now = Date.now(),
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
  const newest = record.days.at(-1);
  const date = newest?.date ?? '';
  const points = newest?.points;
  const since =
    game && points !== undefined && date !== '' && foestatsDay(game.at) > date ? game.score - points : undefined;
  const { week } = activity;
  const known = (n: number | undefined) => (n === undefined ? '?' : signed(n));
  const change = { days: week.days, points: known(week.points), battles: known(week.battles) };
  const at = { date: shortDay(date) };
  const text =
    since === undefined
      ? daysText(activity)
      : since === 0
        ? t('foestats.unchangedSince', at)
        : t('foestats.changedSince', { ...at, points: signed(since) });
  const site = newest?.source && t(NAMES[newest.source].source);
  return {
    text,
    week: week.days > 0 ? t(week.days === 1 ? 'foestats.oneDay' : 'foestats.week', change) : undefined,
    idle: since !== undefined && since !== 0 ? false : activity.idle,
    loading,
    loadingTip,
    title: [
      site ? t('foestats.sourceFrom', { ...at, source: site }) : t('foestats.source', at),
      since !== undefined &&
        game &&
        t('foestats.game', { points: formatNumber(game.score), when: formatWhen(game.at, now) }),
      record.unreachable && t('foestats.stale', name),
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
