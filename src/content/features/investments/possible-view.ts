import { html, type TemplateResult } from 'lit-html';
import { t } from '../../core/texts';
import { progressCell } from '../../ui/fp-bar';
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
import { type InvestmentsActions, markCell, ownerStar, tabs } from './view';
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
  { column: 'mark', label: 'mark.col', num: false, icon: headerIcons.star, cls: 'inv-mark' },
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

/** the player field names this owner exactly, in any case; the field is the only state, a part of a name marks nothing */
const picks = (field: string, name: string) => field.trim().toLowerCase() === name.toLowerCase();

/** shown on row hover or focus (styles), always and in the accent while the player field names this owner; then a click
 * empties the field */
const pickButton = (name: string, picked: boolean, actions: PossibleActions) => {
  const word = t(picked ? 'investments.possible.unpickPlayer' : 'investments.possible.pickPlayer');
  return html`<button class=${picked ? 'inv-pick on' : 'inv-pick'} aria-pressed=${picked ? 'true' : 'false'} data-tip=${word}
    aria-label=${word} @click=${() => actions.pickPlayer(picked ? '' : name)}>${picked ? headerIcons.funnelFilled : headerIcons.funnel}</button>`;
};

const row = (
  r: PossibleRowVm,
  playerField: string,
  actions: PossibleActions,
) => html`<tr class=${r.reach === 'none' ? 'muted' : ''} data-tip=${r.notes.join('\n')}>
  ${markCell(r, actions.mark)}
  <td class="inv-name" data-tip=${r.ownerName}><span class="inv-owner">${externalLink(r.ownerName, r.ownerUrl)}${ownerStar(r.ownerMarked)}${pickButton(r.ownerName, picks(playerField, r.ownerName), actions)}</span></td>
  <td class="inv-reach" data-tip=${r.reachTip} aria-label=${r.reachTip}>${reachCell(r)}</td>
  <td class="inv-name" data-tip=${[r.name, ...r.notes].join('\n')}>${r.name}</td>
  <td class="num">${r.level}</td>
  ${progressCell(r)}
  <td class=${r.share.stale ? 'num muted' : 'num'} data-tip=${r.share.tip}>${r.share.text}</td>
  ${
    r.hit
      ? html`<td class="num">${t('gb.rank', { rank: r.hit.rank })}</td>
        <td class="num" data-tip=${t('snipe.costHint')}>${r.hit.cost}</td>
        ${profitCell(r.hit.profit, r.hit.estimate, r.hit.range)}
        ${tierCell(r.hit.tier)}`
      : html`<td></td><td></td><td></td><td></td>`
  }
  <td class="num">${r.age}</td>
</tr>`;

const text = (value: string, label: string, set: (value: string) => void) =>
  html`<input type="search" placeholder=${label} aria-label=${label} .value=${value}
    @input=${(e: Event) => set((e.target as HTMLInputElement).value)}
    @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />`;

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

/** a toggle with the profit icon: only rows with a profitable place */
const hitsFilter = (f: PossibleFilter, actions: PossibleActions) => {
  const word = t('investments.possible.onlyHits');
  return html`<span class="inv-hits-filter"><button class=${f.onlyHits ? 'on' : ''} aria-pressed=${f.onlyHits ? 'true' : 'false'}
    data-tip=${word} aria-label=${word} @click=${() => actions.filter({ onlyHits: !f.onlyHits })}>${headerIcons.profit}</button></span>`;
};

/** a toggle with the star: only marked buildings and buildings of marked owners */
const markedFilter = (f: PossibleFilter, actions: PossibleActions) => {
  const word = t('investments.possible.onlyMarked');
  return html`<span class="inv-marked-filter"><button class=${f.onlyMarked ? 'on' : ''} aria-pressed=${f.onlyMarked ? 'true' : 'false'}
    data-tip=${word} aria-label=${word} @click=${() => actions.filter({ onlyMarked: !f.onlyMarked })}>${headerIcons.starFilled}</button></span>`;
};

/** one toggle per tier, with the icons of the column "Sicherheit"; any switched on lets a row with that tier through */
const tierFilter = (f: PossibleFilter, actions: PossibleActions) =>
  html`<span class="inv-tier-filter">${TIER_TOGGLES.map((key) => {
    const word = t(`investments.tierFilter.${key}`);
    const on = f.tier[key];
    return html`<button class=${on ? 'on' : ''} aria-pressed=${on ? 'true' : 'false'} data-tip=${word} aria-label=${word}
    @click=${() => actions.filter({ tier: { ...f.tier, [key]: !on } })}>${tierIcon[key]}</button>`;
  })}</span>`;

/** the filters, the count at the end of the same row so it shows without scrolling */
const filters = (f: PossibleFilter, count: string, actions: PossibleActions) => html`<p class="inv-filter">
    ${text(f.player, t('investments.possible.player'), (player) => actions.filter({ player }))}
    ${text(f.name, t('investments.possible.name'), (name) => actions.filter({ name }))}
    ${hitsFilter(f, actions)}
    ${reachFilter(f, actions)}
    ${tierFilter(f, actions)}
    ${markedFilter(f, actions)}
    <span class="inv-count muted">${count}</span>
  </p>`;

const table = (vm: PossibleVm, actions: PossibleActions) => html`<table class="gb-table inv-table inv-possible">
    <colgroup><col class="c-mark" /><col class="c-owner" /><col class="c-reach" /><col class="c-name" /><col class="c-level" /><col class="c-progress" /><col class="c-share" />
      <col class="c-rank" /><col class="c-cost" /><col class="c-gain" /><col class="c-tier" /><col class="c-seen" /></colgroup>
    <thead><tr>${sortHeads(columns, vm.sort, actions.sort)}</tr></thead>
    <tbody>${vm.rows.map((r) => row(r, vm.filter.player, actions))}</tbody>
  </table>`;

const content = (vm: PossibleVm, actions: PossibleActions) =>
  vm.empty
    ? html`<p class="muted">${t('investments.possible.none')}</p>`
    : vm.rows.length === 0
      ? html`<p class="muted">${t('investments.possible.noRow')}</p>`
      : table(vm, actions);

/** The tab "Mögliche Investitionen": tabs, filters and count stay, only the table scrolls, its head fixed. */
export function possibleView(vm: PossibleVm, actions: PossibleActions): TemplateResult {
  // the filter fields stay in one outer template: swapping templates would replace them and take their focus mid-typing
  return html`<div class="inv-pane">${tabs('possible', actions)}${filters(vm.filter, vm.empty ? '' : vm.count, actions)}<div
    class="inv-scroll">${content(vm, actions)}</div></div>`;
}
