import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { formatAge, formatNumber, t } from '../../core/texts';
import { foldToggle } from '../../ui/fold-toggle';
import { progressCell, progressPercent } from '../../ui/fp-bar';
import { headerIcons } from '../../ui/icons';
import { profitCell, tierCell } from '../../ui/snipe-hit';
import { type SortColumn, sortHeads } from '../../ui/sortable';
import { starButton } from '../../ui/star';
import { rowsIn, windowedRows } from '../../ui/windowed-rows';
import type { SnipeColumn, SnipeRowVm, SnipeVm } from './snipe-view-model';
import { activityLine, owner } from './view';

export interface SnipeActions {
  sort(column: SnipeColumn, append: boolean): void;
  /** moves the table by rows, down for positive; the owner keeps the offset inside the list */
  scroll(rows: number): void;
  /** folds the section in or out */
  toggle(): void;
  /** puts the star on a building or takes it away */
  mark(owner: PlayerId, entityId: number, marked: boolean): void;
  /** puts the star on a player or takes it away */
  markPlayer(player: PlayerId, marked: boolean): void;
}

/** Columns in table order; heads show the whole word, the widths are in the styles. */
const columns: SortColumn<SnipeColumn>[] = [
  // left-aligned: a short number would leave the column empty on the left
  { column: 'order', label: 'snipe.col.order', num: false },
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star, cls: 'snipe-mark' },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'progress', label: 'gb.col.progress', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'cost', label: 'gb.col.cost', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true, icon: headerIcons.profit },
  { column: 'tier', label: 'gb.col.tier', num: false, icon: headerIcons.info },
];

const row = (r: SnipeRowVm, actions: SnipeActions) => html`<tr data-tip=${r.notes.join('\n')}>
  <td>${r.order}</td>
  <td class="snipe-mark">${starButton(r.marked, () => actions.mark(r.owner, r.entityId, !r.marked))}</td>
  <td class="snipe-name" data-tip=${[r.name, ...r.notes].join('\n')}>${r.name}</td>
  <td class="num">${r.level}</td>
  ${progressCell(
    {
      invested: formatNumber(r.invested),
      required: formatNumber(r.required),
      rest: formatNumber(Math.max(0, r.required - r.invested)),
      percent: progressPercent(r.invested, r.required),
    },
    '',
    r.ownerShare === undefined ? [] : [r.ownerShare],
  )}
  <td class="num">${t('gb.rank', { rank: r.rank })}</td>
  <td class="num" data-tip=${t('snipe.costHint')}>${formatNumber(r.cost)}</td>
  ${profitCell(r.profit, r.estimate, r.profitRange)}
  ${tierCell(r.tier)}
</tr>`;

/** the head stays, the body shows six rows; wheel and the two buttons move it by a row */
const table = (vm: Extract<SnipeVm, { kind: 'list' }>, actions: SnipeActions) =>
  windowedRows({
    cls: 'snipe-scroll',
    window: vm.scroll,
    scroll: actions.scroll,
    table: html`<table class="gb-table snipe-table">
        <colgroup><col class="c-order" /><col class="c-mark" /><col class="c-name" /><col class="c-level" /><col class="c-progress" /><col class="c-rank" />
          <col class="c-cost" /><col class="c-profit" /><col class="c-tier" /></colgroup>
        <thead><tr>${sortHeads(columns, vm.sort, actions.sort)}</tr></thead>
        <tbody>${rowsIn(vm.rows, vm.scroll).map((r) => row(r, actions))}</tbody>
      </table>`,
  });

const toggle = (expanded: boolean, text: TemplateResult | string, actions: SnipeActions) =>
  foldToggle('snipe-fold', expanded, text, t(expanded ? 'snipe.collapse' : 'snipe.expand'), actions.toggle);

const summary = (vm: Extract<SnipeVm, { kind: 'list' }>) => {
  const duration = formatAge(Date.now() - vm.at);
  return vm.best
    ? t('snipe.summaryHits', {
        count: vm.rows.length,
        name: vm.best.name,
        profit: vm.best.profit,
        owner: vm.owner,
        duration,
      })
    : t('snipe.summaryNone', { owner: vm.owner, duration });
};

/** The section "Mögliche Einzahlungen" above the calculator; nothing without a list, since there is nothing to fold.
 * While the calculator shows no building the section is the only part with content: it stays open, without fold line. */
export function snipeView(vm: SnipeVm, actions: SnipeActions, expanded: boolean, foldable = true): TemplateResult | '' {
  if (vm.kind === 'none') return '';
  if (foldable && !expanded) return html`${toggle(false, summary(vm), actions)}<hr class="snipe-sep" />`;
  const heading = html`<span class="gb-title">${t('snipe.heading')}</span>`;
  return html`${foldable ? toggle(true, heading, actions) : html`<p class="snipe-head">${heading}</p>`}
    <p>${owner(vm.owner, vm.ownerUrl, vm.ownerMarked === undefined ? undefined : { marked: vm.ownerMarked, toggle: (marked) => actions.markPlayer(vm.ownerId, marked) })}${vm.activity ? activityLine(vm.activity) : ''}
    <br /><span class="muted">${t('gb.age', { duration: formatAge(Date.now() - vm.at) })}</span></p>
    ${vm.rows.length === 0 ? html`<p class="muted">${t('snipe.noHit')}</p>` : table(vm, actions)}
    ${vm.counts.length ? html`<p class="muted">${vm.counts.join(' · ')}</p>` : ''}<hr class="snipe-sep" />`;
}
