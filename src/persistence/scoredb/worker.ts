import type { HandlerDeps } from '../../background/handlers';
import type { FetchLike } from '../../content/stores/foestats-api';
import type { PlayerId, WorldId } from '../../shared/ids';
import type { FoestatsOutcome } from '../../shared/model';
import type { Handlers } from '../../shared/rpc';
import { scoredbPlayerUrl } from '../../shared/scoredb';
import type { ScoredbApi } from './contract';
import { scoredbDays } from './page';

/**
 * What ScoreDB said about a player. ASSUMPTION from requests on 2026-11-13: an unknown player gives 500 with an error
 * page (`<title>Error</title>`), so that and 404 count as `'unknown'`, as does a page without both charts. Any other
 * failing status and a network error count as `'unreachable'`.
 */
export async function scoredbPlayer(fetch: FetchLike, world: WorldId, player: PlayerId): Promise<FoestatsOutcome> {
  try {
    const res = await fetch(scoredbPlayerUrl(world, player), { credentials: 'omit', headers: { accept: 'text/html' } });
    if (res.status === 404) return 'unknown';
    if (!res.ok) {
      if (res.status !== 500) return 'unreachable';
      return /<title>\s*Error\s*<\/title>/i.test(await res.text()) ? 'unknown' : 'unreachable';
    }
    const days = scoredbDays(await res.text(), world, player);
    return days ? { days } : 'unknown';
  } catch {
    return 'unreachable';
  }
}

export function scoredbHandlers({ fetchPage }: Pick<HandlerDeps, 'fetchPage'>): Handlers<ScoredbApi> {
  return {
    'scoredb.player': ({ world, player }) => scoredbPlayer(fetchPage, world, player),
  };
}
