// The files of the backup in a local folder: one main file per profile, written anew each time, and a copy per day in
// the subfolder `Tageskopien`. A sync tool such as OneDrive may leave conflict copies next to the main file; they carry
// the main file's name plus a suffix.
import { type PlayerId, playerId, type WorldId, worldId } from '../shared/ids';
import type { Profile } from '../shared/profile';

/** the subfolder of the daily copies */
export const DAILY_FOLDER = 'Tageskopien';
/** how many daily copies each profile keeps unless the user set another number */
export const DAILY_KEEP = 7;
/** the upper bound of the setting, a copy per day: a year */
export const DAILY_KEEP_MAX = 365;

/**
 * The number of daily copies to keep from a stored value: a whole number from 0 (no daily copies) to `DAILY_KEEP_MAX`.
 * Anything else, such as nothing stored, a fraction or a negative number, gives the default.
 */
export function dailyKeepOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= DAILY_KEEP_MAX
    ? value
    : DAILY_KEEP;
}

/** The number typed into the setting: whole numbers pass, a fraction is cut off, too large a number is capped; empty or no number is undefined. */
export function parseDailyKeep(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const n = Number(text);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(DAILY_KEEP_MAX, Math.max(0, Math.trunc(n)));
}

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

/** Of the names in the daily folder, the profile's copies beyond the newest `keep`, newest first; 0 gives all of them. */
export function dailyToDelete(names: string[], profile: Profile, keep: number): string[] {
  const pattern = new RegExp(`^${literal(stem(profile))}-\\d{4}-\\d{2}-\\d{2}${literal(EXT)}$`);
  return names
    .filter((name) => pattern.test(name))
    .sort()
    .reverse()
    .slice(keep);
}
