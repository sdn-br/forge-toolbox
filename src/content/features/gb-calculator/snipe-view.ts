import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { formatAge, formatNumber, t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { profitCell, tierCell } from '../../ui/snipe-hit';
import { type SortColumn, sortHead } from '../../ui/sortable';
import { starButton } from '../../ui/star';
import { type SnipeColumn, type SnipeRowVm, type SnipeVm, VISIBLE_ROWS } from './snipe-view-model';
import { activityLine, owner } from './view';

export interface SnipeActions {
  sort(column: SnipeColumn): void;
  /** moves the table by rows, down for positive; the owner keeps the offset inside the list */
  scroll(rows: number): void;
  /** folds the section in or out */
  toggle(): void;
  /** puts the star on a building or takes it away */
  mark(owner: PlayerId, entityId: number, marked: boolean): void;
}

/** Columns in table order; heads show the whole word, the widths are in the styles. */
const columns: SortColumn<SnipeColumn>[] = [
  { column: 'order', label: 'snipe.col.order', num: true },
  { column: 'name', label: 'gb.col.name', num: false },
  { column: 'level', label: 'gb.col.level', num: true },
  { column: 'progress', label: 'gb.col.progress', num: true },
  { column: 'rank', label: 'gb.col.rank', num: true },
  { column: 'cost', label: 'gb.col.cost', num: true },
  { column: 'profit', label: 'gb.col.profit', num: true },
];

const row = (r: SnipeRowVm, actions: SnipeActions) => html`<tr data-tip=${r.notes.join('\n')}>
  <td class="num">${r.order}</td>
  <td class="snipe-name">${r.name}</td>
  <td class="num">${r.level}</td>
  <td class="num" data-tip=${t('snipe.progressHint', { percent: r.percent })}>${formatNumber(r.invested)} / ${formatNumber(r.required)}</td>
  <td class="num">${t('gb.rank', { rank: r.rank })}</td>
  <td class="num" data-tip=${t('snipe.costHint')}>${formatNumber(r.cost)}</td>
  ${profitCell(r.profit, r.estimate)}
  ${tierCell(r.tier)}
  <td class="snipe-mark">${starButton(r.marked, () => actions.mark(r.owner, r.entityId, !r.marked))}</td>
</tr>`;

/** one of the two scroll buttons; greyed at its end like the factor status buttons */
const scrollButton = (on: boolean, word: string, icon: TemplateResult, action: () => void) =>
  html`<button class=${on ? 'icon' : 'icon off'} aria-disabled=${on ? 'false' : 'true'} data-tip=${word}
    aria-label=${word} @click=${() => on && action()}>${icon}</button>`;

const hidden = ({ above, below }: { above: number; below: number }) =>
  above > 0 && below > 0
    ? t('snipe.hiddenBoth', { above, below })
    : above > 0
      ? t('snipe.hiddenAbove', { count: above })
      : below > 0
        ? t('snipe.hiddenBelow', { count: below })
        : '';

/** the head stays, the body shows six rows; wheel and the two buttons move it by a row */
const table = (vm: Extract<SnipeVm, { kind: 'list' }>, actions: SnipeActions) => {
  const { top, above, below } = vm.scroll;
  const scrolls = vm.rows.length > VISIBLE_ROWS;
  const wheel = (e: WheelEvent) => {
    const step = Math.sign(e.deltaY);
    if (!scrolls || step === 0 || (step < 0 ? above : below) === 0) return;
    e.preventDefault();
    actions.scroll(step);
  };
  return html`<div class="snipe-scroll" @wheel=${wheel}>
      <table class="gb-table snipe-table">
        <colgroup><col class="c-order" /><col class="c-name" /><col class="c-level" /><col class="c-progress" /><col class="c-rank" />
          <col class="c-cost" /><col class="c-profit" /><col class="c-tier" /><col class="c-mark" /></colgroup>
        <thead><tr>${columns.map((c) => sortHead(c, vm.sort, (column) => actions.sort(column)))}<th class="snipe-tier"
          aria-label=${t('gb.col.tier')} data-tip=${t('gb.col.tier')}>${headerIcons.info}</th><th class="snipe-mark"
          aria-label=${t('mark.col')} data-tip=${t('mark.col')}>${headerIcons.star}</th></tr></thead>
        <tbody>${vm.rows.slice(top, top + VISIBLE_ROWS).map((r) => row(r, actions))}</tbody>
      </table>
      ${
        scrolls
          ? html`<div class="snipe-nav">
            ${scrollButton(above > 0, t('snipe.scrollUp'), headerIcons.chevronUp, () => actions.scroll(-1))}
            ${scrollButton(below > 0, t('snipe.scrollDown'), headerIcons.chevronDown, () => actions.scroll(1))}
          </div>`
          : ''
      }
    </div>${scrolls ? html`<p class="muted snipe-hidden">${hidden(vm.scroll)}</p>` : ''}`;
};

/** the one clickable line of the section: a chevron and the text; the whole line folds the section */
const toggle = (expanded: boolean, text: TemplateResult | string, actions: SnipeActions) =>
  html`<button class="snipe-toggle" aria-expanded=${expanded ? 'true' : 'false'}
    aria-label=${t(expanded ? 'snipe.collapse' : 'snipe.expand')} @click=${() => actions.toggle()}>${
      expanded ? headerIcons.chevronDown : headerIcons.chevronRight
    }<span>${text}</span></button>`;

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

/** The section "Mögliche Einzahlungen" above the calculator; nothing without a list, since there is nothing to fold. */
export function snipeView(vm: SnipeVm, actions: SnipeActions, expanded: boolean): TemplateResult | '' {
  if (vm.kind === 'none') return '';
  if (!expanded) return html`${toggle(false, summary(vm), actions)}<hr class="snipe-sep" />`;
  return html`${toggle(true, html`<span class="gb-title">${t('snipe.heading')}</span>`, actions)}
    <p>${owner(vm.owner, vm.ownerUrl)}${vm.activity ? activityLine(vm.activity) : ''}
    <br /><span class="muted">${t('gb.age', { duration: formatAge(Date.now() - vm.at) })}</span></p>
    ${vm.rows.length === 0 ? html`<p class="muted">${t('snipe.noHit')}</p>` : table(vm, actions)}
    ${vm.counts.length ? html`<p class="muted">${vm.counts.join(' · ')}</p>` : ''}<hr class="snipe-sep" />`;
}
