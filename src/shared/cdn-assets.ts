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

/** the 50x50 portrait of a unit; the game names it by the unit's asset name or type id, the index tells which exists */
export const unitPortraitPath = (name: string): string =>
  `/shared/unit_portraits/armyuniticons_50x50/armyuniticons_50x50_${name}.jpg`;
