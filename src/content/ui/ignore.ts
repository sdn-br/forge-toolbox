// The closed eye that ignores a great building or a player: outline-less eye when not ignored, accent when ignored.
import { html } from 'lit-html';
import { t } from '../core/texts';
import { filterToggle, toggleButton } from './buttons';
import { headerIcons } from './icons';

/**
 * Why a great building counts as ignored, in words, building first: "LG ignoriert", "Spieler ignoriert". Empty when
 * neither is ignored. `owner` is undefined for a player the store does not know.
 */
export const ignoreWords = (building: boolean, owner: boolean | undefined): string[] => [
  ...(building ? [t('ignore.building')] : []),
  ...(owner ? [t('ignore.player')] : []),
];

/** `{ ignoreNote }` with the reasons in words for a row tooltip; nothing for a row that is not ignored */
export const ignoreNote = (building: boolean, owner: boolean | undefined) => {
  const words = ignoreWords(building, owner);
  return words.length > 0 ? { ignoreNote: words.join(', ') } : {};
};

/**
 * A toggle button. In a table row (styles) it shows faint on row hover or focus while not ignored and stays in the
 * accent while ignored. The word is in the tooltip and the label, `aria-pressed` tells the state.
 */
export const ignoreButton = (kind: 'building' | 'player', ignored: boolean, toggle: () => void) => {
  const word = t(ignored ? 'ignore.remove' : `ignore.add.${kind}`);
  return toggleButton('ignore', ignored, word, headerIcons.eyeClosed, toggle);
};

/** a toggle with the open eye: also the rows of ignored buildings and owners, muted */
export const ignoredFilter = (show: boolean, set: (show: boolean) => void) =>
  filterToggle('ignored-filter', show, t('ignore.show'), headerIcons.eye, set);

/** the building name with the closed eye at the right edge; `tip` is the name and, when ignored, why */
export const buildingCell = (name: string, tip: string, ignored: boolean, toggle: () => void) =>
  html`<td class="name-cell" data-tip=${tip}><span class="row-name"><span class="row-label">${name}</span>${ignoreButton('building', ignored, toggle)}</span></td>`;
