// Game images on the Inno CDN. The game's script `ForgeHX-<hash>.js` carries an index from asset paths to content
// hashes; the real file of a path lies under `<origin of the script>/assets<path without extension>-<hash>.<extension>`.

/** asset path, such as `/shared/unit_portraits/armyuniticons_50x50/armyuniticons_50x50_rogue.jpg`, to its hash */
export type AssetIndex = Record<string, string>;

/** the text right before the index in the game's script */
const MARKER = 'baseUrl,';

/**
 * The index from the source of the game's script: the object literal right after `baseUrl,`, up to its first `}`.
 * Undefined when the marker is missing, the text is no JSON object, or it holds no path with a string hash.
 */
export function parseAssetIndex(source: string): AssetIndex | undefined {
  const at = source.indexOf(MARKER);
  if (at < 0) return undefined;
  const start = at + MARKER.length;
  const end = source.indexOf('}', start);
  if (end < 0) return undefined;
  const literal = source.slice(start, end + 1).trim();
  if (!literal.startsWith('{')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(literal);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const index: AssetIndex = {};
  for (const [path, hash] of Object.entries(parsed)) if (typeof hash === 'string') index[path] = hash;
  return Object.keys(index).length ? index : undefined;
}

/** whether the URL lies on the Inno CDN over https; the extension reads nothing else */
export function isCdnUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname.endsWith('.innogamescdn.com');
  } catch {
    return false;
  }
}

/** the real URL of an asset: its hash before the extension, under `/assets` of the CDN origin */
export function assetUrl(origin: string, path: string, hash: string): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  const [stem, ext] = dot > slash ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
  return `${origin}/assets${stem}-${hash}${ext}`;
}

/** the 50x50 portrait of a unit, named by its type id (checked in the game's index 2026-11-01) */
export const unitPortraitPath = (name: string): string =>
  `/shared/unit_portraits/armyuniticons_50x50/armyuniticons_50x50_${name}.jpg`;

/** the mark the game sets on a building whose loot Double Loot doubled (the same icon type the plunder handler reads) */
export const DOUBLE_LOOT_ICON_PATH = '/city/gui/citymap_icons/citymap_icon_plunder_and_pillage.png';

/** the game's icon of a unit class (`light_melee`, `heavy_melee`, `fast`, `short_ranged`, `long_ranged`) */
export const unitClassIconPath = (unitClass: string): string => `/shared/icons/goods/unit_class_${unitClass}.png`;

/**
 * Where the image of a building may lie, by its `asset_id`, the likelier first. The game draws the sprite sheet
 * `spriteSheets.idle` of its iso entity table, whose name is the asset id with `SS_` after the first letter
 * (`G_ArcticFuture_Goods3` → `G_SS_ArcticFuture_Goods3`); some buildings have only an image under the plain id.
 */
// debt: the rule, not the game's tables. ceiling: 2 of 2274 buildings with an image in the table name it otherwise
// (checked 2026-11-02), they show none. upgrade: read the tables `getIsoEntityData`/`getIsoSpriteData` from the
// game's script if missing images are seen.
export const buildingImagePaths = (assetId: string): string[] => [
  `/city/buildings/${assetId.replace(/^([A-Z])_/, '$1_SS_')}.png`,
  `/city/buildings/${assetId}.png`,
];
