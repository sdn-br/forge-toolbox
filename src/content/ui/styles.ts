// Shared look of all toolbox UI. Lives inside each shadow root, so game CSS and toolbox CSS never meet.
export const baseCss = `
:host { all: initial; }
* { box-sizing: border-box; }
.box { position: fixed; min-width: 260px; max-width: 520px; background: #2b1d10; color: #f3e3c3;
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
header { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; padding: 4px 6px; background: #4a3620;
  border-bottom: 1px solid #8a6a3a; cursor: move; user-select: none; touch-action: none; }
.box.pinned header, .box.popped header { cursor: default; }
header h1 { flex: 1; margin: 0; font-size: 13px; font-weight: 600; }
header button { all: unset; cursor: pointer; width: 18px; text-align: center; opacity: .8; }
header button:hover { opacity: 1; }
header button.active { color: #f0c060; }
.body { padding: 6px 8px; max-height: 70vh; overflow: auto; }
.box.minimized .body { display: none; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 2px 4px; border-bottom: 1px solid #4a3620; text-align: left; }
td.num, th.num { text-align: right; }
.muted { color: #b8a27d; }
.warn { color: #f0a050; }
.error { color: #f07060; }
button.action { font: inherit; cursor: pointer; margin: 2px 4px 2px 0; }
label { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
p.setting-hint { margin: 0 0 4px 22px; }
h2 { font-size: 12px; margin: 8px 0 4px; color: #f0c060; }
input, select, textarea { font: inherit; }
.tabs { display: flex; flex-wrap: wrap; gap: 2px; margin: 0 0 6px; }
.tabs button { font: inherit; cursor: pointer; }
.tabs button.active { font-weight: 600; }
.split { display: flex; gap: 8px; align-items: flex-start; }
.split > .side { flex: 0 0 150px; min-width: 0; }
.split > .main { flex: 1; min-width: 0; }
ul.rows { list-style: none; margin: 4px 0; padding: 0; }
ul.rows li { padding: 2px 4px; cursor: pointer; border-bottom: 1px solid #4a3620; }
ul.rows li.active { background: #4a3620; }
ul.rows li.dragging { opacity: .4; }
.card { border: 1px solid #8a6a3a; border-radius: 4px; padding: 0 6px 4px; margin: 6px 0; }
.note { cursor: text; min-height: 2em; overflow-wrap: anywhere; }
.note h3, .note h4, .note h5 { margin: 6px 0 2px; color: #f0c060; }
.note h3 { font-size: 14px; } .note h4 { font-size: 13px; } .note h5 { font-size: 12px; }
.note p, .note ul, .note ol { margin: 2px 0; }
.note ul, .note ol { padding-left: 18px; }
.note a, a { color: #f0c060; }
a.ext-link { text-decoration: none; opacity: .6; }
a.ext-link:hover { opacity: 1; }
textarea.note-input { width: 100%; min-height: 10em; resize: vertical; }
input.title { width: 100%; font-weight: 600; }
button.marker { all: unset; cursor: pointer; }
tr.battle-row { cursor: pointer; }
tr.plunder-row { cursor: pointer; }
tr.plunder-row:hover, tr.plunder-row:focus-visible { background: #3a2a16; outline: none; }
button.map-button { all: unset; cursor: pointer; }
tr.battle-row.expanded, tr.details { background: #3a2a16; }
.battle p { margin: 2px 0 4px; }
details { margin: 6px 0; }
summary { cursor: pointer; color: #f0c060; }
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
.map-tools button { font: inherit; cursor: pointer; padding: 0 6px; }
.map-tools button.active { font-weight: 600; outline: 1px solid #f0c060; }
.map-tip { position: absolute; max-width: 200px; padding: 3px 6px; background: #000d; color: #f3e3c3;
  border: 1px solid #8a6a3a; border-radius: 4px; pointer-events: none; white-space: pre-line; }
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
.stats-tab { font: inherit; cursor: pointer; writing-mode: vertical-rl; padding: 8px 2px; background: #4a3620;
  color: #f3e3c3; border: 2px solid #8a6a3a; border-right: 0; border-radius: 6px 0 0 6px; }
.stats-drawer[data-side=right] .stats-tab { border: 2px solid #8a6a3a; border-left: 0; border-radius: 0 6px 6px 0; }
.stats-drawer.open .stats-tab { color: #f0c060; }
.stats-panel { width: 250px; max-height: 70vh; overflow: auto; padding: 4px 8px; background: #2b1d10;
  border: 2px solid #8a6a3a; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.stats-panel h2:first-child { margin-top: 2px; }
.stats-panel p { margin: 2px 0; }
.stats-panel .swatch { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: -1px; }
.stats-list { list-style: none; margin: 2px 0; padding: 0; }
/* popped out: no room beside the window, so the panel takes a column beside the map */
.box.popped .stats-drawer { position: static; flex: 0 0 auto; flex-direction: row; }
.box.popped .stats-tab { border: 2px solid #8a6a3a; border-radius: 6px; }
.box.popped .stats-panel { max-height: none; align-self: stretch; width: 230px; box-shadow: none; }
/* great building calculator: one row per place, coloured by what the place is worth */
.gb-factor { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 4px 0 6px; }
.gb-factor button { font: inherit; cursor: pointer; }
.gb-factor button.active, .gb-factor input.active { font-weight: 600; outline: 1px solid #f0c060; }
.gb-factor input { width: 5em; }
.gb-places { position: relative; min-height: 60px; }
.gb-table td, .gb-table th { white-space: nowrap; }
tr.gb-profit { background: rgba(90, 170, 90, .28); }
tr.gb-loss { background: rgba(200, 80, 60, .28); }
tr.gb-levelWarning { background: rgba(220, 190, 60, .32); }
tr.gb-mine { background: rgba(80, 140, 220, .32); }
tr.gb-unavailable, tr.gb-worse { color: #8a7a60; }
td.short { color: #ff6a50; font-weight: 600; }
td.over-rest { color: #e08070; }
td.below-safe { font-style: italic; opacity: .75; }
.gb-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 8px;
  background: rgba(43, 29, 16, .88); text-align: center; color: #f0c060; }
`;
