import { describe, expect, it } from 'vitest';
import { playerActivity } from '../src/content/domain/activity';

/** days from a list of `[date, points, battles]` */
const days = (...rows: [string, number | undefined, number | undefined][]) =>
  rows.map(([date, points, battles]) => ({ date, points, battles }));

describe('playerActivity', () => {
  it('knows nothing without days', () => {
    expect(playerActivity([], '2026-10-22')).toBeUndefined();
  });

  it('finds the last day with more points or battles than the day before', () => {
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

  it('ignores falling points, for example after a building was torn down', () => {
    const history = days(['2026-10-20', 100, 6], ['2026-10-21', 120, 6], ['2026-10-22', 90, 6]);
    expect(playerActivity(history, '2026-10-22')).toMatchObject({ lastActive: '2026-10-21', daysAgo: 1 });
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
});
