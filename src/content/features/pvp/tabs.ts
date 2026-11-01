// What the box needs of each tab: the tabs in order, the view model each builds and how a tab loads a slice of its rows.
import type { PlayerId } from '../../../shared/ids';
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

export interface PvpSection {
  /** Reads what the tab shows: its totals, which also give the number of rows, and `limit` rows from `offset`. */
  load(query: PvpQuery, offset: number, limit: number): Promise<BuildVm>;
}
