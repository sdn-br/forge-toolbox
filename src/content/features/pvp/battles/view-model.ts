import type { PlayerId } from '../../../../shared/ids';
import type { Battle, PlunderTotals } from '../../../../shared/model';
import { formatWhen, t } from '../../../core/texts';
import type { ArmyValues } from '../../../domain/assess-city';
import { measuredArmy } from '../../../domain/measured-army';
import type { BattleDetailsVm } from '../../../ui/battle-details';
import { battleDetails } from '../../shared/battle-details';
import { formatPlunderTotals, formatRounds } from '../../shared/pvp-format';
import { type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';

export interface PvpRow extends OpponentVm {
  battleId: number;
  opponent: PlayerId;
  when: string;
  result: string;
  battle: string;
  attacker: ArmyValues;
  defender: ArmyValues;
  /** units, measured armies and result; only for an expanded row */
  details?: BattleDetailsVm;
}

/** `totals` are the plunder totals, they stand above the battles too */
export interface BattlesVm extends ListVm {
  tab: 'battles';
  rows: PvpRow[];
}

function battleKind(b: Battle): string {
  if (b.auto) return t('pvp.auto');
  return formatRounds(b.rounds);
}

export function battlesViewModel(
  input: ViewInput & {
    battles: Battle[];
    /** number of battles over all pages */
    total: number;
    plunderTotals: PlunderTotals;
  },
): BattlesVm {
  const { battles, now } = input;
  return {
    ...listVm(input, input.total, formatPlunderTotals(input.plunderTotals)),
    tab: 'battles',
    rows: battles.map((b) => {
      const army = measuredArmy(b);
      return {
        battleId: b.battleId,
        opponent: b.opponent,
        ...opponentVm(input, b.opponent),
        when: formatWhen(b.at, now),
        result: t(`pvp.${b.result}`),
        battle: battleKind(b),
        attacker: army.attacker,
        defender: army.defender,
        details: input.expanded.has(b.battleId) ? battleDetails(b, army) : undefined,
      };
    }),
  };
}
