import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { formatNumber, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import { battleDetailsView } from '../../ui/battle-details';
import { keepKeys } from '../../ui/inputs';
import { externalIcon } from '../../ui/links';
import type { IncomingRow, PlunderRow, PvpRow, PvpTab, PvpVm } from './view-model';

export interface PvpActions {
  tab(tab: PvpTab): void;
  search(text: string): void;
  pick(opponent: PlayerId): void;
  clearPick(): void;
  page(page: number): void;
  /** shows or hides the details of a battle row */
  expand(battleId: number): void;
  /** filters to this player and opens their note for typing */
  note(opponent: PlayerId): void;
}

const army = (a: ArmyValues) => `${formatNumber(a.attack)} / ${formatNumber(a.defense)}`;

/** the name filters to the player, the icon beside it opens their page at foestats */
const opponentLink = (r: { opponent: PlayerId; name: string; url: string }, actions: PvpActions) =>
  html`<td><a href="#" @click=${(e: Event) => {
    e.preventDefault();
    actions.pick(r.opponent);
  }}>${r.name}</a> ${externalIcon(r.url)}</td>`;

/** 📝 per row: dim without a note, the note as tooltip */
const noteMarker = (opponent: PlayerId, note: string, actions: PvpActions) =>
  html`<td><button class=${note ? 'marker' : 'marker dim'} title=${note || t('notes.add')}
    @click=${() => actions.note(opponent)}>📝</button></td>`;

const incomingRow = (r: IncomingRow, actions: PvpActions) => html`<tr>
  ${noteMarker(r.attacker, r.note, actions)}${opponentLink({ opponent: r.attacker, name: r.name, url: r.url }, actions)}
  <td>${r.when}</td><td>${r.what}</td></tr>`;

/** a click on the row shows its details, a click on its link or note marker does what they do */
const expandOnClick = (battleId: number, actions: PvpActions) => (e: Event) => {
  if (!(e.target as Element).closest('a, button')) actions.expand(battleId);
};

const row = (r: PvpRow, actions: PvpActions) => html`<tr class=${r.expanded ? 'battle-row expanded' : 'battle-row'}
    title=${t('pvp.details')} @click=${expandOnClick(r.battleId, actions)}>
  ${noteMarker(r.opponent, r.note, actions)}${opponentLink(r, actions)}
  <td>${r.when}</td><td>${r.result}</td><td>${r.battle}</td>
  <td class="num">${army(r.attacker)}</td><td class="num">${army(r.defender)}</td></tr>
  ${r.details ? html`<tr class="details"><td colspan="7">${battleDetailsView(r.details)}</td></tr>` : ''}`;

const plunderRow = (r: PlunderRow, actions: PvpActions) => html`<tr>
  ${noteMarker(r.opponent, r.note, actions)}${opponentLink(r, actions)}
  <td>${r.when}</td><td>${r.building}</td>
  <td>${r.loot}${r.doubleLoot ? html` <b>${t('plunder.doubleLoot')}</b>` : ''}</td></tr>`;

const battleTable = (vm: PvpVm, actions: PvpActions) => html`<table>
    <tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.result')}</th><th>${t('pvp.battle')}</th>
      <th class="num">${t('pvp.attacker')}</th><th class="num">${t('pvp.defender')}</th></tr>
    ${vm.rows.map((r) => row(r, actions))}
  </table>
  <p class="muted">${t('pvp.armyHint')}</p>`;

const plunderTable = (vm: PvpVm, actions: PvpActions) => html`<table>
    <tr><th></th><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.building')}</th><th>${t('pvp.loot')}</th></tr>
    ${vm.plunders.map((r) => plunderRow(r, actions))}
  </table>`;

const incomingTable = (vm: PvpVm, actions: PvpActions) => html`<table>
    <tr><th></th><th>${t('pvp.attacker')}</th><th>${t('pvp.when')}</th><th>${t('pvp.kind')}</th></tr>
    ${vm.incoming.map((r) => incomingRow(r, actions))}
  </table>`;

const TABLES = { battles: battleTable, plunders: plunderTable, incoming: incomingTable };

const EMPTY = {
  battles: { none: 'pvp.none', noMatch: 'pvp.noMatch' },
  plunders: { none: 'pvp.noPlunders', noMatch: 'pvp.noPlunderMatch' },
  incoming: { none: 'pvp.noIncoming', noMatch: 'pvp.noIncomingMatch' },
} as const;

const tabs = (current: PvpTab | undefined, actions: PvpActions) =>
  html`<p>${(['battles', 'plunders', 'incoming'] as const).map(
    (tab) =>
      html`<button class="action" ?disabled=${tab === (current ?? 'battles')} @click=${() => actions.tab(tab)}>${t(`pvp.tab.${tab}`)}</button> `,
  )}</p>`;

const paging = (vm: PvpVm, actions: PvpActions) =>
  vm.pages <= 1
    ? ''
    : html`<p>
      <button class="action" ?disabled=${vm.page === 0} @click=${() => actions.page(vm.page - 1)}>${t('pvp.previous')}</button>
      ${t('pvp.page', { page: vm.page + 1, pages: vm.pages })}
      <button class="action" ?disabled=${vm.page >= vm.pages - 1} @click=${() => actions.page(vm.page + 1)}>${t('pvp.next')}</button>
    </p>`;

/** `note` is the note card of the picked player */
export function pvpView(vm: PvpVm | undefined, actions: PvpActions, note?: TemplateResult): TemplateResult {
  const filter = html`<p>
    <input type="search" placeholder=${t('pvp.search')} .value=${vm?.search ?? ''}
      @input=${(e: Event) => actions.search((e.target as HTMLInputElement).value)}
      @keydown=${keepKeys} @keypress=${keepKeys} @keyup=${keepKeys} />
    ${
      vm?.picked
        ? html`<button class="action" title=${t('pvp.clearFilter')} @click=${() => actions.clearPick()}>${t('pvp.onlyPlayer', { name: vm.picked })} ✕</button>`
        : ''
    }</p>`;
  // the search field stays in one outer template: swapping templates would replace it and take its focus mid-typing
  return html`${tabs(vm?.tab, actions)}${filter}${note ?? ''}${vm ? list(vm, actions) : ''}`;
}

function list(vm: PvpVm, actions: PvpActions) {
  const totals = html`<p>${vm.tab === 'incoming' ? vm.incomingTotals : vm.plunderTotals}</p>`;
  if (vm.empty) return html`${totals}<p class="muted">${t(EMPTY[vm.tab][vm.empty])}</p>`;
  return html`${totals}${TABLES[vm.tab](vm, actions)}${paging(vm, actions)}`;
}
