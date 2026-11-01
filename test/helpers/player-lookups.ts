import type { PvpPlayerLookups } from '../../src/content/features/shared/player-lookups';

/** lookups of a player store that knows no one; `change` overrides single lookups */
export const playerLookups = (change: Partial<PvpPlayerLookups> = {}): PvpPlayerLookups => ({
  playerName: () => undefined,
  playerUrl: (id) => `https://foestats.com/de/de20/players/${id}`,
  playerGuild: () => undefined,
  relations: () => undefined,
  playerMarked: () => undefined,
  ownerIgnored: () => undefined,
  plunderWorthy: () => undefined,
  noAttack: () => undefined,
  ...change,
});
