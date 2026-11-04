// Where the game's contribution row of a great building window lies, for the bars that cover it.
// debt: the place of the buttons is measured, not read. ceiling: a game update that moves the contribution row moves
// it out from under the cover; and on the tab "Übersicht" the cover lies over whatever is there. upgrade: measure
// again, or read the row bounds from the engine.
export const contributionRowCss = `
  position: fixed; box-sizing: border-box;
  /* the window's top edge T is 275 px above the middle, but not above 40 px. The row (buttons 1, 10, amount field and
     its FP button) lies T + 199 px to T + 225 px, 302 px left to 307 px right of the middle. Cover it with a margin of
     5 px above and below and 6 px at the sides: top T + 194 px, height 36 px, left 308 px, width 621 px. */
  top: calc(max(40px, 50vh - 275px) + 194px); left: calc(50vw - 308px); width: 621px; height: 36px;`;
