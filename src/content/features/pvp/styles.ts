// The look of the PvP box: the pane that fills the box, the tables with their fixed columns, the rows and their markers,
// the side panel with the selected battle.

/** widths in px of the fixed columns; opponent and kind take the rest */
const NOTE = 22;
const WHEN = 96;
const RESULT = 24;
const LOOT = 24;
const BATTLE = 80;
const INCOMING_WHEN = 110;
/** the least room for the opponent: name, two PvP marks, funnel */
const NAME = 130;
/** the least room for the kind of an attack on the own city */
const KIND = 150;
/** the result of an arena line: the icon of an attack or the word of a defense */
const ARENA_RESULT = 84;
/** the block of the opponents on offer: difficulty word, percent boosts "11.674 %", record "12:3" */
const OFFER_DIFFICULTY = 56;
const OFFER_NUM = 64;
const OFFER_RECORD = 48;
/** signed arena points, "+12.345" */
const POINTS = 64;

/** the least width of the battles table; the box is that wide plus its padding and the two scroll buttons */
export const BATTLES_MIN_WIDTH = NOTE + NAME + WHEN + RESULT + LOOT + BATTLE;

export const pvpCss = `
/* the list and, popped out, the side panel in a row; docked the panel hangs out of the box (ui/side-drawer.ts) */
.pvp-layout { display: flex; align-items: stretch; gap: 6px; }
/* tabs, filters, note card and totals, then the table area with a fixed number of rows (VISIBLE_ROWS); the two
   buttons beside it scroll them */
.pvp-pane { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.pvp-pane > :not(.pvp-win) { flex: none; }
.pvp-win { flex: 1 1 auto; min-height: 0; }
.pvp-win .win-area { overflow-x: auto; overflow-y: hidden; }
.pvp-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pvp-filter input[type=search] { width: 10em; }
/* fixed columns so the table keeps its width while the window moves; one line per row, so every row is equally tall
   and the window counts them right */
.pvp-table { table-layout: fixed; }
.pvp-battles { min-width: ${BATTLES_MIN_WIDTH}px; }
.pvp-incoming { min-width: ${NOTE + NAME + INCOMING_WHEN + KIND}px; }
.pvp-arena { min-width: ${NOTE + NAME + WHEN + ARENA_RESULT + POINTS}px; }
.pvp-arena.pvp-defenses { min-width: ${NOTE + NAME + WHEN + POINTS}px; }
/* the block "Gegner jetzt": a small table of its own above the list, a row of a player marked as not to attack warns */
.pvp-offers-title { margin: 4px 0 2px; font-size: 12px; }
.pvp-offers { min-width: ${NAME + OFFER_DIFFICULTY + 3 * OFFER_NUM + OFFER_RECORD}px; margin-bottom: 6px; }
.pvp-table .c-offer-difficulty { width: ${OFFER_DIFFICULTY}px; }
.pvp-table .c-offer-num { width: ${OFFER_NUM}px; }
.pvp-table .c-offer-record { width: ${OFFER_RECORD}px; }
.pvp-offers tr.warn { background: var(--row-warn); }
.pvp-offers .pvp-record { text-align: right; }
/* the second tab row of the arena, the same faces a size smaller */
.tabs.sub { margin-bottom: 6px; }
.tabs.sub button { font-size: 12px; padding: 1px 8px; &.active { padding-top: 0; } }
.pvp-table > * > tr > :is(td, th) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pvp-table .c-note { width: ${NOTE}px; }
.pvp-table:is(.pvp-battles, .pvp-arena) .c-when { width: ${WHEN}px; }
.pvp-incoming .c-when { width: ${INCOMING_WHEN}px; }
.pvp-table .c-result { width: ${RESULT}px; }
.pvp-table .c-loot { width: ${LOOT}px; }
.pvp-table .c-battle { width: ${BATTLE}px; }
.pvp-table .c-arena-result { width: ${ARENA_RESULT}px; }
.pvp-table .c-points { width: ${POINTS}px; }
.pvp-table .pvp-points { text-align: right; }
/* the arena points in the colours of good and bad, a defense muted */
td.pvp-points.good { color: var(--good); }
td.pvp-points.bad { color: var(--bad); }
.pvp-table .pvp-loot, .pvp-table .pvp-result { text-align: center; padding: 0; }
.pvp-result svg { display: block; width: 14px; height: 14px; margin: auto; }
/* the result in the colours of good and bad, a battle given up muted */
:is(td.pvp-result, .pvp-outcome).won { color: var(--good); }
:is(td.pvp-result, .pvp-outcome).lost { color: var(--bad); }
:is(td.pvp-result, .pvp-outcome).surrendered { color: var(--muted); }
.pvp-outcome svg { width: 14px; height: 14px; vertical-align: -2px; }
.pvp-loot svg { display: block; width: 14px; height: 14px; margin: auto; }
.pvp-drawer h2:first-child { margin-top: 2px; }
.pvp-drawer p { margin: 2px 0; }
button.marker { all: unset; cursor: pointer; }
button.marker svg { display: block; width: 14px; height: 14px; }
tr.battle-row { cursor: pointer; }
tr.battle-row:hover { background: var(--row-selected); }
/* the battle the side panel shows, marked like a picked row in the box "Besuchte Stadt" */
tr.battle-row.selected { background: var(--row-selected); box-shadow: inset 3px 0 var(--accent); }
button.marker.dim { opacity: .3; }
/* the history of the arena points in the side panel: the chart in the palette, hover areas without a face */
.pvp-chart { display: block; width: 100%; height: auto; margin: 4px 0 8px; }
.pvp-chart .grid { stroke: var(--line); stroke-width: 1; }
.pvp-chart .axis { fill: var(--muted); font-size: 9px; }
.pvp-chart .line { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.pvp-chart .mark rect { fill: transparent; }
.pvp-chart .mark circle { fill: var(--accent); opacity: 0; pointer-events: none; }
.pvp-chart .mark:hover circle { opacity: 1; }
.pvp-history { width: 100%; }
.pvp-history .num { text-align: right; white-space: nowrap; }
.pvp-history td.pvp-points.good { color: var(--good); }
.pvp-history td.pvp-points.bad { color: var(--bad); }
.pvp-history-button.on { color: var(--accent); border-color: var(--accent); }
`;
