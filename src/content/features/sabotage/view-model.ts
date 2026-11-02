import { type Battle, isFought, type Player } from '../../../shared/model';
import { formatWhen, t } from '../../core/texts';
import type { ArmyValues, CityAssessment, Plunderable } from '../../domain/assess-city';
import { measuredArmy } from '../../domain/measured-army';
import { sortByPlunderPriority } from '../../domain/plunder-priority';
import type { AssetStore } from '../../stores/assets';
import type { CatalogStore } from '../../stores/catalog';
import type { VisitedCity } from '../../stores/cities';
import type { BattleDetailsVm } from '../../ui/battle-details';
import type { OwnerVm } from '../../ui/owner-line';
import { battleDetails, catalogUnits } from '../shared/battle-details';
import { assetImage, buildingImage } from '../shared/building-image';
import type { PvpPlayerLookups } from '../shared/player-lookups';
import { type PlunderVm, plunderVm } from '../shared/plunder';
import { formatIncoming, formatIncomingTotals, formatPlunderTotals, resourceLabel } from '../shared/pvp-format';
import { type AttackStatus, attackStatus } from './attack-status';
import type { VisitedRecord } from './visited-record';

export interface PlunderItem {
  /** the building in the city, to point at it in the game */
  building: number;
  name: string;
  /** the building's image, shown on the left; missing while the catalog or the index lacks it */
  image?: string;
  /** loot beyond coins and supplies; the others show muted */
  important: boolean;
  items: { label: string; amount: number }[];
}

/** the catalog's resource names as the formatters take them */
const resourceName = (catalog: CatalogStore) => (id: string) => catalog.resourceName(id);

export interface SabotageVm {
  /** name and guild with their pages at foestats, the PvP marks only for a player the store knows */
  player: Omit<OwnerVm, 'ownerMarked' | 'ownerIgnored'> & { era: string; plunderWorthy?: boolean; noAttack?: boolean };
  /** whether and when the visited player can be attacked or plundered */
  attack: AttackStatus;
  lootable: boolean;
  army?: CityAssessment['army'];
  /** the defending army as the last own attack on this player met it; a battle never shows their attacking army */
  measured?: { defender: ArmyValues; when: string };
  /**
   * the last own attack on this player; the measured armies in it only when the army values are shown. An inferred
   * battle has no details and its time is the latest it took place.
   */
  lastBattle?: { when: string; result: string; details?: BattleDetailsVm };
  /** own plunders in this city */
  plundered?: {
    /** the last plunder as the PvP side panel shows it */
    last?: PlunderVm;
    /** count and Forge points of all plunders here */
    totals: string;
  };
  /** attacks of this player on the own city; missing when there were none */
  attackedMe?: { when: string; what: string; totals: string };
  plunderRepel: number;
  plunderable: PlunderItem[];
  incomplete: boolean;
}

function lastBattleVm(
  b: Battle,
  showArmy: boolean,
  now: number,
  catalog: CatalogStore,
  assets: Pick<AssetStore, 'url'> | undefined,
): NonNullable<SabotageVm['lastBattle']> {
  const result = t(`pvp.${b.result}`);
  if (!isFought(b)) return { when: t('pvp.atLatest', { when: formatWhen(b.at, now) }), result };
  return {
    when: formatWhen(b.at, now),
    result,
    details: battleDetails(b, {
      ...(showArmy && { measured: measuredArmy(b) }),
      unit: catalogUnits(catalog, assets),
    }),
  };
}

export interface SabotageInput {
  city: VisitedCity;
  player: Player | undefined;
  lookups: PvpPlayerLookups;
  assessment: CityAssessment;
  catalog: CatalogStore;
  /** the game images; without them the battle details show no unit portraits */
  assets?: Pick<AssetStore, 'url'>;
  showArmy: boolean;
  now: number;
  record: VisitedRecord;
}

export function sabotageViewModel({
  city,
  player,
  lookups,
  assessment,
  catalog,
  assets,
  showArmy,
  now,
  record: { lastBattle, lastFought, plunders, incoming, shield },
}: SabotageInput): SabotageVm {
  const friend = city.visit.friend || player?.relations.friend === true;
  const guildMember = city.visit.guildMember || player?.relations.guildMember === true;
  const attack = attackStatus({ neighbor: city.visit.neighbor, friend, guildMember }, player?.attack, shield, now);
  const item = ({ plunderable: p, important }: { plunderable: Plunderable; important: boolean }): PlunderItem => {
    const url = assetImage(assets, p.assetId);
    return {
      building: p.building,
      name: p.name,
      ...(url && { image: url }),
      important,
      items: Object.entries(p.resources).map(([id, amount]) => ({
        label: resourceLabel(id, resourceName(catalog)),
        amount,
      })),
    };
  };
  // an inferred battle measured nothing, so the values come from the last fought one
  const measured = showArmy && lastFought ? measuredArmy(lastFought) : undefined;
  const guild = lookups.playerGuild(city.owner);
  const plunderWorthy = lookups.plunderWorthy(city.owner);
  const noAttack = lookups.noAttack(city.owner);
  return {
    player: {
      owner: lookups.playerName(city.owner) ?? '',
      ownerUrl: lookups.playerUrl(city.owner),
      ...(guild && { ownerGuild: guild }),
      era: catalog.eraName(city.era),
      ...(plunderWorthy !== undefined && { plunderWorthy }),
      ...(noAttack !== undefined && { noAttack }),
    },
    attack,
    lootable: attack.kind === 'plunderable' || attack.kind === 'attackable',
    army: showArmy ? assessment.army : undefined,
    measured:
      measured && lastFought ? { defender: measured.defender, when: formatWhen(lastFought.at, now) } : undefined,
    lastBattle: lastBattle && lastBattleVm(lastBattle, showArmy, now, catalog, assets),
    plundered: plunders && {
      last:
        plunders.last &&
        plunderVm(plunders.last, {
          building: (id) => catalog.buildingName(id),
          resourceName: resourceName(catalog),
          assetUrl: (path) => assets?.url(path),
          buildingImage: (id) => buildingImage(catalog, assets, id),
          now,
        }),
      totals: formatPlunderTotals(plunders.totals),
    },
    attackedMe: incoming?.last && {
      when: formatWhen(incoming.last.at, now),
      what: formatIncoming(incoming.last, (id) => catalog.buildingName(id)),
      totals: formatIncomingTotals(incoming.totals),
    },
    plunderRepel: assessment.plunderRepel,
    plunderable: sortByPlunderPriority(assessment.plunderable).map(item),
    incomplete: assessment.missingDefs.length > 0,
  };
}
