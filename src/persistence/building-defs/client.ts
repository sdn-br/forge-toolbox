import type { Call } from '../../content/core/rpc';
import { toBuildingDef } from '../../content/game/building-defs';
import type { BuildingDefLoader } from '../../content/stores/catalog';

/** The service worker reads the file: a request from the content script would be held to the page's CORS. */
export function buildingDefLoader(call: Call): BuildingDefLoader {
  const read = async (id: string, url: string, cachedOnly: boolean) => {
    const { json } = await call('buildingDefs.file', { id, url, cachedOnly });
    return json === undefined ? undefined : (toBuildingDef(json) ?? undefined);
  };
  return {
    cached: (id, url) => read(id, url, true),
    load: (id, url) => read(id, url, false),
  };
}
