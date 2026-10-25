import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { keepKeys } from '../../ui/inputs';
import { externalLink } from '../../ui/links';
import { profitCell, tierCell } from '../../ui/snipe-hit';
import { type SortColumn, sortHead } from '../../ui/sortable';
import type { PossibleColumn, PossibleFilter, PossibleRowVm, PossibleVm } from './possible-view-model';
import { progressCell, tabs } from './view';
import type { InvestmentsTab } from './view-model';

export interface PossibleActions {
  tab(tab: InvestmentsTab): void;
  sort(column: PossibleColumn): void;
  filter(patch: Partial<PossibleFilter>): void;
}

/** Columns in table order; heads show the whole word, reach and tier their icon; the widths are in the styles. */
const columns: SortColumn<PossibleColumn>[] = [
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'reach', label: 'investments.col.reach', num: false, icon: headerIcons.person },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'progress', label: 'gb.col.progress', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'cost', label: 'gb.col.cost', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true },
  { column: 'tier', label: 'gb.col.tier', num: false, icon: headerIcons.info },
  { column: 'seen', label: 'investments.col.seen', num: true },
];

const row = (r: PossibleRowVm) => html`<tr class=${r.reach === 'none' ? 'muted' : ''} data-tip=${r.notes.join('\n')}>
  <td class="inv-name" data-tip=${r.ownerName}>${externalLink(r.ownerName, r.ownerUrl)}</td>
  <td data-tip=${r.reachTip}>${t(`investments.reach.${r.reach}`)}</td>
  <td class="inv-name" data-tip=${r.name}>${r.name}</td>
  <td class="num">${r.level}</td>
  ${progressCell(r)}
  ${
    r.hit
      ? html`<td class="num">${t('gb.rank', { rank: r.hit.rank })}</td>
        <td class="num" data-tip=${t('snipe.costHint')}>${r.hit.cost}</td>
        ${profitCell(r.hit.profit, r.hit.estimate)}
        ${tierCell(r.hit.tier)}`
      : html`<td></td><td></td><td></td><td></td>`
  }
  <td class="num">${r.age}</td>
</tr>`;

const text = (value: string, label: string, set: (value: string) => void) =>
  html`<input type="search" placeholder=${label} aria-label=${label} .value=${value}
    @input=${(e: Event) => set((e.target as HTMLInputElement).value)}
    @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />`;

const check = (checked: boolean, label: string, set: (checked: boolean) => void) =>
  html`<label><input type="checkbox" .checked=${checked}
    @change=${(e: Event) => set((e.target as HTMLInputElement).checked)} />${label}</label>`;

const filters = (f: PossibleFilter, actions: PossibleActions) => html`<p class="inv-filter">
    ${text(f.player, t('investments.possible.player'), (player) => actions.filter({ player }))}
    ${text(f.name, t('investments.possible.name'), (name) => actions.filter({ name }))}
    ${check(f.onlyHits, t('investments.possible.onlyHits'), (onlyHits) => actions.filter({ onlyHits }))}
    ${check(f.onlyReachable, t('investments.possible.onlyReachable'), (onlyReachable) => actions.filter({ onlyReachable }))}
  </p>`;

const table = (vm: PossibleVm, actions: PossibleActions) => html`<table class="gb-table inv-table inv-possible">
    <colgroup><col class="c-owner" /><col class="c-reach" /><col class="c-name" /><col class="c-level" /><col class="c-progress" />
      <col class="c-rank" /><col class="c-cost" /><col class="c-gain" /><col class="c-tier" /><col class="c-seen" /></colgroup>
    <thead><tr>${columns.map((c) => sortHead(c, vm.sort, (column) => actions.sort(column)))}</tr></thead>
    <tbody>${vm.rows.map(row)}</tbody>
  </table>`;

const content = (vm: PossibleVm, actions: PossibleActions) =>
  vm.empty
    ? html`<p class="muted">${t('investments.possible.none')}</p>`
    : html`${vm.rows.length === 0 ? html`<p class="muted">${t('investments.possible.noRow')}</p>` : table(vm, actions)}
      <p class="muted">${vm.count}</p>`;

/** The tab "Mögliche Investitionen": the filters above the table, the count below; the head stays while the rows scroll. */
export function possibleView(vm: PossibleVm, actions: PossibleActions): TemplateResult {
  // the filter fields stay in one outer template: swapping templates would replace them and take their focus mid-typing
  return html`${tabs('possible', actions)}${filters(vm.filter, actions)}${content(vm, actions)}`;
}
