// The own city as a map: colors by building group, switchable marks, name search and free tiles.
import { t } from '../../core/texts';
import { keyTile, nameOf, needsRoad } from '../../domain/city-grid';
import type { Building, City } from '../../model/city';
import type { CityMapData, LegendItem, MapBadge, MapTile } from '../../ui/city-map';
import type { CityBasis } from './basis';
import { CATEGORY_COLORS, categoryLegend, mutedColor } from './colors';

export interface OwnMapUi {
  /** the text of the search field; hits are the names that contain it, a preview while typing */
  /** mark finished productions */
  finished: boolean;
  /** mark buildings without road connection */
  unconnected: boolean;
  /** show the free tiles */
  free: boolean;
  /** the statistics panel is open; it shows the groups, so the legend leaves them out */
  stats: boolean;
  /** draw the free expansion blocks of the grid */
  expansions: boolean;
}

export interface OwnMapVm {
  data: CityMapData;
  legend: LegendItem[];
  /** free tiles in the unlocked areas; undefined when the areas are unknown */
  free?: number;
  /** some definitions are missing, so some sizes are guessed */
  incomplete: boolean;
}

/**
 * `selected` is the light ink of the boxes, drawn with a dark seam so it shows on every fill, the orange of the great
 * buildings too (Nutzer, 2026-10-26)
 */
export const MARK = {
  selected: '#fbf4e4',
  unconnected: '#ff4040',
  finished: '#7cff7c',
  free: '#5c7a34',
};
/** free expansion blocks: adjacent ones strong, the others faint */
export const ZONE = {
  now: { fill: '#2f6f8f', outline: '#8fd8ff' },
  later: { fill: '#26343c' },
};

/**
 * `basis` is derived from `city`; without grid or areas no expansion blocks are drawn. `selected` are the selected
 * buildings of the own city, which carry the arrows in the game.
 */
export function ownCityMapViewModel(
  city: City,
  basis: CityBasis,
  ui: OwnMapUi,
  selected: ReadonlySet<number> = new Set(),
  now = Date.now(),
) {
  const { fps, area } = basis;
  // while something is selected, the rest steps back
  const selecting = fps.some((f) => selected.has(f.building.id));
  const tiles: MapTile[] = fps.map((f) => {
    const b = f.building;
    const name = nameOf(f);
    const category = b.category;
    const finished = isFinished(b, now);
    const unconnected = needsRoad(b);
    const lines = [name];
    if (finished) lines.push(t('cityMap.finished'));
    if (unconnected) lines.push(t('cityMap.unconnected'));
    lines.push(t('cityMap.clickSelect'));
    const tile: MapTile = {
      id: b.id,
      x: f.x,
      y: f.y,
      width: f.width,
      length: f.length,
      fill: selecting && !selected.has(b.id) ? mutedColor(category) : CATEGORY_COLORS[category],
      tooltip: lines.join('\n'),
    };
    if (selected.has(b.id)) Object.assign(tile, { outline: MARK.selected, strong: true });
    // states as badges on the building, so frames stay for the selection (Nutzer, 2026-10-26)
    const badges: MapBadge[] = [];
    if (ui.finished && finished) badges.push({ color: MARK.finished, symbol: 'check' });
    if (ui.unconnected && unconnected) badges.push({ color: MARK.unconnected, symbol: 'cross' });
    if (badges.length > 0) tile.badges = badges;
    return tile;
  });
  // the count shows always, the tiles only while marked
  const free = ui.free && area?.free.map(keyTile);
  const all = basis.blocks;
  const blocks = ui.expansions && all;
  const data: CityMapData = {
    areas: city.areas ?? [],
    tiles,
    ...(all && { extent: [...all.now, ...all.later] }),
    ...(free && { marked: { tiles: free, color: MARK.free } }),
    ...(blocks && {
      zones: [
        { rects: blocks.now, ...ZONE.now, tooltip: t('cityMap.zoneNow') },
        { rects: blocks.later, ...ZONE.later, tooltip: t('cityMap.zoneLater') },
      ],
    }),
  };
  const legend: LegendItem[] = [
    ...(ui.stats ? [] : categoryLegend()),
    ...(selecting ? [{ color: MARK.selected, label: t('cityMap.selected'), outline: true }] : []),
    ...(ui.finished ? [{ color: MARK.finished, label: t('cityMap.finished'), symbol: 'check' as const }] : []),
    ...(ui.unconnected ? [{ color: MARK.unconnected, label: t('cityMap.unconnected'), symbol: 'cross' as const }] : []),
    ...(free ? [{ color: MARK.free, label: t('cityMap.free') }] : []),
    ...(blocks
      ? [
          { color: ZONE.now.fill, label: t('cityMap.legendNow') },
          { color: ZONE.later.fill, label: t('cityMap.legendLater') },
        ]
      : []),
  ];
  const vm: OwnMapVm = { data, legend, incomplete: fps.some((f) => !f.known) };
  if (area) vm.free = area.free.length;
  return vm;
}

/**
 * The game turns a production into finished by its own clock, without a message, so a production whose time is up
 * counts as finished.
 */
function isFinished(b: Building, now: number): boolean {
  const s = b.state;
  return s.kind === 'finished' || (s.kind === 'producing' && s.readyAt !== undefined && s.readyAt <= now);
}

/** when the next production of the city finishes after `now`, for redrawing the map then */
export function nextFinish(city: City, now: number): number | undefined {
  let next: number | undefined;
  for (const b of city.buildings.values()) {
    const at = b.state.kind === 'producing' ? b.state.readyAt : undefined;
    if (at !== undefined && at > now && (next === undefined || at < next)) next = at;
  }
  return next;
}
