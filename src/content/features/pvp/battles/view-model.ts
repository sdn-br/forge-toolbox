import { DOUBLE_LOOT_ICON_PATH } from '../../../../shared/cdn-assets';
import type { BuildingDefId } from '../../../../shared/ids';
import {
  type BattleResult,
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
import { formatBattleSummary, formatResourceLines, formatRounds } from '../../shared/pvp-format';
import { isFiltered, type ListVm, listVm, type OpponentVm, opponentVm, type ViewInput } from '../rows';

/** the plunder a battle allowed, as its details show it */
export interface PlunderVm {
  /** time of the plunder like the battle's, "heute 14:01" or "01.11., 14:01": when loot was there, worth knowing */
  when: string;
  outcome: PlunderOutcome;
  /** the catalog name, the game's id for an unknown building, "–" when the game named none */
  building: string;
  /** one line per resource, "1.220 Münzen"; empty when repelled */
  loot: string[];
  doubleLoot: boolean;
  /** the game's Double Loot mark, shown beside the building; missing while the index is not known */
  doubleLootIcon?: string;
}

export interface PvpRow extends OpponentVm {
  battleId: number;
  /** an inferred battle's time with "≈" in front, so the column stays narrow */
  when: string;
  /** the word, for the tooltip of the icon */
  result: string;
  outcome: BattleResult;
  battle: string;
  /** an inferred battle: no armies, no units, the time is the latest it took place */
  inferred?: boolean;
  /** missing for an inferred battle */
  attacker?: ArmyValues;
  defender?: ArmyValues;
  /** the sack mark: the battle allowed a plunder, which succeeded or was repelled; missing without a plunder */
  loot?: PlunderOutcome;
  /** the side panel shows this battle */
  selected: boolean;
}

/** what the side panel shows of the selected battle */
export interface BattlePanelVm {
  name: string;
  /** the opponent's guild with its page at foestats; missing when the player store knows none */
  guild?: { name: string; url: string };
  when: string;
  /** the result, shown as its icon beside the time; `result` is the word for its tooltip */
  outcome: BattleResult;
  result: string;
  /** an inferred battle has no units and armies, only its plunder */
  inferred: boolean;
  /** units, measured armies and result of a fought battle */
  details?: BattleDetailsVm;
  plunder?: PlunderVm;
}

/** `totals` are the battles and their plunders the filter matches */
export interface BattlesVm extends ListVm {
  tab: 'battles';
  /** the loaded rows, the first at `from` */
  rows: PvpRow[];
}

/** the time of a battle; an inferred one took place by then at the latest */
const battleWhen = (b: BattleWithPlunder, now: number) =>
  isFought(b) ? formatWhen(b.at, now) : t('pvp.atLatest', { when: formatWhen(b.at, now) });

function battleKind(b: FoughtBattle): string {
  if (b.auto) return t('pvp.auto');
  return formatRounds(b.rounds);
}

export function plunderVm(
  p: Plunder,
  building: (id: BuildingDefId) => string | undefined,
  resourceName: (id: string) => string | undefined,
  now: number,
  assetUrl: (path: string) => string | undefined = () => undefined,
): PlunderVm {
  const icon = p.doubleLoot ? assetUrl(DOUBLE_LOOT_ICON_PATH) : undefined;
  return {
    when: formatWhen(p.at, now),
    outcome: p.outcome,
    building: p.cityEntityId === undefined ? '–' : (building(p.cityEntityId) ?? p.cityEntityId),
    loot: p.outcome === 'repelled' ? [] : formatResourceLines(p.resources, resourceName),
    doubleLoot: p.doubleLoot,
    ...(icon && { doubleLootIcon: icon }),
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
      const row = {
        battleId: b.battleId,
        ...opponentVm(input, b.opponent),
        result: t(`pvp.${b.result}`),
        outcome: b.result,
        ...(b.plunder && { loot: b.plunder.outcome }),
        selected: input.selected === b.battleId,
      };
      if (!isFought(b)) {
        return {
          ...row,
          when: t('pvp.approx', { when: formatWhen(b.at, now) }),
          battle: t('pvp.inferred'),
          inferred: true,
        };
      }
      const army = measuredArmy(b);
      return {
        ...row,
        when: battleWhen(b, now),
        battle: battleKind(b),
        attacker: army.attacker,
        defender: army.defender,
      };
    }),
  };
}

/** the selected battle for the side panel: units, armies and result of a fought battle, then its plunder */
export function battlePanelVm(b: BattleWithPlunder, input: ViewInput): BattlePanelVm {
  const { name } = opponentVm(input, b.opponent);
  const guild = input.lookups.playerGuild(b.opponent);
  return {
    name,
    ...(guild && { guild }),
    when: battleWhen(b, input.now),
    outcome: b.result,
    result: t(`pvp.${b.result}`),
    inferred: !isFought(b),
    ...(isFought(b) && {
      details: battleDetails(b, { measured: measuredArmy(b), withResult: false, unit: input.unit }),
    }),
    ...(b.plunder && { plunder: plunderVm(b.plunder, input.building, input.resourceName, input.now, input.assetUrl) }),
  };
}
