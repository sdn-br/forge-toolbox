import type { Call } from '../../content/core/rpc';
import { toBuildingDef } from '../../content/game/building-defs';
import type { BuildingDef } from '../../content/model/catalog';
import type { BuildingDefLoader } from '../../content/stores/catalog';
import type { BuildingDefId } from '../../shared/ids';

const parse = (json: unknown): BuildingDef | undefined =>
  json === undefined ? undefined : (toBuildingDef(json) ?? undefined);

/** The service worker reads the files: a request from the content script would be held to the page's CORS. */
export function buildingDefLoader(call: Call): BuildingDefLoader {
  return {
    all: async () =>
      (await call('buildingDefs.all', {})).files.flatMap(({ url, json }) => {
        const def = parse(json);
        return def ? [{ def, url }] : [];
      }),
    load: async (id, url) => parse((await call('buildingDefs.file', { id, url })).json),
    missing: async () => (await call('buildingDefs.missing', {})).ids as BuildingDefId[],
    save: async (files) => {
      await call('buildingDefs.put', { files });
    },
  };
}
