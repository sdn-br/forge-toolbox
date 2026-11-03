import { html, type TemplateResult } from 'lit-html';
import { t } from '../../../core/texts';
import { toggleGroup } from '../../../ui/buttons';
import { headerIcons } from '../../../ui/icons';
import { rowTip } from '../../../ui/ignore';
import { HIT_CELL_COUNT, hitCells, tierIcon } from '../../../ui/snipe-hit';
import type { SortColumn } from '../../../ui/sortable';
import { filterBar, isMuted, LEAD_COLUMNS, leadCells, rowsTable } from '../row-parts';
import type { RowActions } from '../rows';
import {
  type PossibleColumn,
  type PossibleFilter,
  type PossibleRowVm,
  type PossibleVm,
  PROFIT_TOGGLES,
  TIER_TOGGLES,
} from './view-model';

export type PossibleActions = RowActions<PossibleColumn, PossibleFilter>;

/** Columns in table order, after the lead columns both tabs share; the tier shows its icon. */
const columns: SortColumn<PossibleColumn>[] = [
  ...LEAD_COLUMNS,
  { column: 'share', label: 'investments.col.share', full: 'investments.col.shareFull', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'cost', label: 'gb.col.cost', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true, icon: headerIcons.profit },
  { column: 'ratio', label: 'gb.col.ratio', num: true, icon: headerIcons.profitRatio },
  { column: 'tier', label: 'gb.col.tier', num: false, icon: headerIcons.info },
  { column: 'seen', label: 'investments.col.seen', num: true },
];

const row = (
  r: PossibleRowVm,
  playerField: string,
  actions: PossibleActions,
) => html`<tr class=${isMuted(r) ? 'muted' : ''} data-tip=${rowTip(r)}>
  ${leadCells(r, playerField, actions, 'investments.possible.growthHint')}
  <td class=${r.share.stale ? 'num muted' : 'num'} data-tip=${r.share.tip}>${r.share.text}</td>
  ${r.hit ? hitCells(r.hit) : Array.from({ length: HIT_CELL_COUNT }, () => html`<td></td>`)}
  <td class="num">${r.age}</td>
</tr>`;

const PROFIT_ICONS = { with: headerIcons.profit, without: headerIcons.noProfit };

/** two toggles, the profit icon for rows with a profitable place and its hollow pieces for the rest; each shows its
 * rows while on */
const hitsFilter = (f: PossibleFilter, actions: PossibleActions) =>
  toggleGroup(
    'inv-hits-filter',
    PROFIT_TOGGLES,
    f.profit,
    (key) => t(`investments.possible.profit.${key}`),
    (key) => PROFIT_ICONS[key],
    (profit) => actions.filter({ profit }),
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
const filters = (f: PossibleFilter, count: string, actions: PossibleActions) =>
  filterBar(f, actions.filter, count, { beforeReach: hitsFilter(f, actions), afterReach: tierFilter(f, actions) });

const table = (vm: PossibleVm, actions: PossibleActions) =>
  rowsTable({
    cls: 'inv-possible',
    columns,
    sort: vm.sort,
    rows: vm.rows,
    window: vm.scroll,
    actions,
    row: (r) => row(r, vm.filter.player, actions),
  });

const content = (vm: PossibleVm, actions: PossibleActions) =>
  vm.empty
    ? html`<p class="muted">${t('investments.possible.none')}</p>`
    : vm.rows.length === 0
      ? html`<p class="muted">${t('investments.filter.noRow')}</p>`
      : table(vm, actions);

/** The tab "Mögliche Investitionen": filters and count stay, the rows that fit are drawn and the two buttons scroll them. */
export function possibleView(vm: PossibleVm, actions: PossibleActions): TemplateResult {
  // the filter fields stay in one outer template: swapping templates would replace them and take their focus mid-typing
  return html`${filters(vm.filter, vm.empty ? '' : vm.count, actions)}${content(vm, actions)}`;
}
