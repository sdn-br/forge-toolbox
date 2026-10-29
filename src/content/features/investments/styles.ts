// The look of the investments box, both tabs.
export const investmentsCss = `
/* investments: fixed columns so heads show whole; owner and building names give way */
.inv-table { table-layout: fixed; }
/* the box can be resized: the fixed columns plus at least 122 px for the owner (name, star, eye, funnel) and 116 px for
   the building (name, eye), "Meine" 506 + 238 px, "Mögliche" 594 + 238 px; narrower, the box scrolls sideways instead of squeezing the
   names to nothing. debt: the sums are kept by hand. ceiling: a changed column width makes them stale.
   upgrade: compute them from the column widths once those live in one place */
.inv-table { min-width: 744px; }
.inv-table.inv-possible { min-width: 832px; }
.inv-table .c-mark { width: 34px; }
.inv-table .c-level, .inv-table .c-rank { width: 56px; }
.inv-table .c-deposit { width: 90px; }
.inv-table .c-profit { width: 64px; }
.inv-table .c-status { width: 32px; }
.inv-table .c-progress { width: 104px; }
.inv-table .c-reach { width: 70px; }
.inv-table :is(.icon-head, .inv-status, .snipe-tier, .mark-cell) { text-align: center; padding: 0; }
.inv-table .inv-status svg { display: block; width: 14px; height: 14px; margin: auto; }
.inv-table .icon-head svg { display: inline-block; width: 14px; height: 14px; vertical-align: middle; }
.inv-table .icon-head { white-space: nowrap; }
td.inv-status.safe { color: var(--good); }
td.inv-status.unsafe { color: var(--warn); }
td.inv-status.unknown { color: var(--muted); }
.inv-table tr.grown { background: rgba(220, 190, 60, .24); }
.inv-possible .c-progress { width: 92px; }
.inv-possible .c-share { width: 50px; }
.inv-possible .c-cost { width: 68px; }
.inv-possible .c-gain { width: 64px; }
.inv-possible .c-tier { width: 32px; }
.inv-possible .c-seen { width: 72px; }
/* the head left, over the icons of the cells */
.inv-table th.icon-head.inv-reach { text-align: left; padding: 0 0 0 4px; }
.inv-reach svg { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: 3px; }
.inv-possible td { overflow: hidden; text-overflow: ellipsis; }
/* investments: the body does not scroll, the pane fills it. The table area holds as many rows as fit (ui/fit-rows.ts),
   the two buttons beside it scroll them, and the area itself scrolls only sideways when the box is narrower than the table */
.body:has(> .inv-pane) { display: flex; flex-direction: column; overflow: hidden; }
.inv-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.inv-pane > :not(.inv-win) { flex: none; }
.inv-win { flex: 1 1 auto; min-height: 0; }
.inv-win .win-area { overflow-x: auto; overflow-y: hidden; }
.inv-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.inv-filter input[type=search] { width: 10em; }
.inv-count { margin-left: auto; }
/* the profit icon keeps its own colours, switched on it only turns opaque */
.inv-hits-filter button.on { color: var(--ink); }
/* always at the right edge of the column, so the mouse can run straight down it; hidden until the row is hovered */
button.inv-pick { all: unset; cursor: pointer; flex: none; display: grid; place-items: center; width: 16px; height: 16px; margin-left: auto; opacity: 0; color: var(--ink); }
tr:is(:hover, :has(:focus-visible)) button.inv-pick { opacity: .7; }
tr button.inv-pick:is(:hover, :focus-visible), button.inv-pick.on { opacity: 1; color: var(--accent); }
.inv-ignored-total svg { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; }
button.inv-pick svg { display: block; width: 12px; height: 12px; }
.inv-mine .fp-line { height: 11px; }
.gb-me-line { display: block; }
.gb-me .profit-icon { color: var(--ink); }
.gb-me .profit-icon svg { width: 14px; height: 14px; vertical-align: -2px; }
`;
