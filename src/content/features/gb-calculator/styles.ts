// The look of the GB calculator box and its snipe list.
export const gbCalculatorCss = `
.spinner { display: inline-block; width: .8em; height: .8em; vertical-align: -.1em; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.gb-places { position: relative; min-height: 60px; }
hr.snipe-sep { border: 0; border-top: 1px solid var(--line); margin: 6px 0; }
/* the calculator warns above its header while the building or its owner is ignored; the button lifts it */
p.ignore-warning { display: flex; align-items: center; gap: 6px; }
.ignore-warning .warn-icon svg { display: block; width: 14px; height: 14px; }
/* snipe list: fixed columns so heads show whole; only the building name gives way */
.snipe-table { table-layout: fixed; }
/* "# ▾2" measured 31 px */
.snipe-table .c-order { width: 32px; }
/* sortable heads fit their word, the arrow and a level number (measured: "Stufe ▾2" 56 px, "Einsatz ▾2" 67 px) */
.snipe-table .c-level, .snipe-table .c-rank { width: 56px; }
/* measured: "8.371 / 11.122" 83 px, the head "Fortschritt ▾2" 88 px, room up to "19.999 / 24.000" */
.snipe-table .c-progress { width: 96px; }
.snipe-table .c-cost { width: 68px; }
/* the best case only, "≈ +12.345" at most; the range is in the tooltip */
.snipe-table .c-profit { width: 64px; }
/* icon heads: icon, arrow and level number 29 px */
.snipe-table .c-tier { width: 32px; }
/* the star head with arrow and level number needs 29 px plus 4 px padding */
.snipe-table .c-mark { width: 34px; }
.snipe-table .snipe-tier, .snipe-table th.icon-head:not(.num, .mark-cell) { text-align: center; padding: 0; }
.snipe-counts .ignored-filter { margin-left: 6px; vertical-align: middle; }
.gb-progress { margin: 0 0 6px; }
/* one row per place, coloured by what the place is worth */
tr.gb-profit { background: rgba(90, 170, 90, .28); }
tr.gb-loss { background: rgba(200, 80, 60, .28); }
tr.gb-levelWarning { background: rgba(220, 190, 60, .24); }
tr.gb-mine { background: rgba(80, 140, 220, .32); }
td.over-rest { color: #e08070; }
td.below-safe { font-style: italic; opacity: .75; }
.gb-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 8px;
  background: rgba(43, 29, 16, .88); text-align: center; color: var(--accent); }
`;
