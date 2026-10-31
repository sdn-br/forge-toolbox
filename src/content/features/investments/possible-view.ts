import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { filterToggle, toggleGroup } from '../../ui/buttons';
import { growthTag, progressCell } from '../../ui/fp-bar';
import { headerIcons } from '../../ui/icons';
import { buildingCell, ignoredFilter, rowTip } from '../../ui/ignore';
import { searchField } from '../../ui/inputs';
import { hitCells, tierIcon } from '../../ui/snipe-hit';
import { type SortColumn, sortHeads } from '../../ui/sortable';
import { markCell, markedFilter } from '../../ui/star';
import { rowsIn, windowedRows } from '../../ui/windowed-rows';
import type { GbRowActions } from '../shared/gb-lookups';
import { ownerCell, reachCell, reachFilter } from './filter-parts';
import {
  type PossibleColumn,
  type PossibleFilter,
  type PossibleRowVm,
  type PossibleVm,
  TIER_TOGGLES,
} from './possible-view-model';
import { type InvestmentsActions, tabs } from './view';
import type { InvestmentsTab } from './view-model';

export interface PossibleActions extends GbRowActions {
  tab(tab: InvestmentsTab): void;
  sort(column: PossibleColumn, append: boolean): void;
  filter(patch: Partial<PossibleFilter>): void;
  /** put the owner's name into the "Spieler" filter, as if typed */
  pickPlayer(name: string): void;
  scroll: InvestmentsActions['scroll'];
  measure: InvestmentsActions['measure'];
}

/** Columns in table order; heads show the whole word, reach and tier their icon; the widths are in the styles. */
const columns: SortColumn<PossibleColumn>[] = [
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star, cls: 'mark-cell' },
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'reach', label: 'investments.col.reach', num: false, icon: headerIcons.person, cls: 'inv-reach' },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'progress', label: 'gb.col.progress', num: true },
  { column: 'share', label: 'investments.col.share', full: 'investments.col.shareFull', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'cost', label: 'gb.col.cost', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true, icon: headerIcons.profit },
  { column: 'tier', label: 'gb.col.tier', num: false, icon: headerIcons.info },
  { column: 'seen', label: 'investments.col.seen', num: true },
];

const row = (
  r: PossibleRowVm,
  playerField: string,
  actions: PossibleActions,
) => html`<tr class=${r.reasons[0] === 'none' || r.ignoreNote !== undefined ? 'muted' : ''} data-tip=${rowTip(r)}>
  ${markCell(r, actions.mark)}
  ${ownerCell(r, playerField, actions)}
  <td class="inv-reach" data-tip=${r.reachTip} aria-label=${r.reachTip}>${reachCell(r.reasons)}</td>
  ${buildingCell(r.name, rowTip(r), r.ignored, () => actions.ignore(r.owner, r.entityId, !r.ignored))}
  <td class="num">${r.level}</td>
  ${progressCell(r, growthTag(r.growth, 'investments.possible.growthHint'))}
  <td class=${r.share.stale ? 'num muted' : 'num'} data-tip=${r.share.tip}>${r.share.text}</td>
  ${r.hit ? hitCells(r.hit) : html`<td></td><td></td><td></td><td></td>`}
  <td class="num">${r.age}</td>
</tr>`;

/** a toggle with the profit icon: only rows with a profitable place */
const hitsFilter = (f: PossibleFilter, actions: PossibleActions) =>
  filterToggle('inv-hits-filter', f.onlyHits, t('investments.possible.onlyHits'), headerIcons.profit, (onlyHits) =>
    actions.filter({ onlyHits }),
  );

/** one toggle per tier, with the icons of the column "Sicherheit"; any switched on lets a row with that tier through */
const tierFilter = (f: PossibleFilter, actions: PossibleActions) =>
  toggleGroup(
    'inv-tier-filter',
    TIER_TOGGLES,
    f.tier,
    (key) => t(`investments.tierFilter.${key}`),
    (key) => tierIcon[key],
    (tier) => actions.filter({ tier }),
  );

/** the filters, the count at the end of the same row so it shows without scrolling */
const filters = (f: PossibleFilter, count: string, actions: PossibleActions) => html`<p class="inv-filter">
    ${searchField(f.player, t('investments.filter.player'), (player) => actions.filter({ player }))}
    ${searchField(f.name, t('investments.filter.name'), (name) => actions.filter({ name }))}
    ${hitsFilter(f, actions)}
    ${reachFilter(f.reach, (reach) => actions.filter({ reach }))}
    ${tierFilter(f, actions)}
    ${markedFilter(f.onlyMarked, (onlyMarked) => actions.filter({ onlyMarked }))}
    ${ignoredFilter(f.showIgnored, (showIgnored) => actions.filter({ showIgnored }))}
    <span class="inv-count muted">${count}</span>
  </p>`;

const table = (vm: PossibleVm, actions: PossibleActions) =>
  windowedRows({
    cls: 'inv-win',
    window: vm.scroll,
    scroll: actions.scroll,
    measure: actions.measure,
    table: html`<table class="gb-table inv-table inv-possible">
    <colgroup><col class="c-mark" /><col class="c-owner" /><col class="c-reach" /><col class="c-name" /><col class="c-level" /><col class="c-progress" /><col class="c-share" />
      <col class="c-rank" /><col class="c-cost" /><col class="c-profit" /><col class="c-tier" /><col class="c-seen" /></colgroup>
    <thead><tr>${sortHeads(columns, vm.sort, actions.sort)}</tr></thead>
    <tbody>${rowsIn(vm.rows, vm.scroll).map((r) => row(r, vm.filter.player, actions))}</tbody>
  </table>`,
  });

const content = (vm: PossibleVm, actions: PossibleActions) =>
  vm.empty
    ? html`<p class="muted">${t('investments.possible.none')}</p>`
    : vm.rows.length === 0
      ? html`<p class="muted">${t('investments.filter.noRow')}</p>`
      : table(vm, actions);

/** The tab "Mögliche Investitionen": tabs, filters and count stay, the rows that fit are drawn and the two buttons scroll them. */
export function possibleView(vm: PossibleVm, actions: PossibleActions): TemplateResult {
  // the filter fields stay in one outer template: swapping templates would replace them and take their focus mid-typing
  return html`<div class="inv-pane">${tabs('possible', actions)}${filters(vm.filter, vm.empty ? '' : vm.count, actions)}${content(vm, actions)}</div>`;
}
