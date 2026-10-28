// The files of the backup in a local folder: one main file per profile, written anew each time, and a copy per day in
// the subfolder `Tageskopien`. A sync tool such as OneDrive may leave conflict copies next to the main file; they carry
// the main file's name plus a suffix.
import { type PlayerId, playerId, type WorldId, worldId } from '../shared/ids';
import type { Profile } from '../shared/profile';

/** the subfolder of the daily copies */
export const DAILY_FOLDER = 'Tageskopien';
/** how many daily copies each profile keeps */
export const DAILY_KEEP = 7;

const PREFIX = 'forge-toolbox';
const EXT = '.json.gz';

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const stem = ({ world, player }: Profile) => `${PREFIX}-${world}-${player}`;

/** `forge-toolbox-de20-123.json.gz` */
export const folderFileName = (profile: Profile): string => `${stem(profile)}${EXT}`;

/** `forge-toolbox-de20-123-2026-10-28.json.gz`, by the local day; the names sort by date */
export function dailyFileName(profile: Profile, at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${stem(profile)}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${EXT}`;
}

/** The profile's main file in the main folder, if there is one, and the conflict copies next to it. */
export function profileFiles(names: string[], profile: Profile): { main: string | undefined; conflicts: string[] } {
  const main = folderFileName(profile);
  const pattern = new RegExp(`^${literal(stem(profile))}(-[^/]+)?${literal(EXT)}$`);
  return {
    main: names.includes(main) ? main : undefined,
    conflicts: names.filter((name) => name !== main && pattern.test(name)).sort(),
  };
}

const PROFILE_FILE = new RegExp(`^${PREFIX}-([^-]+)-(\\d+)(-[^/]+)?${literal(EXT)}$`);

/** the export names its file `forge-toolbox-backup-<date>.json.gz`, which would read as world `backup` */
const EXPORT_WORLD = 'backup';

/**
 * The profiles that have a file in the main folder, each once, in the order found. An export lying there is no
 * profile's file; any other name that only looks like one is sorted out by the caller, its file holds no entry of
 * that profile.
 */
export function profilesInFolder(names: string[]): Profile[] {
  const found = new Map<string, Profile>();
  for (const name of names) {
    const match = PROFILE_FILE.exec(name);
    if (!match || match[1] === EXPORT_WORLD) continue;
    const world: WorldId = worldId(match[1] as string);
    const player: PlayerId = playerId(Number(match[2]));
    const key = `${world}:${player}`;
    if (!found.has(key)) found.set(key, { world, player });
  }
  return [...found.values()];
}

/** Of the names in the daily folder, the profile's copies beyond the newest `DAILY_KEEP`, newest first. */
export function dailyToDelete(names: string[], profile: Profile): string[] {
  const pattern = new RegExp(`^${literal(stem(profile))}-\\d{4}-\\d{2}-\\d{2}${literal(EXT)}$`);
  return names
    .filter((name) => pattern.test(name))
    .sort()
    .reverse()
    .slice(DAILY_KEEP);
}
