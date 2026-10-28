import { describe, expect, it } from 'vitest';
import {
  DAILY_KEEP,
  dailyFileName,
  dailyToDelete,
  folderFileName,
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
    expect(dailyToDelete(names, me)).toEqual([day(2), day(1)]);
  });

  it('leaves other profiles and other files alone', () => {
    const names = [
      ...[1, 2, 3, 4, 5, 6, 7].map(day),
      'forge-toolbox-de20-1234-2026-09-01.json.gz',
      'forge-toolbox-de20-123-2026-09-01-PC2.json.gz',
      'readme.txt',
    ];
    expect(dailyToDelete(names, me)).toEqual([]);
  });
});
