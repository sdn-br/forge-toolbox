// View helpers of the own-share boxes: the view choices "Absichern" and "Vertrauen" and the own Arc bonus. Both boxes
// read them from the view choices and settings; the store does not keep them.

import type { PrefStore } from '../../stores/gb-own-state';
import type { PlayerBonusStore } from '../../stores/player-bonuses';

/** view choices, kept like the mode of a map rather than in the settings box */
export const SECURE = 'gbOwn.secure';
export const TRUST = 'gbOwn.trust';

/** a switch of the view choices; `fallback` while nothing is kept */
export const viewFlag = (prefs: Pick<PrefStore, 'pref'>, key: string, fallback: boolean) => {
  const value = prefs.pref(key);
  return value === undefined ? fallback : value === 'true';
};

/** the own Arc bonus, both tiers, while its factor button shows (`arcButton`: the value of that setting) */
export const ownArcBonus = (arcButton: boolean, bonuses: PlayerBonusStore) =>
  arcButton ? bonuses.arcBonus() : undefined;
