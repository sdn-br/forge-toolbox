// The view model of the details of one stored battle, drawn by ui/battle-details.ts.
import type { BattleUnit, FoughtBattle } from '../../../shared/model';
import { formatNumber, t } from '../../core/texts';
import type { MeasuredArmy } from '../../domain/measured-army';
import type { BattleDetailsVm, UnitVm } from '../../ui/battle-details';
import { formatRounds } from './pvp-format';

const unitVm = (u: BattleUnit): UnitVm => ({
  unit: u.unitTypeId,
  hp: u.endHp > 0 ? t('battle.hp', { end: formatNumber(u.endHp), start: formatNumber(u.startHp) }) : t('battle.dead'),
  dead: u.endHp <= 0,
});

/** `measured` is the battle's measured army; without it the details leave the armies out, for where the attack and defense values are switched off */
export function battleDetails(battle: FoughtBattle, measured?: MeasuredArmy): BattleDetailsVm {
  return {
    summary: [
      t(`pvp.${battle.result}`),
      battle.auto ? t('pvp.auto') : t('battle.manual'),
      formatRounds(battle.rounds),
    ].join(', '),
    own: battle.attacker.units.map(unitVm),
    opponent: battle.defender.units.map(unitVm),
    army: measured && { own: measured.attacker, opponent: measured.defender },
  };
}
