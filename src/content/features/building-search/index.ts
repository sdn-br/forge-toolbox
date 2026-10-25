import { html } from 'lit-html';
import type { Feature } from '../../core/feature';
import { formatNumber, t } from '../../core/texts';
import { footprints, spotOf } from '../../domain/city-grid';
import { icons } from '../../ui/icons';
import { NameSearch } from '../../ui/name-search';

const ID = 'buildingSearch';

/**
 * Box "Gebäudesuche": one field that suggests the names of the buildings in the own city. A picked name marks all its
 * buildings in the game; emptying the field takes the arrows away. The own city has one marking, shared with the city
 * map, so whoever marks last wins. The field keeps its text then, and the line below it tells whether its arrows stand.
 */
export const buildingSearchFeature: Feature = {
  id: ID,
  setup(ctx) {
    const own = () => {
      const city = ctx.cities.own();
      return city ? footprints(city.buildings.values(), (id) => ctx.catalog.get(id)) : [];
    };
    const nameOf = (f: ReturnType<typeof own>[number]) => f.def?.name ?? f.building.def;
    const field = new NameSearch({
      placeholder: () => t('buildingSearch.placeholder'),
      names: () => own().map(nameOf),
      update: () => box.update(),
      inline: true,
      onPick: (name) =>
        ctx.markers.set(
          ID,
          'own',
          own()
            .filter((f) => nameOf(f) === name)
            .map(spotOf),
        ),
      onClear: () => ctx.markers.clear(ID),
    });
    const box = ctx.createBox({
      id: ID,
      title: () => t('buildingSearch.title'),
      width: 300,
      render: () => {
        if (!ctx.cities.own()) return html`<p class="muted">${t('cityMap.noCity')}</p>`;
        const marked = ctx.markers.of(ID);
        return html`${field.render()}
          <p class=${marked ? '' : 'muted'}>${
            marked ? t('buildingSearch.marked', { count: formatNumber(marked.spots.length) }) : t('buildingSearch.hint')
          }</p>`;
      },
    });
    // another box marked the own city, or the viewer dismissed the arrows in the game
    ctx.bus.on('markers.changed', () => box.update());
    ctx.bus.on('city.ownChanged', () => box.update());
    ctx.bus.on('catalog.updated', () => box.update());
    ctx.menu.add({
      id: ID,
      icon: icons.buildingSearch,
      label: () => t('buildingSearch.menu'),
      action: () => box.toggle(),
    });
  },
};
