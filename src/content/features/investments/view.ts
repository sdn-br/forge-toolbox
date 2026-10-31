import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import type { InvestmentStatus } from '../../domain/investments';
import { toggleGroup } from '../../ui/buttons';
import { growthTag, progressCell } from '../../ui/fp-bar';
import { headerIcons } from '../../ui/icons';
import { buildingCell, ignoredFilter, rowTip } from '../../ui/ignore';
import { searchField } from '../../ui/inputs';
import { type SortColumn, sortHeads } from '../../ui/sortable';
import { markCell, markedFilter } from '../../ui/star';
import { tabBar } from '../../ui/tabs';
import { rowsIn, windowedRows } from '../../ui/windowed-rows';
import type { GbRowActions } from '../shared/gb-lookups';
import { ownerCell, reachCell, reachFilter } from './filter-parts';
import {
  type InvestmentColumn,
  type InvestmentRowVm,
  type InvestmentsTab,
  type InvestmentsVm,
  type MineFilter,
  STATUS_TOGGLES,
  TABS,
  type TotalsVm,
} from './view-model';

export interface InvestmentsActions extends GbRowActions {
  tab(tab: InvestmentsTab): void;
  sort(column: InvestmentColumn, append: boolean): void;
  filter(patch: Partial<MineFilter>): void;
  /** put the owner's name into the "Spieler" filter, as if typed */
  pickPlayer(name: string): void;
  /** moves the table of the tab by rows, down for positive; the owner keeps the offset inside the list */
  scroll(rows: number): void;
  /** gets the table area on every render, to measure how many rows fit */
  measure(area: Element | undefined): void;
}

const statusIcon: Record<InvestmentStatus, TemplateResult> = {
  safe: headerIcons.checkCircle,
  unsafe: headerIcons.warning,
  unknown: headerIcons.questionCircle,
};

/** Columns in table order, the same as the possible tab where both have one; heads show the whole word, the narrow
 * status, relation and star their icon; the widths are in the styles. */
const columns: SortColumn<InvestmentColumn>[] = [
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star, cls: 'mark-cell' },
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'reach', label: 'investments.col.reach', num: false, icon: headerIcons.person, cls: 'inv-reach' },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'progress', label: 'gb.col.progress', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'deposit', label: 'investments.col.deposit', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true, icon: headerIcons.profit },
  { column: 'status', label: 'investments.col.status', num: false, icon: headerIcons.info },
];

/** "x / y" of the level with the thin bar below, the rest to the level up in the tooltip; `extra` goes under the bar */
const row = (r: InvestmentRowVm, playerField: string, actions: InvestmentsActions) => {
  const status = t(`investments.status.${r.status}`);
  const muted = r.reasons[0] === 'none' || r.ignoreNote !== undefined;
  return html`<tr class=${[r.growth ? 'grown' : '', muted ? 'muted' : ''].join(' ').trim()} data-tip=${rowTip(r)}>
  ${markCell(r, actions.mark)}
  ${ownerCell(r, playerField, actions)}
  <td class="inv-reach" data-tip=${r.reachTip} aria-label=${r.reachTip}>${reachCell(r.reasons)}</td>
  ${buildingCell(r.name, rowTip(r), r.ignored, () => actions.ignore(r.owner, r.entityId, !r.ignored))}
  <td class="num">${r.level}</td>
  ${progressCell(r, growthTag(r.growth, 'investments.growthHint'))}
  <td class="num">${t('gb.rank', { rank: r.rank })}</td>
  <td class="num">${r.deposit}</td>
  <td class="num" data-tip=${t('investments.profitHint', { gross: r.gross })}>${r.profit}</td>
  <td class=${`inv-status ${r.status}`} data-tip=${status} aria-label=${status}>${statusIcon[r.status]}</td>
</tr>`;
};

export const tabs = (current: InvestmentsTab, actions: { tab(tab: InvestmentsTab): void }) =>
  tabBar(TABS, current, (tab) => t(`investments.tab.${tab}`), actions.tab);

const table = (vm: InvestmentsVm, actions: InvestmentsActions) =>
  windowedRows({
    cls: 'inv-win',
    window: vm.scroll,
    scroll: actions.scroll,
    measure: actions.measure,
    table: html`<table class="gb-table inv-table inv-mine">
    <colgroup><col class="c-mark" /><col class="c-owner" /><col class="c-reach" /><col class="c-name" /><col class="c-level" /><col class="c-progress" />
      <col class="c-rank" /><col class="c-deposit" /><col class="c-profit" /><col class="c-status" /></colgroup>
    <thead><tr>${sortHeads(columns, vm.sort, actions.sort)}</tr></thead>
    <tbody>${rowsIn(vm.rows, vm.scroll).map((r) => row(r, vm.filter.player, actions))}</tbody>
  </table>`,
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
const filters = (f: MineFilter, age: string, actions: InvestmentsActions) => html`<p class="inv-filter">
    ${searchField(f.player, t('investments.filter.player'), (player) => actions.filter({ player }))}
    ${searchField(f.name, t('investments.filter.name'), (name) => actions.filter({ name }))}
    ${reachFilter(f.reach, (reach) => actions.filter({ reach }))}
    ${statusFilter(f, actions)}
    ${markedFilter(f.onlyMarked, (onlyMarked) => actions.filter({ onlyMarked }))}
    ${ignoredFilter(f.showIgnored, (showIgnored) => actions.filter({ showIgnored }))}
    <span class="inv-count muted">${age}</span>
  </p>`;

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
  // tabs, filters and totals stay, the rows that fit are drawn and the two buttons scroll them, sideways the area scrolls
  return html`<div class="inv-pane">${tabs('mine', actions)}${filters(vm.filter, vm.age, actions)}${content}</div>`;
}
