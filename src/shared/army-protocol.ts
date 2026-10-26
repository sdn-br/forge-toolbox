// The content script asks the page module for the opponent of the open army window, over window.postMessage like the
// marker link. The request names no opponent (only startByBattleType does), but the game's window object holds it.
// Page scripts can post the same messages, so each side accepts only what its parser lets through.

export const ARMY_TAG = 'forge-toolbox-army';

/** `seq` numbers the ask; the page echoes it, so a late answer to an older window changes nothing */
export type ArmyCommand = { tag: typeof ARMY_TAG; from: 'content'; type: 'target'; seq: number };

/** the defender of the pvp battle the open army window prepares; no answer when the page cannot tell */
export type ArmyEvent = { tag: typeof ARMY_TAG; from: 'page'; type: 'target'; seq: number; playerId: number };

const isId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

const fields = (data: unknown, from: string): Record<string, unknown> | null => {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  return d.tag === ARMY_TAG && d.from === from && d.type === 'target' && isId(d.seq) ? d : null;
};

/** The command in a posted message, or null when it is none or malformed. */
export function parseArmyCommand(data: unknown): ArmyCommand | null {
  const d = fields(data, 'content');
  return d ? { tag: ARMY_TAG, from: 'content', type: 'target', seq: d.seq as number } : null;
}

/** The event in a posted message, or null when it is none or malformed. */
export function parseArmyEvent(data: unknown): ArmyEvent | null {
  const d = fields(data, 'page');
  if (!d || !isId(d.playerId) || d.playerId === 0) return null;
  return { tag: ARMY_TAG, from: 'page', type: 'target', seq: d.seq as number, playerId: d.playerId };
}
