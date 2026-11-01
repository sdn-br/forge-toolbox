// What the box needs of each tab: the tabs in order, the view model each builds and how a tab loads its page.
import type { PlayerId } from '../../../shared/ids';
import type { BattlesVm } from './battles/view-model';
import type { IncomingVm } from './incoming/view-model';
import type { PlundersVm } from './plunders/view-model';
import type { PvpTab, ViewInput } from './rows';

export const TABS: PvpTab[] = ['battles', 'plunders', 'incoming'];

export type PvpVm = BattlesVm | PlundersVm | IncomingVm;

/** the tab's view model from what it loaded; building it again reads nothing */
export type BuildVm = (input: ViewInput) => PvpVm;

export interface PvpSection {
  /**
   * Reads what the tab shows: its totals, then the rows of the page. `pageFor` gets the number of rows over all pages
   * and returns the page to read, so a page past the end falls back.
   */
  load(opponents: PlayerId[] | undefined, pageFor: (total: number) => number): Promise<BuildVm>;
}
