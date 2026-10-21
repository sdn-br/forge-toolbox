import type {
  Battle,
  CityShield,
  IncomingAttack,
  IncomingTotals,
  Player,
  Plunder,
  PlunderTotals,
} from '../../../shared/model';
import {
  formatIncoming,
  formatIncomingTotals,
  formatPlunderTotals,
  formatResources,
  formatWhen,
  resourceLabel,
  t,
} from '../../core/texts';
import type { ArmyValues, CityAssessment, Plunderable } from '../../domain/assess-city';
import { measuredArmy } from '../../domain/measured-army';
import type { CatalogStore } from '../../stores/catalog';
import type { VisitedCity } from '../../stores/cities';
import { type BattleDetailsVm, battleDetails } from '../../ui/battle-details';
import { type AttackStatus, attackStatus } from './attack-status';

export interface PlunderItem {
  name: string;
  items: { label: string; amount: number }[];
}

export interface SabotageVm {
  player: { name: string; guild?: string; era: string };
  /** whether and when the visited player can be attacked or plundered */
  attack: AttackStatus;
  lootable: boolean;
  army?: CityAssessment['army'];
  /** the defending army as the last own attack on this player met it; a battle never shows their attacking army */
  measured?: { defender: ArmyValues; when: string };
  /** the last own attack on this player; the measured armies in it only when the army values are shown */
  lastBattle?: { when: string; result: string; details: BattleDetailsVm };
  /** own plunders in this city */
  plundered?: {
    last?:
      | { when: string; repelled: false; building: string; loot: string; doubleLoot: boolean }
      | { when: string; repelled: true; building?: string };
    /** count and Forge points of all plunders here */
    totals: string;
  };
  /** attacks of this player on the own city; missing when there were none */
  attackedMe?: { when: string; what: string; totals: string };
  plunderRepel: number;
  plunderable: PlunderItem[];
  incomplete: boolean;
}

function lastPlunder(p: Plunder, catalog: CatalogStore, now: number): NonNullable<SabotageVm['plundered']>['last'] {
  const when = formatWhen(p.at, now);
  const building = p.cityEntityId && (catalog.get(p.cityEntityId)?.name ?? p.cityEntityId);
  if (p.outcome === 'repelled' || !building) return { when, repelled: true, ...(building && { building }) };
  return {
    when,
    repelled: false,
    building,
    loot: formatResources(p.resources, catalog),
    doubleLoot: p.doubleLoot,
  };
}

/** What is recorded about the visited player; each part only once it is loaded for this player. */
export interface VisitedRecord {
  lastBattle?: Battle;
  plunders?: { last?: Plunder; totals: PlunderTotals };
  incoming?: { last?: IncomingAttack; totals: IncomingTotals };
  shield?: CityShield;
}

export interface SabotageInput {
  city: VisitedCity;
  player: Player | undefined;
  assessment: CityAssessment;
  catalog: CatalogStore;
  showArmy: boolean;
  now: number;
  record: VisitedRecord;
}

export function sabotageViewModel({
  city,
  player,
  assessment,
  catalog,
  showArmy,
  now,
  record: { lastBattle, plunders, incoming, shield },
}: SabotageInput): SabotageVm {
  const friend = city.visit.friend || player?.relations.friend === true;
  const guildMember = city.visit.guildMember || player?.relations.guildMember === true;
  const attack = attackStatus({ neighbor: city.visit.neighbor, friend, guildMember }, player?.attack, shield, now);
  const item = (p: Plunderable): PlunderItem => ({
    name: p.name,
    items: Object.entries(p.resources).map(([id, amount]) => ({ label: resourceLabel(id, catalog), amount })),
  });
  return {
    player: { name: player?.name ?? '', guild: player?.guild?.name, era: catalog.eraName(city.era) },
    attack,
    lootable: attack.kind === 'plunderable' || attack.kind === 'attackable',
    army: showArmy ? assessment.army : undefined,
    measured:
      showArmy && lastBattle
        ? { defender: measuredArmy(lastBattle).defender, when: formatWhen(lastBattle.at, now) }
        : undefined,
    lastBattle: lastBattle && {
      when: formatWhen(lastBattle.at, now),
      result: t(`pvp.${lastBattle.result}`),
      details: battleDetails(lastBattle, { army: showArmy }),
    },
    plundered: plunders && {
      last: plunders.last && lastPlunder(plunders.last, catalog, now),
      totals: formatPlunderTotals(plunders.totals),
    },
    attackedMe: incoming?.last && {
      when: formatWhen(incoming.last.at, now),
      what: formatIncoming(incoming.last, (id) => catalog.get(id)?.name),
      totals: formatIncomingTotals(incoming.totals),
    },
    plunderRepel: assessment.plunderRepel,
    plunderable: assessment.plunderable.map(item),
    incomplete: assessment.missingDefs.length > 0,
  };
}
