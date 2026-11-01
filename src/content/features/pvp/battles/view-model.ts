import type { BuildingDefId } from '../../../../shared/ids';
import {
  type BattleSummary,
  type BattleWithPlunder,
  type FoughtBattle,
  isFought,
  type Plunder,
  type PlunderOutcome,
} from '../../../../shared/model';
import { formatWhen, t } from '../../../core/texts';
import type { ArmyValues } from '../../../domain/assess-city';
import { measuredArmy } from '../../../domain/measured-army';
import type { BattleDetailsVm } from '../../../ui/battle-details';
import { battleDetails } from '../../shared/battle-details';
import { formatBattleSummary, formatResources, formatRounds } from '../../shared/pvp-format';
import { isFiltered, type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';

/** the plunder a battle allowed, as its details show it */
export interface PlunderVm {
  outcome: PlunderOutcome;
  /** the catalog name, the game's id for an unknown building, "–" when the game named none */
  building: string;
  /** "1.220 Münzen, 5 Forge-Punkte"; empty when repelled */
  loot: string;
  doubleLoot: boolean;
}

export interface PvpRow extends OpponentVm {
  battleId: number;
  when: string;
  result: string;
  battle: string;
  /** an inferred battle: no armies, no units, the time is the latest it took place */
  inferred?: boolean;
  /** missing for an inferred battle */
  attacker?: ArmyValues;
  defender?: ArmyValues;
  /** the sack mark: the battle allowed a plunder, which succeeded or was repelled; missing without a plunder */
  loot?: PlunderOutcome;
  /** the row shows its details */
  expanded: boolean;
  /** units, measured armies and result; only for an expanded fought battle */
  details?: BattleDetailsVm;
  /** only for an expanded row with a plunder */
  plunder?: PlunderVm;
}

/** `totals` are the battles and their plunders the filter matches */
export interface BattlesVm extends ListVm {
  tab: 'battles';
  /** the loaded rows, the first at `from` */
  rows: PvpRow[];
}

function battleKind(b: FoughtBattle): string {
  if (b.auto) return t('pvp.auto');
  return formatRounds(b.rounds);
}

export function plunderVm(
  p: Plunder,
  building: (id: BuildingDefId) => string | undefined,
  resourceName: (id: string) => string | undefined,
): PlunderVm {
  return {
    outcome: p.outcome,
    building: p.cityEntityId === undefined ? '–' : (building(p.cityEntityId) ?? p.cityEntityId),
    loot: p.outcome === 'repelled' ? '' : formatResources(p.resources, resourceName),
    doubleLoot: p.doubleLoot,
  };
}

export function battlesViewModel(
  input: ViewInput & {
    battles: BattleWithPlunder[];
    /** over all battles the filter matches */
    summary: BattleSummary;
    /** the index of the first loaded battle in the list */
    from: number;
  },
): BattlesVm {
  const { battles, now, summary } = input;
  return {
    ...listVm({
      total: summary.battles,
      from: input.from,
      totals: formatBattleSummary(summary),
      filtered: isFiltered(input.filter, 'battles'),
    }),
    tab: 'battles',
    rows: battles.map((b): PvpRow => {
      const expanded = input.expanded.has(b.battleId);
      const row = {
        battleId: b.battleId,
        ...opponentVm(input, b.opponent),
        result: t(`pvp.${b.result}`),
        ...(b.plunder && { loot: b.plunder.outcome }),
        expanded,
        ...(expanded && b.plunder && { plunder: plunderVm(b.plunder, input.building, input.resourceName) }),
      };
      if (!isFought(b)) {
        return {
          ...row,
          when: t('pvp.atLatest', { when: formatWhen(b.at, now) }),
          battle: t('pvp.inferred'),
          inferred: true,
        };
      }
      const army = measuredArmy(b);
      return {
        ...row,
        when: formatWhen(b.at, now),
        battle: battleKind(b),
        attacker: army.attacker,
        defender: army.defender,
        ...(expanded && { details: battleDetails(b, army) }),
      };
    }),
  };
}
