// The image of a building definition on the Inno CDN, for the plunder views.
import { buildingImagePaths } from '../../../shared/cdn-assets';
import type { BuildingDefId } from '../../../shared/ids';
import type { AssetStore } from '../../stores/assets';
import type { CatalogStore } from '../../stores/catalog';

/** the full URL of the building's image; undefined while the catalog lacks the definition or the index the image */
export const buildingImage = (
  catalog: Pick<CatalogStore, 'get'>,
  assets: Pick<AssetStore, 'url'> | undefined,
  id: BuildingDefId,
): string | undefined => assetImage(assets, catalog.get(id)?.assetId);

/** the full URL of the image named by a definition's `asset_id`; undefined while the index lacks it */
export function assetImage(
  assets: Pick<AssetStore, 'url'> | undefined,
  assetId: string | undefined,
): string | undefined {
  if (!assetId || !assets) return undefined;
  for (const path of buildingImagePaths(assetId)) {
    const url = assets.url(path);
    if (url) return url;
  }
  return undefined;
}
