import { html, type TemplateResult } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { formatNumber, formatPrice, t } from '../../core/texts';
import type { Offer, OwnStatsVm } from './stats';
import type { OwnMapUi, OwnMapVm } from './view-model';

export type MapMark = 'finished' | 'unconnected' | 'free' | 'expansions';

export interface CityMapActions {
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

/** "Belohnungs-Erweiterungen: 0 platzierbar, 23 offen (14 aus Forschung, nächste: …; 9 von der Kontinentkarte)" */
function rewardLine(o: Offer) {
  const counts = { kind: o.label, open: formatNumber(o.total) };
  const head =
    o.placeable === undefined
      ? t('cityMap.expRewardOpen', counts)
      : t('cityMap.expReward', { ...counts, placeable: formatNumber(o.placeable) });
  const s = o.sources;
  if (!s) return head;
  const research = t('cityMap.expFromResearch', { count: formatNumber(s.fromResearch) });
  const parts = [s.nextTech === undefined ? research : t('cityMap.expNextTech', { research, tech: s.nextTech })];
  if (s.fromMap !== undefined) parts.push(t('cityMap.expFromMap', { count: formatNumber(s.fromMap) }));
  return `${head} (${parts.join('; ')})`;
}

function offerLine(o: Offer, resourcesKnown: boolean) {
  if (o.kind === 'reward') return html`<li>${rewardLine(o)}</li>`;
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
  return html`<p data-tip=${t('cityMap.streetsHint')}>${
    s.percent === undefined
      ? t('cityMap.streetsNone', counts)
      : t('cityMap.streetsValue', { ...counts, percent: percent(s.percent) })
  }</p>
    ${s.partial ? html`<p class="muted">${t('cityMap.streetsPartial')}</p>` : ''}`;
}

function statsPanel(s: OwnStatsVm) {
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
    <h2 data-tip=${t('cityMap.streetsHint')}>${t('cityMap.streets')}</h2>
    ${streetsView(s.streets)}
    <h2>${t('cityMap.expansions')}</h2>
    <ul class="stats-list">
      ${e.placed === undefined ? '' : html`<li>${t('cityMap.expPlaced', { count: formatNumber(e.placed) })}</li>`}
      ${(e.offers ?? []).map((o) => offerLine(o, e.resourcesKnown))}
    </ul>
    ${e.offers ? '' : html`<p class="muted">${t('cityMap.expOpenUnknown')}</p>`}
    ${e.offers && !e.resourcesKnown ? html`<p class="muted">${t('cityMap.expResourcesUnknown')}</p>` : ''}
    ${
      e.blocks
        ? html`<ul class="stats-list">
          <li>${t('cityMap.expNow', { count: formatNumber(e.blocks.now) })}</li>
          <li>${t('cityMap.expLater', { count: formatNumber(e.blocks.later) })}</li></ul>`
        : html`<p class="muted">${t('cityMap.expBlocksUnknown')}</p>`
    }
  </div>`;
}

/**
 * `field` is the search field, `selection` the list of the selected buildings, `map` the drawn city map with its legend,
 * `stats` the content of the side panel
 */
export function cityMapView(
  vm: OwnMapVm | undefined,
  ui: OwnMapUi,
  actions: CityMapActions,
  field?: TemplateResult,
  selection?: TemplateResult,
  map?: TemplateResult,
  stats?: OwnStatsVm,
): TemplateResult {
  if (!vm) return html`<p class="muted">${t('cityMap.noCity')}</p>`;
  // the search field stays in one outer template: swapping templates would replace it and take its focus mid-typing
  return html`<div class="map-stats-layout">
    <div class="map-main">
      <p>
        ${field ?? ''}
        <span class="matches">${vm.matches === undefined ? '' : t('cityMap.matches', { count: formatNumber(vm.matches) })}</span>
      </p>
      ${selection ?? ''}
      <div class="map-marks">${toggle(ui, 'finished', actions)}${toggle(ui, 'unconnected', actions)}${toggle(ui, 'free', actions)}${toggle(
        ui,
        'expansions',
        actions,
        t('cityMap.expBlocks'),
      )}</div>
      <p class=${vm.free === undefined ? 'muted' : ''}>${
        vm.free === undefined ? t('cityMap.freeUnknown') : t('cityMap.freeCount', { count: formatNumber(vm.free) })
      }</p>
      ${vm.incomplete ? html`<p class="warn">${t('cityMap.incomplete')}</p>` : ''}
      ${map ?? ''}
    </div>
    <aside class=${ui.stats ? 'stats-drawer open' : 'stats-drawer'} ${ref((el) => placeDrawer(el))}>
      <button class="stats-tab" data-tip=${t(ui.stats ? 'cityMap.statsClose' : 'cityMap.statsOpen')}
        @click=${() => actions.toggleStats()}>${t('cityMap.stats')}</button>
      ${ui.stats && stats ? statsPanel(stats) : ''}
    </aside>
  </div>`;
}
