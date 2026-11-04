import { html, type TemplateResult } from 'lit-html';
import { t } from '../../../core/texts';
import { toggleGroup } from '../../../ui/buttons';
import { growthTag, progressCell } from '../../../ui/fp-bar';
import { headerIcons } from '../../../ui/icons';
import { buildingCell, rowTip } from '../../../ui/ignore';
import { keepKeys } from '../../../ui/inputs';
import type { SortColumn } from '../../../ui/sortable';
import { ownerCell, reachTd, rowsTable } from '../row-parts';
import type { RowActions } from '../rows';
import {
  type FinderColumn,
  type FinderFilter,
  type FinderRowVm,
  type FinderType,
  type FinderVm,
  STARTED_TOGGLES,
} from './view-model';

export type FinderActions = RowActions<FinderColumn, FinderFilter>;

const columns: SortColumn<FinderColumn>[] = [
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'reach', label: 'investments.col.reach', num: false, icon: headerIcons.person, cls: 'inv-reach' },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'progress', label: 'gb.col.progress', num: true },
  { column: 'seen', label: 'investments.col.seen', num: true },
];

/** the level, the gold marker before it when the building has the gold tier */
const levelCell = (r: FinderRowVm) =>
  html`<td class="num">${r.gold ? html`<span class="tier-gold" data-tip=${t('investments.finder.gold')} aria-label=${t('investments.finder.gold')}>${headerIcons.goldTier}</span>` : ''}${r.level}</td>`;

/** an ignored building or owner is drawn muted; out of reach is no reason here, the finder looks beyond the relations */
const row = (
  r: FinderRowVm,
  actions: FinderActions,
) => html`<tr class=${r.ignoreNote !== undefined ? 'muted' : ''} data-tip=${rowTip(r)}>
  ${ownerCell(r, actions)}
  ${reachTd(r)}
  ${buildingCell(r.name, rowTip(r), r.ignored, () => actions.ignore(r.owner, r.entityId, !r.ignored))}
  ${levelCell(r)}
  ${progressCell(r, growthTag(r.growth, 'investments.possible.growthHint', r.growthSpan))}
  <td class="num">${r.age}</td>
</tr>`;

const typeSelect = (types: FinderType[], current: string, actions: FinderActions) =>
  html`<select aria-label=${t('investments.finder.type')} data-tip=${t('investments.finder.type')}
    @change=${(e: Event) => actions.filter({ type: (e.target as HTMLSelectElement).value })}>
    <option value="" .selected=${current === ''}>${t('investments.finder.allTypes')}</option>
    ${types.map((ty) => html`<option value=${ty.def} .selected=${ty.def === current}>${ty.name}</option>`)}
  </select>`;

const levelField = (label: string, value: string, set: (value: string) => void) =>
  html`<input class="inv-level" type="number" min="1" step="1" placeholder=${label} aria-label=${label} .value=${value}
    @input=${(e: Event) => set((e.target as HTMLInputElement).value)}
    @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />`;

const STARTED_ICONS = { started: headerIcons.started, notStarted: headerIcons.notStarted };

const filters = (vm: FinderVm, actions: FinderActions) => html`<p class="inv-filter">
    ${typeSelect(vm.types, vm.filter.type, actions)}
    ${levelField(t('investments.finder.levelFrom'), vm.filter.levelFrom, (levelFrom) => actions.filter({ levelFrom }))}
    ${levelField(t('investments.finder.levelTo'), vm.filter.levelTo, (levelTo) => actions.filter({ levelTo }))}
    ${toggleGroup(
      'inv-started-filter',
      STARTED_TOGGLES,
      vm.filter.progress,
      (key) => t(`investments.finder.${key}`),
      (key) => STARTED_ICONS[key],
      (progress) => actions.filter({ progress }),
    )}
    <span class="inv-count muted">${vm.empty ? '' : vm.count}</span>
  </p>`;

const content = (vm: FinderVm, actions: FinderActions) =>
  vm.empty
    ? html`<p class="muted">${t('investments.finder.none')}</p>`
    : vm.rows.length === 0
      ? html`<p class="muted">${t('investments.filter.noRow')}</p>`
      : rowsTable({
          cls: 'inv-finder',
          columns,
          sort: vm.sort,
          rows: vm.rows,
          window: vm.scroll,
          actions,
          row: (r) => row(r, actions),
        });

/** The tab "LG-Finder": filters and count stay, the rows that fit are drawn and the two buttons scroll them. */
export function finderView(vm: FinderVm, actions: FinderActions): TemplateResult {
  // the filter fields stay in one outer template, so typing keeps their focus
  return html`${filters(vm, actions)}${content(vm, actions)}`;
}
