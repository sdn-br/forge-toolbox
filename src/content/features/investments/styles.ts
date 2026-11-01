// The look of the investments box, both tabs.
import { HIT_COLUMN_WIDTHS as hit } from '../../ui/snipe-hit';

/** widths in px of the columns only the investments have; the shared ones are in ui/snipe-hit.ts */
const REACH = 70;
const MINE_PROGRESS = 104;
const DEPOSIT = 90;
const SHARE = 50;
const SEEN = 72;
/** the least room for the names: 122 px for the owner (name, star, eye, funnel), 116 px for the building (name, eye) */
const NAMES = 122 + 116;
const MINE_FIXED = hit.mark + REACH + hit.level + MINE_PROGRESS + hit.rank + DEPOSIT + hit.profit + hit.icon;
const POSSIBLE_FIXED =
  hit.mark + REACH + hit.level + hit.progress + SHARE + hit.rank + hit.cost + hit.profit + hit.icon + SEEN;

export const investmentsCss = `
/* investments: fixed columns so heads show whole; owner and building names give way. The box can be resized: the
   fixed columns plus the least room for the names; narrower, the box scrolls sideways instead of squeezing the names
   to nothing */
.inv-table { table-layout: fixed; min-width: ${MINE_FIXED + NAMES}px; }
.inv-table.inv-possible { min-width: ${POSSIBLE_FIXED + NAMES}px; }
.inv-table .c-reach { width: ${REACH}px; }
.inv-mine .c-progress { width: ${MINE_PROGRESS}px; }
.inv-table .c-deposit { width: ${DEPOSIT}px; }
.inv-possible .c-share { width: ${SHARE}px; }
.inv-possible .c-seen { width: ${SEEN}px; }
.inv-table :is(.icon-head, .inv-status, .snipe-tier) { text-align: center; padding: 0; }
.inv-table .icon-head { white-space: nowrap; }
td.inv-status.safe { color: var(--good); }
td.inv-status.unsafe { color: var(--warn); }
td.inv-status.unknown { color: var(--muted); }
.inv-table tr.grown { background: var(--row-warn); }
/* the head left, over the icons of the cells */
.inv-table th.icon-head.inv-reach { text-align: left; padding: 0 0 0 4px; }
.inv-reach svg { display: inline-block; margin-right: 3px; }
.inv-possible td { overflow: hidden; text-overflow: ellipsis; }
/* investments: the pane fills the body (BoxOptions.fill). The table area holds as many rows as fit (ui/fit-rows.ts),
   the two buttons beside it scroll them, and the area itself scrolls only sideways when the box is narrower than the table */
.inv-pane { display: flex; flex-direction: column; }
.inv-pane > :not(.inv-win) { flex: none; }
.inv-win { flex: 1 1 auto; min-height: 0; }
.inv-win .win-area { overflow-x: auto; overflow-y: hidden; }
.inv-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.inv-filter input[type=search] { width: 10em; }
.inv-count { margin-left: auto; }
/* the profit icon keeps its own colours, switched on it only turns opaque */
.inv-hits-filter button.on { color: var(--ink); }
.inv-ignored-total svg { display: inline-block; }
/* both tabs show a growth beside the bar: the bar line keeps its height without one, so every row is equally tall and
   the row window counts them right */
.inv-table .fp-line { height: 11px; }
.gb-me-line { display: block; }
.gb-me .profit-icon { color: var(--ink); }
`;
