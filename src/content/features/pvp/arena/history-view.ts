import { html, svg } from 'lit-html';
import { t } from '../../../core/texts';
import { type ArenaHistoryVm, CHART, type HistoryChartVm, type HistoryDayRow } from './history';

/** the step line with grid, axes and a hover area per change; the tooltip is the `data-tip` of the toolbox */
const chart = (
  c: HistoryChartVm,
) => html`<svg class="pvp-chart" viewBox=${`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label=${t('pvp.arena.history.title')}>
  ${c.yTicks.map((tick) => svg`<line class="grid" x1=${c.plot.left} x2=${c.plot.right} y1=${tick.y} y2=${tick.y} /><text class="axis" x=${c.plot.left - 4} y=${tick.y + 3} text-anchor="end">${tick.label}</text>`)}
  ${c.xTicks.map((tick) => svg`<line class="grid" x1=${tick.x} x2=${tick.x} y1=${c.plot.top} y2=${c.plot.bottom} /><text class="axis" x=${tick.x} y=${c.plot.bottom + 12} text-anchor="middle">${tick.label}</text>`)}
  <path class="line" d=${c.path} />
  ${c.marks.map((m) => svg`<g class="mark" data-tip=${m.tip}><rect x=${m.x0} y=${c.plot.top} width=${Math.max(m.x1 - m.x0, 1)} height=${c.plot.bottom - c.plot.top} /><circle cx=${m.x} cy=${m.y} r="3" /></g>`)}
</svg>`;

const dayRow = (d: HistoryDayRow) =>
  html`<tr><td>${d.day}</td><td class="num">${d.points}</td><td class=${`num pvp-points ${d.gain}`}>${d.change}</td><td class="num" data-tip=${d.attacks ? d.attackTip : ''}>${d.attacks}</td><td class="num" data-tip=${d.defenses ? d.defenseTip : ''}>${d.defenses}</td></tr>`;

/** the content of the side panel: the chart, then a table per day, newest first */
export const historyPanel = (vm: ArenaHistoryVm) => html`<h2>${t('pvp.arena.history.title')}</h2>
  ${vm.chart ? chart(vm.chart) : html`<p class="muted">${t('pvp.arena.history.tooFew')}</p>`}
  ${
    vm.days.length
      ? html`<table class="pvp-history"><thead><tr><th>${t('pvp.arena.history.day')}</th><th class="num">${t('pvp.arena.points')}</th><th class="num">${t('pvp.arena.history.change')}</th><th class="num" data-tip=${t('pvp.arena.history.attacks')} aria-label=${t('pvp.arena.history.attacks')}>${t('pvp.arena.history.attacksShort')}</th><th class="num" data-tip=${t('pvp.arena.history.defenses')} aria-label=${t('pvp.arena.history.defenses')}>${t('pvp.arena.history.defensesShort')}</th></tr></thead>
        <tbody>${vm.days.map(dayRow)}</tbody></table>`
      : html`<p class="muted">${t('pvp.arena.history.none')}</p>`
  }`;
