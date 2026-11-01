// The star that marks a great building or a player: outline when not marked, filled when marked.
import { html } from 'lit-html';
import type { PlayerId } from '../../shared/ids';
import { t } from '../core/texts';
import { toggleButton, toggleGroup } from './buttons';
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

type MarkKey = 'marked' | 'notMarked';

const MARK_KEYS: MarkKey[] = ['marked', 'notMarked'];
const MARK_ICONS = { marked: headerIcons.starFilled, notMarked: headerIcons.notMarked };

/** two toggles, the filled star for the marked rows (a marked building or owner) and its outline for the rest; each
 * shows its rows while on */
export const markedFilter = (mark: Record<MarkKey, boolean>, set: (mark: Record<MarkKey, boolean>) => void) =>
  toggleGroup(
    'inv-marked-filter',
    MARK_KEYS,
    mark,
    (key) => t(`investments.filter.mark.${key}`),
    (key) => MARK_ICONS[key],
    set,
  );
