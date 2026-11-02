// The look of the Besuchte Stadt box: the plunder rows.
export const sabotageCss = `
tr.plunder-row { cursor: pointer; }
tr.plunder-row:hover, tr.plunder-row:focus-visible { background: var(--row-selected); outline: none; }
/* the building's image left of its name and loot, faded with a muted row */
.plunder-table td { vertical-align: top; }
.plunder-table td.img { width: 72px; padding-right: 24px; vertical-align: middle; }
.plunder-table td.img img { display: block; width: 72px; height: auto; }
.plunder-table tr.muted td.img img { opacity: .5; }
/* the pin at the right edge shows whether the building carries it in the game: off in the text colour, on filled in
   the accent; the row keeps its colour */
.plunder-table td.mark { width: 22px; vertical-align: middle; }
.plunder-table td.mark svg { display: block; width: 16px; height: 16px; margin: 0 auto; color: var(--ink); }
.plunder-table tr.marked td.mark svg { color: var(--accent); }
`;
