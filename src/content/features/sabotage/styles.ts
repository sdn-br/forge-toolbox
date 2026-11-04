// The look of the Besuchte Stadt box: the head with its tabs and the plunder rows.
export const sabotageCss = `
/* The body does not scroll: the head and the tab bar stand above the content area. On Plündern it has the height of its
   content, so nothing scrolls there; the list reserves the room of five rows, so the box keeps its size with fewer. The
   Kampf tab gets the height measured on Plündern (inline), and scrolls natively without passing the scroll on at its
   ends. Both shrink when the box hits its max height. Popped out, the window decides: it fills. */
.body { display: flex; flex-direction: column; overflow: hidden; }
.visit-top { flex: none; }
.visit-content { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.box.popped .visit-content { height: auto !important; }
/* five rows of 76px and the line of hidden rows below them (about 21px) */
.plunder-list { min-height: 401px; }
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
/* Every row is 76px high: name and up to three loot lines in two columns (the row shows at most six items, the full text is the
   tooltip). The building's image sits in a 72 x 54 frame, scaled down to fit, so a tall image does not stretch the row. */
.plunder-table { table-layout: fixed; }
.plunder-table tr { height: 76px; }
.plunder-table td { vertical-align: middle; height: 76px; overflow: hidden; }
.plunder-table td.img { width: 96px; padding-right: 24px; }
.plunder-table td.img .frame { display: block; width: 72px; height: 54px; }
.plunder-table td.img img { display: block; width: 72px; height: 54px; object-fit: contain; object-position: center; }
.plunder-table tr.muted td.img img { opacity: .5; }
.plunder-table td.text { line-height: 1.4; }
.plunder-table .plunder-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* the loot fills the left column first, three items each */
.plunder-table .loot { display: grid; grid-template-rows: repeat(3, auto); grid-auto-flow: column; grid-auto-columns: 1fr;
  column-gap: 8px; }
.plunder-table .loot > div { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.plunder-table td.text > div { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
/* the pin at the right edge shows whether the building carries it in the game: off in the text colour, on filled in
   the accent; the row keeps its colour */
.plunder-table td.mark { width: 22px; }
.plunder-table td.mark svg { display: block; width: 16px; height: 16px; margin: 0 auto; color: var(--ink); }
.plunder-table tr.marked td.mark svg { color: var(--accent); }
`;
