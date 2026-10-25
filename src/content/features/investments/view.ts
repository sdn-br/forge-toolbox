import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { t } from '../../core/texts';
import type { InvestmentStatus } from '../../domain/investments';
import { progressCell } from '../../ui/fp-bar';
import { headerIcons } from '../../ui/icons';
import { externalLink } from '../../ui/links';
import { type SortColumn, sortHeads } from '../../ui/sortable';
import { starButton } from '../../ui/star';
import { rowsIn, windowedRows } from '../../ui/windowed-rows';
import {
  type InvestmentColumn,
  type InvestmentRowVm,
  type InvestmentsTab,
  type InvestmentsVm,
  TABS,
} from './view-model';

export interface InvestmentsActions {
  tab(tab: InvestmentsTab): void;
  /** puts the star on a building or takes it away */
  mark(owner: PlayerId, entityId: number, marked: boolean): void;
  sort(column: InvestmentColumn, append: boolean): void;
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

/** Columns in table order; heads show the whole word, the narrow status and star their icon; the widths are in the styles. */
const columns: SortColumn<InvestmentColumn>[] = [
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star, cls: 'inv-mark' },
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'deposit', label: 'investments.col.deposit', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true, icon: headerIcons.profit },
  { column: 'status', label: 'investments.col.status', num: false, icon: headerIcons.info },
  { column: 'progress', label: 'gb.col.progress', num: true },
];

/** the first cell of a row: the star of the building */
export const markCell = (r: { owner: PlayerId; entityId: number; marked: boolean }, mark: InvestmentsActions['mark']) =>
  html`<td class="inv-mark">${starButton(r.marked, () => mark(r.owner, r.entityId, !r.marked))}</td>`;

/** "x / y" of the level with the thin bar below, the rest to the level up in the tooltip; `extra` goes under the bar */
const row = (r: InvestmentRowVm, actions: InvestmentsActions) => {
  const status = t(`investments.status.${r.status}`);
  return html`<tr class=${r.growth ? 'grown' : ''}>
  ${markCell(r, actions.mark)}
  <td class="inv-name" data-tip=${r.ownerName}><span class="inv-owner">${externalLink(r.ownerName, r.ownerUrl)}${ownerStar(r.ownerMarked)}</span></td>
  <td class="inv-name" data-tip=${r.name}>${r.name}</td>
  <td class="num">${r.level}</td>
  <td class="num">${t('gb.rank', { rank: r.rank })}</td>
  <td class="num">${r.deposit}</td>
  <td class="num" data-tip=${t('investments.profitHint', { gross: r.gross })}>${r.profit}</td>
  <td class=${`inv-status ${r.status}`} data-tip=${status} aria-label=${status}>${statusIcon[r.status]}</td>
  ${progressCell(
    r,
    r.growth
      ? html`<div class="inv-growth" data-tip=${t('investments.growthHint', { growth: r.growth })}>${t(
          'investments.growth',
          { growth: r.growth },
        )}</div>`
      : '',
  )}
</tr>`;
};

export const tabs = (current: InvestmentsTab, actions: { tab(tab: InvestmentsTab): void }) =>
  html`<div class="tabs">${TABS.map(
    (tab) =>
      html`<button class=${tab === current ? 'active' : ''} ?disabled=${tab === current} @click=${() => actions.tab(tab)}>${t(`investments.tab.${tab}`)}</button>`,
  )}</div>`;

/** a filled star beside the name of a marked owner; only shown, the star to toggle sits where the player is seen */
export const ownerStar = (marked: boolean) => {
  if (!marked) return '';
  const word = t('investments.ownerMarked');
  return html`<span class="owner-star" role="img" data-tip=${word} aria-label=${word}>${headerIcons.starFilled}</span>`;
};

const table = (vm: InvestmentsVm, actions: InvestmentsActions) =>
  windowedRows({
    cls: 'inv-win',
    window: vm.scroll,
    scroll: actions.scroll,
    measure: actions.measure,
    table: html`<table class="gb-table inv-table">
    <colgroup><col class="c-mark" /><col class="c-owner" /><col class="c-name" /><col class="c-level" /><col class="c-rank" />
      <col class="c-deposit" /><col class="c-profit" /><col class="c-status" /><col class="c-progress" /></colgroup>
    <thead><tr>${sortHeads(columns, vm.sort, actions.sort)}</tr></thead>
    <tbody>${rowsIn(vm.rows, vm.scroll).map((r) => row(r, actions))}</tbody>
  </table>`,
  });

/** the totals above the table, so they show without scrolling */
const totals = (
  vm: InvestmentsVm,
) => html`<p class="gb-me">${t('investments.circulating', { fp: vm.totals.circulating })}
    · <span class="profit-icon" role="img" data-tip=${t('gb.col.profit')} aria-label=${t('gb.col.profit')}>${headerIcons.profit}</span>
    <b class=${vm.totals.gain ? 'gain' : ''}><span class="profit-icon" role="img" data-tip=${t('investments.profitSafe')}
      aria-label=${t('investments.profitSafe')}>${headerIcons.checkCircle}</span> ${vm.totals.profitSafe}</b>
    <span class="muted">· <span data-tip=${t('investments.profitTotal')} aria-label=${t('investments.profitTotal')}>Σ</span> ${vm.totals.profitTotal}</span></p>`;

export function investmentsView(vm: InvestmentsVm, actions: InvestmentsActions): TemplateResult {
  const age = vm.age === undefined ? t('investments.noList') : t('gb.age', { duration: vm.age });
  // tabs, age and totals stay, the rows that fit are drawn and the two buttons scroll them, sideways the area scrolls
  return html`<div class="inv-pane">${tabs('mine', actions)}<p class="muted">${age}</p>
    ${vm.rows.length === 0 ? html`<p class="muted">${t('investments.none')}</p>` : html`${totals(vm)}${table(vm, actions)}`}</div>`;
}
