// The owner of a great building or a list (LG-Rechner, snipe helper): the name with the foestats page, the guild, the
// star and the closed eye beside it while the player store knows the owner.
import { html } from 'lit-html';
import type { PlayerId } from '../../shared/ids';
import { t } from '../core/texts';
import { ignoreButton } from './ignore';
import { externalLink, guildTag } from './links';
import { starButton } from './star';

/** the owner line: the name with the foestats page, the guild, the star and the eye only for a player the store knows */
export interface OwnerVm {
  owner: string;
  /** the owner's page at foestats */
  ownerUrl: string;
  /** the owner's guild with its page at foestats; missing for an owner without a guild or with an unknown one */
  ownerGuild?: { name: string; url: string };
  /** the player put a star on the owner; missing when the player store does not know the owner */
  ownerMarked?: boolean;
  /** the player ignores the owner; missing when the player store does not know the owner */
  ownerIgnored?: boolean;
}

/** what the owner line looks up about a player */
export interface OwnerLookups {
  /** a player's page at foestats */
  playerUrl(id: PlayerId): string;
  /** a player's guild with its page at foestats; undefined for a player without a guild or with an unknown one */
  playerGuild(id: PlayerId): { name: string; url: string } | undefined;
  /** whether the owner carries a star; undefined for a player the store does not know */
  playerMarked(id: PlayerId): boolean | undefined;
  /** whether the owner is ignored; undefined for a player the store does not know */
  ownerIgnored(id: PlayerId): boolean | undefined;
}

export const ownerVm = (lookups: OwnerLookups, id: PlayerId, owner: string): OwnerVm => {
  const ownerMarked = lookups.playerMarked(id);
  const ownerIgnored = lookups.ownerIgnored(id);
  const ownerGuild = lookups.playerGuild(id);
  return {
    owner,
    ownerUrl: lookups.playerUrl(id),
    ...(ownerGuild && { ownerGuild }),
    ...(ownerMarked !== undefined && { ownerMarked }),
    ...(ownerIgnored !== undefined && { ownerIgnored }),
  };
};

/** the star and the closed eye of an owner, each only while the player store knows the owner */
export const ownerMarks = (
  o: { ownerMarked?: boolean; ownerIgnored?: boolean },
  toggleMark: (marked: boolean) => void,
  toggleIgnore: (ignored: boolean) => void,
) =>
  html`${o.ownerMarked === undefined ? '' : starButton(o.ownerMarked, () => toggleMark(!o.ownerMarked))}${
    o.ownerIgnored === undefined ? '' : ignoreButton('player', o.ownerIgnored, () => toggleIgnore(!o.ownerIgnored))
  }`;

/** the owner with the guild, a star and the closed eye beside it while the player store knows them */
export const ownerOf = (o: OwnerVm, toggleMark: (marked: boolean) => void, toggleIgnore: (ignored: boolean) => void) =>
  html`<span class="gb-owner">${t('gbCalc.ownerLabel')}: ${externalLink(o.owner, o.ownerUrl)}${
    o.ownerGuild ? html` ${guildTag(o.ownerGuild)}` : ''
  }${o.ownerMarked === undefined ? '' : ' '}${ownerMarks(o, toggleMark, toggleIgnore)}</span>`;
