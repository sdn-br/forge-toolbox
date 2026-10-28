// The filter pieces both investment tabs draw: text fields, icon toggles, the star filter, the funnel beside an owner.
import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { t } from '../../core/texts';
import { filterToggle, toggleButton, toggleGroup } from '../../ui/buttons';
import { headerIcons } from '../../ui/icons';
import { ignoreButton } from '../../ui/ignore';
import { keepKeys } from '../../ui/inputs';
import { externalLink } from '../../ui/links';
import { starButton } from '../../ui/star';
import { picks, REACH_TOGGLES, type Reach, type ReachFilter } from './filter-model';

export const REACH_ICONS: Partial<Record<Reach, TemplateResult>> = {
  neighbor: headerIcons.neighbor,
  friend: headerIcons.friend,
  guildMember: headerIcons.guild,
};

/** an icon per reason; out of reach and unknown stay words */
export const reachCell = (reach: Reach, reasons: Reach[]) =>
  reach === 'none' || reach === 'unknown'
    ? t(`investments.reach.${reach}`)
    : reasons.map((reason) => REACH_ICONS[reason]);

export const text = (value: string, label: string, set: (value: string) => void) =>
  html`<input type="search" placeholder=${label} aria-label=${label} .value=${value}
    @input=${(e: Event) => set((e.target as HTMLInputElement).value)}
    @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />`;

const REACH_FILTER_ICONS = { ...REACH_ICONS, none: headerIcons.notReachable } as Record<
  keyof ReachFilter,
  TemplateResult
>;

/** one toggle per reason, any switched on lets a row through */
export const reachFilter = (reach: ReachFilter, set: (reach: ReachFilter) => void) =>
  toggleGroup(
    'inv-reach-filter',
    REACH_TOGGLES,
    reach,
    (key) => t(key === 'none' ? 'investments.reachHint.none' : `investments.reach.${key}`),
    (key) => REACH_FILTER_ICONS[key],
    set,
  );

/** a toggle with the star: only marked buildings and buildings of marked owners */
export const markedFilter = (onlyMarked: boolean, set: (onlyMarked: boolean) => void) =>
  filterToggle('inv-marked-filter', onlyMarked, t('investments.possible.onlyMarked'), headerIcons.starFilled, set);

/** shown on row hover or focus (styles), always and in the accent while the player field names this owner; then a click
 * empties the field */
export const pickButton = (name: string, picked: boolean, pick: (name: string) => void) => {
  const word = t(picked ? 'investments.possible.unpickPlayer' : 'investments.possible.pickPlayer');
  return toggleButton('inv-pick', picked, word, picked ? headerIcons.funnelFilled : headerIcons.funnel, () =>
    pick(picked ? '' : name),
  );
};

/** what a row says about its owner */
export interface OwnerCellRow {
  owner: PlayerId;
  ownerName: string;
  ownerUrl: string;
  ownerMarked: boolean;
  /** missing for an owner the player store does not know, who cannot be ignored */
  ownerIgnored?: boolean;
}

export interface OwnerCellActions {
  /** put the owner's name into the "Spieler" filter, as if typed */
  pickPlayer(name: string): void;
  ignorePlayer(owner: PlayerId, ignored: boolean): void;
  markPlayer(owner: PlayerId, marked: boolean): void;
}

/**
 * The owner: link, then at the right edge the star, the closed eye and the funnel. Star and eye only for a player the
 * store knows. All keep their place in every row, so the mouse can run straight down the column.
 */
export const ownerCell = (r: OwnerCellRow, playerField: string, actions: OwnerCellActions) =>
  html`<td class="inv-name" data-tip=${r.ownerName}><span class="inv-owner">${externalLink(r.ownerName, r.ownerUrl)}${
    r.ownerIgnored === undefined
      ? ''
      : html`${starButton(r.ownerMarked, () => actions.markPlayer(r.owner, !r.ownerMarked))}${ignoreButton('player', r.ownerIgnored, () => actions.ignorePlayer(r.owner, !r.ownerIgnored))}`
  }${pickButton(r.ownerName, picks(playerField, r.ownerName), actions.pickPlayer)}</span></td>`;
