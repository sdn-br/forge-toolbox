// The parts both investment tabs draw: the lead cells of a row, the table around the rows and the filter bar, each tab
// adding only its own columns and filters.
import { html, type TemplateResult } from 'lit-html';
import { sameName, type TextKey, t } from '../../core/texts';
import type { Reach, ReachFilter } from '../../domain/reach';
import { toggleButton } from '../../ui/buttons';
import { growthTag, progressCell } from '../../ui/fp-bar';
import { headerIcons } from '../../ui/icons';
import { buildingCell, ignoredFilter, rowTip } from '../../ui/ignore';
import { searchField } from '../../ui/inputs';
import { externalLink } from '../../ui/links';
import { ownerMarks } from '../../ui/owner-line';
import { RELATION_ICONS, relationToggles } from '../../ui/relations';
import { type Sort, type SortColumn, sortHeads } from '../../ui/sortable';
import { markCell, markedFilter } from '../../ui/star';
import { type RowWindow, windowedRows } from '../../ui/windowed-rows';
import type { GbRowActions } from '../shared/gb-lookups';
import type { CommonFilter, CommonRowVm, NamedColumn, RowActions } from './rows';

/** an icon per reason; out of reach and unknown stay words */
const reachCell = (reasons: Reach[]) => {
  const [first] = reasons;
  return first === 'none' || first === 'unknown'
    ? t(`investments.reach.${first}`)
    : reasons.map((reason) => RELATION_ICONS[reason as keyof typeof RELATION_ICONS]);
};

/** one toggle per reason, any switched on lets a row through */
const reachFilter = (reach: ReachFilter, set: (reach: ReachFilter) => void) =>
  relationToggles(
    'inv-reach-filter',
    reach,
    (key) => t(key === 'none' ? 'investments.reachHint.none' : `investments.reach.${key}`),
    set,
  );

/** the player field names this owner exactly, in any case; the field is the only state, a part of a name marks nothing */
const picks = (field: string, name: string) => sameName(field.trim(), name);

/** shown on row hover or focus (styles), always and in the accent while the player field names this owner; then a click
 * empties the field */
const pickButton = (name: string, picked: boolean, pick: (name: string) => void) => {
  const word = t(picked ? 'investments.filter.unpickPlayer' : 'investments.filter.pickPlayer');
  return toggleButton('inv-pick', picked, word, picked ? headerIcons.funnelFilled : headerIcons.funnel, () =>
    pick(picked ? '' : name),
  );
};

/** what the lead cells do: stars, eyes and the funnel beside the owner */
type LeadActions = GbRowActions & Pick<RowActions<string, CommonFilter>, 'pickPlayer'>;

/**
 * The owner: link, then at the right edge the star, the closed eye and the funnel. Star and eye only for a player the
 * store knows. All keep their place in every row, so the mouse can run straight down the column. The tooltip is the name
 * with the guild over the row's tooltip.
 */
const ownerCell = (r: CommonRowVm, playerField: string, actions: LeadActions) =>
  html`<td class="name-cell" data-tip=${[r.ownerTip, rowTip(r)].filter(Boolean).join('\n')}><span class="row-name">${externalLink(r.ownerName, r.ownerUrl)}${ownerMarks(
    r.ownerIgnored === undefined ? {} : { ownerMarked: r.ownerMarked, ownerIgnored: r.ownerIgnored },
    (marked) => actions.markPlayer(r.owner, marked),
    (ignored) => actions.ignorePlayer(r.owner, ignored),
  )}${pickButton(r.ownerName, picks(playerField, r.ownerName), actions.pickPlayer)}</span></td>`;

export type LeadColumn = NamedColumn | 'level' | 'progress';

/** the first columns of both tables; heads show the whole word, relation and star their icon; the widths are in the
 * styles */
export const LEAD_COLUMNS: SortColumn<LeadColumn>[] = [
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star, cls: 'mark-cell' },
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'reach', label: 'investments.col.reach', num: false, icon: headerIcons.person, cls: 'inv-reach' },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'progress', label: 'gb.col.progress', num: true },
];

/** out of reach or ignored rows are drawn muted */
export const isMuted = (r: CommonRowVm) => r.reasons[0] === 'none' || r.ignoreNote !== undefined;

/** the cells of the lead columns; "x / y" of the level with the thin bar below, the growth beside it explained by
 * `growthHint` */
export const leadCells = (r: CommonRowVm, playerField: string, actions: LeadActions, growthHint: TextKey) => html`
  ${markCell(r, actions.mark)}
  ${ownerCell(r, playerField, actions)}
  <td class="inv-reach" data-tip=${r.reachTip} aria-label=${r.reachTip}>${reachCell(r.reasons)}</td>
  ${buildingCell(r.name, rowTip(r), r.ignored, () => actions.ignore(r.owner, r.entityId, !r.ignored))}
  <td class="num">${r.level}</td>
  ${progressCell(r, growthTag(r.growth, growthHint))}`;

export interface RowsTable<R, C extends string> {
  /** the class of the tab's table, beside the classes both share */
  cls: string;
  /** in table order; each gets its `col` with the class `c-<column>` for the widths in the styles */
  columns: SortColumn<C>[];
  sort: Sort<C>;
  /** the rows of the window, the only ones drawn */
  rows: R[];
  window: RowWindow;
  actions: Pick<RowActions<C, CommonFilter>, 'sort' | 'scroll' | 'measure'>;
  row(r: R): TemplateResult;
}

/** the table of a tab: only the rows of the window are drawn, the two buttons scroll them */
export const rowsTable = <R, C extends string>(spec: RowsTable<R, C>) =>
  windowedRows({
    cls: 'inv-win',
    window: spec.window,
    scroll: spec.actions.scroll,
    measure: spec.actions.measure,
    table: html`<table class=${`gb-table inv-table ${spec.cls}`}>
    <colgroup>${spec.columns.map((c) => html`<col class=${`c-${c.column}`} />`)}</colgroup>
    <thead><tr>${sortHeads(spec.columns, spec.sort, spec.actions.sort)}</tr></thead>
    <tbody>${spec.rows.map(spec.row)}</tbody>
  </table>`,
  });

/** the filters of a tab; `beforeReach` and `afterReach` are its own, `count` stands at the end of the same row so it
 * shows without scrolling */
export const filterBar = (
  f: CommonFilter,
  set: (patch: Partial<CommonFilter>) => void,
  count: string,
  own: { beforeReach?: TemplateResult; afterReach: TemplateResult },
) => html`<p class="inv-filter">
    ${searchField(f.player, t('investments.filter.player'), (player) => set({ player }))}
    ${searchField(f.name, t('investments.filter.name'), (name) => set({ name }))}
    ${own.beforeReach ?? ''}
    ${reachFilter(f.reach, (reach) => set({ reach }))}
    ${own.afterReach}
    ${markedFilter(f.onlyMarked, (onlyMarked) => set({ onlyMarked }))}
    ${ignoredFilter(f.showIgnored, (showIgnored) => set({ showIgnored }))}
    <span class="inv-count muted">${count}</span>
  </p>`;
