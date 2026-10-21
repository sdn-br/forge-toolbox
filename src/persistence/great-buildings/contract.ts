import type { PlayerId, WorldId } from '../../shared/ids';
import type { KnownGreatBuilding } from '../../shared/model';

export interface GreatBuildingsApi {
  /** a row replaces what was known about that building */
  'greatBuildings.put': { arg: { rows: KnownGreatBuilding[] }; result: undefined };
  /** the known buildings of one owner, or of all owners of the world */
  'greatBuildings.list': { arg: { world: WorldId; owner?: PlayerId }; result: KnownGreatBuilding[] };
}
