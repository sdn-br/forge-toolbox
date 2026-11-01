import type { Call } from '../../content/core/rpc';
import type { AssetPersistence } from '../../content/stores/assets';

/** The service worker reads the game's script: a request from the content script would be held to the page's CORS. */
export function assetPersistence(call: Call): AssetPersistence {
  return {
    index: async (script) => (await call('assets.index', { script })).index,
  };
}
