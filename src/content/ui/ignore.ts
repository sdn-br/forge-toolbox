// The closed eye that ignores a great building or a player: outline-less eye when not ignored, accent when ignored.
import { html } from 'lit-html';
import { t } from '../core/texts';
import { type IgnoreReason, ignoreReason } from '../domain/ignore';
import { headerIcons } from './icons';

/** the reasons in words, building first: "LG ignoriert", "Spieler ignoriert" */
export const ignoreWords = (reason: IgnoreReason): string[] => [
  ...(reason.building ? [t('ignore.building')] : []),
  ...(reason.owner ? [t('ignore.player')] : []),
];

/** `{ ignoreNote }` with the reasons in words for a row tooltip; nothing for a row that is not ignored */
export const ignoreNote = (building: boolean, owner: boolean | undefined) => {
  const reason = ignoreReason(building, owner);
  return reason ? { ignoreNote: ignoreWords(reason).join(', ') } : {};
};

/**
 * A toggle button. In a table row (styles) it shows faint on row hover or focus while not ignored and stays in the
 * accent while ignored. The word is in the tooltip and the label, `aria-pressed` tells the state.
 */
export const ignoreButton = (kind: 'building' | 'player', ignored: boolean, toggle: () => void) => {
  const word = t(ignored ? 'ignore.remove' : `ignore.add.${kind}`);
  return html`<button class=${ignored ? 'ignore on' : 'ignore'} aria-pressed=${ignored ? 'true' : 'false'} data-tip=${word}
    aria-label=${word} @click=${toggle}>${headerIcons.eyeClosed}</button>`;
};
