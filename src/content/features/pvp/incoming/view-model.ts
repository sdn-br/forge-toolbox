import type { IncomingAttack, IncomingTotals } from '../../../../shared/model';
import { formatWhen } from '../../../core/texts';
import { formatIncoming, formatIncomingTotals } from '../../shared/pvp-format';
import { isFiltered, type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';

/** an attack on the own city; the opponent is the attacker */
export interface IncomingRow extends OpponentVm {
  when: string;
  /** kind and outcome, e.g. "Kampf: durchbrochen" */
  what: string;
}

/** `totals` are battles, held ones and plunders of the attacks on the own city the filter matches */
export interface IncomingVm extends ListVm {
  tab: 'incoming';
  /** the loaded rows, the first at `from` */
  rows: IncomingRow[];
}

export function incomingViewModel(
  input: ViewInput & {
    incoming: IncomingAttack[];
    incomingTotals: IncomingTotals;
    /** the index of the first loaded attack in the list */
    from: number;
  },
): IncomingVm {
  const { incoming, incomingTotals, building, now } = input;
  return {
    ...listVm({
      total: incomingTotals.battles + incomingTotals.plunders,
      from: input.from,
      totals: formatIncomingTotals(incomingTotals),
      filtered: isFiltered(input.filter, 'incoming'),
    }),
    tab: 'incoming',
    rows: incoming.map((a) => ({
      ...opponentVm(input, a.attacker),
      when: formatWhen(a.at, now),
      what: formatIncoming(a, building),
    })),
  };
}
