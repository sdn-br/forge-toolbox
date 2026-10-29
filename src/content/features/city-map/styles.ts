// The look of the city map box: the layout around the map and the statistics drawer.
export const cityMapCss = `
/* the statistics panel that hangs out of the box has the frame of a box */
.stats-panel { background: var(--bg); border: 2px solid var(--line); border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0,0,0,.5); }
.map-marks { display: flex; flex-wrap: wrap; gap: 0 12px; }
.map-stats-layout { display: flex; align-items: flex-start; gap: 6px; }
.map-main { flex: 1; min-width: 0; }
/* a box with a height, or popped out: the map takes the height the controls above and the legend below leave */
:is(.box.tall, .box.popped) .body.fill :is(.map-stats-layout, .city-map) { flex: 1 1 auto; min-height: 0; }
:is(.box.tall, .box.popped) .body.fill .map-stats-layout { align-items: stretch; }
:is(.box.tall, .box.popped) .body.fill :is(.map-main, .city-map) { display: flex; flex-direction: column; }
:is(.box.tall, .box.popped) .body.fill .map-frame { flex: 1 1 auto; height: auto; }
/* docked: the statistics hang out of the side of the box and leave the map whole; the body's overflow does not clip
   them because their containing block is the box itself */
.stats-drawer { position: absolute; top: 34px; right: 100%; display: flex; flex-direction: row-reverse;
  align-items: flex-start; }
.stats-drawer[data-side=right] { right: auto; left: 100%; flex-direction: row; }
button.stats-tab { margin: 0; writing-mode: vertical-rl; padding: 8px 2px; border-width: 2px; border-right: 0; border-radius: 6px 0 0 6px; }
.stats-drawer[data-side=right] .stats-tab { border-width: 2px; border-left: 0; border-radius: 0 6px 6px 0; }
.stats-drawer.open .stats-tab { color: var(--accent); }
.stats-panel { width: 250px; max-height: 70vh; overflow: auto; padding: 4px 8px; }
.stats-panel h2:first-child { margin-top: 2px; }
.stats-panel p { margin: 2px 0; }
.stats-list { list-style: none; margin: 2px 0; padding: 0; }
/* popped out: no room beside the window, so the panel takes a column beside the map */
.box.popped .stats-drawer { position: static; flex: 0 0 auto; flex-direction: row; }
.box.popped .stats-tab { border: 2px solid var(--line); border-radius: 6px; }
.box.popped .stats-panel { max-height: none; align-self: stretch; width: 230px; box-shadow: none; }
`;
