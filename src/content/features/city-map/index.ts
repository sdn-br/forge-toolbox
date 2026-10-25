import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { footprints, spotOf } from '../../domain/city-grid';
import { largeDefaultSize } from '../../ui/box';
import { CityMap, legendView, type MapTile } from '../../ui/city-map';
import { icons } from '../../ui/icons';
import { toMode } from '../../ui/map-projection';
import { NameSearch } from '../../ui/name-search';
import { ownCityStats } from './stats';
import { type CityMapActions, cityMapView } from './view';
import { type OwnMapUi, ownCityMapViewModel } from './view-model';

const ID = 'cityMap';
const MODE = 'cityMap.own.mode';
const STATS = 'cityMap.own.stats';

/**
 * Box "Stadtplan" with the own city. It follows the city store, so it shows what the game reported last. A picked
 * search suggestion and a click on a building set arrows in the game; both share the one marking of the own city with
 * the building search, so whoever marks last wins.
 */
export const cityMapFeature: Feature = {
  id: ID,
  setup(ctx) {
    const ui: OwnMapUi = {
      search: '',
      finished: true,
      unconnected: true,
      free: true,
      stats: ctx.ui.pref(STATS) === 'open',
      expansions: false,
    };
    const own = () => {
      const city = ctx.cities.own();
      return city ? footprints(city.buildings.values(), (id) => ctx.catalog.get(id)) : [];
    };
    const nameOf = (f: ReturnType<typeof own>[number]) => f.def?.name ?? f.building.def;
    /** the buildings that carry an arrow this box set */
    const arrows = () => {
      const m = ctx.markers.of(ID);
      return new Set(m?.city === 'own' ? m.spots.map((s) => s.id) : []);
    };
    // whether the arrows of this box come from a pick; emptying the field takes only those, not a clicked one. Stale
    // after another box replaced them, but then clearing what this box marked changes nothing
    let pickArrows = false;
    const field = new NameSearch({
      placeholder: () => t('cityMap.search'),
      names: () => own().map(nameOf),
      update: () => box.update(),
      // typing highlights the buildings whose name contains the text, without arrows
      onInput: (text) => {
        ui.search = text;
        ui.picked = undefined;
      },
      onPick: (name) => {
        ui.search = name;
        ui.picked = name;
        pickArrows = true;
        ctx.markers.set(
          ID,
          'own',
          own()
            .filter((f) => nameOf(f) === name)
            .map(spotOf),
        );
      },
      onClear: () => {
        if (pickArrows) ctx.markers.clear(ID);
      },
    });
    // a click marks this building alone; a click on the building that alone carries the arrow takes it away
    const clicked = (tile: MapTile) => {
      const marked = arrows();
      if (marked.size === 1 && tile.id !== undefined && marked.has(tile.id)) return ctx.markers.clear(ID);
      const building = own().find((f) => f.building.id === tile.id);
      if (!building) return;
      pickArrows = false;
      ctx.markers.set(ID, 'own', [spotOf(building)]);
    };
    const map = new CityMap({
      mode: toMode(ctx.ui.pref(MODE)),
      onMode: (mode) => ctx.ui.savePref(MODE, mode),
      onTileClick: clicked,
    });
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
        const vm = ownCityMapViewModel(city, def, ui, grid, arrows());
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
        return cityMapView(vm, ui, actions, field.render(), drawn, stats || undefined);
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
    // another box marked the own city, or the viewer dismissed the arrows in the game: the map shows what is left
    ctx.bus.on('markers.changed', () => box.update());
    ctx.bus.on('city.ownChanged', () => box.update());
    ctx.bus.on('catalog.updated', () => box.update());
    ctx.bus.on('catalog.grid', () => box.update());
    ctx.bus.on('resources.changed', () => box.update());
    ctx.bus.on('research.changed', () => box.update());
    ctx.menu.add({ id: 'cityMap', icon: icons.cityMap, label: () => t('cityMap.menu'), action: () => box.toggle() });
  },
};
