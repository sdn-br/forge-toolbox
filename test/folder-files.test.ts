import { describe, expect, it } from 'vitest';
import {
  DAILY_KEEP,
  DAILY_KEEP_MAX,
  dailyFileName,
  dailyKeepOf,
  dailyToDelete,
  folderFileName,
  parseDailyKeep,
  profileFiles,
  profilesInFolder,
} from '../src/backup/folder-files';
import { playerId, worldId } from '../src/shared/ids';

const me = { world: worldId('de20'), player: playerId(123) };

describe('file names in the backup folder', () => {
  it('names the main file by world and own player id', () => {
    expect(folderFileName(me)).toBe('forge-toolbox-de20-123.json.gz');
  });

  it('names the daily copy by the local day, so the names sort by date', () => {
    expect(dailyFileName(me, new Date(2026, 9, 3, 23, 59).getTime())).toBe('forge-toolbox-de20-123-2026-10-03.json.gz');
  });
});

describe('the files of a profile in the main folder', () => {
  it('finds the main file and the conflict copies of a sync tool', () => {
    const names = [
      'forge-toolbox-de20-123.json.gz',
      'forge-toolbox-de20-123-PC2.json.gz',
      'forge-toolbox-de20-123 (1).json.gz',
      'forge-toolbox-de20-1234.json.gz',
      'forge-toolbox-de21-123.json.gz',
      'forge-toolbox-de20-123.json',
      'notes.txt',
    ];
    expect(profileFiles(names, me)).toEqual({
      main: 'forge-toolbox-de20-123.json.gz',
      conflicts: ['forge-toolbox-de20-123-PC2.json.gz'],
    });
  });

  it('has no main file when only a conflict copy is there', () => {
    expect(profileFiles(['forge-toolbox-de20-123-PC2.json.gz'], me)).toEqual({
      main: undefined,
      conflicts: ['forge-toolbox-de20-123-PC2.json.gz'],
    });
  });

  it('reads a world name literally, not as a pattern', () => {
    const odd = { world: worldId('d.20'), player: playerId(1) };
    expect(profileFiles(['forge-toolbox-dx20-1.json.gz'], odd).main).toBeUndefined();
  });
});

describe('the profiles in the main folder', () => {
  it('names each profile once, conflict copies included', () => {
    expect(
      profilesInFolder([
        'forge-toolbox-de20-123.json.gz',
        'forge-toolbox-de20-123-PC2.json.gz',
        'forge-toolbox-us1-7.json.gz',
        'forge-toolbox-backup-2026-10-26.json.gz',
        'other.json.gz',
      ]),
    ).toEqual([me, { world: 'us1', player: 7 }]);
  });
});

describe('rotating the daily copies', () => {
  const day = (d: number) => `forge-toolbox-de20-123-2026-10-${String(d).padStart(2, '0')}.json.gz`;

  it(`keeps the newest ${DAILY_KEEP} of the profile and deletes the older ones`, () => {
    const names = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(day).reverse();
    expect(dailyToDelete(names, me, DAILY_KEEP)).toEqual([day(2), day(1)]);
  });

  it('keeps nothing with 0 and the newest one with 1, only of the profile', () => {
    const names = [1, 2, 3].map(day).concat('forge-toolbox-de20-1234-2026-09-01.json.gz', 'readme.txt');
    expect(dailyToDelete(names, me, 0)).toEqual([day(3), day(2), day(1)]);
    expect(dailyToDelete(names, me, 1)).toEqual([day(2), day(1)]);
  });

  it('leaves other profiles and other files alone', () => {
    const names = [
      ...[1, 2, 3, 4, 5, 6, 7].map(day),
      'forge-toolbox-de20-1234-2026-09-01.json.gz',
      'forge-toolbox-de20-123-2026-09-01-PC2.json.gz',
      'readme.txt',
    ];
    expect(dailyToDelete(names, me, DAILY_KEEP)).toEqual([]);
  });
});

describe('the setting of the daily copies', () => {
  it('reads a whole number from 0 to the bound, any other value gives the default', () => {
    expect(dailyKeepOf(undefined)).toBe(DAILY_KEEP);
    expect(dailyKeepOf(0)).toBe(0);
    expect(dailyKeepOf(3)).toBe(3);
    expect(dailyKeepOf(DAILY_KEEP_MAX)).toBe(DAILY_KEEP_MAX);
    for (const bad of [-1, 1.5, DAILY_KEEP_MAX + 1, '3', null, Number.NaN]) expect(dailyKeepOf(bad)).toBe(DAILY_KEEP);
  });

  it('parses the typed text: cuts a fraction, caps, rejects empty and no number', () => {
    expect(parseDailyKeep('5')).toBe(5);
    expect(parseDailyKeep('2.9')).toBe(2);
    expect(parseDailyKeep('-4')).toBe(0);
    expect(parseDailyKeep('99999')).toBe(DAILY_KEEP_MAX);
    expect(parseDailyKeep('')).toBeUndefined();
    expect(parseDailyKeep('abc')).toBeUndefined();
  });
});
