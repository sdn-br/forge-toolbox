import { html, type TemplateResult } from 'lit-html';
import type { PlayerId } from '../../../shared/ids';
import { formatNumber, t } from '../../core/texts';
import type { ArmyValues } from '../../domain/assess-city';
import type { PvpRow, PvpVm } from './view-model';

export interface PvpActions {
  search(text: string): void;
  pick(opponent: PlayerId): void;
  clearPick(): void;
  page(page: number): void;
}

const army = (a: ArmyValues) => `${formatNumber(a.attack)} / ${formatNumber(a.defense)}`;

const row = (r: PvpRow, actions: PvpActions) => html`<tr>
  <td><a href="#" @click=${(e: Event) => {
    e.preventDefault();
    actions.pick(r.opponent);
  }}>${r.name}</a></td>
  <td>${r.when}</td><td>${r.result}</td><td>${r.battle}</td>
  <td class="num">${army(r.attacker)}</td><td class="num">${army(r.defender)}</td></tr>`;

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
  if (!vm) return filter;
  if (vm.empty) return html`${filter}<p class="muted">${t(vm.empty === 'none' ? 'pvp.none' : 'pvp.noMatch')}</p>`;
  return html`${filter}
    <table>
      <tr><th>${t('pvp.opponent')}</th><th>${t('pvp.when')}</th><th>${t('pvp.result')}</th><th>${t('pvp.battle')}</th>
        <th class="num">${t('pvp.attacker')}</th><th class="num">${t('pvp.defender')}</th></tr>
      ${vm.rows.map((r) => row(r, actions))}
    </table>
    <p class="muted">${t('pvp.armyHint')}</p>
    ${paging(vm, actions)}`;
}
