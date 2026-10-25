import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { t } from '../../core/texts';
import type { InvestmentStatus } from '../../domain/investments';
import { fpBar } from '../../ui/fp-bar';
import { headerIcons } from '../../ui/icons';
import { externalLink } from '../../ui/links';
import { type SortColumn, sortHead } from '../../ui/sortable';
import { starButton } from '../../ui/star';
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
  sort(column: InvestmentColumn): void;
}

const statusIcon: Record<InvestmentStatus, TemplateResult> = {
  safe: headerIcons.checkCircle,
  unsafe: headerIcons.warning,
  unknown: headerIcons.questionCircle,
};

/** Columns in table order; heads show the whole word, the narrow status and star their icon; the widths are in the styles. */
const columns: SortColumn<InvestmentColumn>[] = [
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star },
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'deposit', label: 'investments.col.deposit', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true },
  { column: 'status', label: 'investments.col.status', num: false, icon: headerIcons.info },
  { column: 'progress', label: 'gb.col.progress', num: true },
];

/** the first cell of a row: the star of the building */
export const markCell = (r: { owner: PlayerId; entityId: number; marked: boolean }, mark: InvestmentsActions['mark']) =>
  html`<td class="inv-mark">${starButton(r.marked, () => mark(r.owner, r.entityId, !r.marked))}</td>`;

/** "x / y" of the level with the thin bar below, the rest to the level up in the tooltip; `extra` goes under the bar */
export const progressCell = (
  p: { invested: string; required: string; rest: string; percent: number },
  extra: TemplateResult | '' = '',
) => html`<td class="num inv-progress" data-tip=${t('investments.restHint', { rest: p.rest, required: p.required })}>
    ${p.invested} / ${p.required}
    ${fpBar(p.percent)}
    ${extra}
  </td>`;

const row = (r: InvestmentRowVm, actions: InvestmentsActions) => {
  const status = t(`investments.status.${r.status}`);
  return html`<tr class=${r.growth ? 'grown' : ''}>
  ${markCell(r, actions.mark)}
  <td class="inv-name" data-tip=${r.ownerName}>${externalLink(r.ownerName, r.ownerUrl)}</td>
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

const table = (vm: InvestmentsVm, actions: InvestmentsActions) => html`<table class="gb-table inv-table">
    <colgroup><col class="c-mark" /><col class="c-owner" /><col class="c-name" /><col class="c-level" /><col class="c-rank" />
      <col class="c-deposit" /><col class="c-profit" /><col class="c-status" /><col class="c-progress" /></colgroup>
    <thead><tr>${columns.map((c) => sortHead(c, vm.sort, (column) => actions.sort(column)))}</tr></thead>
    <tbody>${vm.rows.map((r) => row(r, actions))}</tbody>
  </table>
  <p class="gb-me">${t('investments.circulating', { fp: vm.totals.circulating })}
    · <b class=${vm.totals.gain ? 'gain' : ''}>${t('investments.profitSafe', { profit: vm.totals.profitSafe })}</b>
    <span class="muted">· ${t('investments.profitTotal', { profit: vm.totals.profitTotal })}</span></p>`;

export function investmentsView(vm: InvestmentsVm, actions: InvestmentsActions): TemplateResult {
  const age = vm.age === undefined ? t('investments.noList') : t('gb.age', { duration: vm.age });
  return html`${tabs('mine', actions)}<p class="muted">${age}</p>
    ${vm.rows.length === 0 ? html`<p class="muted">${t('investments.none')}</p>` : table(vm, actions)}`;
}
