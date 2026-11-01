import type { Call } from '../../content/core/rpc';
import { toBuildingDef } from '../../content/game/building-defs';
import type { BuildingDefLoader } from '../../content/stores/catalog';

/** The service worker reads the file: a request from the content script would be held to the page's CORS. */
export function buildingDefLoader(call: Call): BuildingDefLoader {
  return {
    load: async (id, url) => {
      const { json } = await call('buildingDefs.file', { id, url });
      return json === undefined ? undefined : (toBuildingDef(json) ?? undefined);
    },
  };
}
