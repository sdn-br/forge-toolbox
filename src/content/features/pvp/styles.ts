// The look of the PvP box: the pane that fills the box, the tables with their fixed columns, the rows and their markers.

/** widths in px of the fixed columns; opponent and kind take the rest */
const NOTE = 22;
const WHEN = 135;
const RESULT = 76;
const LOOT = 24;
const BATTLE = 80;
const ARMY = 80;
const INCOMING_WHEN = 110;
/** the least room for the opponent: name, two PvP marks, funnel */
const NAME = 130;
/** the least room for the kind of an attack on the own city */
const KIND = 150;

/** the least width of the battles table; the box is that wide plus its padding and the two scroll buttons */
export const BATTLES_MIN_WIDTH = NOTE + NAME + WHEN + RESULT + LOOT + BATTLE + 2 * ARMY;

export const pvpCss = `
/* the pane fills the body (BoxOptions.fill): tabs, filters, note card and totals stay, the table area holds as many
   rows as fit (ui/fit-rows.ts), the two buttons beside it scroll them, sideways the area scrolls when the box is
   narrower than the table */
.pvp-pane { display: flex; flex-direction: column; }
.pvp-pane > :not(.pvp-win) { flex: none; }
.pvp-win { flex: 1 1 auto; min-height: 0; }
.pvp-win .win-area { overflow-x: auto; overflow-y: hidden; }
.pvp-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pvp-filter input[type=search] { width: 10em; }
/* fixed columns so the table keeps its width while the window moves; one line per row, so every row is equally tall
   and the window counts them right. The details of a battle wrap */
.pvp-table { table-layout: fixed; }
.pvp-battles { min-width: ${BATTLES_MIN_WIDTH}px; }
.pvp-incoming { min-width: ${NOTE + NAME + INCOMING_WHEN + KIND}px; }
.pvp-table > * > tr > :is(td, th) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pvp-table > tbody > tr.details > td { white-space: normal; overflow: visible; }
.pvp-table .c-note { width: ${NOTE}px; }
.pvp-battles .c-when { width: ${WHEN}px; }
.pvp-incoming .c-when { width: ${INCOMING_WHEN}px; }
.pvp-table .c-result { width: ${RESULT}px; }
.pvp-table .c-loot { width: ${LOOT}px; }
.pvp-table .c-battle { width: ${BATTLE}px; }
.pvp-table .c-army { width: ${ARMY}px; }
.pvp-table .pvp-loot { text-align: center; padding: 0; }
.pvp-loot svg { display: block; width: 14px; height: 14px; margin: auto; }
.pvp-plunder { margin: 4px 0; }
button.marker { all: unset; cursor: pointer; }
button.marker svg { display: block; width: 14px; height: 14px; }
tr.battle-row { cursor: pointer; }
tr.battle-row.expanded, tr.details { background: var(--row-selected); }
button.marker.dim { opacity: .3; }
`;
