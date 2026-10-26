import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { nameOf } from '../../domain/city-grid';
import { largeDefaultSize } from '../../ui/box';
import { CityMap, legendView, type MapTile } from '../../ui/city-map';
import { icons } from '../../ui/icons';
import { toMode } from '../../ui/map-projection';
import { NameSearch } from '../../ui/name-search';
import { selectionList } from '../../ui/selection-list';
import { ownCityStats } from './stats';
import { type CityMapActions, cityMapView } from './view';
import { nextFinish, type OwnMapUi, ownCityMapViewModel } from './view-model';

const ID = 'cityMap';
const MODE = 'cityMap.own.mode';
const STATS = 'cityMap.own.stats';

/**
 * Box "Stadtplan" with the own city. It follows the city store, so it shows what the game reported last. The map
 * frames the selection of the own city, which the building search shares and the arrows in the game show; a picked
 * suggestion and clicks on buildings change it.
 */
export const cityMapFeature: Feature = {
  id: ID,
  setup(ctx) {
    const ui: OwnMapUi = {
      finished: true,
      unconnected: true,
      free: true,
      stats: ctx.ui.pref(STATS) === 'open',
      expansions: false,
    };
    const field = new NameSearch({
      placeholder: () => t('cityMap.search'),
      names: () => ctx.selection.buildings().map(nameOf),
      update: () => box.update(),
      onPick: (name) => ctx.selection.addName(name),
    });
    // a click selects this building alone, or nothing when it was alone; with shift it adds or removes the building
    const clicked = (tile: MapTile, how: { shift: boolean }) => {
      if (tile.id === undefined) return;
      if (how.shift) ctx.selection.toggle(tile.id);
      else ctx.selection.selectOnly(tile.id);
    };
    const map = new CityMap({
      mode: toMode(ctx.ui.pref(MODE)),
      onMode: (mode) => ctx.ui.savePref(MODE, mode),
      onTileClick: clicked,
    });
    // the game finishes productions by its clock, without a message: redraw when the next one is due, while open
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const redrawAt = (at: number | undefined, now: number) => {
      clearTimeout(finishTimer);
      finishTimer = at === undefined ? undefined : setTimeout(() => box.isOpen && box.update(), at - now + 500);
    };
    const box = ctx.createBox({
      id: 'cityMap',
      title: () => t('cityMap.title'),
      width: 500,
      resizable: true,
      defaultSize: largeDefaultSize,
      fill: true,
      render: () => {
        const city = ctx.cities.own();
        if (!city) return cityMapView(undefined, ui, actions);
        const def = (id: Parameters<typeof ctx.catalog.get>[0]) => ctx.catalog.get(id);
        const grid = ctx.catalog.cityGrid();
        const now = Date.now();
        redrawAt(nextFinish(city, now), now);
        const vm = ownCityMapViewModel(city, def, ui, grid, ctx.selection.ids(), now);
        const stats =
          ui.stats &&
          ownCityStats(city, def, {
            ...(grid && { grid }),
            resources: ctx.resources,
            research: ctx.research,
            eraIndex: (era) => ctx.catalog.eraIndex(era),
            eraName: (era) => ctx.catalog.eraName(era),
          });
        const drawn = map.render(vm.data, legendView(vm.legend));
        return cityMapView(vm, ui, actions, field.render(), selectionList(ctx.selection), drawn, stats || undefined);
      },
    });
    const actions: CityMapActions = {
      toggle: (mark) => {
        ui[mark] = !ui[mark];
        box.update();
      },
      toggleStats: () => {
        ui.stats = !ui.stats;
        ctx.ui.savePref(STATS, ui.stats ? 'open' : 'closed');
        box.update();
      },
    };
    ctx.bus.on('selection.changed', () => box.update());
    ctx.bus.on('city.ownChanged', () => box.update());
    ctx.bus.on('catalog.updated', () => box.update());
    ctx.bus.on('catalog.grid', () => box.update());
    ctx.bus.on('resources.changed', () => box.update());
    ctx.bus.on('research.changed', () => box.update());
    ctx.menu.add({ id: 'cityMap', icon: icons.cityMap, label: () => t('cityMap.menu'), action: () => box.toggle() });
  },
};
