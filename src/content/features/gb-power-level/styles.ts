// The look of the Powerleveln box.
export const powerLevelCss = `
/* the Powerleveln table: fixed columns as well, the current level marked, locked levels dimmed */
table.power-level { table-layout: fixed; width: auto; }
table.power-level th, table.power-level td { overflow: hidden; text-overflow: ellipsis; }
table.power-level tr.current td { background: rgba(80, 140, 220, .22); }
table.power-level tr.locked { color: #8a7a60; }
table.power-level tr.total td { font-weight: 600; }
.gb-levels input.span { width: 4.5em; }
`;
