import { formatPercent } from '../core/texts';
import type { ArmyValues } from '../domain/assess-city';

/** "368 % / 269 %": attack and defense of an army */
export const formatArmy = (a: ArmyValues) => `${formatPercent(a.attack)} / ${formatPercent(a.defense)}`;
