import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { headerIcons } from '../../ui/icons';
import { keepKeys } from '../../ui/inputs';
import { externalLink } from '../../ui/links';
import { profitCell, tierCell, tierIcon } from '../../ui/snipe-hit';
import { type SortColumn, sortHeads } from '../../ui/sortable';
import {
  type PossibleColumn,
  type PossibleFilter,
  type PossibleRowVm,
  type PossibleVm,
  REACH_TOGGLES,
  type Reach,
  TIER_TOGGLES,
} from './possible-view-model';
import { type InvestmentsActions, markCell, progressCell, tabs } from './view';
import type { InvestmentsTab } from './view-model';

export interface PossibleActions {
  tab(tab: InvestmentsTab): void;
  sort(column: PossibleColumn, append: boolean): void;
  filter(patch: Partial<PossibleFilter>): void;
  /** put the owner's name into the "Spieler" filter, as if typed */
  pickPlayer(name: string): void;
  mark: InvestmentsActions['mark'];
}

/** Columns in table order; heads show the whole word, reach and tier their icon; the widths are in the styles. */
const columns: SortColumn<PossibleColumn>[] = [
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star },
  { column: 'owner', label: 'investments.col.owner', num: false },
  { column: 'reach', label: 'investments.col.reach', num: false, icon: headerIcons.person },
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

const REACH_ICONS: Partial<Record<Reach, TemplateResult>> = {
  neighbor: headerIcons.neighbor,
  friend: headerIcons.friend,
  guildMember: headerIcons.guild,
};

/** an icon per reason; out of reach and unknown stay words */
const reachCell = (r: PossibleRowVm) =>
  r.reach === 'none' || r.reach === 'unknown'
    ? t(`investments.reach.${r.reach}`)
    : r.reasons.map((reason) => REACH_ICONS[reason]);

/** shown on row hover or focus (styles) */
const pickButton = (name: string, actions: PossibleActions) => {
  const word = t('investments.possible.pickPlayer');
  return html`<button class="inv-pick" data-tip=${word} aria-label=${word} @click=${() => actions.pickPlayer(name)}>${headerIcons.funnel}</button>`;
};

const row = (
  r: PossibleRowVm,
  actions: PossibleActions,
) => html`<tr class=${r.reach === 'none' ? 'muted' : ''} data-tip=${r.notes.join('\n')}>
  ${markCell(r, actions.mark)}
  <td class="inv-name" data-tip=${r.ownerName}><span class="inv-owner">${externalLink(r.ownerName, r.ownerUrl)}${pickButton(r.ownerName, actions)}</span></td>
  <td class="inv-reach" data-tip=${r.reachTip} aria-label=${r.reachTip}>${reachCell(r)}</td>
  <td class="inv-name" data-tip=${r.name}>${r.name}</td>
  <td class="num">${r.level}</td>
  ${progressCell(r)}
  <td class=${r.share.stale ? 'num muted' : 'num'} data-tip=${r.share.tip}>${r.share.text}</td>
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

const REACH_FILTER_ICONS: Record<(typeof REACH_TOGGLES)[number], TemplateResult> = {
  ...REACH_ICONS,
  none: headerIcons.notReachable,
} as Record<(typeof REACH_TOGGLES)[number], TemplateResult>;

/** one toggle per reason, any switched on lets a row through */
const reachFilter = (f: PossibleFilter, actions: PossibleActions) =>
  html`<span class="inv-reach-filter">${REACH_TOGGLES.map((key) => {
    const word = t(key === 'none' ? 'investments.reachHint.none' : `investments.reach.${key}`);
    const on = f.reach[key];
    return html`<button class=${on ? 'on' : ''} aria-pressed=${on ? 'true' : 'false'} data-tip=${word} aria-label=${word}
    @click=${() => actions.filter({ reach: { ...f.reach, [key]: !on } })}>${REACH_FILTER_ICONS[key]}</button>`;
  })}</span>`;

/** one toggle per tier, with the icons of the column "Sicherheit"; any switched on lets a row with that tier through */
const tierFilter = (f: PossibleFilter, actions: PossibleActions) =>
  html`<span class="inv-tier-filter">${TIER_TOGGLES.map((key) => {
    const word = t(`investments.tierFilter.${key}`);
    const on = f.tier[key];
    return html`<button class=${on ? 'on' : ''} aria-pressed=${on ? 'true' : 'false'} data-tip=${word} aria-label=${word}
    @click=${() => actions.filter({ tier: { ...f.tier, [key]: !on } })}>${tierIcon[key]}</button>`;
  })}</span>`;

const filters = (f: PossibleFilter, actions: PossibleActions) => html`<p class="inv-filter">
    ${text(f.player, t('investments.possible.player'), (player) => actions.filter({ player }))}
    ${text(f.name, t('investments.possible.name'), (name) => actions.filter({ name }))}
    ${check(f.onlyHits, t('investments.possible.onlyHits'), (onlyHits) => actions.filter({ onlyHits }))}
    ${reachFilter(f, actions)}
    ${tierFilter(f, actions)}
    ${check(f.onlyMarked, t('investments.possible.onlyMarked'), (onlyMarked) => actions.filter({ onlyMarked }))}
  </p>`;

const table = (vm: PossibleVm, actions: PossibleActions) => html`<table class="gb-table inv-table inv-possible">
    <colgroup><col class="c-mark" /><col class="c-owner" /><col class="c-reach" /><col class="c-name" /><col class="c-level" /><col class="c-progress" /><col class="c-share" />
      <col class="c-rank" /><col class="c-cost" /><col class="c-gain" /><col class="c-tier" /><col class="c-seen" /></colgroup>
    <thead><tr>${sortHeads(columns, vm.sort, actions.sort)}</tr></thead>
    <tbody>${vm.rows.map((r) => row(r, actions))}</tbody>
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
