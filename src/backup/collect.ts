import type { ToolboxDb } from '../background/db';
import { hasOwnContribution, isFlagged } from '../persistence/great-buildings/merge';
import type { BackupFile } from './format';
import { BACKUP_FORMAT, BACKUP_VERSION } from './format';

const playerKey = (world: string, id: number) => `${world}|${id}`;

/** Reads what the backup holds from the database, every world. */
export async function collectBackup(
  db: ToolboxDb,
  settings: Record<string, unknown> | undefined,
  now: number,
): Promise<BackupFile> {
  const [battles, plunders, incoming, noteGroups, notePages, shields, buildings, allPlayers] = await Promise.all([
    db.battles.toArray(),
    db.plunders.toArray(),
    db.incoming.toArray(),
    db.noteGroups.toArray(),
    db.notePages.toArray(),
    db.cityShields.toArray(),
    db.greatBuildings.toArray(),
    db.players.toArray(),
  ]);
  const cityShields = shields.filter((s) => s.expiresAt > now);
  const greatBuildings = buildings.filter((b) => isFlagged(b) || hasOwnContribution(b));

  const referenced = new Set<string>();
  for (const b of battles) referenced.add(playerKey(b.world, b.opponent));
  for (const p of plunders) referenced.add(playerKey(p.world, p.opponent));
  for (const a of incoming) referenced.add(playerKey(a.world, a.attacker));
  for (const p of notePages) if (p.player !== undefined) referenced.add(playerKey(p.world, p.player));
  for (const s of cityShields) referenced.add(playerKey(s.world, s.player));
  for (const b of greatBuildings) referenced.add(playerKey(b.world, b.owner));
  const players = allPlayers.filter((p) => p.marked || p.ignored || referenced.has(playerKey(p.world, p.id)));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now,
    ...(settings && { settings }),
    tables: { battles, plunders, incoming, noteGroups, notePages, cityShields, greatBuildings, players },
  };
}
