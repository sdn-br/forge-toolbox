// The look of the Eigenanteil box.
export const ownShareCss = `
/* in a bar with its own gaps a text button takes no margin */
.power-open > button.action { margin: 0; }
tr.own-row td { background: #3a2814; }
td.own-fp, td.gain { color: var(--good); }
button.copy-fp { all: unset; cursor: pointer; }
button.copy-fp:hover { text-decoration: underline; }
/* the check that stands in for the number a moment after copying */
button.copy-fp svg { display: inline-block; width: 12px; height: 12px; vertical-align: -1px; }
/* the Eigenanteil table keeps its column widths (the colgroup) whatever the cells hold */
table.own-share { table-layout: fixed; width: auto; }
table.own-share th, table.own-share td { overflow: hidden; text-overflow: ellipsis; }
table.own-share .icon-cell { text-align: center; }
.own-share .marker { display: inline-flex; align-items: center; gap: 2px; vertical-align: middle; }
.own-share .marker svg { display: block; width: 14px; height: 14px; }
.own-share .marker.danger { color: #f07060; }
.own-share .marker.levels { color: var(--accent); }
.power-open { margin: 4px 0; }
.power-open button { display: inline-grid; place-items: center; padding: 3px 6px; }
.power-open button svg { display: block; width: auto; height: 22px; }
.copy-line { display: flex; gap: 4px; align-items: center; margin: 4px 0; }
.copy-line .copy-text { flex: 1; min-width: 0; }
.copy-line .copy-building { width: 7em; }
input.ext { width: 100%; min-width: 0; }
`;
