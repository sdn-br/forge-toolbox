// The star that marks a great building or a player: outline when not marked, filled when marked.
import { html } from 'lit-html';
import { t } from '../core/texts';
import { headerIcons } from './icons';

/** a toggle button; the word is in the tooltip and the label, `aria-pressed` tells the state */
export const starButton = (marked: boolean, toggle: () => void) => {
  const word = t(marked ? 'mark.remove' : 'mark.add');
  return html`<button class=${marked ? 'star on' : 'star'} aria-pressed=${marked ? 'true' : 'false'} data-tip=${word}
    aria-label=${word} @click=${toggle}>${marked ? headerIcons.starFilled : headerIcons.star}</button>`;
};
