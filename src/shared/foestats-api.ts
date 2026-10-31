// Client of the unofficial foestats API (api.forge-db.com), used by the content script: the API answers requests from
// the game page, while those of the service worker (origin chrome-extension://) seem to be blocked by Cloudflare.
// The answers are not ours, so everything is read defensively: numbers may come as strings, fields may be missing, and
// a failed or blocked call gives `'unreachable'` instead of an error.
import { foestatsWorld } from './foestats';
import type { PlayerId, WorldId } from './ids';

/** the part of `fetch` the client needs; tests pass their own */
export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** the daily snapshot of a player */
export interface FoestatsPlayer {
  rank?: number;
  points?: number;
  pointsChange?: number;
  battles?: number;
  battlesChange?: number;
  era?: string;
  guild?: { id: number; name: string };
  active?: boolean;
  /** the day of the snapshot, `YYYY-MM-DD` */
  date?: string;
}

/**
 * What foestats answered about a player: the snapshot, `'unknown'` when foestats does not know the player (404), or
 * `'unreachable'` when it did not answer usefully (network error, any other failing status, no snapshot in the body).
 */
export type FoestatsAnswer = { snapshot: FoestatsPlayer } | 'unknown' | 'unreachable';

const BASE = 'https://api.forge-db.com/api/players';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function num(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** `YYYY-MM-DD`, also from a full timestamp */
function day(v: unknown): string | undefined {
  return typeof v === 'string' ? /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0] : undefined;
}

/** the `data` of a successful answer */
const data = (json: unknown) => (isRecord(json) && json.success === true ? json.data : undefined);

const defined = <T extends object>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function parsePlayer(json: unknown): FoestatsPlayer | undefined {
  const d = data(json);
  if (!isRecord(d)) return undefined;
  const guildId = num(d.guild_id);
  const guildName = typeof d.guild_name === 'string' ? d.guild_name : undefined;
  return defined({
    rank: num(d.rank),
    points: num(d.points),
    pointsChange: num(d.points_change),
    battles: num(d.battles),
    battlesChange: num(d.battles_change),
    era: typeof d.era === 'string' ? d.era : undefined,
    guild: guildId !== undefined && guildName !== undefined ? { id: guildId, name: guildName } : undefined,
    active:
      d.is_active === undefined || d.is_active === null ? undefined : d.is_active === true || num(d.is_active) === 1,
    date: day(d.data_date),
  });
}

export function foestatsApi(fetch: FetchLike) {
  // the histories (`/points-history`, `/battles-history`) need a foestats session since 2026-10-28; the daily snapshot
  // still answers without one
  const playerUrl = (world: WorldId, player: PlayerId) => {
    const w = foestatsWorld(world);
    return `${BASE}/${w.server}/${w.world}/${player}`;
  };
  return {
    async player(world: WorldId, player: PlayerId): Promise<FoestatsAnswer> {
      try {
        const res = await fetch(playerUrl(world, player), {
          credentials: 'omit',
          headers: { accept: 'application/json' },
        });
        if (res.status === 404) return 'unknown';
        if (!res.ok) return 'unreachable';
        const snapshot = parsePlayer(JSON.parse(await res.text()));
        return snapshot ? { snapshot } : 'unreachable';
      } catch {
        return 'unreachable';
      }
    },
  };
}

export type FoestatsClient = ReturnType<typeof foestatsApi>;
