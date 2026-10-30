// The Arc bonus of the session player: what his own great buildings and limited bonuses add to every place reward.
import type { LimitedBonus } from '../model/bonus';
import type { City } from '../model/city';

const CONTRIBUTION_BOOST = 'contribution_boost';

/**
 * The Arc bonus in percent: the contribution boosts of the own great buildings plus limited ones of that type. Limited
 * bonuses of own great buildings show up in both lists (seen with a supplies boost), so a limited bonus of a building
 * that already counts is skipped.
 */
export function arcBonus(own: City | undefined, limited: LimitedBonus[] = []): number {
  const counted = new Set<number>();
  let sum = 0;
  for (const b of own?.buildings.values() ?? []) {
    const bonus = b.greatBuilding?.bonus;
    if (bonus?.type !== CONTRIBUTION_BOOST) continue;
    sum += bonus.value;
    counted.add(b.id);
  }
  for (const l of limited) {
    if (l.type === CONTRIBUTION_BOOST && (l.entityId === undefined || !counted.has(l.entityId))) sum += l.value;
  }
  return sum;
}
