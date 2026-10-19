import type { Player } from '../../../shared/model';
import { formatWhen, type TextKey, t } from '../../core/texts';
import type { CityAssessment, Plunderable } from '../../domain/assess-city';
import type { CatalogStore } from '../../stores/catalog';
import type { VisitedCity } from '../../stores/cities';
import { de } from '../../texts/de';

export interface PlunderItem {
  name: string;
  items: { label: string; amount: number }[];
  when?: string;
}

export interface SabotageVm {
  player: { name: string; guild?: string; era: string };
  lootable: boolean;
  army?: CityAssessment['army'];
  plunderRepel: number;
  ready: PlunderItem[];
  producing: PlunderItem[];
  incomplete: boolean;
}

export function resourceLabel(id: string, catalog: CatalogStore): string {
  const key = `resource.${id}`;
  return key in de ? t(key as TextKey) : (catalog.resourceName(id) ?? id);
}

export function sabotageViewModel(
  city: VisitedCity,
  player: Player | undefined,
  assessment: CityAssessment,
  catalog: CatalogStore,
  showArmy: boolean,
  now: number,
): SabotageVm {
  const friend = city.visit.friend || player?.relations.friend === true;
  const guildMember = city.visit.guildMember || player?.relations.guildMember === true;
  const waiting =
    city.visit.nextInteractionAt !== undefined && city.visit.nextInteractionAt > now && !city.visit.canPlunder;
  const item = (p: Plunderable): PlunderItem => ({
    name: p.name,
    items: Object.entries(p.resources).map(([id, amount]) => ({ label: resourceLabel(id, catalog), amount })),
    when: p.readyAt === undefined ? undefined : t('sabotage.readyAt', { when: formatWhen(p.readyAt, now) }),
  });
  return {
    player: { name: player?.name ?? '', guild: player?.guild?.name, era: catalog.eraName(city.era) },
    lootable: city.visit.neighbor && !friend && !guildMember && !waiting,
    army: showArmy ? assessment.army : undefined,
    plunderRepel: assessment.plunderRepel,
    ready: assessment.plunderable.filter((p) => p.ready).map(item),
    producing: assessment.plunderable.filter((p) => !p.ready).map(item),
    incomplete: assessment.missingDefs.length > 0,
  };
}
