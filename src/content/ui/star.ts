// The star that marks a great building or a player: outline when not marked, filled when marked.
import { html } from 'lit-html';
import type { PlayerId } from '../../shared/ids';
import { t } from '../core/texts';
import { filterToggle, toggleButton } from './buttons';
import { headerIcons } from './icons';

/** a toggle button; the word is in the tooltip and the label, `aria-pressed` tells the state */
export const starButton = (marked: boolean, toggle: () => void) => {
  const word = t(marked ? 'mark.remove' : 'mark.add');
  return toggleButton('star', marked, word, marked ? headerIcons.starFilled : headerIcons.star, toggle);
};

/** the table cell with the star of a building */
export const markCell = (
  r: { owner: PlayerId; entityId: number; marked: boolean },
  mark: (owner: PlayerId, entityId: number, marked: boolean) => void,
) => html`<td class="mark-cell">${starButton(r.marked, () => mark(r.owner, r.entityId, !r.marked))}</td>`;

/** a toggle with the filled star: only marked buildings and buildings of marked owners */
export const markedFilter = (onlyMarked: boolean, set: (onlyMarked: boolean) => void) =>
  filterToggle('inv-marked-filter', onlyMarked, t('investments.filter.onlyMarked'), headerIcons.starFilled, set);
