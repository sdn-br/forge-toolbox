// The look of the Besuchte Stadt box: the plunder rows.
export const sabotageCss = `
tr.plunder-row { cursor: pointer; }
tr.plunder-row:hover, tr.plunder-row:focus-visible { background: var(--row-selected); outline: none; }
/* the row whose building carries the arrow in the game */
tr.plunder-row.marked { background: var(--row-selected); box-shadow: inset 3px 0 var(--accent); }
`;
