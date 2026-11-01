import type { Table } from 'dexie';
import { isCdnUrl } from '../../shared/cdn-assets';
import type { Handlers } from '../../shared/rpc';
import type { AssetsDeps } from '../assets/worker';
import type { BuildingDefsApi } from './contract';

/** the metadata file of one building definition, keyed by the definition's id */
export interface BuildingDefFileRow {
  id: string;
  /** the URL it was read from; it carries the file's hash */
  url: string;
  json: unknown;
  /** when it was read */
  at: number;
}

export type BuildingDefsTables = { buildingDefFiles: Table<BuildingDefFileRow, string> };

/**
 * One row per definition: a new URL for the same id replaces it. A file that cannot be read or parsed is not stored
 * and is tried again on the next call.
 */
export function buildingDefsHandlers(
  db: BuildingDefsTables,
  { now, fetchText }: AssetsDeps,
): Handlers<BuildingDefsApi> {
  /** downloads on the way, so two calls for the same file read it once */
  const reading = new Map<string, Promise<unknown>>();

  const read = async (id: string, url: string): Promise<unknown> => {
    let json: unknown;
    try {
      json = JSON.parse(await fetchText(url));
    } catch {
      return undefined;
    }
    await db.buildingDefFiles.put({ id, url, json, at: now() });
    return json;
  };

  return {
    'buildingDefs.all': async () => ({
      files: (await db.buildingDefFiles.toArray()).map(({ id, url, json }) => ({ id, url, json })),
    }),
    'buildingDefs.put': async ({ files }) => {
      const at = now();
      await db.buildingDefFiles.bulkPut(files.filter((f) => isCdnUrl(f.url)).map((f) => ({ ...f, at })));
      return {};
    },
    'buildingDefs.file': async ({ id, url }) => {
      if (!isCdnUrl(url)) throw new Error(`not a file on the Inno CDN: ${url}`);
      const stored = await db.buildingDefFiles.get(id);
      if (stored?.url === url) return { json: stored.json };
      let pending = reading.get(url);
      if (!pending) {
        pending = read(id, url).finally(() => reading.delete(url));
        reading.set(url, pending);
      }
      const json = await pending;
      return json === undefined ? {} : { json };
    },
  };
}
