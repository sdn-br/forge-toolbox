import { buildingDefFiles } from '../../persistence/building-defs/client';
import type { BuildingDefId } from '../../shared/ids';
import type { Call } from '../core/rpc';
import type { BuildingDef } from '../model/catalog';
import type { BuildingDefLoader } from '../stores/catalog';
import { toBuildingDef } from './building-defs';

const parse = (json: unknown): BuildingDef | undefined => toBuildingDef(json) ?? undefined;

/** The cache of definition files translated into the domain model; the service worker only sees the raw files. */
export function buildingDefLoader(call: Call): BuildingDefLoader {
  const files = buildingDefFiles(call);
  return {
    all: async () =>
      (await files.all()).flatMap(({ url, json }) => {
        const def = parse(json);
        return def ? [{ def, url }] : [];
      }),
    load: async (id, url) => parse((await files.file(id, url)).json),
    missing: async () => (await files.missing()) as BuildingDefId[],
    save: (defs) => files.put(defs),
  };
}
