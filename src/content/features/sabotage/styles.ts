// The look of the Besuchte Stadt box: the head with its tabs and the plunder rows.
export const sabotageCss = `
/* head and tab bar stay on top of the one scrolling body; the body's padding (6px 8px) is taken back by the margin */
.visit-top { position: sticky; top: -6px; z-index: 2; margin: -6px -8px 0; padding: 6px 8px 0; background: var(--bg); }
.visit-top p { margin: 0 0 4px; }
/* the invitation icon in the box of the PvP mark buttons beside it, so all icons share one middle */
.visit-name .rel-icons { display: inline-grid; place-items: center; width: 18px; height: 18px; vertical-align: middle; }
.visit-name .rel-icons svg { display: block; margin: 0; }
.visit-name { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; }
button.note-icon { all: unset; cursor: pointer; flex: none; width: 18px; height: 18px; display: grid; place-items: center;
  color: var(--accent); }
button.note-icon svg { display: block; width: 16px; height: 16px; }
button.note-icon.empty { color: var(--ink); opacity: .35; }
button.note-icon:hover, button.note-icon:focus-visible, button.note-icon[aria-pressed=true] { opacity: 1; }
button.note-icon:focus-visible { box-shadow: 0 0 0 1px var(--accent); }
.tabs button .count { margin-left: 4px; font-size: 11px; vertical-align: middle; }
.tabs button { display: inline-flex; align-items: center; }
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
