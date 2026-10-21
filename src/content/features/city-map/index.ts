import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { CityMap, legendView } from '../../ui/city-map';
import { toMode } from '../../ui/map-projection';
import { cityMapView } from './view';
import { type OwnMapUi, ownCityMapViewModel } from './view-model';

const MODE = 'cityMap.own.mode';

/** Box "Stadtplan" with the own city. It follows the city store, so it shows what the game reported last. */
export const cityMapFeature: Feature = {
  id: 'cityMap',
  setup(ctx) {
    const ui: OwnMapUi = { search: '', finished: true, unconnected: true, free: true };
    const map = new CityMap({ mode: toMode(ctx.ui.pref(MODE)), onMode: (mode) => ctx.ui.savePref(MODE, mode) });
    const box = ctx.createBox({
      id: 'cityMap',
      title: () => t('cityMap.title'),
      width: 500,
      render: () => {
        const city = ctx.cities.own();
        const vm = city && ownCityMapViewModel(city, (id) => ctx.catalog.get(id), ui);
        const drawn = vm && map.render(vm.data, legendView(vm.legend));
        return cityMapView(vm, ui, actions, drawn);
      },
    });
    const actions = {
      search: (text: string) => {
        ui.search = text;
        box.update();
      },
      toggle: (mark: 'finished' | 'unconnected' | 'free') => {
        ui[mark] = !ui[mark];
        box.update();
      },
    };
    ctx.bus.on('city.ownChanged', () => box.update());
    ctx.bus.on('catalog.updated', () => box.update());
    ctx.menu.add({ id: 'cityMap', icon: '🗺️', label: () => t('cityMap.menu'), action: () => box.toggle() });
  },
};
