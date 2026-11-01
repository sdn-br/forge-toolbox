import type { AssetIndex } from '../../shared/cdn-assets';

export interface AssetsApi {
  /**
   * The asset index of the game's script at `script`, an URL on the Inno CDN: from the database when this script was
   * read before, else downloaded and kept in place of the index of an older script. `index` is missing when the
   * script could not be read or holds no index; a URL off the CDN is refused.
   */
  'assets.index': { arg: { script: string }; result: { index?: AssetIndex } };
}
