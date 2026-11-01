// What the box needs of each tab: the tabs in order, the view model each builds and how a tab loads a slice of its rows.
import type { PlayerId } from '../../../shared/ids';
import type { BattleSummary, BattleWithPlunder, IncomingTotals } from '../../../shared/model';
import type { BattlesVm } from './battles/view-model';
import type { IncomingVm } from './incoming/view-model';
import type { PvpTab, ViewInput } from './rows';

export const TABS: PvpTab[] = ['battles', 'incoming'];

export type PvpVm = BattlesVm | IncomingVm;

/** the tab's view model from what it loaded; building it again reads nothing */
export type BuildVm = (input: ViewInput) => PvpVm;

/** what the filter asks the store for */
export interface PvpQuery {
  /** undefined means all, an empty list none */
  opponents?: PlayerId[];
  /** only battles with a plunder; the attacks on the own city ignore it */
  withPlunder: boolean;
}

/** the totals of a tab, which also give its number of rows */
export type Totals = BattleSummary | IncomingTotals;

/** what a tab read */
export interface Loaded {
  build: BuildVm;
  /** the totals the slice was built with, read or handed in */
  totals: Totals;
  /** the battles read, for the side panel; none on the attacks on the own city */
  battles: BattleWithPlunder[];
}

export interface PvpSection {
  /**
   * Reads what the tab shows: `limit` rows from `offset` and its totals, which also give the number of rows. `totals`
   * of the same query and tab are used instead of reading them again, for a slice read while scrolling.
   */
  load(query: PvpQuery, offset: number, limit: number, totals?: Totals): Promise<Loaded>;
}
