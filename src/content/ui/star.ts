// The star that marks a great building or a player: outline when not marked, filled when marked.
import { t } from '../core/texts';
import { toggleButton } from './buttons';
import { headerIcons } from './icons';

/** a toggle button; the word is in the tooltip and the label, `aria-pressed` tells the state */
export const starButton = (marked: boolean, toggle: () => void) => {
  const word = t(marked ? 'mark.remove' : 'mark.add');
  return toggleButton('star', marked, word, marked ? headerIcons.starFilled : headerIcons.star, toggle);
};
