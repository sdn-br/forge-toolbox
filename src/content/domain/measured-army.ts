// Army values as the game applied them in a battle, derived from the raw unit bonuses of each side.
import type { Battle } from '../../shared/model';
import { type ArmyValues, GREAT_BUILDING_SIDES, type Side } from './assess-city';

/** the great building boost types that count on a side */
const greatBuildingTypes = (side: Side) =>
  Object.entries(GREAT_BUILDING_SIDES).flatMap(([type, sides]) => (sides.includes(side) ? [type] : []));

// Verified 2026-10-19 on a recorded battle: the attacker's attack_boost and attacker_defense_boost equal the
// own building boosts (BoostService.getAllBoosts), the defender's great building types equal the calculated ones.
// The attack_boost on defending units does not belong to the defending army and is left out.
const ATTACKER = {
  attack: ['attack_boost', ...greatBuildingTypes('aa')],
  defense: ['attacker_defense_boost', ...greatBuildingTypes('ad')],
};
const DEFENDER = {
  attack: ['defender_attack_boost', ...greatBuildingTypes('da')],
  defense: ['defense_boost', ...greatBuildingTypes('dd')],
};

const sum = (bonuses: Record<string, number>, types: string[]) =>
  types.reduce((total, type) => total + (bonuses[type] ?? 0), 0);

export function measuredArmy(battle: Battle): { attacker: ArmyValues; defender: ArmyValues } {
  const a = battle.attacker.bonuses;
  const d = battle.defender.bonuses;
  return {
    attacker: { attack: sum(a, ATTACKER.attack), defense: sum(a, ATTACKER.defense) },
    defender: { attack: sum(d, DEFENDER.attack), defense: sum(d, DEFENDER.defense) },
  };
}
