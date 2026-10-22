import { describe, expect, it } from 'vitest';
import { fetchDue, foestatsDay, RETRY_AFTER } from '../src/shared/foestats';
import { playerId, worldId } from '../src/shared/ids';
import type { FoestatsFetch } from '../src/shared/model';

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();

describe('foestatsDay', () => {
  it('is the previous day until the daily update at 05:40', () => {
    expect(foestatsDay(at(22, 0, 10))).toBe('2026-10-21');
    expect(foestatsDay(at(22, 5, 39))).toBe('2026-10-21');
    expect(foestatsDay(at(22, 5, 40))).toBe('2026-10-22');
    expect(foestatsDay(at(22, 23, 59))).toBe('2026-10-22');
    expect(foestatsDay(new Date(2026, 0, 1, 3).getTime())).toBe('2025-12-31');
  });
});

describe('fetchDue', () => {
  const last = (change: Partial<FoestatsFetch>): FoestatsFetch => ({
    world: worldId('de20'),
    player: playerId(1),
    day: '2026-10-22',
    at: at(22, 8),
    ok: true,
    ...change,
  });

  it('asks a player not asked before', () => {
    expect(fetchDue(undefined, at(22, 9))).toBe(true);
  });

  it('asks once per foestats day', () => {
    expect(fetchDue(last({}), at(22, 23))).toBe(false);
    expect(fetchDue(last({}), at(23, 5, 39))).toBe(false);
    expect(fetchDue(last({}), at(23, 5, 40))).toBe(true);
    expect(fetchDue(last({ day: '2026-10-21', at: at(22, 5) }), at(22, 5, 30))).toBe(false);
  });

  it('asks again after a failure, but not right away', () => {
    const failed = last({ ok: false, at: at(22, 8) });
    expect(fetchDue(failed, at(22, 8) + RETRY_AFTER - 1)).toBe(false);
    expect(fetchDue(failed, at(22, 8) + RETRY_AFTER)).toBe(true);
  });
});
