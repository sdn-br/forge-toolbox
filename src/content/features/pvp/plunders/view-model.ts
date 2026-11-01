import type { PlayerId } from '../../../../shared/ids';
import type { Plunder, PlunderTotals } from '../../../../shared/model';
import { formatWhen, t } from '../../../core/texts';
import { formatPlunderTotals, formatResources } from '../../shared/pvp-format';
import { type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';

export interface PlunderRow extends OpponentVm {
  opponent: PlayerId;
  when: string;
  building: string;
  loot: string;
  doubleLoot: boolean;
}

/** `totals` are count and Forge points of the plunders the filter matches */
export interface PlundersVm extends ListVm {
  tab: 'plunders';
  rows: PlunderRow[];
}

export function plundersViewModel(
  input: ViewInput & {
    plunders: Plunder[];
    plunderTotals: PlunderTotals;
  },
): PlundersVm {
  const { plunders, plunderTotals, building, resourceName, now } = input;
  return {
    // the repelled ones are rows too
    ...listVm(input, plunderTotals.count + plunderTotals.repelled, formatPlunderTotals(plunderTotals)),
    tab: 'plunders',
    rows: plunders.map((p) => ({
      opponent: p.opponent,
      ...opponentVm(input, p.opponent),
      when: formatWhen(p.at, now),
      building: p.cityEntityId === undefined ? '–' : (building(p.cityEntityId) ?? p.cityEntityId),
      loot: p.outcome === 'repelled' ? t('plunder.repelled') : formatResources(p.resources, resourceName),
      doubleLoot: p.doubleLoot,
    })),
  };
}
