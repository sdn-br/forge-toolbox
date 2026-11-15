import { describe, expect, it } from 'vitest';
import { playerActivity } from '../src/content/domain/activity';
import { activityVm } from '../src/content/features/shared/activity';
import { playerId, worldId } from '../src/shared/ids';

/** days from a list of `[date, points, battles]` */
const days = (...rows: [string, number | undefined, number | undefined][]) =>
  rows.map(([date, points, battles]) => ({ date, points, battles }));

describe('playerActivity', () => {
  it('knows nothing without days', () => {
    expect(playerActivity([], '2026-10-22')).toBeUndefined();
  });

  it('finds the last day with other points or more battles than the day before', () => {
    const history = days(
      ['2026-10-18', 100, 5],
      ['2026-10-19', 100, 6],
      ['2026-10-20', 100, 6],
      ['2026-10-21', 100, 6],
      ['2026-10-22', 100, 6],
    );
    expect(playerActivity(history, '2026-10-22')).toMatchObject({ lastActive: '2026-10-19', daysAgo: 3, idle: true });
    expect(playerActivity(history.slice(0, 4), '2026-10-21')).toMatchObject({ daysAgo: 2, idle: false });
  });

  it('counts points as well as battles, and today as zero days', () => {
    const history = days(['2026-10-21', 100, 6], ['2026-10-22', 101, 6]);
    expect(playerActivity(history, '2026-10-22')).toMatchObject({ lastActive: '2026-10-22', daysAgo: 0, idle: false });
  });

  it('counts falling points as a change, for example after a building was torn down', () => {
    const history = days(['2026-10-20', 100, 6], ['2026-10-21', 120, 6], ['2026-10-22', 90, 6]);
    expect(playerActivity(history, '2026-10-22')).toMatchObject({ lastActive: '2026-10-22', daysAgo: 0 });
  });

  it('measures from the current foestats day, also when the last days are missing', () => {
    const history = days(['2026-10-15', 100, 6], ['2026-10-16', 110, 6]);
    expect(playerActivity(history, '2026-10-22')).toMatchObject({ daysAgo: 6, idle: true });
  });

  it('tells how long no increase was seen when the whole history is flat', () => {
    const history = days(['2026-10-19', 100, 6], ['2026-10-20', 100, 6], ['2026-10-22', 100, 6]);
    const activity = playerActivity(history, '2026-10-22');
    expect(activity).toMatchObject({ flatFor: 3, idle: true });
    expect(activity?.lastActive).toBeUndefined();
    expect(activity?.daysAgo).toBeUndefined();
    expect(playerActivity(days(['2026-10-22', 100, 6]), '2026-10-22')).toMatchObject({ flatFor: 0, idle: false });
  });

  it('compares the newest day with the one a week before', () => {
    const history = days(
      ['2026-10-10', 10, 1],
      ['2026-10-14', 100, 5],
      ['2026-10-15', 150, 7],
      ['2026-10-21', 400, 20],
      ['2026-10-22', 500, 25],
    );
    expect(playerActivity(history, '2026-10-22')).toMatchObject({ week: { points: 350, battles: 18, days: 7 } });
  });

  it('compares with the oldest day when the history is shorter than a week', () => {
    const history = days(['2026-10-20', 100, 5], ['2026-10-22', 160, 9]);
    expect(playerActivity(history, '2026-10-22')).toMatchObject({ week: { points: 60, battles: 4, days: 2 } });
  });

  it('leaves out a change it cannot tell', () => {
    const history = days(['2026-10-20', undefined, 5], ['2026-10-22', 160, undefined]);
    expect(playerActivity(history, '2026-10-22')?.week).toEqual({ days: 2 });
  });

  it('knows the day from one snapshot and the day before worked out from its changes', () => {
    const history = [
      { date: '2026-10-21', points: 1150, battles: 67 },
      { date: '2026-10-22', points: 1200, battles: 70 },
    ];
    expect(playerActivity(history, '2026-10-22')).toEqual({
      lastActive: '2026-10-22',
      daysAgo: 0,
      idle: false,
      week: { points: 50, battles: 3, days: 1 },
    });
  });

  it('tells no increase from a single snapshot day', () => {
    expect(playerActivity([{ date: '2026-10-22', points: 1200, battles: 70 }], '2026-10-22')).toEqual({
      flatFor: 0,
      idle: false,
      week: { points: 0, battles: 0, days: 0 },
    });
  });

  it('does not date an increase that lies in a gap between known days', () => {
    // snapshots on the 15th and the 21st, each with the day before
    const history = days(
      ['2026-10-14', 100, 5],
      ['2026-10-15', 110, 5],
      ['2026-10-20', 200, 9],
      ['2026-10-21', 200, 9],
    );
    const activity = playerActivity(history, '2026-10-22');
    expect(activity).toMatchObject({ flatFor: 2, idle: false, week: { points: 100, battles: 4, days: 7 } });
    expect(activity?.lastActive).toBeUndefined();
  });
});

describe('activityVm without days', () => {
  const record = (change: { unreachable?: boolean; unknown?: boolean; loading?: boolean }) => ({
    days: [],
    unreachable: false,
    unknown: false,
    loading: false,
    ...change,
  });
  const text = (change: Parameters<typeof record>[0]) => activityVm(record(change), '2026-10-22', 'foestats')?.text;

  it('tells why nothing is known', () => {
    expect(text({})).toBe('keine foestats-Daten');
    expect(text({ unreachable: true })).toBe('foestats nicht erreichbar');
    expect(text({ unknown: true })).toBe('bei foestats unbekannt');
    expect(text({ unknown: true, unreachable: true })).toBe('bei foestats unbekannt');
    expect(text({ unknown: true, loading: true })).toBe('wird von foestats geladen …');
  });

  it('names the chosen site', () => {
    const vm = (change: Parameters<typeof record>[0]) => activityVm(record(change), '2026-10-22', 'scoredb');
    expect(vm({})?.text).toBe('keine scoredb.io-Daten');
    expect(vm({ unreachable: true })?.text).toBe('scoredb.io nicht erreichbar');
    expect(vm({ unknown: true })?.text).toBe('bei scoredb.io unbekannt');
    expect(vm({ loading: true })).toMatchObject({
      text: 'wird von scoredb.io geladen …',
      loadingTip: 'wird von scoredb.io geladen …',
    });
    const day = { world: worldId('de20'), player: playerId(1), date: '2026-10-22', points: 100, battles: 6 };
    const known = (site: 'foestats' | 'scoredb') =>
      activityVm({ ...record({ unreachable: true }), days: [day] }, '2026-10-22', site)?.title;
    expect(known('scoredb')).toBe('Punkte und Kämpfe, Stand 22.10.\nscoredb.io nicht erreichbar, Stand von früher');
    expect(known('foestats')).toBe('Punkte und Kämpfe, Stand 22.10.\nfoestats nicht erreichbar, Stand von früher');
  });

  it('says nothing of it once days are stored', () => {
    const day = { world: worldId('de20'), player: playerId(1), date: '2026-10-22', points: 100, battles: 6 };
    const vm = activityVm({ ...record({ unknown: true }), days: [day] }, '2026-10-22', 'foestats');
    expect(vm?.text).toBe('noch keine Änderung bekannt');
  });
});

describe('activityVm with the score the game told', () => {
  const world = worldId('de20');
  const player = playerId(1);
  const record = (...rows: [string, number, 'foestats' | 'scoredb' | undefined][]) => ({
    days: rows.map(([date, points, source]) => ({
      world,
      player,
      date,
      points,
      battles: 6,
      ...(source && { source }),
    })),
    unreachable: false,
    unknown: false,
    loading: false,
  });
  // 2026-11-14 22:48 local, a foestats day after the 13th
  const seen = new Date(2026, 10, 14, 22, 48).getTime();
  const now = new Date(2026, 10, 14, 23, 0).getTime();
  const quiet = record(['2026-11-09', 100, 'scoredb'], ['2026-11-13', 100, 'scoredb']);

  it('tells the change since the newest stored day, either way, and that the player is not idle then', () => {
    expect(activityVm(quiet, '2026-11-14', 'scoredb', { score: 12_500, at: seen }, now)).toMatchObject({
      text: '+12.400 Punkte seit Stand 13.11.',
      idle: false,
    });
    expect(activityVm(quiet, '2026-11-14', 'scoredb', { score: 40, at: seen }, now)?.text).toBe(
      '−60 Punkte seit Stand 13.11.',
    );
  });

  it('tells no change since the newest stored day, idle as the days tell', () => {
    expect(activityVm(quiet, '2026-11-14', 'scoredb', { score: 100, at: seen }, now)).toMatchObject({
      text: 'keine Änderung seit Stand 13.11.',
      idle: true,
    });
  });

  it('does not compare a score of the same day as the newest stored one, its time of day is not known', () => {
    const sameDay = new Date(2026, 10, 13, 12, 0).getTime();
    expect(activityVm(quiet, '2026-11-14', 'scoredb', { score: 12_500, at: sameDay }, now)?.text).toBe(
      'seit 5 Tagen keine Änderung',
    );
  });

  it('dates the last change without a score of the game', () => {
    const rose = record(['2026-11-12', 100, 'scoredb'], ['2026-11-13', 150, 'scoredb']);
    expect(activityVm(rose, '2026-11-14', 'scoredb', undefined, now)?.text).toBe('zuletzt Änderung am 13.11.');
  });

  it('names the site of the newest day and the score of the game with its time in the tooltip', () => {
    expect(activityVm(quiet, '2026-11-14', 'foestats', { score: 12_500, at: seen }, now)?.title).toBe(
      'Punkte und Kämpfe, Stand 13.11. (scoredb.io)\nPunkte laut Spiel 12.500, gesehen heute 22:48',
    );
    const old = record(['2026-11-13', 100, undefined]);
    expect(activityVm(old, '2026-11-14', 'scoredb', undefined, now)?.title).toBe('Punkte und Kämpfe, Stand 13.11.');
  });
});
