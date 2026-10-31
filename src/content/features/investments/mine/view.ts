import { html, type TemplateResult } from 'lit-html';
import { t } from '../../../core/texts';
import type { InvestmentStatus } from '../../../domain/investments';
import { toggleGroup } from '../../../ui/buttons';
import { headerIcons } from '../../../ui/icons';
import { rowTip } from '../../../ui/ignore';
import type { SortColumn } from '../../../ui/sortable';
import { filterBar, isMuted, LEAD_COLUMNS, leadCells, rowsTable } from '../row-parts';
import type { RowActions } from '../rows';
import {
  type InvestmentColumn,
  type InvestmentRowVm,
  type InvestmentsVm,
  type MineFilter,
  STATUS_TOGGLES,
  type TotalsVm,
} from './view-model';

export type InvestmentsActions = RowActions<InvestmentColumn, MineFilter>;

const statusIcon: Record<InvestmentStatus, TemplateResult> = {
  safe: headerIcons.checkCircle,
  unsafe: headerIcons.warning,
  unknown: headerIcons.questionCircle,
};

/** Columns in table order, after the lead columns both tabs share; the narrow status shows its icon. */
const columns: SortColumn<InvestmentColumn>[] = [
  ...LEAD_COLUMNS,
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'deposit', label: 'investments.col.deposit', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true, icon: headerIcons.profit },
  { column: 'status', label: 'investments.col.status', num: false, icon: headerIcons.info },
];

const row = (r: InvestmentRowVm, playerField: string, actions: InvestmentsActions) => {
  const status = t(`investments.status.${r.status}`);
  return html`<tr class=${[r.growth ? 'grown' : '', isMuted(r) ? 'muted' : ''].join(' ').trim()} data-tip=${rowTip(r)}>
  ${leadCells(r, playerField, actions, 'investments.growthHint')}
  <td class="num">${t('gb.rank', { rank: r.rank })}</td>
  <td class="num">${r.deposit}</td>
  <td class="num" data-tip=${t('investments.profitHint', { gross: r.gross })}>${r.profit}</td>
  <td class=${`inv-status ${r.status}`} data-tip=${status} aria-label=${status}>${statusIcon[r.status]}</td>
</tr>`;
};

const table = (vm: InvestmentsVm, actions: InvestmentsActions) =>
  rowsTable({
    cls: 'inv-mine',
    columns,
    sort: vm.sort,
    rows: vm.rows,
    window: vm.scroll,
    actions,
    row: (r) => row(r, vm.filter.player, actions),
  });

/** one status toggle per status, with the icons of the column; any switched on lets its rows through */
const statusFilter = (f: MineFilter, actions: InvestmentsActions) =>
  toggleGroup(
    'inv-status-filter',
    STATUS_TOGGLES,
    f.status,
    (key) => t(`investments.statusFilter.${key}`),
    (key) => statusIcon[key],
    (status) => actions.filter({ status }),
  );

/** the filters, the age of the town hall list at the end of the same row so it shows without scrolling */
const filters = (f: MineFilter, age: string, actions: InvestmentsActions) =>
  filterBar(f, actions.filter, age, { afterReach: statusFilter(f, actions) });

/** a line of the totals: the deposits, then the profit icon once, the safe profit and the total */
const totalsLine = (totals: TotalsVm, selection: boolean) =>
  html`<span class="gb-me-line">${
    selection
      ? html`<span class="profit-icon" role="img" data-tip=${t('investments.selection')} aria-label=${t('investments.selection')}>${headerIcons.funnel}</span> `
      : ''
  }${t('investments.circulating', { fp: totals.circulating })}
    · <span class="profit-icon" role="img" data-tip=${t('gb.col.profit')} aria-label=${t('gb.col.profit')}>${headerIcons.profit}</span>
    <b class=${totals.gain ? 'gain' : ''}><span class="profit-icon" role="img" data-tip=${t('investments.profitSafe')}
      aria-label=${t('investments.profitSafe')}>${headerIcons.checkCircle}</span> ${totals.profitSafe}</b>
    <span class="muted">· <span data-tip=${t('investments.profitTotal')} aria-label=${t('investments.profitTotal')}>Σ</span> ${totals.profitTotal}</span>${
      totals.ignored
        ? html` <span class="muted inv-ignored-total" data-tip=${t('investments.ignoredTotalsHint')}>· <span class="profit-icon" role="img" aria-hidden="true">${headerIcons.eyeClosed}</span> ${totals.ignored}</span>`
        : ''
    }</span>`;

/** the totals above the table, so they show without scrolling: over all own investments, and under them, with the
 * funnel in front, over the filtered rows while the filters leave some out */
const totals = (vm: InvestmentsVm) =>
  html`<p class="gb-me">${totalsLine(vm.totals, false)}${vm.selection ? totalsLine(vm.selection, true) : ''}</p>`;

export function investmentsView(vm: InvestmentsVm, actions: InvestmentsActions): TemplateResult {
  // the filter fields stay in one outer template: swapping templates would replace them and take their focus mid-typing
  const content = vm.empty
    ? html`<p class="muted">${t('investments.none')}</p>`
    : html`${totals(vm)}${vm.rows.length === 0 ? html`<p class="muted">${t('investments.filter.noRow')}</p>` : table(vm, actions)}`;
  // filters and totals stay, the rows that fit are drawn and the two buttons scroll them, sideways the area scrolls
  return html`${filters(vm.filter, vm.age, actions)}${content}`;
}
