// The funnel beside a name in a table row: it filters the table to that player.
import { t } from '../core/texts';
import { toggleButton } from './buttons';
import { headerIcons } from './icons';

/** shown on row hover or focus (styles), always and in the accent while the player field names this owner; then a click
 * empties the field */
export const pickButton = (name: string, picked: boolean, pick: (name: string) => void) => {
  const word = t(picked ? 'investments.filter.unpickPlayer' : 'investments.filter.pickPlayer');
  return toggleButton('inv-pick', picked, word, picked ? headerIcons.funnelFilled : headerIcons.funnel, () =>
    pick(picked ? '' : name),
  );
};
