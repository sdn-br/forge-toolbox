// The page module tells the content script which great building window the game shows, over window.postMessage like
// the marker link. The game sends nothing when a window closes, so only the engine knows.
// Page scripts can post the same messages, so each side accepts only what its parser lets through.

export const GB_WINDOW_TAG = 'forge-toolbox-gb-window';

/**
 * `list`: the great building list of a player, no great building over it. `foreign` and `own`: the window of one great
 * building of another player or of the own city, also when it is open over a list. `none`: neither.
 */
export const GB_WINDOW_STATES = ['none', 'list', 'foreign', 'own'] as const;
export type GbWindowState = (typeof GB_WINDOW_STATES)[number];

/** the content script asks the page to watch the windows; asking again while it watches changes nothing */
export type GbWindowCommand = { tag: typeof GB_WINDOW_TAG; from: 'content'; type: 'watch' };

/** the state changed; the page starts from `none` and reports only changes */
export type GbWindowEvent = { tag: typeof GB_WINDOW_TAG; from: 'page'; type: 'state'; state: GbWindowState };

const fields = (data: unknown, from: string, type: string): Record<string, unknown> | null => {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  return d.tag === GB_WINDOW_TAG && d.from === from && d.type === type ? d : null;
};

/** The command in a posted message, or null when it is none or malformed. */
export function parseGbWindowCommand(data: unknown): GbWindowCommand | null {
  return fields(data, 'content', 'watch') ? { tag: GB_WINDOW_TAG, from: 'content', type: 'watch' } : null;
}

/** The event in a posted message, or null when it is none or malformed. */
export function parseGbWindowEvent(data: unknown): GbWindowEvent | null {
  const d = fields(data, 'page', 'state');
  const state = GB_WINDOW_STATES.find((s) => s === d?.state);
  return state ? { tag: GB_WINDOW_TAG, from: 'page', type: 'state', state } : null;
}
