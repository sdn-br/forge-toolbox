import type { Battle, Player, Plunder, PlunderTotals } from '../../../shared/model';
import { formatPlunderTotals, formatResources, formatWhen, resourceLabel } from '../../core/texts';
import type { ArmyValues, CityAssessment, Plunderable } from '../../domain/assess-city';
import { measuredArmy } from '../../domain/measured-army';
import type { CatalogStore } from '../../stores/catalog';
import type { VisitedCity } from '../../stores/cities';

export interface PlunderItem {
  name: string;
  items: { label: string; amount: number }[];
}

export interface SabotageVm {
  player: { name: string; guild?: string; era: string };
  lootable: boolean;
  army?: CityAssessment['army'];
  /** the defending army as the last own attack on this player met it; a battle never shows their attacking army */
  measured?: { defender: ArmyValues; when: string };
  /** own plunders in this city */
  plundered?: {
    last?:
      | { when: string; repelled: false; building: string; loot: string; doubleLoot: boolean }
      | { when: string; repelled: true; building?: string };
    /** count and Forge points of all plunders here */
    totals: string;
  };
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

export function sabotageViewModel(
  city: VisitedCity,
  player: Player | undefined,
  assessment: CityAssessment,
  catalog: CatalogStore,
  showArmy: boolean,
  now: number,
  lastBattle?: Battle,
  plunders?: { last?: Plunder; totals: PlunderTotals },
): SabotageVm {
  const friend = city.visit.friend || player?.relations.friend === true;
  const guildMember = city.visit.guildMember || player?.relations.guildMember === true;
  const waiting =
    city.visit.nextInteractionAt !== undefined && city.visit.nextInteractionAt > now && !city.visit.canPlunder;
  const item = (p: Plunderable): PlunderItem => ({
    name: p.name,
    items: Object.entries(p.resources).map(([id, amount]) => ({ label: resourceLabel(id, catalog), amount })),
  });
  return {
    player: { name: player?.name ?? '', guild: player?.guild?.name, era: catalog.eraName(city.era) },
    lootable: city.visit.neighbor && !friend && !guildMember && !waiting,
    army: showArmy ? assessment.army : undefined,
    measured:
      showArmy && lastBattle
        ? { defender: measuredArmy(lastBattle).defender, when: formatWhen(lastBattle.at, now) }
        : undefined,
    plundered: plunders && {
      last: plunders.last && lastPlunder(plunders.last, catalog, now),
      totals: formatPlunderTotals(plunders.totals),
    },
    plunderRepel: assessment.plunderRepel,
    plunderable: assessment.plunderable.map(item),
    incomplete: assessment.missingDefs.length > 0,
  };
}
