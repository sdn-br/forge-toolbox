import { html, type TemplateResult } from 'lit-html';
import { formatDuration, formatNumber, type TextKey, t } from '../../core/texts';
import type { SnipeTier } from '../../domain/gb-snipe';
import { headerIcons } from '../../ui/icons';
import type { SnipeColumn, SnipeRowVm, SnipeSort, SnipeVm } from './snipe-view-model';
import { activityLine, owner } from './view';

const MINUTE = 60_000;

export interface SnipeActions {
  sort(column: SnipeColumn): void;
  /** folds the section in or out */
  toggle(): void;
}

const tierIcon: Record<SnipeTier, TemplateResult> = {
  exact: headerIcons.check,
  safe: headerIcons.checkCircle,
  possible: headerIcons.questionCircle,
};

/** Columns in table order; heads show the whole word, the widths are in the styles. */
const columns: { column: SnipeColumn; label: TextKey; num: boolean }[] = [
  { column: 'order', label: 'snipe.col.order', num: true },
  { column: 'name', label: 'snipe.col.name', num: false },
  { column: 'level', label: 'snipe.col.level', num: true },
  { column: 'progress', label: 'snipe.col.progress', num: true },
  { column: 'rank', label: 'snipe.col.rank', num: true },
  { column: 'cost', label: 'snipe.col.cost', num: true },
  { column: 'profit', label: 'snipe.col.profit', num: true },
];

const head = (c: (typeof columns)[number], sort: SnipeSort, actions: SnipeActions) => {
  const label = t(c.label);
  const mark = sort.column === c.column ? (sort.desc ? 'desc' : 'asc') : '';
  return html`<th class=${`sortable ${c.num ? 'num' : ''} ${mark}`} aria-label=${label}
    aria-sort=${mark === '' ? 'none' : mark === 'desc' ? 'descending' : 'ascending'}
    data-tip=${t('snipe.sortHint', { column: label })} @click=${() => actions.sort(c.column)}>${label}</th>`;
};

const row = (r: SnipeRowVm) => html`<tr data-tip=${r.notes.join('\n')}>
  <td class="num">${r.order}</td>
  <td class="snipe-name">${r.name}</td>
  <td class="num">${r.level}</td>
  <td class="num" data-tip=${t('snipe.progressHint', { percent: r.percent })}>${formatNumber(r.invested)} / ${formatNumber(r.required)}</td>
  <td class="num">${t('snipe.rank', { rank: r.rank })}</td>
  <td class="num" data-tip=${t('snipe.costHint')}>${formatNumber(r.cost)}</td>
  <td class=${r.estimate ? 'num estimate' : 'num'} data-tip=${r.estimate ? t('gbCalc.estimate') : ''}>${
    r.estimate ? '≈ ' : ''
  }${r.profit}</td>
  <td class=${`snipe-tier ${r.tier}`} data-tip=${t(`snipe.tier.${r.tier}`)} aria-label=${t(`snipe.tier.${r.tier}`)}>${tierIcon[r.tier]}</td>
</tr>`;

/** the one clickable line of the section: a chevron and the text; the whole line folds the section */
const toggle = (expanded: boolean, text: TemplateResult | string, actions: SnipeActions) =>
  html`<button class="snipe-toggle" aria-expanded=${expanded ? 'true' : 'false'}
    aria-label=${t(expanded ? 'snipe.collapse' : 'snipe.expand')} @click=${() => actions.toggle()}>${
      expanded ? headerIcons.chevronDown : headerIcons.chevronRight
    }<span>${text}</span></button>`;

const summary = (vm: Extract<SnipeVm, { kind: 'list' }>) => {
  const duration = formatDuration(Math.max(MINUTE, Date.now() - vm.at));
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
    <br /><span class="muted">${t('snipe.age', { duration: formatDuration(Math.max(MINUTE, Date.now() - vm.at)) })}</span></p>
    ${
      vm.rows.length === 0
        ? html`<p class="muted">${t('snipe.noHit')}</p>`
        : html`<table class="gb-table snipe-table">
            <colgroup><col class="c-order" /><col class="c-name" /><col class="c-level" /><col class="c-progress" /><col class="c-rank" />
              <col class="c-cost" /><col class="c-profit" /><col class="c-tier" /></colgroup>
            <tr>${columns.map((c) => head(c, vm.sort, actions))}<th class="snipe-tier" aria-label=${t('snipe.col.tier')}
              data-tip=${t('snipe.col.tier')}>${headerIcons.info}</th></tr>
            ${vm.rows.map(row)}
          </table>`
    }
    ${vm.counts.length ? html`<p class="muted">${vm.counts.join(' · ')}</p>` : ''}<hr class="snipe-sep" />`;
}
