// The view model of one stored plunder, as the PvP side panel and the visited city show it (ui/plunder.ts).
import { DOUBLE_LOOT_ICON_PATH } from '../../../shared/cdn-assets';
import type { BuildingDefId } from '../../../shared/ids';
import type { Plunder, PlunderOutcome } from '../../../shared/model';
import { formatWhen } from '../../core/texts';
import { formatResourceLines } from './pvp-format';

/** a plunder as its details show it */
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
  /** the building's image, shown on the left; missing while the catalog or the index lacks it */
  image?: string;
}

/** what turns a plunder into its view model: names and images from the catalog and the game's index */
export interface PlunderLookups {
  building: (id: BuildingDefId) => string | undefined;
  resourceName: (id: string) => string | undefined;
  /** the URL of a game image on the Inno CDN, once the index is known */
  assetUrl?: (path: string) => string | undefined;
  /** the URL of a building's image on the Inno CDN, once the catalog and the index know it */
  buildingImage?: (id: BuildingDefId) => string | undefined;
  now: number;
}

export function plunderVm(p: Plunder, input: PlunderLookups): PlunderVm {
  const icon = p.doubleLoot ? input.assetUrl?.(DOUBLE_LOOT_ICON_PATH) : undefined;
  const image = p.cityEntityId && input.buildingImage?.(p.cityEntityId);
  return {
    when: formatWhen(p.at, input.now),
    outcome: p.outcome,
    building: p.cityEntityId === undefined ? '–' : (input.building(p.cityEntityId) ?? p.cityEntityId),
    loot: p.outcome === 'repelled' ? [] : formatResourceLines(p.resources, input.resourceName),
    doubleLoot: p.doubleLoot,
    ...(icon && { doubleLootIcon: icon }),
    ...(image && { image }),
  };
}
