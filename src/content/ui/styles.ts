// Shared look of all toolbox UI. Lives inside each shadow root, so game CSS and toolbox CSS never meet.
export const baseCss = `
:host { all: initial; --ink: #fbf4e4; --accent: #e8861c; --btn: #4a3620; --btn-hover: #6a5030;
  --field: #1c130a; --line: #8a6a3a; color-scheme: dark; }
/* the accent parts of an icon */
.acc { color: var(--accent); }
* { box-sizing: border-box; }
.box { position: fixed; min-width: 260px; max-width: 520px; background: #2b1d10; color: var(--ink);
  font: 12px/1.4 system-ui, sans-serif; border: 2px solid #8a6a3a; border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.box.popped { position: static; max-width: none; height: 100vh; border: 0; border-radius: 0; }
/* resized by the viewer: no width cap; with a height the body takes what the header leaves and scrolls */
.box.sized { max-width: none; }
.box.tall, .box.popped { display: flex; flex-direction: column; }
.box.tall .body, .box.popped .body { flex: 1 1 auto; min-height: 0; max-height: none; }
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
.gb-factor button:not(.icon), .gb-levels button:not(.icon), button.action, .tabs button, .map-tools button,
.stats-tab, .power-open button {
  font: inherit; cursor: pointer; color: var(--ink); background: var(--btn); border: 1px solid var(--line);
  border-radius: 3px; padding: 1px 6px;
  &:hover { background: var(--btn-hover); }
  &.active { border-color: var(--accent); font-weight: 600; }
  &:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  &:is(:disabled, [aria-disabled=true]) { cursor: default; background: var(--btn); }
  &:is(:disabled, [aria-disabled=true]):not(.active) { opacity: .5; }
}
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
.tabs { display: flex; flex-wrap: wrap; gap: 2px; margin: 0 0 6px; }
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
.gb-factor input, .gb-levels input { width: 5em; }
.gb-places { position: relative; min-height: 60px; }
.gb-table td, .gb-table th { white-space: nowrap; }
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
.power-open button { display: inline-flex; align-items: center; gap: 4px; }
.power-open button svg { display: block; width: 14px; height: 14px; }
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
p.gb-me { margin: 6px 0; padding: 4px 6px; border: 1px solid #8a6a3a; border-radius: 4px; background: #3a2814; }
p.gb-me.safe { border-color: #5a9a4a; }
p.gb-me.safe, .gb-me .gain { color: #8fd08f; }
.gb-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 8px;
  background: rgba(43, 29, 16, .88); text-align: center; color: var(--accent); }
`;
