// The relations to another player as icons (neighbour, friend, guild member), and a toggle group that filters by them.
import type { TemplateResult } from 'lit-html';
import type { Relations } from '../../shared/model';
import { REACH_TOGGLES, type ReachFilter, reasonsOf } from '../domain/reach';
import { toggleGroup } from './buttons';
import { headerIcons } from './icons';

export const RELATION_ICONS: Record<keyof Relations, TemplateResult> = {
  neighbor: headerIcons.neighbor,
  friend: headerIcons.friend,
  guildMember: headerIcons.guild,
};

const TOGGLE_ICONS: Record<keyof ReachFilter, TemplateResult> = { ...RELATION_ICONS, none: headerIcons.notReachable };

/** an icon per relation the player has, in the fixed order; none without any or for an unknown player */
export const relationIcons = (relations: Relations | undefined): TemplateResult[] =>
  reasonsOf(relations).flatMap((r) => (r === 'none' || r === 'unknown' ? [] : [RELATION_ICONS[r]]));

/** one toggle per relation and one for none, each with its icon; `cls` names the group for the styles */
export const relationToggles = (
  cls: string,
  filter: ReachFilter,
  word: (key: keyof ReachFilter) => string,
  set: (filter: ReachFilter) => void,
) => toggleGroup(cls, REACH_TOGGLES, filter, word, (key) => TOGGLE_ICONS[key], set);
