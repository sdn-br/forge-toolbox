import { BACKUP_FORMAT, type BackupProfile, type BackupTables } from '../../src/backup/format';
import { gzipJson } from '../../src/backup/gzip';
import { areaCounts } from '../../src/backup/import';
import type { CopyEntry } from '../../src/content/core/backup-store';
import { eraId, playerId, worldId } from '../../src/shared/ids';
import type { Battle } from '../../src/shared/model';

export const de20 = worldId('de20');
/** the profile of the tests: de20 and player 1 */
export const me = { world: de20, player: playerId(1) };

export const battle = (battleId: number, opponent = 2): Battle => ({
  world: de20,
  battleId,
  at: 1,
  opponent: playerId(opponent),
  result: 'won',
  auto: true,
  rounds: 1,
  era: eraId('ColonialAge'),
  attacker: { bonuses: {}, units: [] },
  defender: { bonuses: {}, units: [] },
});

export const tables = (change: Partial<BackupTables> = {}): BackupTables => ({
  battles: [],
  plunders: [],
  incoming: [],
  noteGroups: [],
  notePages: [],
  cityShields: [],
  greatBuildings: [],
  players: [],
  ...change,
});

/** the copy of the test profile as an earlier install wrote it */
export async function copyOf(entry: Omit<BackupProfile, 'world' | 'player'>, createdAt: number): Promise<CopyEntry> {
  const profile: BackupProfile = { ...me, ...entry };
  const file = await gzipJson({ format: BACKUP_FORMAT, version: 2, createdAt, profiles: [profile] });
  return { ...me, createdAt, counts: areaCounts(profile), file: await file.arrayBuffer() };
}
