import { html } from 'lit-html';
import type { Feature } from '../../core/feature';
import { t } from '../../core/texts';
import { nameOf } from '../../domain/city-grid';
import { icons } from '../../ui/icons';
import { NameSearch } from '../../ui/name-search';
import { selectionList } from '../../ui/selection-list';

const ID = 'buildingSearch';

/**
 * Box "Gebäudesuche": one field that suggests the names of the buildings in the own city, and the selection of the own
 * city below it. A picked name adds all its buildings to the selection and empties the field; the arrows in the game
 * show the selection. The city map shows and changes the same selection.
 */
export const buildingSearchFeature: Feature = {
  id: ID,
  setup(ctx) {
    const field = new NameSearch({
      placeholder: () => t('buildingSearch.placeholder'),
      names: () => ctx.selection.buildings().map(nameOf),
      update: () => box.update(),
      inline: true,
      onPick: (name) => ctx.selection.addName(name),
    });
    const box = ctx.createBox({
      id: ID,
      title: () => t('buildingSearch.title'),
      width: 300,
      render: () => {
        if (!ctx.cities.own()) return html`<p class="muted">${t('cityMap.noCity')}</p>`;
        return html`${field.render()}${selectionList(ctx.selection)}`;
      },
    });
    ctx.bus.on('selection.changed', () => box.update());
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
