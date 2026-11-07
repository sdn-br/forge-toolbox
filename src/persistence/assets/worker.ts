import type { Table } from 'dexie';
import { type AssetIndex, isCdnUrl, parseAssetIndex } from '../../shared/cdn-assets';
import type { Handlers } from '../../shared/rpc';
import { singleFlight } from '../../shared/single-flight';
import type { AssetsApi } from './contract';

/** the index of one script of the game, keyed by the script's URL */
export interface AssetIndexRow {
  script: string;
  index: AssetIndex;
  /** when it was read */
  at: number;
}

export type AssetsTables = { assetIndexes: Table<AssetIndexRow, string> };

/** reaches the CDN; tests pass their own */
export interface AssetsDeps {
  now: () => number;
  /** the text of the file at `url`; throws when it cannot be read */
  fetchText: (url: string) => Promise<string>;
}

/**
 * The game's script changes its URL with every release, so a stored index stays valid for its URL and is read once per
 * release. Only the newest is kept. A script that cannot be read or parsed is not stored and is tried again on the
 * next call.
 */
export function assetsHandlers(db: AssetsTables, { now, fetchText }: AssetsDeps): Handlers<AssetsApi> {
  /** two calls for the same script read it once */
  const read = singleFlight(async (script: string): Promise<AssetIndex | undefined> => {
    let source: string;
    try {
      source = await fetchText(script);
    } catch {
      return undefined;
    }
    const index = parseAssetIndex(source);
    if (!index) return undefined;
    const table = db.assetIndexes;
    await table.db.transaction('rw', table, async () => {
      await table.clear();
      await table.put({ script, index, at: now() });
    });
    return index;
  });

  return {
    'assets.index': async ({ script }) => {
      if (!isCdnUrl(script)) throw new Error(`not a script on the Inno CDN: ${script}`);
      const stored = await db.assetIndexes.get(script);
      if (stored) return { index: stored.index };
      const index = await read(script);
      return index ? { index } : {};
    },
  };
}
