import { html, type TemplateResult } from 'lit-html';
import { formatNumber, t } from '../../core/texts';
import { keepKeys } from '../../ui/inputs';
import type { OwnMapUi, OwnMapVm } from './view-model';

export interface CityMapActions {
  search(text: string): void;
  toggle(mark: 'finished' | 'unconnected' | 'free'): void;
}

const toggle = (ui: OwnMapUi, mark: 'finished' | 'unconnected' | 'free', actions: CityMapActions) =>
  html`<label><input type="checkbox" .checked=${ui[mark]} @change=${() => actions.toggle(mark)} />${t(`cityMap.${mark}`)}</label>`;

/** `map` is the drawn city map with its legend */
export function cityMapView(
  vm: OwnMapVm | undefined,
  ui: OwnMapUi,
  actions: CityMapActions,
  map?: TemplateResult,
): TemplateResult {
  if (!vm) return html`<p class="muted">${t('cityMap.noCity')}</p>`;
  // the search field stays in one outer template: swapping templates would replace it and take its focus mid-typing
  return html`<p>
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
    ${map ?? ''}`;
}
