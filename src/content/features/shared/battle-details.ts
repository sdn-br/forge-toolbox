// The view model of the details of one stored battle, drawn by ui/battle-details.ts.
import type { BattleUnit, FoughtBattle } from '../../../shared/model';
import { formatNumber, t } from '../../core/texts';
import type { MeasuredArmy } from '../../domain/measured-army';
import type { BattleDetailsVm, UnitVm } from '../../ui/battle-details';
import { formatRounds } from './pvp-format';

/** the unit's name in the game's language, its type id while the unit types are not loaded */
const unitVm = (u: BattleUnit, unitName: (id: string) => string | undefined): UnitVm => ({
  unit: unitName(u.unitTypeId) ?? u.unitTypeId,
  hp: u.endHp > 0 ? t('battle.hp', { end: formatNumber(u.endHp), start: formatNumber(u.startHp) }) : t('battle.dead'),
  dead: u.endHp <= 0,
});

export interface BattleDetailsOptions {
  /** the battle's measured army; without it the details leave the armies out, for where the attack and defense values
   * are switched off */
  measured?: MeasuredArmy;
  /** false leaves the result word out, for where an icon shows it */
  withResult?: boolean;
  /** the name of a unit type, from the catalog */
  unitName?: (id: string) => string | undefined;
}

export function battleDetails(
  battle: FoughtBattle,
  { measured, withResult = true, unitName = () => undefined }: BattleDetailsOptions = {},
): BattleDetailsVm {
  return {
    summary: [
      ...(withResult ? [t(`pvp.${battle.result}`)] : []),
      battle.auto ? t('pvp.auto') : t('battle.manual'),
      formatRounds(battle.rounds),
    ].join(', '),
    own: battle.attacker.units.map((u) => unitVm(u, unitName)),
    opponent: battle.defender.units.map((u) => unitVm(u, unitName)),
    army: measured && { own: measured.attacker, opponent: measured.defender },
  };
}
