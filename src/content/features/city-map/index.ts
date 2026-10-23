import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { CityMap, legendView } from '../../ui/city-map';
import { icons } from '../../ui/icons';
import { toMode } from '../../ui/map-projection';
import { ownCityStats } from './stats';
import { type CityMapActions, cityMapView } from './view';
import { type OwnMapUi, ownCityMapViewModel } from './view-model';

const MODE = 'cityMap.own.mode';
const STATS = 'cityMap.own.stats';

/** Box "Stadtplan" with the own city. It follows the city store, so it shows what the game reported last. */
export const cityMapFeature: Feature = {
  id: 'cityMap',
  setup(ctx) {
    const ui: OwnMapUi = {
      search: '',
      finished: true,
      unconnected: true,
      free: true,
      stats: ctx.ui.pref(STATS) === 'open',
      expansions: false,
    };
    const map = new CityMap({ mode: toMode(ctx.ui.pref(MODE)), onMode: (mode) => ctx.ui.savePref(MODE, mode) });
    const box = ctx.createBox({
      id: 'cityMap',
      title: () => t('cityMap.title'),
      width: 500,
      fill: true,
      render: () => {
        const city = ctx.cities.own();
        if (!city) return cityMapView(undefined, ui, actions);
        const def = (id: Parameters<typeof ctx.catalog.get>[0]) => ctx.catalog.get(id);
        const grid = ctx.catalog.cityGrid();
        const vm = ownCityMapViewModel(city, def, ui, grid);
        const stats =
          ui.stats &&
          ownCityStats(city, def, {
            ...(grid && { grid }),
            resources: ctx.resources,
            research: ctx.research,
            eraIndex: (era) => ctx.catalog.eraIndex(era),
            eraName: (era) => ctx.catalog.eraName(era),
          });
        return cityMapView(vm, ui, actions, map.render(vm.data, legendView(vm.legend)), stats || undefined);
      },
    });
    const actions: CityMapActions = {
      search: (text) => {
        ui.search = text;
        box.update();
      },
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
    ctx.bus.on('city.ownChanged', () => box.update());
    ctx.bus.on('catalog.updated', () => box.update());
    ctx.bus.on('catalog.grid', () => box.update());
    ctx.bus.on('resources.changed', () => box.update());
    ctx.bus.on('research.changed', () => box.update());
    ctx.menu.add({ id: 'cityMap', icon: icons.cityMap, label: () => t('cityMap.menu'), action: () => box.toggle() });
  },
};
