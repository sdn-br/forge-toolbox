import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { formatNumber, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import type { IncomingRow, PlunderRow, PvpRow, PvpTab, PvpVm } from './view-model';

export interface PvpActions {
  tab(tab: PvpTab): void;
  search(text: string): void;
  pick(opponent: PlayerId): void;
  clearPick(): void;
  page(page: number): void;
}

const army = (a: ArmyValues) => `${formatNumber(a.attack)} / ${formatNumber(a.defense)}`;

const opponentLink = (r: { opponent: PlayerId; name: string }, actions: PvpActions) =>
  html`<td><a href="#" @click=${(e: Event) => {
    e.preventDefault();
    actions.pick(r.opponent);
  }}>${r.name}</a></td>`;

const incomingRow = (r: IncomingRow, actions: PvpActions) => html`<tr>
  ${opponentLink({ opponent: r.attacker, name: r.name }, actions)}<td>${r.when}</td><td>${r.what}</td></tr>`;

const row = (r: PvpRow, actions: PvpActions) => html`<tr>
  ${opponentLink(r, actions)}
  <td>${r.when}</td><td>${r.result}</td><td>${r.battle}</td>
  <td class="num">${army(r.attacker)}</td><td class="num">${army(r.defender)}</td></tr>`;

const plunderRow = (r: PlunderRow, actions: PvpActions) => html`<tr>
  ${opponentLink(r, actions)}
  <td>${r.when}</td><td>${r.building}</td>
  <td>${r.loot}${r.doubleLoot ? html` <b>${t('plunder.doubleLoot')}</b>` : ''}</td></tr>`;

const battleTable = (vm: PvpVm, actions: PvpActions) => html`<table>
    <tr><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.result')}</th><th>${t('pvp.battle')}</th>
      <th class="num">${t('pvp.attacker')}</th><th class="num">${t('pvp.defender')}</th></tr>
    ${vm.rows.map((r) => row(r, actions))}
  </table>
  <p class="muted">${t('pvp.armyHint')}</p>`;

const plunderTable = (vm: PvpVm, actions: PvpActions) => html`<table>
    <tr><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.building')}</th><th>${t('pvp.loot')}</th></tr>
    ${vm.plunders.map((r) => plunderRow(r, actions))}
  </table>`;

const incomingTable = (vm: PvpVm, actions: PvpActions) => html`<table>
    <tr><th>${t('pvp.attacker')}</th><th>${t('pvp.when')}</th><th>${t('pvp.kind')}</th></tr>
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

export function pvpView(vm: PvpVm | undefined, actions: PvpActions): TemplateResult {
  const filter = html`<p>
    <input type="search" placeholder=${t('pvp.search')} .value=${vm?.search ?? ''}
      @input=${(e: Event) => actions.search((e.target as HTMLInputElement).value)} />
    ${
      vm?.picked
        ? html`<button class="action" title=${t('pvp.clearFilter')} @click=${() => actions.clearPick()}>${t('pvp.onlyPlayer', { name: vm.picked })} ✕</button>`
        : ''
    }</p>`;
  const head = html`${tabs(vm?.tab, actions)}${filter}`;
  if (!vm) return head;
  const totals = html`<p>${vm.tab === 'incoming' ? vm.incomingTotals : vm.plunderTotals}</p>`;
  if (vm.empty) return html`${head}${totals}<p class="muted">${t(EMPTY[vm.tab][vm.empty])}</p>`;
  return html`${head}${totals}
    ${TABLES[vm.tab](vm, actions)}
    ${paging(vm, actions)}`;
}
