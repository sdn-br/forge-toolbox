// Shared look of all toolbox UI. Lives inside each shadow root, so game CSS and toolbox CSS never meet.
export const baseCss = `
:host { all: initial; }
* { box-sizing: border-box; }
.box { position: fixed; min-width: 260px; max-width: 520px; background: #2b1d10; color: #f3e3c3;
  font: 12px/1.4 system-ui, sans-serif; border: 2px solid #8a6a3a; border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.box.popped { position: static; max-width: none; min-height: 100vh; border: 0; border-radius: 0; }
header { display: flex; align-items: center; gap: 4px; padding: 4px 6px; background: #4a3620;
  border-bottom: 1px solid #8a6a3a; cursor: move; user-select: none; touch-action: none; }
.box.pinned header, .box.popped header { cursor: default; }
header h1 { flex: 1; margin: 0; font-size: 13px; font-weight: 600; }
header button { all: unset; cursor: pointer; width: 18px; text-align: center; opacity: .8; }
header button:hover { opacity: 1; }
header button.active { color: #f0c060; }
.body { padding: 6px 8px; max-height: 70vh; overflow: auto; }
.box.popped .body { max-height: none; }
.box.minimized .body { display: none; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 2px 4px; border-bottom: 1px solid #4a3620; text-align: left; }
td.num, th.num { text-align: right; }
.muted { color: #b8a27d; }
.warn { color: #f0a050; }
.error { color: #f07060; }
button.action { font: inherit; cursor: pointer; margin: 2px 4px 2px 0; }
label { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
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
textarea.note-input { width: 100%; min-height: 10em; resize: vertical; }
input.title { width: 100%; font-weight: 600; }
button.marker { all: unset; cursor: pointer; }
tr.battle-row { cursor: pointer; }
tr.battle-row.expanded, tr.details { background: #3a2a16; }
.battle p { margin: 2px 0 4px; }
button.marker.dim { opacity: .3; }
`;
