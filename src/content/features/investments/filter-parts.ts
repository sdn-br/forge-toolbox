// The filter pieces both investment tabs draw: the relation toggles, the funnel beside an owner, the owner and relation cells.
import { html } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { sameName, t } from '../../core/texts';
import type { Reach, ReachFilter } from '../../domain/reach';
import { toggleButton } from '../../ui/buttons';
import { headerIcons } from '../../ui/icons';
import { externalLink } from '../../ui/links';
import { ownerMarks } from '../../ui/owner-line';
import { RELATION_ICONS, relationToggles } from '../../ui/relations';
import type { GbRowActions } from '../shared/gb-lookups';

/** an icon per reason; out of reach and unknown stay words */
export const reachCell = (reasons: Reach[]) => {
  const [first] = reasons;
  return first === 'none' || first === 'unknown'
    ? t(`investments.reach.${first}`)
    : reasons.map((reason) => RELATION_ICONS[reason as keyof typeof RELATION_ICONS]);
};

/** one toggle per reason, any switched on lets a row through */
export const reachFilter = (reach: ReachFilter, set: (reach: ReachFilter) => void) =>
  relationToggles(
    'inv-reach-filter',
    reach,
    (key) => t(key === 'none' ? 'investments.reachHint.none' : `investments.reach.${key}`),
    set,
  );

/** the player field names this owner exactly, in any case; the field is the only state, a part of a name marks nothing */
const picks = (field: string, name: string) => sameName(field.trim(), name);

/** shown on row hover or focus (styles), always and in the accent while the player field names this owner; then a click
 * empties the field */
const pickButton = (name: string, picked: boolean, pick: (name: string) => void) => {
  const word = t(picked ? 'investments.filter.unpickPlayer' : 'investments.filter.pickPlayer');
  return toggleButton('inv-pick', picked, word, picked ? headerIcons.funnelFilled : headerIcons.funnel, () =>
    pick(picked ? '' : name),
  );
};

/** what a row says about its owner */
interface OwnerCellRow {
  owner: PlayerId;
  ownerName: string;
  ownerUrl: string;
  ownerMarked: boolean;
  /** missing for an owner the player store does not know, who cannot be ignored */
  ownerIgnored?: boolean;
}

interface OwnerCellActions extends Pick<GbRowActions, 'ignorePlayer' | 'markPlayer'> {
  /** put the owner's name into the "Spieler" filter, as if typed */
  pickPlayer(name: string): void;
}

/**
 * The owner: link, then at the right edge the star, the closed eye and the funnel. Star and eye only for a player the
 * store knows. All keep their place in every row, so the mouse can run straight down the column.
 */
export const ownerCell = (r: OwnerCellRow, playerField: string, actions: OwnerCellActions) =>
  html`<td class="name-cell" data-tip=${r.ownerName}><span class="row-name">${externalLink(r.ownerName, r.ownerUrl)}${ownerMarks(
    r.ownerIgnored === undefined ? {} : { ownerMarked: r.ownerMarked, ownerIgnored: r.ownerIgnored },
    (marked) => actions.markPlayer(r.owner, marked),
    (ignored) => actions.ignorePlayer(r.owner, ignored),
  )}${pickButton(r.ownerName, picks(playerField, r.ownerName), actions.pickPlayer)}</span></td>`;
