import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { formatNumber, formatPrice, t } from '../../core/texts';
import { keepKeys } from '../../ui/inputs';
import type { OwnStatsVm } from './stats';
import type { OwnMapUi, OwnMapVm } from './view-model';

export type MapMark = 'finished' | 'unconnected' | 'free' | 'expansions';

export interface CityMapActions {
  search(text: string): void;
  toggle(mark: MapMark): void;
  toggleStats(): void;
}

/** width of the docked panel in pixels, as in the styles */
const PANEL_WIDTH = 250;

const toggle = (ui: OwnMapUi, mark: MapMark, actions: CityMapActions, label = t(`cityMap.${mark as 'free'}`)) =>
  html`<label><input type="checkbox" .checked=${ui[mark]} @change=${() => actions.toggle(mark)} />${label}</label>`;

/**
 * Docked, the panel hangs out of the left side of the box, where the box usually has room (it opens at the right
 * edge of the screen). A box near the left edge gets it on its right side instead. Checked on every render.
 */
function placeDrawer(el: Element | undefined) {
  const drawer = el as HTMLElement | undefined;
  const box = drawer?.closest('.box');
  if (!drawer || !box) return;
  drawer.dataset.side = box.getBoundingClientRect().left < PANEL_WIDTH + 30 ? 'right' : 'left';
}

const percent = (n: number) => formatNumber(Math.round(n * 10) / 10);

function offerLine(o: NonNullable<OwnStatsVm['expansions']['offers']>[number], resourcesKnown: boolean) {
  const parts = [
    o.buyable !== undefined && resourcesKnown
      ? t('cityMap.expBuyable', { kind: o.label, buyable: formatNumber(o.buyable), total: formatNumber(o.total) })
      : t('cityMap.expTotal', { kind: o.label, total: formatNumber(o.total) }),
  ];
  if (o.next !== undefined && resourcesKnown) parts.push(t('cityMap.expNext', { price: formatPrice(o.next) }));
  if (o.eraName) parts.push(t('cityMap.expFrom', { era: o.eraName }));
  return html`<li>${parts.join(' ')}</li>`;
}

function streetsView(s: OwnStatsVm['streets']) {
  if (!s) return html`<p class="muted">${t('cityMap.streetsUnknown')}</p>`;
  const counts = { needed: formatNumber(s.needed), placed: formatNumber(s.placed) };
  return html`<p title=${t('cityMap.streetsHint')}>${
    s.percent === undefined
      ? t('cityMap.streetsNone', counts)
      : t('cityMap.streetsValue', { ...counts, percent: percent(s.percent) })
  }</p>
    ${s.partial ? html`<p class="muted">${t('cityMap.streetsPartial')}</p>` : ''}`;
}

function statsPanel(s: OwnStatsVm, ui: OwnMapUi, actions: CityMapActions) {
  const e = s.expansions;
  return html`<div class="stats-panel">
    <h2>${t('cityMap.area')}</h2>
    <p class=${s.area ? '' : 'muted'}>${
      s.area
        ? t('cityMap.areaValue', { free: formatNumber(s.area.free), total: formatNumber(s.area.total) })
        : t('cityMap.areaUnknown')
    }</p>
    <h2>${t('cityMap.buildings', { count: formatNumber(s.buildings) })}</h2>
    <table class="type-stats">
      <tr><th>${t('cityMap.type')}</th><th class="num">${t('cityMap.count')}</th>
        <th class="num">${t('cityMap.share')}</th><th class="num">${t('cityMap.tiles')}</th></tr>
      ${s.types.map(
        (r) => html`<tr><td><span class="swatch" style=${`background:${r.color}`}></span>${r.label}</td>
          <td class="num">${formatNumber(r.count)}</td><td class="num">${percent(r.share)} %</td>
          <td class="num">${formatNumber(r.tiles)}</td></tr>`,
      )}
    </table>
    <h2 title=${t('cityMap.streetsHint')}>${t('cityMap.streets')}</h2>
    ${streetsView(s.streets)}
    <h2>${t('cityMap.expansions')}</h2>
    <ul class="stats-list">
      ${e.placed === undefined ? '' : html`<li>${t('cityMap.expPlaced', { count: formatNumber(e.placed) })}</li>`}
      ${e.unplaced === undefined ? '' : html`<li>${t('cityMap.expUnplaced', { count: formatNumber(e.unplaced) })}</li>`}
      ${(e.offers ?? []).map((o) => offerLine(o, e.resourcesKnown))}
    </ul>
    ${e.offers ? '' : html`<p class="muted">${t('cityMap.expOpenUnknown')}</p>`}
    ${e.offers && !e.resourcesKnown ? html`<p class="muted">${t('cityMap.expResourcesUnknown')}</p>` : ''}
    <p class="footnote muted">${t('cityMap.expAssumed')}</p>
    ${toggle(ui, 'expansions', actions, t('cityMap.expBlocks'))}
    ${
      e.blocks
        ? html`<ul class="stats-list">
          <li>${t('cityMap.expNow', { count: formatNumber(e.blocks.now) })}</li>
          <li>${t('cityMap.expLater', { count: formatNumber(e.blocks.later) })}</li></ul>`
        : html`<p class="muted">${t('cityMap.expBlocksUnknown')}</p>`
    }
    <p class="footnote muted">${t('cityMap.expBlocksAssumed')}</p>
  </div>`;
}

/** `map` is the drawn city map with its legend, `stats` the content of the side panel */
export function cityMapView(
  vm: OwnMapVm | undefined,
  ui: OwnMapUi,
  actions: CityMapActions,
  map?: TemplateResult,
  stats?: OwnStatsVm,
): TemplateResult {
  if (!vm) return html`<p class="muted">${t('cityMap.noCity')}</p>`;
  // the search field stays in one outer template: swapping templates would replace it and take its focus mid-typing
  return html`<div class="map-stats-layout">
    <div class="map-main">
      <p>
        <input type="search" placeholder=${t('cityMap.search')} .value=${ui.search}
          @input=${(e: Event) => actions.search((e.target as HTMLInputElement).value)}
          @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />
        <span class="matches">${vm.matches === undefined ? '' : t('cityMap.matches', { count: formatNumber(vm.matches) })}</span>
      </p>
      <div class="map-marks">${toggle(ui, 'finished', actions)}${toggle(ui, 'unconnected', actions)}${toggle(ui, 'free', actions)}</div>
      <p class=${vm.free === undefined ? 'muted' : ''}>${
        vm.free === undefined ? t('cityMap.freeUnknown') : t('cityMap.freeCount', { count: formatNumber(vm.free) })
      }</p>
      ${vm.incomplete ? html`<p class="warn">${t('cityMap.incomplete')}</p>` : ''}
      ${map ?? ''}
    </div>
    <aside class=${ui.stats ? 'stats-drawer open' : 'stats-drawer'} ${ref((el) => placeDrawer(el))}>
      <button class="stats-tab" title=${t(ui.stats ? 'cityMap.statsClose' : 'cityMap.statsOpen')}
        @click=${() => actions.toggleStats()}>${t('cityMap.stats')}</button>
      ${ui.stats && stats ? statsPanel(stats, ui, actions) : ''}
    </aside>
  </div>`;
}
