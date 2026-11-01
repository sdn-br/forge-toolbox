import type { PlayerId } from '../../../../shared/ids';
import type { IncomingAttack, IncomingTotals } from '../../../../shared/model';
import { formatWhen } from '../../../core/texts';
import { formatIncoming, formatIncomingTotals } from '../../shared/pvp-format';
import { type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';

/** an attack on the own city */
export interface IncomingRow extends OpponentVm {
  attacker: PlayerId;
  when: string;
  /** kind and outcome, e.g. "Kampf: durchbrochen" */
  what: string;
}

/** `totals` are battles, held ones and plunders of the attacks on the own city the filter matches */
export interface IncomingVm extends ListVm {
  tab: 'incoming';
  rows: IncomingRow[];
}

export function incomingViewModel(
  input: ViewInput & {
    incoming: IncomingAttack[];
    incomingTotals: IncomingTotals;
  },
): IncomingVm {
  const { incoming, incomingTotals, building, now } = input;
  return {
    ...listVm(input, incomingTotals.battles + incomingTotals.plunders, formatIncomingTotals(incomingTotals)),
    tab: 'incoming',
    rows: incoming.map((a) => ({
      attacker: a.attacker,
      ...opponentVm(input, a.attacker),
      when: formatWhen(a.at, now),
      what: formatIncoming(a, building),
    })),
  };
}
