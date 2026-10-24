import { html, type TemplateResult } from 'lit-html';
import { type TextKey, t } from '../../core/texts';
import type { InvestmentStatus } from '../../domain/investments';
import { headerIcons } from '../../ui/icons';
import { externalLink } from '../../ui/links';
import {
  type InvestmentColumn,
  type InvestmentRowVm,
  type InvestmentSort,
  type InvestmentsTab,
  type InvestmentsVm,
  TABS,
} from './view-model';

export interface InvestmentsActions {
  tab(tab: InvestmentsTab): void;
  sort(column: InvestmentColumn): void;
}

const statusIcon: Record<InvestmentStatus, TemplateResult> = {
  safe: headerIcons.checkCircle,
  unsafe: headerIcons.warning,
  unknown: headerIcons.questionCircle,
};

/** Columns in table order; heads show the whole word, the widths are in the styles. */
const columns: { column: InvestmentColumn; label: TextKey; num: boolean }[] = [
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'name', label: 'investments.col.name', num: false },
  { column: 'level', label: 'investments.col.level', num: true },
  { column: 'rank', label: 'investments.col.rank', num: true },
  { column: 'deposit', label: 'investments.col.deposit', num: true },
  { column: 'profit', label: 'investments.col.profit', num: true },
  { column: 'status', label: 'investments.col.status', num: false },
  { column: 'progress', label: 'investments.col.progress', num: true },
];

const head = (c: (typeof columns)[number], sort: InvestmentSort | undefined, actions: InvestmentsActions) => {
  const label = t(c.label);
  const hint = t('investments.sortHint', { column: label });
  const mark = sort?.column === c.column ? (sort.desc ? 'desc' : 'asc') : '';
  // the status column is narrow: its head is an icon, the word in tooltip and label
  const icon = c.column === 'status';
  return html`<th class=${`sortable ${c.num ? 'num' : ''} ${icon ? 'inv-status' : ''} ${mark}`} aria-label=${label}
    aria-sort=${mark === '' ? 'none' : mark === 'desc' ? 'descending' : 'ascending'}
    data-tip=${icon ? `${label}\n${hint}` : hint} @click=${() => actions.sort(c.column)}>${
      icon ? headerIcons.info : label
    }</th>`;
};

const row = (r: InvestmentRowVm) => {
  const status = t(`investments.status.${r.status}`);
  return html`<tr class=${r.growth ? 'grown' : ''}>
  <td class="inv-name" data-tip=${r.ownerName}>${externalLink(r.ownerName, r.ownerUrl)}</td>
  <td class="inv-name" data-tip=${r.name}>${r.name}</td>
  <td class="num">${r.level}</td>
  <td class="num">P${r.rank}</td>
  <td class="num">${r.deposit}</td>
  <td class="num" data-tip=${t('investments.profitHint', { gross: r.gross })}>${r.profit}</td>
  <td class=${`inv-status ${r.status}`} data-tip=${status} aria-label=${status}>${statusIcon[r.status]}</td>
  <td class="num inv-progress" data-tip=${t('investments.restHint', { rest: r.rest, required: r.required })}>
    ${r.invested} / ${r.required}
    <div class="inv-bar"><div style=${`width: ${r.percent}%`}></div></div>
    ${
      r.growth
        ? html`<div class="inv-growth" data-tip=${t('investments.growthHint', { growth: r.growthFp ?? '' })}>${r.growth}</div>`
        : ''
    }
  </td>
</tr>`;
};

const tabs = (current: InvestmentsTab, actions: InvestmentsActions) =>
  html`<div class="tabs">${TABS.map(
    (tab) =>
      html`<button class=${tab === current ? 'active' : ''} ?disabled=${tab === current} @click=${() => actions.tab(tab)}>${t(`investments.tab.${tab}`)}</button>`,
  )}</div>`;

const table = (vm: InvestmentsVm, actions: InvestmentsActions) => html`<table class="gb-table inv-table">
    <colgroup><col class="c-owner" /><col class="c-name" /><col class="c-level" /><col class="c-rank" />
      <col class="c-deposit" /><col class="c-profit" /><col class="c-status" /><col class="c-progress" /></colgroup>
    <thead><tr>${columns.map((c) => head(c, vm.sort, actions))}</tr></thead>
    <tbody>${vm.rows.map(row)}</tbody>
  </table>
  <p class="gb-me">${t('investments.circulating', { fp: vm.totals.circulating })}
    · <b class=${vm.totals.gain ? 'gain' : ''}>${t('investments.profitSafe', { profit: vm.totals.profitSafe })}</b>
    <span class="muted">· ${t('investments.profitTotal', { profit: vm.totals.profitTotal })}</span></p>`;

export function investmentsView(vm: InvestmentsVm, actions: InvestmentsActions): TemplateResult {
  const age = vm.age === undefined ? t('investments.noList') : t('investments.age', { duration: vm.age });
  return html`${tabs(vm.tab, actions)}<p class="muted">${age}</p>
    ${vm.rows.length === 0 ? html`<p class="muted">${t('investments.none')}</p>` : table(vm, actions)}`;
}
