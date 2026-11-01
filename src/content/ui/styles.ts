// The look of the UI kit, in each shadow root, so game CSS and toolbox CSS never meet: the colours, the box frame,
// fields, tables, tabs, the tooltip, the buttons, and the shared UI parts more than one feature uses. What only one
// feature draws lives next to it and comes in through `BoxOptions.css`.
import { hitColumnsCss } from './snipe-hit';

export const baseCss = `
:host { all: initial; --bg: #2b1d10; --ink: #fbf4e4; --accent: #e8861c; --btn: #4a3620; --btn-hover: #6a5030;
  --field: #1c130a; --line: #8a6a3a; --muted: #b8a27d; --good: #8fd08f; --warn: #f0a050; --bad: #ff6a50;
  --row-good: rgba(90, 170, 90, .28); --row-bad: rgba(200, 80, 60, .28); --row-warn: rgba(220, 190, 60, .24);
  --row-mine: rgba(80, 140, 220, .32); --row-selected: #3a2a16; color-scheme: dark; }
/* the accent parts of an icon */
.acc { color: var(--accent); }
* { box-sizing: border-box; }
/* the frame of a box */
.box { background: var(--bg); border: 2px solid var(--line); border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5);
  position: fixed; min-width: 260px; color: var(--ink); font: 12px/1.4 system-ui, sans-serif; }
.box.popped { position: static; height: 100vh; border: 0; border-radius: 0; }
/* a box without the resize handle (capped): its height is capped (inline), the body scrolls beyond it; its width is the
   configured one, only the window caps it (box.ts). A box with the handle has the width it is given or resized to */
.box.tall, .box.popped, .box.capped { display: flex; flex-direction: column; }
.box.tall .body, .box.popped .body, .box.capped .body { flex: 1 1 auto; min-height: 0; max-height: none; }
.resize-handle { position: absolute; right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize;
  touch-action: none; z-index: 1; background: linear-gradient(135deg, transparent 55%, var(--line) 55%, var(--line) 65%,
  transparent 65%, transparent 75%, var(--line) 75%, var(--line) 85%, transparent 85%); }
header { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; padding: 4px 6px; background: var(--btn);
  border-bottom: 1px solid var(--line); cursor: move; user-select: none; touch-action: none; }
.box.pinned header, .box.popped header { cursor: default; }
header h1 { flex: 1; margin: 0; font-size: 13px; font-weight: 600; }
header button { all: unset; cursor: pointer; width: 20px; height: 20px; display: grid; place-items: center;
  color: var(--ink); opacity: .8; }
header button:hover { opacity: 1; }
header button.active { color: var(--accent); }
.body { padding: 6px 8px; max-height: 70vh; overflow: auto; }
.box.minimized .body { display: none; }
/* a box with a height, or popped out, whose content fills the body (BoxOptions.fill): the body does not scroll, its
   content takes the height it has */
:is(.box.tall, .box.popped) .body.fill { display: flex; flex-direction: column; overflow: hidden; }
:is(.box.tall, .box.popped) .body.fill > * { flex: 1 1 auto; min-height: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { padding: 2px 4px; border-bottom: 1px solid var(--btn); text-align: left; }
td.num, th.num { text-align: right; }
.muted { color: var(--muted); }
.warn { color: var(--warn); }
button.action { margin: 2px 4px 2px 0; }
/* in a bar with its own gaps a text button takes no margin */
:is(.selection, .gb-factor, .gb-levels, .map-tools) > button.action { margin: 0; }
/* text buttons in the box colours, like the fields; icon, header, menu and settings buttons have their own looks */
button.action {
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
/* an icon alone without the face of a text button (ui/buttons.ts); where it is greyed (off) differs per place */
button.icon { all: unset; cursor: pointer; width: 18px; height: 18px; display: grid; place-items: center;
  color: var(--ink); opacity: .8; }
button.icon:hover { opacity: 1; }
button.icon svg { display: block; width: 14px; height: 14px; }
label { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
h2 { font-size: 12px; margin: 8px 0 4px; color: var(--accent); }
input, select, textarea { font: inherit; }
/* fields in the box colours: dark ground, light text, the frame brown, the accent on focus */
input:not([type=checkbox]):not([type=radio]), select, textarea { color: var(--ink); background: var(--field);
  border: 1px solid var(--line); border-radius: 3px; padding: 1px 4px; }
input:not([type=checkbox]):not([type=radio]):focus, select:focus, textarea:focus { outline: none;
  border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
input::placeholder, textarea::placeholder { color: var(--muted); opacity: .7; }
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
.card { border: 1px solid var(--line); border-radius: 4px; padding: 0 6px 4px; margin: 6px 0; }
.note { cursor: text; min-height: 2em; overflow-wrap: anywhere; }
.note h3, .note h4, .note h5 { margin: 6px 0 2px; color: var(--accent); }
.note h3 { font-size: 14px; } .note h4 { font-size: 13px; } .note h5 { font-size: 12px; }
.note p, .note ul, .note ol { margin: 2px 0; }
.note ul, .note ol { padding-left: 18px; }
.note a, a { color: var(--accent); }
.tip { position: fixed; z-index: 2147483647; max-width: 260px; padding: 3px 6px; background: #000d; color: var(--ink);
  font: 12px/1.4 system-ui, sans-serif; border: 1px solid var(--line); border-radius: 4px; pointer-events: none;
  white-space: pre-line; }
.tip[hidden] { display: none; }
header button svg { display: block; width: 16px; height: 16px; }
textarea.note-input { width: 100%; min-height: 10em; resize: vertical; }
.battle p { margin: 2px 0 4px; }
.battle .army { white-space: nowrap; font-weight: normal; }
/* the portrait spans the name and the hit points below it; a fallen unit's fades like its text */
.battle td { vertical-align: top; }
/* units as the game draws them: portrait, class icon on a dark round badge inside its lower right corner and clear of the health bar, the bar below */
.unit-tiles { display: grid; grid-template-columns: repeat(2, 40px); gap: 6px; }
.unit-tile { position: relative; width: 40px; }
.unit-tile .unit-img { display: block; width: 40px; height: 40px; border-radius: 3px; }
.unit-tile .unit-img[hidden] { display: none; }
.unit-tile .unit-name { overflow: hidden; font-size: 9px; line-height: 1.1; word-break: break-word; background: var(--field); }
.unit-tile.dead .unit-img { opacity: .45; filter: grayscale(1); }
.unit-class { position: absolute; right: 1px; top: 21px; width: 18px; height: 18px; box-sizing: border-box; border-radius: 50%;
  background: rgba(0, 0, 0, .75); border: 1px solid var(--line); display: grid; place-items: center; }
.unit-class img { display: block; width: 13px; height: 13px; }
.unit-health { display: block; height: 4px; margin-top: 3px; background: var(--bad); }
.unit-health > span { display: block; height: 100%; background: var(--good); }
details { margin: 6px 0; }
summary { cursor: pointer; color: var(--accent); }
.name-search { position: relative; display: inline-block; vertical-align: middle; }
/* the suggestions lie over what follows (the map); inline they push it down, for a box that grows with its content */
.name-search .suggestions { position: absolute; left: 0; top: 100%; z-index: 5; min-width: 100%; max-height: 16em;
  overflow: auto; margin: 2px 0 0; padding: 2px 0; list-style: none; background: var(--field);
  border: 1px solid var(--line); border-radius: 3px; box-shadow: 0 4px 12px rgba(0,0,0,.5); }
.name-search.inline { display: block; }
.name-search.inline input { width: 100%; }
.name-search.inline .suggestions { position: static; box-shadow: none; }
.suggestions li { display: flex; justify-content: space-between; gap: 12px; padding: 1px 6px; cursor: pointer;
  white-space: nowrap; }
.suggestions li:hover, .suggestions li.active { background: var(--btn-hover); }
.suggestions .num { color: var(--muted); }
/* the selected buildings, one row per name: name, "selected/in the city", ✕ */
.selection { margin: 4px 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.selection-list { display: contents; list-style: none; }
.selection-list li { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 1px 2px 1px 8px;
  background: var(--btn); border: 1px solid var(--line); border-radius: 10px; }
.selection-list .name { min-width: 0; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selection-list .num { color: var(--muted); }
/* the city map (ui/city-map.ts): the frame, the tools on it, the legend below */
.city-map { margin: 4px 0; }
.map-frame { position: relative; height: 55vh; min-height: 180px; overflow: hidden; border: 1px solid var(--line); }
.map-frame canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.map-tools { position: absolute; top: 4px; right: 4px; display: flex; gap: 2px; }
.map-tools button { display: inline-flex; align-items: center; }
.map-tools button svg, .tabs button svg { display: block; width: 14px; height: 14px; }
.map-legend { display: flex; flex-wrap: wrap; gap: 2px 10px; list-style: none; margin: 4px 0; padding: 0; }
/* a colour square before a word, in the map legend and the statistics; the outline variant shows only its frame */
.swatch { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: -1px;
  border: 2px solid transparent; }
.swatch.outline { background: none; }
.swatch.badge { border: none; background: none; }
/* the factor bar and the level bar of the great building boxes (ui/factor-bar.ts, ui/level-bar.ts) */
.gb-factor, .gb-levels { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 4px 0 6px; }
.gb-factor input.active, .gb-levels input.active { font-weight: 600; border-color: var(--accent); }
.gb-factor input[type=number], .gb-levels input[type=number] { width: 5em; }
/* factor buttons all one width, whatever the number of digits */
.gb-factor button.action { min-width: 3.6em; text-align: center; }
.gb-factor label { gap: 3px; }
/* the tables of the great building boxes */
.gb-table td, .gb-table th { white-space: nowrap; }
/* a head that folds what follows (ui/fold-toggle.ts) */
button.fold-toggle { all: unset; cursor: pointer; display: flex; align-items: center; gap: 4px; width: 100%; }
button.fold-toggle:hover { color: var(--accent); }
button.fold-toggle:focus-visible { outline: 1px solid var(--accent); }
button.fold-toggle svg { display: block; flex: none; width: 14px; height: 14px; }
/* the side drawer of a box (ui/side-drawer.ts). Docked it hangs out of the side of the box and leaves the content
   whole; the body's overflow does not clip it because its containing block is the box itself. The panel sits flush
   against the box and the tab on its outer edge, so the tab moves out with the panel. The panel has the frame of a box */
.side-drawer { position: absolute; top: 34px; right: 100%; display: flex; flex-direction: row; align-items: flex-start; }
.side-drawer[data-side=right] { right: auto; left: 100%; flex-direction: row-reverse; }
button.side-tab { margin: 0; writing-mode: vertical-rl; padding: 8px 2px; border-width: 2px; border-right: 0; border-radius: 6px 0 0 6px; }
.side-drawer[data-side=right] .side-tab { border-width: 2px; border-left: 0; border-radius: 0 6px 6px 0; }
.side-drawer.open .side-tab { color: var(--accent); }
.side-panel { width: var(--side-width); max-height: 70vh; overflow: auto; padding: 4px 8px; background: var(--bg); border: 2px solid var(--line);
  border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5); }
/* popped out: no room beside the window, so the panel takes a column beside the content */
.box.popped .side-drawer { position: static; flex: 0 0 auto; flex-direction: row-reverse; }
.box.popped .side-tab { border: 2px solid var(--line); border-radius: 6px; }
.box.popped .side-panel { max-height: none; align-self: stretch; box-shadow: none; }
/* windowed rows (ui/windowed-rows.ts): the table area, the two buttons beside it, the line of what is hidden */
.win-scroll { display: flex; align-items: stretch; gap: 4px; }
.win-area { flex: 1 1 auto; min-width: 0; }
.win-nav { flex: none; display: flex; flex-direction: column; justify-content: space-between; }
/* full strength, the accent on hover; greyed a little less than the factor buttons */
.win-nav button.icon { opacity: 1; }
.win-nav button.icon:hover { color: var(--accent); }
.win-nav button.icon.off { cursor: default; opacity: .4; color: var(--ink); }
p.win-hidden { margin: 2px 0; }
/* a round spinner while something is asked (ui/activity.ts) */
.spinner { display: inline-block; width: .8em; height: .8em; vertical-align: -.1em; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
/* the star that marks a great building or a player, the closed eye that ignores one, and the two PvP marks; all look the same */
:is(button.star, button.ignore, button.plunder, button.no-attack) { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 18px; height: 18px; vertical-align: middle; color: var(--ink); opacity: .7; }
:is(button.star, button.ignore, button.plunder, button.no-attack):is(:hover, .on) { color: var(--accent); opacity: 1; }
:is(button.star, button.ignore, button.plunder, button.no-attack) svg { display: block; width: 14px; height: 14px; }
/* a column head that sorts on a click (snipe helper, investments); an icon head marks the direction by its colour */
th.sortable { cursor: pointer; user-select: none; }
th.sortable:hover { color: var(--accent); }
th.sortable.desc::after { content: ' ▾'; color: var(--accent); }
th.sortable.asc::after { content: ' ▴'; color: var(--accent); }
/* several sort levels: the arrow moves into the level number's span so the number follows it, small */
th.sortable.multi::after { content: none; }
th.sortable .sort-level { color: var(--accent); font-size: .75em; }
th.sortable.desc .sort-level::before { content: ' ▾'; font-size: 1.333em; }
th.sortable.asc .sort-level::before { content: ' ▴'; font-size: 1.333em; }
/* the parts the snipe list and the investment tables share; the widths of their shared columns (ui/snipe-hit.ts) */
${hitColumnsCss.trim()}
:is(.snipe-table, .inv-table) td.name-cell { overflow: hidden; text-overflow: ellipsis; }
/* the star left; in the snipe list its icon in line with the number of # before it (the button centres a 14 px icon in
   18 px) */
:is(.snipe-table, .inv-table) td.mark-cell { text-align: left; padding: 0 0 0 2px; }
:is(.snipe-table, .inv-table) th.icon-head.mark-cell { text-align: left; padding: 0 0 0 4px; }
:is(.snipe-table, .inv-table) :is(.snipe-tier, .inv-status) svg { display: block; width: 14px; height: 14px; margin: auto; }
/* a 14 px icon inside a line of text, lowered to sit on the baseline (investments, GB calculator). A list, not :is(),
   so each selector keeps its own specificity and the column heads keep theirs */
.inv-reach svg, .inv-ignored-total svg, .gb-me .profit-icon svg, td.secured svg, .gb-me .secured-icon svg {
  width: 14px; height: 14px; vertical-align: -2px; }
/* an ignored hit shown on request or an owner out of reach: the whole row muted, links and tier colours too */
:is(.snipe-table, .inv-table) tr.muted :is(td, a) { color: inherit; }
td.snipe-tier.exact { color: var(--good); }
td.snipe-tier.safe { color: #5a9a4a; }
td.snipe-tier.possible { color: var(--warn); }
/* icon toggles (ui/buttons.ts): faint while off, in the accent while on */
.icon-toggles { display: inline-flex; gap: 2px; }
.icon-toggles button { all: unset; cursor: pointer; display: inline-grid; place-items: center; width: 22px; height: 22px; color: var(--ink); opacity: .45; }
.icon-toggles button.on { color: var(--accent); opacity: 1; }
.icon-toggles button svg { display: block; width: 14px; height: 14px; }
.row-name { display: flex; align-items: center; }
.row-name a { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* the star and the eye in a row, in the PvP box the two PvP marks: 16 px at the right edge like the funnel (which then follows them), faint on row hover or
   focus while off, always in the accent while on. Name cells keep the name's ellipsis and give them their 16 px */
.row-name .row-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.row-name :is(button.star, button.ignore, button.plunder, button.no-attack) { flex: none; width: 16px; height: 16px; margin-left: auto; opacity: 0; }
.row-name :is(button.star, button.ignore, button.plunder, button.no-attack) svg { width: 12px; height: 12px; }
.row-name :is(button.star, button.ignore, button.plunder, button.no-attack) + :is(button.ignore, button.no-attack, button.inv-pick) { margin-left: 0; }
/* keyboard focus shows them too, a mouse click does not keep them (:focus-within would, until the next click) */
tr:is(:hover, :has(:focus-visible)) .row-name :is(button.star, button.ignore, button.plunder, button.no-attack) { opacity: .7; }
tr .row-name :is(button.star, button.ignore, button.plunder, button.no-attack):is(:hover, :focus-visible),
tr .row-name :is(button.star, button.ignore, button.plunder, button.no-attack).on { opacity: 1; color: var(--accent); }
/* the funnel of a row (ui/pick.ts) */
/* always at the right edge of the column, so the mouse can run straight down it; hidden until the row is hovered */
button.inv-pick { all: unset; cursor: pointer; flex: none; display: grid; place-items: center; width: 16px; height: 16px; margin-left: auto; opacity: 0; color: var(--ink); }
tr:is(:hover, :has(:focus-visible)) button.inv-pick { opacity: .7; }
tr button.inv-pick:is(:hover, :focus-visible), button.inv-pick.on { opacity: 1; color: var(--accent); }
button.inv-pick svg { display: block; width: 12px; height: 12px; }
/* the growth beside the bar; in the investments the bar line has one height in every row, so all rows are equally tall and the
   row window counts them right */
.growth-tag { flex: none; color: var(--accent); font-weight: 600; font-size: 10px; line-height: 1; }
.fp-line { display: flex; align-items: center; gap: 4px; margin-top: 2px; }
.fp-line .fp-bar { flex: 1 1 auto; margin-top: 0; }
/* a thin bar under "paid in / costs", filled towards the level up (investments, GB calculator) */
.fp-bar { height: 3px; margin-top: 2px; background: var(--line); border-radius: 2px; overflow: hidden; }
.fp-bar > div { height: 100%; background: var(--accent); }
/* the factor of one place and where the factors come from (gb-own-share/factor-state.ts, Eigenanteil and Powerleveln) */
input.place-factor { width: 100%; min-width: 0; }
/* a column header drawn as an icon */
.gb-table th svg { display: inline-block; width: 14px; height: 14px; vertical-align: middle; }
.gb-table th svg.harvest { width: 18px; height: 18px; }
input.place-factor.arc { color: var(--accent); }
.gb-factor .factor-status { display: inline-grid; place-items: center; margin-left: 4px; }
.gb-factor .factor-status svg { width: 14px; height: 14px; }
.gb-factor .factor-status.saved { color: var(--accent); }
.gb-factor button.icon.off, .gb-factor button.icon.off:hover { opacity: .3; cursor: default; }
/* a place no one can take, an estimated cell, a place short of Forge points: in the great building tables */
tr.gb-unavailable, tr.gb-worse { color: #8a7a60; }
.gb-table td.estimate { font-style: italic; }
td.short { color: var(--bad); font-weight: 600; }
/* the name of the great building on top of its boxes, and the line about the own place or the totals below the table */
.gb-title { font-size: 15px; font-weight: 600; }
p.gb-me { margin: 6px 0; padding: 4px 6px; border: 1px solid var(--line); border-radius: 4px; background: #3a2814; }
p.gb-me.safe { border-color: #5a9a4a; }
p.gb-me.safe, .gb-me .gain { color: var(--good); }
`;
