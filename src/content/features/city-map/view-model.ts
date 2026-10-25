// The own city as a map: colors by building group, switchable marks, name search and free tiles.
import type { BuildingDefId } from '../../../shared/ids';
import { t } from '../../core/texts';
import { buildingCategory, footprints, freeTiles, matchesName, needsRoad } from '../../domain/city-grid';
import { expansionBlocks } from '../../domain/expansions';
import type { BuildingDef, CityGrid } from '../../stores/catalog';
import type { City } from '../../stores/city-model';
import { CATEGORY_COLORS, categoryLegend, mutedColor } from '../../ui/city-colors';
import type { CityMapData, LegendItem, MapTile } from '../../ui/city-map';

export interface OwnMapUi {
  /** the text of the search field; hits are the names that contain it */
  search: string;
  /** the suggestion picked last, while the field still holds it; hits are then exactly the buildings of that name */
  picked?: string;
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
  /** number of buildings whose name matches; only while searching */
  matches?: number;
  /** free tiles in the unlocked areas; undefined when the areas are unknown */
  free?: number;
  /** some definitions are missing, so some sizes are guessed */
  incomplete: boolean;
}

/** `arrow` is the accent of the boxes, as on a marked plunder row */
export const MARK = {
  arrow: '#e8861c',
  search: '#ffe04a',
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
 * `grid` is the city grid; without it, or without areas, no expansion blocks are drawn. `arrows` are the buildings that
 * carry an arrow the city map set in the game.
 */
export function ownCityMapViewModel(
  city: City,
  def: (id: BuildingDefId) => BuildingDef | undefined,
  ui: OwnMapUi,
  grid?: CityGrid,
  arrows: ReadonlySet<number> = new Set(),
) {
  const fps = footprints(city.buildings.values(), def);
  const searching = ui.search.trim() !== '';
  let matches = 0;
  const tiles: MapTile[] = fps.map((f) => {
    const b = f.building;
    const name = f.def?.name ?? b.def;
    const category = buildingCategory(b.type);
    const hit = ui.picked === undefined ? matchesName(name, ui.search) : name === ui.picked;
    if (hit) matches++;
    const finished = b.state.kind === 'finished';
    const unconnected = needsRoad(b);
    const lines = [name];
    if (finished) lines.push(t('cityMap.finished'));
    if (unconnected) lines.push(t('cityMap.unconnected'));
    const arrow = arrows.has(b.id);
    // a click marks this building alone; on the one building that alone carries the arrow it takes the arrow away
    lines.push(t(arrow && arrows.size === 1 ? 'cityMap.clickUnmark' : 'cityMap.clickMark'));
    const tile: MapTile = {
      id: b.id,
      x: f.x,
      y: f.y,
      width: f.width,
      length: f.length,
      fill: searching && !hit ? mutedColor(category) : CATEGORY_COLORS[category],
      tooltip: lines.join('\n'),
    };
    if (arrow) Object.assign(tile, { outline: MARK.arrow, strong: true });
    else if (hit) Object.assign(tile, { outline: MARK.search, strong: true });
    else if (ui.unconnected && unconnected) Object.assign(tile, { outline: MARK.unconnected, strong: true });
    else if (ui.finished && finished) Object.assign(tile, { outline: MARK.finished });
    return tile;
  });
  const free = city.areas && freeTiles(city.areas, fps);
  const blocks = ui.expansions && grid && city.areas && expansionBlocks(grid, city.areas, city.blocked);
  const data: CityMapData = {
    areas: city.areas ?? [],
    tiles,
    ...(free && ui.free && { marked: { tiles: free, color: MARK.free } }),
    ...(blocks && {
      zones: [
        { rects: blocks.now, ...ZONE.now, tooltip: t('cityMap.zoneNow') },
        { rects: blocks.later, ...ZONE.later, tooltip: t('cityMap.zoneLater') },
      ],
    }),
  };
  const legend: LegendItem[] = [
    ...(ui.stats ? [] : categoryLegend()),
    ...(fps.some((f) => arrows.has(f.building.id))
      ? [{ color: MARK.arrow, label: t('cityMap.arrow'), outline: true }]
      : []),
    ...(ui.finished ? [{ color: MARK.finished, label: t('cityMap.finished'), outline: true }] : []),
    ...(ui.unconnected ? [{ color: MARK.unconnected, label: t('cityMap.unconnected'), outline: true }] : []),
    ...(searching ? [{ color: MARK.search, label: t('cityMap.searchHit'), outline: true }] : []),
    ...(free && ui.free ? [{ color: MARK.free, label: t('cityMap.free') }] : []),
    ...(blocks
      ? [
          { color: ZONE.now.fill, label: t('cityMap.legendNow') },
          { color: ZONE.later.fill, label: t('cityMap.legendLater') },
        ]
      : []),
  ];
  const vm: OwnMapVm = { data, legend, incomplete: fps.some((f) => !f.known) };
  if (searching) vm.matches = matches;
  if (free) vm.free = free.length;
  return vm;
}
