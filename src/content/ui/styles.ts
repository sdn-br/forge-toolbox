// Shared look of all toolbox UI. Lives inside each shadow root, so game CSS and toolbox CSS never meet.
export const baseCss = `
:host { all: initial; --bg: #2b1d10; --ink: #fbf4e4; --accent: #e8861c; --btn: #4a3620; --btn-hover: #6a5030;
  --field: #1c130a; --line: #8a6a3a; color-scheme: dark; }
/* the accent parts of an icon */
.acc { color: var(--accent); }
* { box-sizing: border-box; }
.box { position: fixed; min-width: 260px; background: var(--bg); color: var(--ink);
  font: 12px/1.4 system-ui, sans-serif; border: 2px solid #8a6a3a; border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.box.popped { position: static; height: 100vh; border: 0; border-radius: 0; }
/* a box without the resize handle (capped): its height is capped (inline), the body scrolls beyond it; its width is the
   configured one, only the window caps it (box.ts). A box with the handle has the width it is given or resized to */
.box.tall, .box.popped, .box.capped { display: flex; flex-direction: column; }
.box.tall .body, .box.popped .body, .box.capped .body { flex: 1 1 auto; min-height: 0; max-height: none; }
.resize-handle { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize;
  touch-action: none; z-index: 1; background: linear-gradient(135deg, transparent 55%, #8a6a3a 55%, #8a6a3a 65%,
  transparent 65%, transparent 75%, #8a6a3a 75%, #8a6a3a 85%, transparent 85%); }
header { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; padding: 4px 6px; background: var(--btn);
  border-bottom: 1px solid #8a6a3a; cursor: move; user-select: none; touch-action: none; }
.box.pinned header, .box.popped header { cursor: default; }
header h1 { flex: 1; margin: 0; font-size: 13px; font-weight: 600; }
header button { all: unset; cursor: pointer; width: 20px; height: 20px; display: grid; place-items: center;
  color: var(--ink); opacity: .8; }
header button:hover { opacity: 1; }
header button.active { color: var(--accent); }
.body { padding: 6px 8px; max-height: 70vh; overflow: auto; }
.box.minimized .body { display: none; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 2px 4px; border-bottom: 1px solid #4a3620; text-align: left; }
td.num, th.num { text-align: right; }
.muted { color: #b8a27d; }
.warn { color: #f0a050; }
.error { color: #f07060; }
button.action { margin: 2px 4px 2px 0; }
/* text buttons in the box colours, like the fields; icon, header, menu and settings buttons have their own looks */
.gb-factor button:not(.icon), .gb-levels button:not(.icon), button.action, .map-tools button,
.stats-tab, .power-open button {
  font: inherit; cursor: pointer; color: var(--ink); background: var(--btn); border: 1px solid var(--line);
  border-radius: 3px; padding: 1px 6px;
  &:hover { background: var(--btn-hover); }
  &.active { border-color: var(--accent); font-weight: 600; }
  &:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  &:is(:disabled, [aria-disabled=true]) { cursor: default; background: var(--btn); }
  &:is(:disabled, [aria-disabled=true]):not(.active) { opacity: .5; }
}
/* a text button that carries an icon, alone or beside a word: the svg sits centred at 14px */
button.action.icon-only { display: inline-flex; align-items: center; justify-content: center; gap: 4px; }
button.action.icon-only svg { display: block; width: 14px; height: 14px; }
label { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
p.setting-hint { margin: 0 0 4px 22px; }
h2 { font-size: 12px; margin: 8px 0 4px; color: var(--accent); }
/* settings: a column of module icons, the chosen module beside it */
.settings-layout { display: flex; gap: 8px; align-items: flex-start; }
.settings-nav { flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; position: sticky; top: 0; }
.settings-nav button { all: unset; cursor: pointer; width: 28px; height: 28px; display: grid; place-items: center;
  font-size: 16px; border-radius: 4px; color: var(--ink); background: var(--btn); border-left: 3px solid transparent; }
.settings-nav button:hover, .settings-nav button.active { --btn: var(--btn-hover); }
.settings-nav button.active { border-left-color: var(--accent); }
.settings-nav svg { display: block; width: 20px; height: 20px; }
.settings-main { flex: 1; min-width: 0; }
.settings-main h2:first-child { margin-top: 2px; }
.settings-main h3 { font-size: 12px; margin: 10px 0 4px; color: #b8a27d; }
input, select, textarea { font: inherit; }
/* fields in the box colours: dark ground, light text, the frame brown, the accent on focus */
input:not([type=checkbox]):not([type=radio]), select, textarea { color: var(--ink); background: var(--field);
  border: 1px solid #8a6a3a; border-radius: 3px; padding: 1px 4px; }
input:not([type=checkbox]):not([type=radio]):focus, select:focus, textarea:focus { outline: none;
  border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
input::placeholder, textarea::placeholder { color: #b8a27d; opacity: .7; }
input[type=checkbox], input[type=radio] { accent-color: var(--accent); }
/* no spinner arrows: they take half of a narrow field, arrow keys still step */
input[type=number] { appearance: textfield; -moz-appearance: textfield; }
input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
input.num, input[type=number] { text-align: right; }
/* tabs: each with its own face, the active one opens into the box below it */
.tabs { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 2px; margin: 0 -8px 8px; padding: 0 8px;
  border-bottom: 1px solid var(--line); }
.tabs button { font: inherit; cursor: pointer; color: var(--ink); background: var(--btn); border: 1px solid var(--line);
  border-bottom: none; border-radius: 5px 5px 0 0; padding: 3px 10px; margin-bottom: -1px; opacity: .75;
  &:hover { background: var(--btn-hover); opacity: 1; }
  &.active { cursor: default; background: var(--bg); opacity: 1; font-weight: 600; border-top: 2px solid var(--accent);
    padding-top: 2px; }
  &:focus-visible { outline: none; box-shadow: 0 0 0 1px var(--accent); }
}
.split { display: flex; gap: 8px; align-items: flex-start; }
.split > .side { flex: 0 0 150px; min-width: 0; }
.split > .main { flex: 1; min-width: 0; }
ul.rows { list-style: none; margin: 4px 0; padding: 0; }
ul.rows li { padding: 2px 4px; cursor: pointer; border-bottom: 1px solid #4a3620; }
ul.rows li.active { background: var(--btn); }
ul.rows li.dragging { opacity: .4; }
.card { border: 1px solid #8a6a3a; border-radius: 4px; padding: 0 6px 4px; margin: 6px 0; }
.note { cursor: text; min-height: 2em; overflow-wrap: anywhere; }
.note h3, .note h4, .note h5 { margin: 6px 0 2px; color: var(--accent); }
.note h3 { font-size: 14px; } .note h4 { font-size: 13px; } .note h5 { font-size: 12px; }
.note p, .note ul, .note ol { margin: 2px 0; }
.note ul, .note ol { padding-left: 18px; }
.note a, a { color: var(--accent); }
a.ext-link { text-decoration: none; opacity: .6; }
a.ext-link:hover { opacity: 1; }
.spinner { display: inline-block; width: .8em; height: .8em; vertical-align: -.1em; border: 2px solid #8a6a3a; border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
.tip { position: fixed; z-index: 2147483647; max-width: 260px; padding: 3px 6px; background: #000d; color: var(--ink);
  font: 12px/1.4 system-ui, sans-serif; border: 1px solid #8a6a3a; border-radius: 4px; pointer-events: none;
  white-space: pre-line; }
.tip[hidden] { display: none; }
header button svg { display: block; width: 16px; height: 16px; }
@keyframes spin { to { transform: rotate(360deg); } }
textarea.note-input { width: 100%; min-height: 10em; resize: vertical; }
input.title { width: 100%; font-weight: 600; }
button.marker { all: unset; cursor: pointer; }
button.marker svg, button.map-button svg { display: block; width: 14px; height: 14px; }
tr.battle-row { cursor: pointer; }
tr.plunder-row { cursor: pointer; }
tr.plunder-row:hover, tr.plunder-row:focus-visible { background: #3a2a16; outline: none; }
button.map-button { all: unset; cursor: pointer; }
tr.battle-row.expanded, tr.details { background: #3a2a16; }
.battle p { margin: 2px 0 4px; }
details { margin: 6px 0; }
summary { cursor: pointer; color: var(--accent); }
button.marker.dim { opacity: .3; }
.city-map { margin: 4px 0; }
.map-marks { display: flex; flex-wrap: wrap; gap: 0 12px; }
.map-frame { position: relative; height: 55vh; min-height: 180px; overflow: hidden; border: 1px solid #8a6a3a; }
/* a box with a height, or popped out: the map takes the height the controls above and the legend below leave */
.box.tall .body.fill, .box.popped .body.fill { display: flex; flex-direction: column; }
:is(.box.tall, .box.popped) .body.fill :is(.map-stats-layout, .city-map) { flex: 1 1 auto; min-height: 0; }
:is(.box.tall, .box.popped) .body.fill .map-stats-layout { align-items: stretch; }
:is(.box.tall, .box.popped) .body.fill :is(.map-main, .city-map) { display: flex; flex-direction: column; }
:is(.box.tall, .box.popped) .body.fill .map-frame { flex: 1 1 auto; height: auto; }
.map-frame canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.map-tools { position: absolute; top: 4px; right: 4px; display: flex; gap: 2px; }
.map-tools button { display: inline-flex; align-items: center; }
.map-tools button svg, .tabs button svg { display: block; width: 14px; height: 14px; }
.map-legend { display: flex; flex-wrap: wrap; gap: 2px 10px; list-style: none; margin: 4px 0; padding: 0; }
.map-legend .swatch { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: -1px;
  border: 2px solid transparent; }
.map-legend .swatch.outline { background: none; }
.map-stats-layout { display: flex; align-items: flex-start; gap: 6px; }
.map-main { flex: 1; min-width: 0; }
/* docked: the statistics hang out of the side of the box and leave the map whole; the body's overflow does not clip
   them because their containing block is the box itself */
.stats-drawer { position: absolute; top: 34px; right: 100%; display: flex; flex-direction: row-reverse;
  align-items: flex-start; }
.stats-drawer[data-side=right] { right: auto; left: 100%; flex-direction: row; }
.stats-tab { writing-mode: vertical-rl; padding: 8px 2px; border-width: 2px; border-right: 0; border-radius: 6px 0 0 6px; }
.stats-drawer[data-side=right] .stats-tab { border-width: 2px; border-left: 0; border-radius: 0 6px 6px 0; }
.stats-drawer.open .stats-tab { color: var(--accent); }
.stats-panel { width: 250px; max-height: 70vh; overflow: auto; padding: 4px 8px; background: #2b1d10;
  border: 2px solid #8a6a3a; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.stats-panel h2:first-child { margin-top: 2px; }
.stats-panel p { margin: 2px 0; }
.stats-panel .swatch { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: -1px; }
.stats-list { list-style: none; margin: 2px 0; padding: 0; }
/* popped out: no room beside the window, so the panel takes a column beside the map */
.box.popped .stats-drawer { position: static; flex: 0 0 auto; flex-direction: row; }
.box.popped .stats-tab { border: 2px solid var(--line); border-radius: 6px; }
.box.popped .stats-panel { max-height: none; align-self: stretch; width: 230px; box-shadow: none; }
/* great building calculator: one row per place, coloured by what the place is worth */
.gb-factor, .gb-levels { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 4px 0 6px; }
.gb-factor input.active, .gb-levels input.active { font-weight: 600; border-color: var(--accent); }
.gb-factor input[type=number], .gb-levels input[type=number] { width: 5em; }
/* factor buttons all one width, whatever the number of digits */
.gb-factor button:not(.icon) { min-width: 3.6em; text-align: center; }
.gb-factor label { gap: 3px; }
.gb-places { position: relative; min-height: 60px; }
.gb-table td, .gb-table th { white-space: nowrap; }
/* snipe list: fixed columns so heads show whole; only the building name gives way */
button.snipe-toggle { all: unset; cursor: pointer; display: flex; align-items: center; gap: 4px; width: 100%; }
button.snipe-toggle:hover { color: var(--accent); }
button.snipe-toggle:focus-visible { outline: 1px solid var(--accent); }
button.snipe-toggle svg { display: block; flex: none; width: 14px; height: 14px; }
hr.snipe-sep { border: 0; border-top: 1px solid var(--line); margin: 6px 0; }
/* windowed rows (ui/windowed-rows.ts): the table area, the two buttons beside it, the line of what is hidden */
.win-scroll { display: flex; align-items: stretch; gap: 4px; }
.win-area { flex: 1 1 auto; min-width: 0; }
.win-nav { flex: none; display: flex; flex-direction: column; justify-content: space-between; }
.win-nav button.icon { all: unset; cursor: pointer; display: grid; place-items: center; width: 18px; height: 18px;
  color: var(--ink); }
.win-nav button.icon:hover { color: var(--accent); }
.win-nav button.icon.off { cursor: default; opacity: .4; color: var(--ink); }
.win-nav button.icon svg { display: block; width: 14px; height: 14px; }
p.win-hidden { margin: 2px 0; }
/* a column head that sorts on a click (snipe helper, investments); an icon head marks the direction by its colour */
/* the star that marks a great building or a player */
button.star { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 18px; height: 18px; vertical-align: middle; color: var(--ink); opacity: .7; }
button.star:hover, button.star.on { color: var(--accent); opacity: 1; }
button.star svg { display: block; width: 14px; height: 14px; }
th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: var(--accent); }
th.sortable.desc::after { content: ' ▾'; color: var(--accent); }
th.sortable.asc::after { content: ' ▴'; color: var(--accent); }
/* several sort levels: the arrow moves into the level number's span so the number follows it, small */
th.sortable.multi::after { content: none; }
th.sortable .sort-level { color: var(--accent); font-size: .75em; }
th.sortable.desc .sort-level::before { content: ' ▾'; font-size: 1.333em; }
th.sortable.asc .sort-level::before { content: ' ▴'; font-size: 1.333em; }
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
.snipe-table td.snipe-name { overflow: hidden; text-overflow: ellipsis; }
.snipe-table .snipe-tier, .snipe-table th.icon-head:not(.num) { text-align: center; padding: 0; }
/* the star left, its icon in line with the number of # before it (the button centres a 14 px icon in 18 px) */
.snipe-table td.snipe-mark { text-align: left; padding: 0 0 0 2px; }
.snipe-table th.icon-head.snipe-mark { text-align: left; padding: 0 0 0 4px; }
.snipe-table .snipe-tier svg { display: block; width: 14px; height: 14px; margin: auto; }
td.snipe-tier.exact { color: #8fd08f; }
td.snipe-tier.safe { color: #5a9a4a; }
td.snipe-tier.possible { color: #f0a050; }
/* investments: fixed columns so heads show whole; owner and building names give way */
.inv-table { table-layout: fixed; }
/* the box can be resized: the fixed columns plus at least 90 px for the owner (name, star, funnel) and 100 px for the
   building, "Meine" 436 + 190 px, "Mögliche" 594 + 190 px; narrower, the box scrolls sideways instead of squeezing the
   names to nothing. debt: the sums are kept by hand. ceiling: a changed column width makes them stale.
   upgrade: compute them from the column widths once those live in one place */
.inv-table { min-width: 626px; }
.inv-table.inv-possible { min-width: 784px; }
.inv-table .c-mark { width: 34px; }
.inv-table .c-level, .inv-table .c-rank { width: 56px; }
.inv-table .c-deposit { width: 90px; }
.inv-table .c-profit { width: 64px; }
.inv-table .c-status { width: 32px; }
.inv-table .c-progress { width: 104px; }
.inv-table td.inv-name { overflow: hidden; text-overflow: ellipsis; }
.inv-table :is(.icon-head, .inv-status, .snipe-tier, .inv-mark) { text-align: center; padding: 0; }
/* the star left, as in the snipe helper (the button centres a 14 px icon in 18 px) */
.inv-table td.inv-mark { text-align: left; padding: 0 0 0 2px; }
.inv-table th.icon-head.inv-mark { text-align: left; padding: 0 0 0 4px; }
.inv-table :is(.inv-status, .snipe-tier) svg { display: block; width: 14px; height: 14px; margin: auto; }
.inv-table .icon-head svg { display: inline-block; width: 14px; height: 14px; vertical-align: middle; }
.inv-table .icon-head { white-space: nowrap; }
td.inv-status.safe { color: #8fd08f; }
td.inv-status.unsafe { color: #f0a050; }
td.inv-status.unknown { color: #b8a27d; }
.inv-table tr.grown { background: rgba(220, 190, 60, .32); }
.inv-possible .c-progress { width: 92px; }
.inv-possible .c-share { width: 50px; }
.inv-possible .c-cost { width: 68px; }
.inv-possible .c-gain { width: 64px; }
.inv-possible .c-tier { width: 32px; }
.inv-possible .c-seen { width: 72px; }
.inv-possible .c-reach { width: 70px; }
/* the head left, over the icons of the cells */
.inv-table th.icon-head.inv-reach { text-align: left; padding: 0 0 0 4px; }
.inv-reach svg { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: 3px; }
/* an owner out of reach: the whole row muted, links and tier colours too */
.inv-possible tr.muted :is(td, a) { color: inherit; }
.inv-possible td { overflow: hidden; text-overflow: ellipsis; }
/* investments: the body does not scroll, the pane fills it. The table area holds as many rows as fit (ui/fit-rows.ts),
   the two buttons beside it scroll them, and the area itself scrolls only sideways when the box is narrower than the table */
.body:has(> .inv-pane) { display: flex; flex-direction: column; overflow: hidden; }
.inv-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.inv-pane > :not(.inv-win) { flex: none; }
.inv-win { flex: 1 1 auto; min-height: 0; }
.inv-win .win-area { overflow-x: auto; overflow-y: hidden; }
.inv-filter { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.inv-filter input[type=search] { width: 10em; }
.inv-count { margin-left: auto; }
.inv-reach-filter, .inv-tier-filter, .inv-hits-filter, .inv-marked-filter { display: inline-flex; gap: 2px; }
.inv-reach-filter button, .inv-tier-filter button, .inv-hits-filter button, .inv-marked-filter button { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 22px; height: 22px; color: var(--ink); opacity: .45; }
.inv-reach-filter button.on, .inv-tier-filter button.on, .inv-marked-filter button.on { color: var(--accent); opacity: 1; }
/* the profit icon keeps its own colours, switched on it only turns opaque */
.inv-hits-filter button.on { opacity: 1; }
.inv-reach-filter button svg, .inv-tier-filter button svg, .inv-hits-filter button svg, .inv-marked-filter button svg { display: block; width: 14px; height: 14px; }
.inv-owner { display: flex; align-items: center; }
.inv-owner a { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* always at the right edge of the column, so the mouse can run straight down it; hidden until the row is hovered */
button.inv-pick { all: unset; cursor: pointer; flex: none; display: grid; place-items: center; width: 16px; height: 16px; margin-left: auto; opacity: 0; color: var(--ink); }
tr:is(:hover, :focus-within) button.inv-pick { opacity: .7; }
tr button.inv-pick:is(:hover, :focus-visible), button.inv-pick.on { opacity: 1; color: var(--accent); }
.owner-star { flex: none; display: grid; place-items: center; margin-left: 3px; color: var(--accent); }
.owner-star svg { display: block; width: 11px; height: 11px; }
button.inv-pick svg { display: block; width: 12px; height: 12px; }
.inv-growth { color: var(--accent); font-weight: 600; }
/* a thin bar under "paid in / costs", filled towards the level up (investments, GB calculator) */
.fp-bar { height: 3px; margin-top: 2px; background: var(--line); border-radius: 2px; overflow: hidden; }
.fp-bar > div { height: 100%; background: var(--accent); }
.gb-progress { margin: 0 0 6px; }
tr.gb-profit { background: rgba(90, 170, 90, .28); }
tr.gb-loss { background: rgba(200, 80, 60, .28); }
tr.gb-levelWarning { background: rgba(220, 190, 60, .32); }
tr.gb-mine { background: rgba(80, 140, 220, .32); }
tr.own-row td { background: #3a2814; }
td.own-fp, td.gain { color: #8fd08f; }
button.copy-fp { all: unset; cursor: pointer; }
button.copy-fp:hover { text-decoration: underline; }
input.ext, input.place-factor { width: 100%; min-width: 0; }
/* the Eigenanteil table keeps its column widths (the colgroup) whatever the cells hold */
table.own-share { table-layout: fixed; width: auto; }
table.own-share th, table.own-share td { overflow: hidden; text-overflow: ellipsis; }
table.own-share .icon-cell { text-align: center; }
/* a column header drawn as an icon */
.gb-table th svg { display: inline-block; width: 14px; height: 14px; vertical-align: middle; }
.gb-table th svg.harvest { width: 18px; height: 18px; }
.own-share .marker { display: inline-flex; align-items: center; gap: 2px; vertical-align: middle; }
.own-share .marker svg { display: block; width: 14px; height: 14px; }
.own-share .marker.danger { color: #f07060; }
.own-share .marker.levels { color: var(--accent); }
/* the Powerleveln table: fixed columns as well, the current level marked, locked levels dimmed */
table.power-level { table-layout: fixed; width: auto; }
table.power-level th, table.power-level td { overflow: hidden; text-overflow: ellipsis; }
table.power-level tr.current td { background: rgba(80, 140, 220, .22); }
table.power-level tr.locked { color: #8a7a60; }
table.power-level tr.total td { font-weight: 600; }
table.power-level button.icon { all: unset; cursor: pointer; display: grid; place-items: center; width: 18px; height: 18px;
  color: var(--ink); opacity: .8; }
table.power-level button.icon:hover { opacity: 1; }
table.power-level button.icon svg { display: block; width: 14px; height: 14px; }
.power-open { margin: 4px 0; }
.power-open button { display: inline-grid; place-items: center; padding: 3px 6px; }
.power-open button svg { display: block; width: auto; height: 22px; }
.gb-levels input.span { width: 4.5em; }
input.place-factor.arc { color: var(--accent); }
.gb-factor .factor-status { display: inline-grid; place-items: center; margin-left: 4px; }
.gb-factor .factor-status svg { width: 14px; height: 14px; }
.gb-factor .factor-status.saved { color: var(--accent); }
.gb-factor button.icon { all: unset; cursor: pointer; width: 18px; height: 18px; display: grid; place-items: center;
  color: var(--ink); opacity: .8; }
.gb-factor button.icon:hover { opacity: 1; }
.gb-factor button.icon.off, .gb-factor button.icon.off:hover { opacity: .3; cursor: default; }
.gb-factor button.icon svg { display: block; width: 14px; height: 14px; }
.copy-line { display: flex; gap: 4px; align-items: center; margin: 4px 0; }
.copy-line button.icon { all: unset; cursor: pointer; width: 18px; height: 18px; display: grid; place-items: center;
  color: var(--ink); opacity: .8; }
.copy-line button.icon:hover { opacity: 1; }
.copy-line button.icon svg { display: block; width: 14px; height: 14px; }
.page-mark { display: inline-block; vertical-align: -2px; }
.page-mark svg { display: block; width: 14px; height: 14px; }
.copy-line .copy-text { flex: 1; min-width: 0; }
.copy-line .copy-building { width: 7em; }
tr.gb-unavailable, tr.gb-worse { color: #8a7a60; }
.gb-table td.estimate { font-style: italic; }
td.short { color: #ff6a50; font-weight: 600; }
td.over-rest { color: #e08070; }
td.below-safe { font-style: italic; opacity: .75; }
/* the name of the great building on top of its boxes */
.gb-title { font-size: 15px; font-weight: 600; }
p.gb-me { margin: 6px 0; padding: 4px 6px; border: 1px solid #8a6a3a; border-radius: 4px; background: #3a2814; }
p.gb-me.safe { border-color: #5a9a4a; }
p.gb-me.safe, .gb-me .gain { color: #8fd08f; }
.gb-me .profit-icon { color: var(--ink); }
.gb-me .profit-icon svg { width: 14px; height: 14px; vertical-align: -2px; }
.gb-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 8px;
  background: rgba(43, 29, 16, .88); text-align: center; color: var(--accent); }
`;
