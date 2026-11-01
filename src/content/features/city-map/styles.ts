// The look of the city map box: the layout around the map and the statistics drawer.
export const cityMapCss = `
.map-marks { display: flex; flex-wrap: wrap; gap: 0 12px; }
.map-stats-layout { display: flex; align-items: flex-start; gap: 6px; }
.map-main { flex: 1; min-width: 0; }
/* a box with a height, or popped out: the map takes the height the controls above and the legend below leave */
:is(.box.tall, .box.popped) .body.fill .city-map { flex: 1 1 auto; min-height: 0; }
:is(.box.tall, .box.popped) .body.fill .map-stats-layout { align-items: stretch; }
:is(.box.tall, .box.popped) .body.fill :is(.map-main, .city-map) { display: flex; flex-direction: column; }
:is(.box.tall, .box.popped) .body.fill .map-frame { flex: 1 1 auto; height: auto; }
/* the statistics in the side drawer (ui/side-drawer.ts) */
.stats-panel h2:first-child { margin-top: 2px; }
.stats-panel p { margin: 2px 0; }
.stats-list { list-style: none; margin: 2px 0; padding: 0; }
/* popped out the column beside the map is a little narrower */
.box.popped .stats-drawer .side-panel { --side-width: 230px; }
`;
