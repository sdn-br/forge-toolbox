// The two PvP marks of a player, separate from the star and the eye of the great buildings: good to plunder (a small
// star with a sack) and not to attack (a warning triangle with swords).
import { html } from 'lit-html';
import { t } from '../core/texts';
import { toggleButton } from './buttons';
import { headerIcons } from './icons';

/** a toggle button; the word is in the tooltip and the label, `aria-pressed` tells the state */
export const plunderButton = (on: boolean, toggle: () => void) =>
  toggleButton(
    'plunder',
    on,
    t(on ? 'pvpMark.plunder.remove' : 'pvpMark.plunder.add'),
    on ? headerIcons.plunderStarFilled : headerIcons.plunderStar,
    toggle,
  );

export const noAttackButton = (on: boolean, toggle: () => void) =>
  toggleButton(
    'no-attack',
    on,
    t(on ? 'pvpMark.noAttack.remove' : 'pvpMark.noAttack.add'),
    on ? headerIcons.noAttackOn : headerIcons.noAttack,
    toggle,
  );

/** the two PvP marks of a player, each only while the player store knows the player */
export const pvpMarks = (
  vm: { plunderWorthy?: boolean; noAttack?: boolean },
  togglePlunder: (value: boolean) => void,
  toggleNoAttack: (value: boolean) => void,
) =>
  html`${vm.plunderWorthy === undefined ? '' : plunderButton(vm.plunderWorthy, () => togglePlunder(!vm.plunderWorthy))}${
    vm.noAttack === undefined ? '' : noAttackButton(vm.noAttack, () => toggleNoAttack(!vm.noAttack))
  }`;
