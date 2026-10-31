// The look of the GB calculator box and its snipe list.
export const gbCalculatorCss = `
.gb-places { position: relative; min-height: 60px; }
hr.snipe-sep { border: 0; border-top: 1px solid var(--line); margin: 6px 0; }
/* the calculator warns above its header while the building or its owner is ignored; the button lifts it */
p.ignore-warning { display: flex; align-items: center; gap: 6px; }
.ignore-warning .warn-icon svg { display: block; width: 14px; height: 14px; }
/* snipe list: fixed columns so heads show whole; only the building name gives way. The widths of the columns it shares
   with the investments are in ui/snipe-hit.ts; "# ▾2" measured 31 px */
.snipe-table { table-layout: fixed; }
.snipe-table .c-order { width: 32px; }
.snipe-table .snipe-tier, .snipe-table th.tier-head { text-align: center; padding: 0; }
.snipe-counts .ignored-filter { margin-left: 6px; vertical-align: middle; }
.gb-progress { margin: 0 0 6px; }
/* one row per place, coloured by what the place is worth */
tr.gb-profit { background: var(--row-good); }
tr.gb-loss { background: var(--row-bad); }
tr.gb-levelWarning { background: var(--row-warn); }
tr.gb-mine { background: var(--row-mine); }
td.over-rest { color: var(--bad); }
/* the circled check where a place is safe, in the cell and after "sicher" in the own line */
td.secured svg, .gb-me .secured-icon svg { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; }
td.below-safe { font-style: italic; opacity: .75; }
.gb-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 8px;
  background: rgba(43, 29, 16, .88); text-align: center; color: var(--accent); }
`;
